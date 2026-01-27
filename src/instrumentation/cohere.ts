/**
 * Kalibr Cohere Auto-Instrumentation
 *
 * Provides automatic tracing for Cohere API calls.
 *
 * @example
 * ```typescript
 * import { createTracedCohere } from '@kalibr/sdk';
 *
 * const cohere = createTracedCohere();
 * const response = await cohere.chat({
 *   model: 'command-r-plus',
 *   message: 'Hello!'
 * });
 * // Automatically traced!
 * ```
 */

import { traceWrapper } from './base';

// Type stub for Cohere client (optional peer dependency)
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface CohereClientStub {
  chat: (request: any) => Promise<any>;
}

/**
 * Create a traced Cohere client.
 *
 * Returns a new CohereClient instance with automatic tracing
 * enabled for chat() calls.
 *
 * @param apiKey - Optional API key (uses COHERE_API_KEY env var if not provided)
 * @returns A traced CohereClient
 *
 * @example
 * ```typescript
 * const cohere = createTracedCohere();
 * // or with explicit key
 * const cohere = createTracedCohere('your-api-key');
 *
 * const response = await cohere.chat({
 *   model: 'command-r-plus',
 *   message: 'Tell me a joke'
 * });
 * ```
 */
export function createTracedCohere(apiKey?: string): CohereClientStub {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { CohereClient } = require('cohere-ai');
  const client = new CohereClient({ token: apiKey });

  const originalChat = client.chat.bind(client);

  client.chat = async (request: any) => {
    return traceWrapper(
      'chat_completion',
      'cohere',
      request.model || 'command',
      () => originalChat(request),
      (result: any) => ({
        inputTokens: result.meta?.tokens?.inputTokens,
        outputTokens: result.meta?.tokens?.outputTokens,
        metadata: {
          finish_reason: result.finishReason,
        },
      })
    );
  };

  return client;
}
