/**
 * Unit Tests for Retry Logic and Circuit Breaker
 *
 * Tests for:
 * - retryWithBackoff utility
 * - CircuitBreaker class
 * - MV refresh retry logic
 *
 * @file retry.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff, CircuitBreaker } from '../utils/retry.js';

describe('retryWithBackoff', () => {

  it('should return data on first attempt when function succeeds', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(mockFn);

    expect(result.success).toBe(true);
    expect(result.data).toBe('success');
    expect(result.attempts).toBe(1);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient errors and eventually succeed', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new Error('Connection timeout'))
      .mockRejectedValueOnce(new Error('Connection timeout'))
      .mockResolvedValue('success');

    const result = await retryWithBackoff(mockFn, {
      maxRetries: 3,
      baseDelay: 10,
      maxDelay: 50,
      jitter: false,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBe('success');
    expect(result.attempts).toBe(3);
    expect(mockFn).toHaveBeenCalledTimes(3);
  }, 10000);

  it('should fail after max retries when function always fails', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('Connection timeout'));

    const result = await retryWithBackoff(mockFn, {
      maxRetries: 2,
      baseDelay: 10,
      maxDelay: 50,
      jitter: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.attempts).toBe(3); // Initial attempt + 2 retries
    expect(mockFn).toHaveBeenCalledTimes(3);
  }, 10000);

  it('should not retry when shouldRetry returns false', async () => {
    const mockFn = vi.fn();
    mockFn.mockRejectedValue(new Error('Non-transient error'));
    mockFn.mockRejectedValue(new Error('Non-transient error'));
    mockFn.mockRejectedValue(new Error('Non-transient error'));
    mockFn.mockRejectedValue(new Error('Non-transient error'));

    const result = await retryWithBackoff(mockFn, {
      maxRetries: 3,
      baseDelay: 10,
      shouldRetry: (error) => {
        return !error.message.includes('Non-transient');
      },
    });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1); // Only initial attempt, no retries
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should use exponential backoff delays', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new Error('Error 1'))
      .mockRejectedValueOnce(new Error('Error 2'))
      .mockRejectedValueOnce(new Error('Error 3'))
      .mockResolvedValue('success');

    const startTime = Date.now();
    await retryWithBackoff(mockFn, {
      maxRetries: 3,
      baseDelay: 10,
      maxDelay: 50,
      jitter: false,
    });

    const duration = Date.now() - startTime;
    // 10ms + 20ms + 40ms = ~70ms total delay
    expect(duration).toBeGreaterThanOrEqual(60);
    expect(duration).toBeLessThan(200);
  }, 10000);

  it('should cap delay at maxDelay', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new Error('Error 1'))
      .mockRejectedValueOnce(new Error('Error 2'))
      .mockRejectedValueOnce(new Error('Error 3'))
      .mockResolvedValue('success');

    const startTime = Date.now();
    await retryWithBackoff(mockFn, {
      maxRetries: 3,
      baseDelay: 50,
      maxDelay: 75,
      jitter: false,
    });

    const duration = Date.now() - startTime;
    // 50ms + 75ms (capped) + 75ms (capped) = ~200ms total delay
    expect(duration).toBeGreaterThanOrEqual(180);
    expect(duration).toBeLessThan(300);
  }, 10000);
});

describe('CircuitBreaker', () => {
  it('should execute function when circuit is closed', async () => {
    const breaker = new CircuitBreaker(2, 1000);
    const mockFn = vi.fn().mockResolvedValue('success');

    const result = await breaker.execute(mockFn);

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(breaker.getState().isOpen).toBe(false);
  });

  it('should open circuit after threshold failures', async () => {
    const breaker = new CircuitBreaker(2, 1000); // Open after 2 failures
    const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

    // First failure
    await expect(breaker.execute(mockFn)).rejects.toThrow();
    expect(breaker.getState().isOpen).toBe(false);
    expect(breaker.getState().failureCount).toBe(1);

    // Second failure - should open circuit
    await expect(breaker.execute(mockFn)).rejects.toThrow();
    expect(breaker.getState().isOpen).toBe(true);
    expect(breaker.getState().failureCount).toBe(2);
  });

  it('should reject immediately when circuit is open', async () => {
    const breaker = new CircuitBreaker(2, 1000);
    const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

    // Open the circuit
    await expect(breaker.execute(mockFn)).rejects.toThrow();
    await expect(breaker.execute(mockFn)).rejects.toThrow();

    // Circuit should be open now
    expect(breaker.getState().isOpen).toBe(true);

    // Next call should fail immediately without executing function
    await expect(breaker.execute(mockFn)).rejects.toThrow('Circuit breaker is OPEN');
    expect(mockFn).toHaveBeenCalledTimes(2); // Only called twice (not a third time)
  });

  it('should close circuit after timeout period', async () => {
    vi.useFakeTimers();

    const breaker = new CircuitBreaker(2, 1000); // 1 second timeout
    const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

    // Open the circuit
    await expect(breaker.execute(mockFn)).rejects.toThrow();
    await expect(breaker.execute(mockFn)).rejects.toThrow();
    expect(breaker.getState().isOpen).toBe(true);

    // Advance time past timeout
    vi.advanceTimersByTime(1100);

    // Circuit should be closed now, function should execute
    mockFn.mockResolvedValue('success');
    const result = await breaker.execute(mockFn);

    expect(result).toBe('success');
    expect(breaker.getState().isOpen).toBe(false);
    expect(breaker.getState().failureCount).toBe(0);

    vi.useRealTimers();
  });

  it('should reset failure count on success', async () => {
    const breaker = new CircuitBreaker(3, 1000);
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new Error('Failure'))
      .mockResolvedValue('success');

    // First failure
    await expect(breaker.execute(mockFn)).rejects.toThrow();
    expect(breaker.getState().failureCount).toBe(1);

    // Success should reset count
    const result = await breaker.execute(mockFn);
    expect(result).toBe('success');
    expect(breaker.getState().failureCount).toBe(0);
    expect(breaker.getState().isOpen).toBe(false);
  });

  it('should close circuit manually with close() method', async () => {
    const breaker = new CircuitBreaker(2, 1000);
    const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

    // Open the circuit
    await expect(breaker.execute(mockFn)).rejects.toThrow();
    await expect(breaker.execute(mockFn)).rejects.toThrow();
    expect(breaker.getState().isOpen).toBe(true);

    // Manually close circuit
    breaker.close();
    expect(breaker.getState().isOpen).toBe(false);
    expect(breaker.getState().failureCount).toBe(0);

    // Function should execute now
    await expect(breaker.execute(mockFn)).rejects.toThrow();
    expect(mockFn).toHaveBeenCalledTimes(3); // Called again after closing
  });
});
