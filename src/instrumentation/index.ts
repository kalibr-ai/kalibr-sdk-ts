/**
 * Kalibr Auto-Instrumentation
 *
 * Provides automatic tracing for popular LLM provider SDKs.
 * Simply wrap your client with the appropriate function to enable
 * automatic span creation for all API calls.
 *
 * @example
 * ```typescript
 * import {
 *   createTracedOpenAI,
 *   createTracedAnthropic,
 *   createTracedGoogle,
 *   createTracedCohere,
 * } from '@kalibr/sdk';
 *
 * // Create traced clients
 * const openai = createTracedOpenAI();
 * const anthropic = createTracedAnthropic();
 * const google = createTracedGoogle(process.env.GOOGLE_API_KEY!);
 * const cohere = createTracedCohere();
 *
 * // All API calls are now automatically traced
 * await openai.chat.completions.create({...});
 * await anthropic.messages.create({...});
 * ```
 */

// OpenAI
export { createTracedOpenAI, wrapOpenAI } from './openai';

// Anthropic
export { createTracedAnthropic, wrapAnthropic } from './anthropic';

// Google
export { createTracedGoogle } from './google';

// Cohere
export { createTracedCohere } from './cohere';

// Base utilities
export { traceWrapper } from './base';

/**
 * List of supported providers for auto-instrumentation.
 */
export const SUPPORTED_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'cohere',
] as const;

/**
 * Type representing supported providers.
 */
export type SupportedProvider = typeof SUPPORTED_PROVIDERS[number];
