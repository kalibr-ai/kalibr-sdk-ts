/**
 * Kalibr Auto-Instrumentation Base
 *
 * Provides the generic wrapper function for tracing async operations
 * with automatic usage extraction.
 */

import { SpanBuilder } from '../kalibr';
import type { Provider } from '../kalibr';

/**
 * Generic wrapper for tracing async functions with usage extraction.
 *
 * Automatically creates a span, executes the function, extracts usage
 * information from the result, and finishes the span.
 *
 * @param operation - The operation name (e.g., 'chat_completion')
 * @param provider - The LLM provider name
 * @param model - The model identifier
 * @param fn - The async function to execute
 * @param extractUsage - Optional function to extract token counts from the result
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * const result = await traceWrapper(
 *   'chat_completion',
 *   'openai',
 *   'gpt-4o',
 *   () => client.chat.completions.create(params),
 *   (result) => ({
 *     inputTokens: result.usage?.prompt_tokens,
 *     outputTokens: result.usage?.completion_tokens,
 *   })
 * );
 * ```
 */
export async function traceWrapper<T>(
  operation: string,
  provider: string,
  model: string,
  fn: () => Promise<T>,
  extractUsage?: (result: T) => {
    inputTokens?: number;
    outputTokens?: number;
    metadata?: any;
  }
): Promise<T> {
  const span = new SpanBuilder()
    .setProvider(provider as Provider)
    .setModel(model)
    .setOperation(operation)
    .start();

  try {
    const result = await fn();

    if (extractUsage) {
      const usage = extractUsage(result);
      await span.finish({
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        metadata: usage.metadata,
      });
    } else {
      await span.finish({
        inputTokens: 0,
        outputTokens: 0,
      });
    }

    return result;
  } catch (error) {
    await span.finish({
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
