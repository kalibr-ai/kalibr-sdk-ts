/**
 * Kalibr Anthropic Auto-Instrumentation
 *
 * Provides automatic tracing for Anthropic API calls.
 *
 * @example
 * ```typescript
 * import { createTracedAnthropic } from '@kalibr/sdk';
 *
 * const anthropic = createTracedAnthropic();
 * const response = await anthropic.messages.create({
 *   model: 'claude-3-sonnet-20240229',
 *   max_tokens: 1024,
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * // Automatically traced!
 * ```
 */

import { traceWrapper } from './base';

// Type stub for Anthropic client (optional peer dependency)
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface AnthropicClient {
  messages: {
    create: (params: any, options?: any) => Promise<any>;
  };
}

/**
 * Create a traced Anthropic client.
 *
 * Returns a new Anthropic client instance with automatic tracing
 * enabled for messages.create() calls.
 *
 * @param apiKey - Optional API key (uses ANTHROPIC_API_KEY env var if not provided)
 * @returns A traced Anthropic client
 *
 * @example
 * ```typescript
 * const anthropic = createTracedAnthropic();
 * // or with explicit key
 * const anthropic = createTracedAnthropic('sk-ant-...');
 *
 * const response = await anthropic.messages.create({
 *   model: 'claude-3-sonnet-20240229',
 *   max_tokens: 1024,
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export function createTracedAnthropic(apiKey?: string): AnthropicClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AnthropicClass = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
  const client = new AnthropicClass({ apiKey });

  const originalCreate = client.messages.create.bind(client.messages);

  client.messages.create = async (params: any, options?: any) => {
    return traceWrapper(
      'chat_completion',
      'anthropic',
      params.model,
      () => originalCreate(params, options),
      (result: any) => ({
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
        metadata: {
          stop_reason: result.stop_reason,
        },
      })
    );
  };

  return client;
}

/**
 * Wrap an existing Anthropic client with automatic tracing.
 *
 * Modifies the client in-place to add tracing to messages.create().
 *
 * @param client - An existing Anthropic client instance
 * @returns The same client with tracing enabled
 *
 * @example
 * ```typescript
 * import Anthropic from '@anthropic-ai/sdk';
 * import { wrapAnthropic } from '@kalibr/sdk';
 *
 * const anthropic = new Anthropic();
 * wrapAnthropic(anthropic);
 *
 * // All subsequent calls are traced
 * const response = await anthropic.messages.create({...});
 * ```
 */
export function wrapAnthropic<T extends AnthropicClient>(client: T): T {
  const originalCreate = client.messages.create.bind(client.messages);

  client.messages.create = async (params: any, options?: any) => {
    return traceWrapper(
      'chat_completion',
      'anthropic',
      params.model,
      () => originalCreate(params, options),
      (result: any) => ({
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
        metadata: {
          stop_reason: result.stop_reason,
        },
      })
    );
  };

  return client;
}
