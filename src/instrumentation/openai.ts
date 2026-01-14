/**
 * Kalibr OpenAI Auto-Instrumentation
 *
 * Provides automatic tracing for OpenAI API calls.
 *
 * @example
 * ```typescript
 * import { createTracedOpenAI } from '@kalibr/sdk';
 *
 * const openai = createTracedOpenAI();
 * const response = await openai.chat.completions.create({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * // Automatically traced!
 * ```
 */

import { traceWrapper } from './base';

// Type stub for OpenAI client (optional peer dependency)
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface OpenAIClient {
  chat: {
    completions: {
      create: (params: any, options?: any) => Promise<any>;
    };
  };
}

/**
 * Create a traced OpenAI client.
 *
 * Returns a new OpenAI client instance with automatic tracing
 * enabled for chat.completions.create() calls.
 *
 * @param apiKey - Optional API key (uses OPENAI_API_KEY env var if not provided)
 * @returns A traced OpenAI client
 *
 * @example
 * ```typescript
 * const openai = createTracedOpenAI();
 * // or with explicit key
 * const openai = createTracedOpenAI('sk-...');
 *
 * const response = await openai.chat.completions.create({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export function createTracedOpenAI(apiKey?: string): OpenAIClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const OpenAIClass = require('openai').default || require('openai');
  const client = new OpenAIClass({ apiKey });

  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

  client.chat.completions.create = async (params: any, options?: any) => {
    return traceWrapper(
      'chat_completion',
      'openai',
      params.model,
      () => originalCreate(params, options),
      (result: any) => ({
        inputTokens: result.usage?.prompt_tokens,
        outputTokens: result.usage?.completion_tokens,
        metadata: {
          finish_reason: result.choices?.[0]?.finish_reason,
        },
      })
    );
  };

  return client;
}

/**
 * Wrap an existing OpenAI client with automatic tracing.
 *
 * Modifies the client in-place to add tracing to chat.completions.create().
 *
 * @param client - An existing OpenAI client instance
 * @returns The same client with tracing enabled
 *
 * @example
 * ```typescript
 * import OpenAI from 'openai';
 * import { wrapOpenAI } from '@kalibr/sdk';
 *
 * const openai = new OpenAI();
 * wrapOpenAI(openai);
 *
 * // All subsequent calls are traced
 * const response = await openai.chat.completions.create({...});
 * ```
 */
export function wrapOpenAI<T extends OpenAIClient>(client: T): T {
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

  client.chat.completions.create = async (params: any, options?: any) => {
    return traceWrapper(
      'chat_completion',
      'openai',
      params.model,
      () => originalCreate(params, options),
      (result: any) => ({
        inputTokens: result.usage?.prompt_tokens,
        outputTokens: result.usage?.completion_tokens,
        metadata: {
          finish_reason: result.choices?.[0]?.finish_reason,
        },
      })
    );
  };

  return client;
}
