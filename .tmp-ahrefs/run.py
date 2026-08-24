from __future__ import annotations

import csv
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API_URL = "https://api.ahrefs.com/v3/public/domain-rating-free"
TOKEN = os.environ["AHREFS_TOKEN"]
CANDIDATE_FILE = Path(".tmp-ahrefs/candidates.txt")
OUT_JSON = Path(".tmp-ahrefs/results.json")
OUT_CSV = Path(".tmp-ahrefs/results.csv")
CONTROLS = ["ahrefs.com", "example.com"]

domains: list[str] = []
seen: set[str] = set()
for raw in CANDIDATE_FILE.read_text(encoding="utf-8").splitlines():
    domain = raw.strip().lower().strip(".")
    if domain and domain not in seen:
        seen.add(domain)
        domains.append(domain)


def fetch_dr(domain: str) -> tuple[float | None, str, str]:
    query = urllib.parse.urlencode({"target": domain, "output": "json"})
    req = urllib.request.Request(
        f"{API_URL}?{query}",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {TOKEN}",
            "User-Agent": "Temporary-Ahrefs-DR-Verification/1.0",
        },
    )
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=40) as response:
                payload = json.loads(response.read().decode("utf-8"))
            block = payload.get("domain_rating", payload)
            value = block.get("domain_rating") if isinstance(block, dict) else None
            return (float(value) if value is not None else None, "ok", "")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")[:500]
            if exc.code == 429 and attempt < 5:
                retry_after = exc.headers.get("Retry-After")
                try:
                    delay = max(float(retry_after), 2.0) if retry_after else 2**attempt
                except ValueError:
                    delay = 2**attempt
                time.sleep(min(delay, 30))
                continue
            return None, f"http_{exc.code}", body
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            if attempt < 5:
                time.sleep(min(2**attempt, 20))
                continue
            return None, "network_error", str(exc)[:500]
    return None, "retry_exhausted", ""


def rdap_status(domain: str) -> tuple[str, str]:
    url = "https://rdap.org/domain/" + urllib.parse.quote(domain, safe="")
    for attempt in range(4):
        req = urllib.request.Request(
            url,
            headers={
                "Accept": "application/rdap+json, application/json",
                "User-Agent": "Temporary-RDAP-Check/1.0",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                response.read(256)
                return "registered", response.geturl()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return "rdap_unregistered", url
            if exc.code == 429 and attempt < 3:
                time.sleep(2 ** (attempt + 1))
                continue
            return f"rdap_http_{exc.code}", url
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt < 3:
                time.sleep(2**attempt)
                continue
            return "rdap_unknown", str(exc)[:300]
    return "rdap_unknown", url


def wayback_summary(domain: str) -> dict:
    query = urllib.parse.urlencode(
        {
            "url": f"{domain}/*",
            "output": "json",
            "fl": "timestamp,original,statuscode,mimetype",
            "filter": "statuscode:200",
            "collapse": "digest",
            "limit": "50",
        }
    )
    req = urllib.request.Request(
        "https://web.archive.org/cdx/search/cdx?" + query,
        headers={"User-Agent": "Temporary-Wayback-Check/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as response:
            payload = json.loads(response.read().decode("utf-8"))
        rows = payload[1:] if isinstance(payload, list) and payload else []
        timestamps = [row[0] for row in rows if isinstance(row, list) and row]
        originals = [row[1] for row in rows if isinstance(row, list) and len(row) > 1]
        return {
            "snapshot_rows": len(rows),
            "earliest": min(timestamps) if timestamps else None,
            "latest": max(timestamps) if timestamps else None,
            "sample_urls": originals[:8],
        }
    except Exception as exc:
        return {"error": str(exc)[:300]}


protected_terms = {"npm", "redis", "gradle", "hibernate", "log4j", "spring"}
risky_terms = {
    "login",
    "payment",
    "billing",
    "reset",
    "verify",
    "password",
    "installer",
    "firmware",
    "driver",
    "drivers",
    "update",
    "updates",
}

controls = []
for domain in CONTROLS:
    dr, status, error = fetch_dr(domain)
    controls.append({"domain": domain, "dr": dr, "api_status": status, "error": error})
    time.sleep(0.5)

rows = []
fatal_auth = any(x["api_status"] in {"http_401", "http_403"} for x in controls)
if not fatal_auth:
    for index, domain in enumerate(domains, 1):
        dr, status, error = fetch_dr(domain)
        rows.append(
            {
                "domain": domain,
                "dr": dr,
                "api_status": status,
                "api_error": error,
                "availability": "not_checked",
                "rdap_url": "",
                "risk_flags": [],
                "wayback": None,
                "grade": "reject",
            }
        )
        print(f"Ahrefs {index}/{len(domains)} {domain}: {dr if dr is not None else status}", flush=True)
        time.sleep(0.5)
else:
    rows = [
        {
            "domain": domain,
            "dr": None,
            "api_status": "skipped_auth_failure",
            "api_error": "Control request failed authentication",
            "availability": "not_checked",
            "rdap_url": "",
            "risk_flags": [],
            "wayback": None,
            "grade": "reject",
        }
        for domain in domains
    ]

for row in rows:
    dr = row["dr"]
    if dr is None or dr < 1:
        continue
    availability, rdap_url = rdap_status(row["domain"])
    row["availability"] = availability
    row["rdap_url"] = rdap_url
    label = row["domain"].split(".", 1)[0]
    flags = []
    if label in protected_terms:
        flags.append("brand_or_project_name")
    if label in risky_terms:
        flags.append("download_or_phishing_semantics")
    if row["domain"].endswith(".zip"):
        flags.append("zip_security_reputation_risk")
    row["risk_flags"] = flags
    if availability == "rdap_unregistered" and dr >= 10 and not flags:
        row["grade"] = "A"
    elif availability == "rdap_unregistered" and dr >= 5 and not flags:
        row["grade"] = "B+"
    elif availability == "rdap_unregistered" and dr >= 1:
        row["grade"] = "manual_review"
    else:
        row["grade"] = "reject"
    time.sleep(0.15)

shortlist = sorted(
    [row for row in rows if row["availability"] == "rdap_unregistered" and (row["dr"] or 0) >= 5],
    key=lambda x: x["dr"] or -1,
    reverse=True,
)[:20]
for row in shortlist:
    row["wayback"] = wayback_summary(row["domain"])
    time.sleep(0.5)

rows.sort(key=lambda x: (x["dr"] is not None, x["dr"] or -1), reverse=True)
report = {
    "checked_at_utc": datetime.now(timezone.utc).isoformat(),
    "source": "Ahrefs API v3 public/domain-rating-free",
    "candidate_count": len(domains),
    "controls": controls,
    "fatal_auth_failure": fatal_auth,
    "results": rows,
}
OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

with OUT_CSV.open("w", newline="", encoding="utf-8") as handle:
    writer = csv.DictWriter(
        handle,
        fieldnames=[
            "domain",
            "dr",
            "api_status",
            "availability",
            "grade",
            "risk_flags",
            "rdap_url",
            "api_error",
        ],
    )
    writer.writeheader()
    for row in rows:
        writer.writerow(
            {
                "domain": row["domain"],
                "dr": "" if row["dr"] is None else row["dr"],
                "api_status": row["api_status"],
                "availability": row["availability"],
                "grade": row["grade"],
                "risk_flags": ",".join(row["risk_flags"]),
                "rdap_url": row["rdap_url"],
                "api_error": row["api_error"],
            }
        )
