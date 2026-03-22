import { describe, it, expect } from 'vitest';
import { ok, err } from './result';

describe('Result helpers', () => {
  it('ok() creates a success result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('err() creates a failure result', () => {
    const result = err({ code: 'FAIL', message: 'something broke' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FAIL');
    }
  });
});
