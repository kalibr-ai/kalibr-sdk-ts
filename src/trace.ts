/**
 * Kalibr Function Wrappers
 *
 * Provides convenient wrappers for automatically tracing functions and
 * code blocks with minimal boilerplate.
 *
 * @example
 * ```typescript
 * import { withTrace, traced } from '@kalibr/sdk';
 *
 * // Wrap a function
 * const chat = withTrace(
 *   async (prompt: string) => openai.chat.completions.create({...}),
 *   { operation: 'chat', provider: 'openai' }
 * );
 *
 * // Trace a code block
 * await traced({ operation: 'process_order' }, async () => {
 *   // ... operations
 *   return result;
 * });
 * ```
 */

import { SpanBuilder } from './kalibr';
import type { Provider } from './kalibr';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for traced functions and blocks.
 */
export interface TraceConfig {
  /** Operation name (e.g., 'chat_completion', 'summarize') */
  operation: string;
  /** LLM provider (optional, defaults based on usage) */
  provider?: string;
  /** Model identifier (optional) */
  model?: string;
  /** Custom metadata to attach to the span */
  metadata?: Record<string, any>;
}

// ============================================================================
// Function Wrappers
// ============================================================================

/**
 * Wrap a function with automatic tracing.
 *
 * Creates a new function that automatically creates a span when called,
 * tracks execution time, and reports success or failure.
 *
 * @param fn - The async function to wrap
 * @param config - Trace configuration
 * @returns A wrapped function with the same signature
 *
 * @example
 * ```typescript
 * const chat = withTrace(
 *   async (prompt: string) => openai.chat.completions.create({
 *     model: 'gpt-4o',
 *     messages: [{ role: 'user', content: prompt }]
 *   }),
 *   { operation: 'chat', provider: 'openai', model: 'gpt-4o' }
 * );
 *
 * // Now calling chat() is automatically traced
 * const response = await chat('Hello!');
 * ```
 */
export function withTrace<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: TraceConfig
): T {
  return (async (...args: any[]) => {
    const span = new SpanBuilder()
      .setOperation(config.operation)
      .setMetadata(config.metadata || {});

    if (config.provider) {
      span.setProvider(config.provider as Provider);
    }

    if (config.model) {
      span.setModel(config.model);
    }

    const startedSpan = span.start();

    try {
      const result = await fn(...args);
      await startedSpan.finish({
        inputTokens: 0,
        outputTokens: 0,
        status: 'success',
      });
      return result;
    } catch (error) {
      await startedSpan.finish({
        inputTokens: 0,
        outputTokens: 0,
        status: 'error',
        errorType: (error as Error).name || 'Error',
        errorMessage: (error as Error).message,
        stackTrace: (error as Error).stack,
      });
      throw error;
    }
  }) as T;
}

/**
 * Execute a block of code with automatic tracing.
 *
 * Creates a span, executes the function, and automatically finishes
 * the span with success or error status.
 *
 * @param config - Trace configuration
 * @param fn - The async function to execute
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * const result = await traced(
 *   { operation: 'process_order', provider: 'openai', model: 'gpt-4o' },
 *   async () => {
 *     // Perform operations
 *     const summary = await summarize(document);
 *     const analysis = await analyze(summary);
 *     return { summary, analysis };
 *   }
 * );
 * ```
 */
export async function traced<T>(
  config: TraceConfig,
  fn: () => Promise<T>
): Promise<T> {
  const span = new SpanBuilder()
    .setOperation(config.operation)
    .setMetadata(config.metadata || {});

  if (config.provider) {
    span.setProvider(config.provider as Provider);
  }

  if (config.model) {
    span.setModel(config.model);
  }

  const startedSpan = span.start();

  try {
    const result = await fn();
    await startedSpan.finish({
      inputTokens: 0,
      outputTokens: 0,
      status: 'success',
    });
    return result;
  } catch (error) {
    await startedSpan.finish({
      inputTokens: 0,
      outputTokens: 0,
      status: 'error',
      errorType: (error as Error).name || 'Error',
      errorMessage: (error as Error).message,
      stackTrace: (error as Error).stack,
    });
    throw error;
  }
}

