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
