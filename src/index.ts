/**
 * Kalibr TypeScript SDK
 *
 * Zero-dependency LLM observability SDK for Next.js and TypeScript applications.
 *
 * @example
 * ```typescript
 * import { Kalibr, SpanBuilder } from '@kalibr/sdk';
 *
 * // Initialize once (e.g., in app/layout.tsx or pages/_app.tsx)
 * Kalibr.init({
 *   apiKey: process.env.KALIBR_API_KEY!,
 *   tenantId: process.env.KALIBR_TENANT_ID!,
 * });
 *
 * // Use SpanBuilder for automatic timing
 * const span = new SpanBuilder()
 *   .setProvider('openai')
 *   .setModel('gpt-4o')
 *   .setOperation('chat_completion')
 *   .start();
 *
 * const response = await openai.chat.completions.create({...});
 *
 * await span.finish({
 *   inputTokens: response.usage.prompt_tokens,
 *   outputTokens: response.usage.completion_tokens,
 * });
 * ```
 *
 * @packageDocumentation
 */

// Main exports
export {
  // Client
  Kalibr,
  type KalibrConfig,
  // Builder
  SpanBuilder,
  StartedSpan,
  type FinishOptions,
  // Types
  type KalibrSpan,
  type PartialSpan,
  type Provider,
  type Status,
  type Environment,
  type DataClass,
  // Utilities
  generateId,
  timestamp,
  calculateCost,
  createSpan,
  withSpan,
} from './kalibr';

// Intelligence & Routing exports
export {
  // Client
  KalibrIntelligence,
  type KalibrIntelligenceConfig,
  // Request option types
  type GetPolicyOptions,
  type ReportOutcomeOptions,
  type RegisterPathOptions,
  type ListPathsOptions,
  type DecideOptions,
  type ExplorationConfigOptions,
  // Response types
  type PolicyResponse,
  type OutcomeResponse,
  type PathResponse,
  type PathInfo,
  type ListPathsResponse,
  type DisablePathResponse,
  type DecideResponse,
  type ExplorationConfigResponse,
  // Convenience functions
  getPolicy,
  reportOutcome,
  registerPath,
  decide,
} from './intelligence';

// Router exports
export {
  Router,
  type RouterConfig,
  type PathConfig,
  type PathSpec,
  type CompletionOptions,
  type Message,
  type ChatCompletion,
} from './router';

// Context Management (Phase 2)
export {
  getTraceId,
  setTraceId,
  withTraceId,
  newTraceId,
  getParentSpanId,
  setParentSpanId,
  withSpanContext,
  getGoal,
  setGoal,
  withGoal,
  clearGoal,
  traceContext,
} from './context';

// Function Wrappers (Phase 3)
export {
  withTrace,
  traced,
  type TraceConfig,
} from './trace';

// Auto-Instrumentation (Phase 4)
export {
  createTracedOpenAI,
  wrapOpenAI,
  createTracedAnthropic,
  wrapAnthropic,
  createTracedGoogle,
  createTracedCohere,
  traceWrapper,
  SUPPORTED_PROVIDERS,
  type SupportedProvider,
} from './instrumentation';

// TraceCapsule (Phase 5)
export {
  type TraceCapsule,
  getOrCreateCapsule,
  addSpanToCapsule,
  serializeCapsule,
  deserializeCapsule,
  clearCapsule,
  flushCapsule,
  getCurrentCapsule,
  setCapsuleMetadata,
} from './capsule';
