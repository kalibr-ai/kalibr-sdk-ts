/**
 * Context Management for Kalibr TypeScript SDK
 *
 * Provides AsyncLocalStorage-based context propagation for trace IDs,
 * span IDs, and goals across async operations. This enables automatic
 * parent-child span relationships without explicit parameter passing.
 *
 * @example Basic usage
 * ```typescript
 * import { withTraceId, getTraceId, SpanBuilder } from '@kalibr/sdk';
 *
 * await withTraceId('custom-trace', async () => {
 *   console.log(getTraceId()); // 'custom-trace'
 *
 *   const span = new SpanBuilder().start();
 *   // span.trace_id = 'custom-trace' automatically
 * });
 * ```
 *
 * @example Nested spans
 * ```typescript
 * import { withTraceId, withSpanContext, SpanBuilder } from '@kalibr/sdk';
 *
 * await withTraceId('trace-1', async () => {
 *   const parent = new SpanBuilder()
 *     .setOperation('parent')
 *     .setProvider('openai')
 *     .setModel('gpt-4o')
 *     .start();
 *
 *   await withSpanContext(parent.getSpanId(), async () => {
 *     const child = new SpanBuilder()
 *       .setOperation('child')
 *       .setProvider('openai')
 *       .setModel('gpt-4o')
 *       .start();
 *     // child.parent_span_id = parent.getSpanId() automatically
 *   });
 * });
 * ```
 *
 * @example Goal-based context
 * ```typescript
 * import { withGoal, getGoal } from '@kalibr/sdk';
 *
 * await withGoal('book_meeting', async () => {
 *   // All operations in this context tagged with goal
 *   console.log(getGoal()); // 'book_meeting'
 * });
 * ```
 */

import { AsyncLocalStorage } from 'async_hooks';

// ============================================================================
// Storage Instances
// ============================================================================

/**
 * AsyncLocalStorage for trace ID propagation.
 * Automatically propagates through async operations.
 */
const traceStorage = new AsyncLocalStorage<string>();

/**
 * AsyncLocalStorage for parent span ID propagation.
 * Used to establish parent-child relationships between spans.
 */
const spanStorage = new AsyncLocalStorage<string>();

/**
 * AsyncLocalStorage for goal propagation.
 * Tracks the current goal/objective across operations.
 */
const goalStorage = new AsyncLocalStorage<string>();

// ============================================================================
// Trace ID Functions
// ============================================================================

/**
 * Get the current trace ID from context.
 *
 * @returns The current trace ID, or undefined if not set
 *
 * @example
 * ```typescript
 * await withTraceId('my-trace', async () => {
 *   console.log(getTraceId()); // 'my-trace'
 * });
 * console.log(getTraceId()); // undefined
 * ```
 */
export function getTraceId(): string | undefined {
  return traceStorage.getStore();
}

/**
 * Set the trace ID for the current execution context.
 *
 * Note: This sets the trace ID for the current context only.
 * For scoped execution, prefer `withTraceId()`.
 *
 * @param traceId - The trace ID to set
 *
 * @example
 * ```typescript
 * setTraceId('my-trace');
 * console.log(getTraceId()); // 'my-trace'
 * ```
 */
export function setTraceId(traceId: string): void {
  traceStorage.enterWith(traceId);
}

/**
 * Execute a function with a specific trace ID in context.
 *
 * The trace ID is automatically propagated through all async
 * operations within the function scope.
 *
 * @param traceId - The trace ID to use
 * @param fn - The function to execute
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * const result = await withTraceId('trace-123', async () => {
 *   // All spans created here will have trace_id = 'trace-123'
 *   const span = new SpanBuilder().start();
 *   return await performOperation();
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
 * Generate a new trace ID with timestamp and random components.
 *
 * Format: `{timestamp_base36}-{random_base36}`
 * Example: `lxyz123-abc456def789`
 *
 * @returns A new unique trace ID
 *
 * @example
 * ```typescript
 * const traceId = newTraceId();
 * console.log(traceId); // e.g., 'lxyz123-abc456def789'
 * ```
 */
export function newTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
}

// ============================================================================
// Span Context Functions
// ============================================================================

/**
 * Get the current parent span ID from context.
 *
 * @returns The current parent span ID, or undefined if not set
 *
 * @example
 * ```typescript
 * await withSpanContext('parent-span-id', async () => {
 *   console.log(getParentSpanId()); // 'parent-span-id'
 * });
 * ```
 */
export function getParentSpanId(): string | undefined {
  return spanStorage.getStore();
}

/**
 * Set the parent span ID for the current execution context.
 *
 * Note: This sets the parent span ID for the current context only.
 * For scoped execution, prefer `withSpanContext()`.
 *
 * @param spanId - The span ID to set as parent
 *
 * @example
 * ```typescript
 * setParentSpanId('parent-span-id');
 * // Subsequent spans will use this as parent_span_id
 * ```
 */
export function setParentSpanId(spanId: string): void {
  spanStorage.enterWith(spanId);
}

/**
 * Execute a function with a specific parent span ID in context.
 *
 * Use this to create parent-child span relationships.
 *
 * @param spanId - The span ID to use as parent
 * @param fn - The function to execute
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * const parentSpan = new SpanBuilder().setOperation('parent').start();
 *
 * await withSpanContext(parentSpan.getSpanId(), async () => {
 *   // All spans created here will have parent_span_id = parentSpan.span_id
 *   const childSpan = new SpanBuilder().setOperation('child').start();
 * });
 * ```
 */
export async function withSpanContext<T>(
  spanId: string,
  fn: () => Promise<T> | T
): Promise<T> {
  return spanStorage.run(spanId, fn);
}

// ============================================================================
// Goal Context Functions
// ============================================================================

/**
 * Get the current goal from context.
 *
 * @returns The current goal, or undefined if not set
 *
 * @example
 * ```typescript
 * await withGoal('summarize_document', async () => {
 *   console.log(getGoal()); // 'summarize_document'
 * });
 * ```
 */
export function getGoal(): string | undefined {
  return goalStorage.getStore();
}

/**
 * Set the goal for the current execution context.
 *
 * Note: This sets the goal for the current context only.
 * For scoped execution, prefer `withGoal()`.
 *
 * @param goal - The goal to set
 *
 * @example
 * ```typescript
 * setGoal('book_meeting');
 * console.log(getGoal()); // 'book_meeting'
 * ```
 */
export function setGoal(goal: string): void {
  goalStorage.enterWith(goal);
}

/**
 * Execute a function with a specific goal in context.
 *
 * The goal is automatically propagated through all async
 * operations within the function scope.
 *
 * @param goal - The goal to use
 * @param fn - The function to execute
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * await withGoal('translate_document', async () => {
 *   const goal = getGoal(); // 'translate_document'
 *   // Use goal for routing decisions, metadata, etc.
 * });
 * ```
 */
export async function withGoal<T>(
  goal: string,
  fn: () => Promise<T> | T
): Promise<T> {
  return goalStorage.run(goal, fn);
}

/**
 * Clear the goal for the current execution context.
 *
 * @example
 * ```typescript
 * setGoal('my_goal');
 * console.log(getGoal()); // 'my_goal'
 * clearGoal();
 * console.log(getGoal()); // undefined
 * ```
 */
export function clearGoal(): void {
  goalStorage.enterWith(undefined as unknown as string);
}

// ============================================================================
// Combined Context Functions
// ============================================================================

/**
 * Options for the traceContext helper.
 */
export interface TraceContextOptions {
  /** Trace ID to use (generates new one if not provided) */
  traceId?: string;
  /** Goal to set for this context */
  goal?: string;
}

/**
 * Execute a function with combined trace and goal context.
 *
 * This is a convenience helper that sets up both trace ID and goal
 * context in a single call.
 *
 * @param options - Context options (traceId, goal)
 * @param fn - The function to execute
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * await traceContext(
 *   { traceId: 'custom-trace', goal: 'summarize' },
 *   async () => {
 *     console.log(getTraceId()); // 'custom-trace'
 *     console.log(getGoal());    // 'summarize'
 *
 *     const span = new SpanBuilder().start();
 *     // span.trace_id = 'custom-trace'
 *   }
 * );
 * ```
 *
 * @example Auto-generated trace ID
 * ```typescript
 * await traceContext({ goal: 'process_document' }, async () => {
 *   console.log(getTraceId()); // Auto-generated, e.g., 'lxyz123-abc456'
 *   console.log(getGoal());    // 'process_document'
 * });
 * ```
 */
export async function traceContext<T>(
  options: TraceContextOptions,
  fn: () => Promise<T> | T
): Promise<T> {
  const traceId = options.traceId || newTraceId();

  // Wrap with trace context
  return traceStorage.run(traceId, async () => {
    // Optionally wrap with goal context
    if (options.goal) {
      return goalStorage.run(options.goal, fn);
    }
    return fn();
  });
}
