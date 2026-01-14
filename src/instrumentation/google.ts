/**
 * Kalibr Google Generative AI Auto-Instrumentation
 *
 * Provides automatic tracing for Google Generative AI (Gemini) API calls.
 *
 * @example
 * ```typescript
 * import { createTracedGoogle } from '@kalibr/sdk';
 *
 * const genAI = createTracedGoogle(process.env.GOOGLE_API_KEY!);
 * const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
 * const result = await model.generateContent('Hello!');
 * // Automatically traced!
 * ```
 */

import { traceWrapper } from './base';

// Type stubs for Google Generative AI (optional peer dependency)
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface GoogleGenerativeAIClient {
  getGenerativeModel: (config: any) => GenerativeModelClient;
}

interface GenerativeModelClient {
  generateContent: (request: any) => Promise<any>;
}

/**
 * Create a traced Google Generative AI client.
 *
 * Returns a new GoogleGenerativeAI client instance with automatic tracing
 * enabled for generateContent() calls on models obtained via getGenerativeModel().
 *
 * @param apiKey - Google API key (required)
 * @returns A traced GoogleGenerativeAI client
 *
 * @example
 * ```typescript
 * const genAI = createTracedGoogle(process.env.GOOGLE_API_KEY!);
 * const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
 *
 * const result = await model.generateContent('Tell me a story');
 * console.log(result.response.text());
 * ```
 */
export function createTracedGoogle(apiKey: string): GoogleGenerativeAIClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const client = new GoogleGenerativeAI(apiKey);

  const originalGetModel = client.getGenerativeModel.bind(client);

  client.getGenerativeModel = (config: any) => {
    const model = originalGetModel(config);
    return wrapGoogleModel(model, config.model);
  };

  return client;
}

/**
 * Wrap a Google GenerativeModel with automatic tracing.
 *
 * @param model - The GenerativeModel instance to wrap
 * @param modelName - The model name for tracing
 * @returns The same model with tracing enabled
 * @internal
 */
function wrapGoogleModel(model: GenerativeModelClient, modelName: string): GenerativeModelClient {
  const originalGenerate = model.generateContent.bind(model);

  model.generateContent = async (request: any) => {
    return traceWrapper(
      'chat_completion',
      'google',
      modelName,
      () => originalGenerate(request),
      (result: any) => ({
        inputTokens: result.response?.usageMetadata?.promptTokenCount,
        outputTokens: result.response?.usageMetadata?.candidatesTokenCount,
        metadata: {
          finish_reason: 'stop',
        },
      })
    );
  };

  return model;
}
