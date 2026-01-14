/**
 * Kalibr Context Management
 *
 * Provides async context propagation for trace IDs, span IDs, and goals
 * using Node.js AsyncLocalStorage. This enables automatic context
 * propagation across async boundaries.
 *
 * @example
 * ```typescript
 * import { withTraceId, getTraceId, traceContext } from '@kalibr/sdk';
 *
 * // Wrap operations with a trace context
 * await withTraceId('my-trace-123', async () => {
 *   console.log(getTraceId()); // 'my-trace-123'
 *   // All nested operations will inherit this trace ID
 * });
 *
 * // Combined context with goal
 * await traceContext({ goal: 'summarize_article' }, async () => {
 *   // Operations here will have both trace ID and goal set
 * });
 * ```
 */

import { AsyncLocalStorage } from 'async_hooks';

// ============================================================================
// Storage Instances
// ============================================================================

const traceStorage = new AsyncLocalStorage<string>();
const goalStorage = new AsyncLocalStorage<string>();
const spanStorage = new AsyncLocalStorage<string>();

// ============================================================================
// Trace ID Functions
// ============================================================================

/**
 * Get the current trace ID from context.
 *
 * @returns The current trace ID or undefined if not in a trace context
 */
export function getTraceId(): string | undefined {
  return traceStorage.getStore();
}

/**
 * Set the trace ID in the current context.
 * Note: This uses enterWith() which affects the current execution context.
 *
 * @param traceId - The trace ID to set
 */
export function setTraceId(traceId: string): void {
  traceStorage.enterWith(traceId);
}

/**
 * Execute a function within a trace context.
 *
 * @param traceId - The trace ID for this context
 * @param fn - The function to execute
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * const result = await withTraceId('trace-123', async () => {
 *   // getTraceId() returns 'trace-123' here
 *   return await processData();
 * });
 * ```
 */
export async function withTraceId<T>(
  traceId: string,
  fn: () => Promise<T> | T
): Promise<T> {
  return traceStorage.run(traceId, fn);
}

/**
 * Generate a new unique trace ID.
 *
 * @returns A unique trace ID in the format: timestamp-random
 */
export function newTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
}

// ============================================================================
// Parent Span ID Functions
// ============================================================================

/**
 * Get the current parent span ID from context.
 *
 * @returns The current parent span ID or undefined if not in a span context
 */
export function getParentSpanId(): string | undefined {
  return spanStorage.getStore();
}

/**
 * Set the parent span ID in the current context.
 *
 * @param spanId - The span ID to set as parent
 */
export function setParentSpanId(spanId: string): void {
  spanStorage.enterWith(spanId);
}

/**
 * Execute a function within a span context.
 *
 * @param spanId - The span ID for this context
 * @param fn - The function to execute
 * @returns The result of the function
 */
export async function withSpanContext<T>(
  spanId: string,
  fn: () => Promise<T> | T
): Promise<T> {
  return spanStorage.run(spanId, fn);
}

// ============================================================================
// Goal Functions
// ============================================================================

/**
 * Get the current goal from context.
 *
 * @returns The current goal or undefined if not in a goal context
 */
export function getGoal(): string | undefined {
  return goalStorage.getStore();
}

/**
 * Set the goal in the current context.
 *
 * @param goal - The goal to set
 */
export function setGoal(goal: string): void {
  goalStorage.enterWith(goal);
}

/**
 * Execute a function within a goal context.
 *
 * @param goal - The goal for this context
 * @param fn - The function to execute
 * @returns The result of the function
 */
export async function withGoal<T>(
  goal: string,
  fn: () => Promise<T> | T
): Promise<T> {
  return goalStorage.run(goal, fn);
}

/**
 * Clear the current goal from context.
 */
export function clearGoal(): void {
  goalStorage.enterWith(undefined as unknown as string);
}

// ============================================================================
// Combined Context Functions
// ============================================================================

/**
 * Execute a function within a combined trace context.
 * Sets both trace ID and optionally goal.
 *
 * @param options - Context options (traceId, goal)
 * @param fn - The function to execute
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * await traceContext(
 *   { traceId: 'my-trace', goal: 'summarize' },
 *   async () => {
 *     // Both trace ID and goal are available here
 *     console.log(getTraceId());  // 'my-trace'
 *     console.log(getGoal());     // 'summarize'
 *   }
 * );
 * ```
 */
export async function traceContext<T>(
  options: {
    traceId?: string;
    goal?: string;
  },
  fn: () => Promise<T> | T
): Promise<T> {
  const { traceId = newTraceId(), goal } = options;

  let result: T;

  if (goal) {
    result = await goalStorage.run(goal, () =>
      traceStorage.run(traceId, fn)
    );
  } else {
    result = await traceStorage.run(traceId, fn);
  }

  return result;
}
