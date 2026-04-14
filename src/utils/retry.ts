// src/utils/retry.ts

/**
 * Retry utility with exponential backoff
 *
 * Provides retry logic for transient failures with configurable:
 * - Max retry attempts
 * - Base delay between retries
 * - Max delay cap
 * - Jitter to prevent thundering herd
 *
 * @file retry.ts
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  jitter?: boolean;
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDurationMs: number;
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and optional jitter
 * @param attempt - Current attempt number (1-based)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay cap in milliseconds
 * @param jitter - Whether to add random jitter
 * @returns Delay in milliseconds
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  jitter: boolean
): number {
  // Exponential backoff: baseDelay * 2^(attempt-1)
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter if enabled (prevents thundering herd)
  if (jitter) {
    const randomJitter = Math.random() * 0.5 * cappedDelay; // Up to 50% jitter
    return cappedDelay + randomJitter;
  }

  return cappedDelay;
}

/**
 * Retry a function with exponential backoff
 * @param fn - Function to retry
 * @param options - Retry configuration options
 * @returns Result with success status, data/error, and attempt information
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
    baseDelay = 100,
    maxDelay = 10000,
    jitter = true,
    shouldRetry = () => true,
  } = options;

  const startTime = Date.now();
  let lastError: Error | undefined;
  let attempt = 1;  // Declare outside loop for access in return statement

  for (; attempt <= maxRetries + 1; attempt++) {
    try {
      const data = await fn();

      return {
        success: true,
        data,
        attempts: attempt,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error as Error;

      // Don't retry if this is the last attempt or shouldRetry returns false
      if (attempt > maxRetries || !shouldRetry(lastError, attempt)) {
        break;
      }

      // Calculate delay for this attempt
      const delay = calculateDelay(attempt, baseDelay, maxDelay, jitter);

      console.debug(`[Retry] Attempt ${attempt} failed, retrying in ${delay.toFixed(0)}ms`, {
        error: lastError.message,
        attempt,
        nextAttempt: attempt + 1,
        maxRetries,
      });

      // Wait before retrying
      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: attempt,  // Return actual attempt count, not maxRetries + 1
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Circuit breaker pattern for preventing cascade failures
 *
 * Tracks failure counts and opens circuit after threshold is reached.
 * While circuit is open, calls fail immediately without executing.
 * Circuit closes after timeout period.
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private isOpen = false;

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}

  /**
   * Execute function with circuit breaker protection
   * @param fn - Function to execute
   * @param options - Circuit breaker options
   * @returns Result of function execution
   */
  async execute<T>(
    fn: () => Promise<T>,
    options: { shouldReset?: () => boolean } = {}
  ): Promise<T> {
    const { shouldReset } = options;

    // Check if circuit should be reset
    if (this.isOpen && this.shouldCloseCircuit(shouldReset)) {
      console.debug('[CircuitBreaker] Closing circuit after timeout');
      this.close();
    }

    // Fail fast if circuit is open
    if (this.isOpen) {
      throw new Error('Circuit breaker is OPEN - rejecting request');
    }

    try {
      const result = await fn();

      // Reset failure count on success
      this.onSuccess();

      return result;
    } catch (error) {
      this.onFailure();

      throw error;
    }
  }

  /**
   * Check if circuit should close based on timeout or custom condition
   */
  private shouldCloseCircuit(shouldReset?: () => boolean): boolean {
    if (shouldReset && shouldReset()) {
      return true;
    }

    if (this.lastFailureTime === null) {
      return false;
    }

    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure >= this.timeout;
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // Open circuit if threshold reached
    if (this.failureCount >= this.threshold) {
      console.warn('[CircuitBreaker] Opening circuit after threshold reached', {
        failureCount: this.failureCount,
        threshold: this.threshold,
      });

      this.isOpen = true;
    }
  }

  /**
   * Close the circuit (manual reset)
   */
  close(): void {
    this.isOpen = false;
    this.failureCount = 0;
    this.lastFailureTime = null;
    console.debug('[CircuitBreaker] Circuit closed manually');
  }

  /**
   * Get circuit breaker state
   */
  getState(): { isOpen: boolean; failureCount: number; lastFailureTime: number | null } {
    return {
      isOpen: this.isOpen,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}
