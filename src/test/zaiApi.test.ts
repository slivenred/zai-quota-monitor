/**
 * Regression tests for the API-layer pure functions.
 *
 * Run with: npm test (compiles, then `node --test out/test/`)
 * Uses Node's built-in test runner — no extra dependencies.
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ZaiApiError,
  buildTimeWindowParams,
  classifyLimit,
  selectError,
  withRetry,
} from '../api/zaiApi';
import type { ApiQuotaLimitItem } from '../types';

describe('classifyLimit', () => {
  it('classifies TIME_LIMIT as the monthly MCP quota', () => {
    const q = classifyLimit({ type: 'TIME_LIMIT', percentage: 42 });
    assert.equal(q.type, 'mcp');
  });

  it('classifies periodType WEEKLY as the weekly quota', () => {
    const q = classifyLimit({ type: 'TOKENS_LIMIT', periodType: 'WEEKLY', percentage: 60 });
    assert.equal(q.type, 'weekly');
  });

  it('classifies everything else as the 5-hour token quota', () => {
    const q = classifyLimit({ type: 'TOKENS_LIMIT', periodType: 'ROLLING_5H', percentage: 10 });
    assert.equal(q.type, 'token');
  });

  it('defaults percentage to 0 when not a number', () => {
    const q = classifyLimit({ type: 'TOKENS_LIMIT', percentage: undefined as unknown as number });
    assert.equal(q.percentage, 0);
  });

  it('converts nextResetTime milliseconds into a Date', () => {
    const ts = 1893456000000;
    const q = classifyLimit({ type: 'TOKENS_LIMIT', percentage: 1, nextResetTime: ts });
    assert.ok(q.nextResetTime instanceof Date);
    assert.equal(q.nextResetTime?.getTime(), ts);
  });

  it('prefers total over usage for the limit value', () => {
    const q = classifyLimit({ type: 'TOKENS_LIMIT', percentage: 1, total: 120, usage: 60 });
    assert.equal(q.total, 120);
  });

  it('falls back to usage when total is absent', () => {
    const q = classifyLimit({ type: 'TOKENS_LIMIT', percentage: 1, usage: 60 });
    assert.equal(q.total, 60);
  });
});

describe('buildTimeWindowParams', () => {
  const parse = (params: string): { startTime: number; endTime: number } => {
    const url = new URL(`https://example.test/?${params}`);
    const parseDate = (v: string | null): number => {
      assert.ok(v, 'date param present');
      // Format: yyyy-MM-dd HH:mm:ss (local time)
      const [datePart, timePart] = (v as string).split(' ');
      const [y, mo, d] = datePart.split('-').map(Number);
      const [h, mi, s] = timePart.split(':').map(Number);
      return new Date(y, mo - 1, d, h, mi, s).getTime();
    };
    return {
      startTime: parseDate(url.searchParams.get('startTime')),
      endTime: parseDate(url.searchParams.get('endTime')),
    };
  };

  it('builds an exact 24-hour window', () => {
    const { startTime, endTime } = parse(buildTimeWindowParams());
    assert.equal(endTime - startTime, 24 * 60 * 60 * 1000);
  });

  it('never places the window end in the future', () => {
    const { endTime } = parse(buildTimeWindowParams());
    assert.ok(endTime <= Date.now() + 1000, `endTime ${endTime} should not be after now`);
  });
});

describe('withRetry', () => {
  const fast = { baseDelayMs: 1 };

  it('retries a transient network error and succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls === 1) throw new ZaiApiError('network', 'read ECONNRESET', undefined, 'ECONNRESET');
      return 'ok';
    }, fast);
    assert.equal(result, 'ok');
    assert.equal(calls, 2);
  });

  it('retries timeout errors', async () => {
    let calls = 0;
    await withRetry(async () => {
      calls += 1;
      if (calls < 3) throw new ZaiApiError('timeout', 'Request timed out');
      return 42;
    }, fast);
    assert.equal(calls, 3);
  });

  it('retries HTTP 429 and 5xx but not other HTTP errors', async () => {
    for (const status of [429, 502, 503]) {
      let calls = 0;
      await withRetry(async () => {
        calls += 1;
        if (calls === 1) throw new ZaiApiError('http', `HTTP ${status}`, status);
        return true;
      }, fast);
      assert.equal(calls, 2, `status ${status} should be retried`);
    }
    let calls = 0;
    await assert.rejects(withRetry(async () => {
      calls += 1;
      throw new ZaiApiError('http', 'HTTP 404', 404);
    }, fast));
    assert.equal(calls, 1, 'HTTP 404 should not be retried');
  });

  it('never retries auth errors', async () => {
    let calls = 0;
    await assert.rejects(withRetry(async () => {
      calls += 1;
      throw new ZaiApiError('auth', 'HTTP 401', 401);
    }, fast), /HTTP 401/);
    assert.equal(calls, 1);
  });

  it('gives up after maxAttempts on persistent network failures', async () => {
    let calls = 0;
    await assert.rejects(withRetry(async () => {
      calls += 1;
      throw new ZaiApiError('network', 'ENETUNREACH', undefined, 'ENETUNREACH');
    }, { maxAttempts: 3, baseDelayMs: 1 }), /ENETUNREACH/);
    assert.equal(calls, 3);
  });

  it('treats non-ZaiApiError rejections as transient', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls === 1) throw new Error('socket hang up');
      return 'recovered';
    }, fast);
    assert.equal(result, 'recovered');
    assert.equal(calls, 2);
  });
});

describe('selectError', () => {
  it('prefers an auth error over other kinds', () => {
    const errors = [
      new ZaiApiError('network', 'connection reset'),
      new ZaiApiError('auth', 'HTTP 401: unauthorized', 401),
      new ZaiApiError('timeout', 'Request timed out'),
    ];
    assert.equal(selectError(errors).kind, 'auth');
  });

  it('returns the first error when none is an auth error', () => {
    const errors = [
      new ZaiApiError('timeout', 'Request timed out'),
      new ZaiApiError('http', 'HTTP 500: oops', 500),
    ];
    assert.equal(selectError(errors).kind, 'timeout');
  });

  it('wraps non-ZaiApiError values as network errors', () => {
    const result = selectError([new Error('ECONNRESET'), 'boom']);
    assert.equal(result.kind, 'network');
    assert.ok(result.message.includes('ECONNRESET'));
  });

  it('falls back to a generic network error for an empty list', () => {
    assert.equal(selectError([]).kind, 'network');
  });
});
