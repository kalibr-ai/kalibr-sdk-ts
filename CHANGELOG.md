# Changelog

All notable changes to the Kalibr TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-01-14

### Added

#### 🎯 Router Class
- High-level routing API with automatic model selection based on learned outcomes
- Support for OpenAI, Anthropic, Google Gemini, and Cohere providers
- Auto-outcome reporting with `successWhen` callback functions
- Unified OpenAI-compatible interface across all providers
- Intelligent fallback handling and automatic error reporting
- Dynamic path registration and exploration rate configuration

#### 🔄 Auto-Instrumentation (Wrapper-Based)
- `createTracedOpenAI()` - Zero-config OpenAI client with automatic tracing
- `createTracedAnthropic()` - Zero-config Anthropic client with automatic tracing
- `createTracedGoogle(apiKey)` - Zero-config Google Gemini client with automatic tracing
- `createTracedCohere()` - Zero-config Cohere client with automatic tracing
- `wrapOpenAI(client)` - Wrap existing OpenAI client for tracing
- `wrapAnthropic(client)` - Wrap existing Anthropic client for tracing
- Automatic usage token extraction and cost calculation
- Preserves full type safety with TypeScript

#### 🧠 Context Management
- AsyncLocalStorage-based context propagation for traces, spans, and goals
- `withTraceId(traceId, fn)` - Execute function with scoped trace ID
- `withSpanContext(spanId, fn)` - Automatic parent-child span relationships
- `withGoal(goal, fn)` - Goal-based context for all nested operations
- `traceContext(options, fn)` - Combined trace + goal context
- Context getters/setters: `getTraceId()`, `setTraceId()`, `newTraceId()`
- Span context: `getParentSpanId()`, `setParentSpanId()`
- Goal context: `getGoal()`, `setGoal()`, `clearGoal()`

#### 🎨 Function Wrappers
- `withTrace(fn, config)` - Wrap any async function with automatic tracing
- `traced(config, fn)` - Trace a code block with automatic span lifecycle management
- Type-safe function wrapping that preserves original signatures
- Automatic error capture and span finalization

#### 📦 TraceCapsule
- Span bundling for efficient batch operations
- Serialization/deserialization for distributed tracing
- `getOrCreateCapsule()` - Get or create trace capsule for current trace
- `addSpanToCapsule(span)` - Add span to current capsule
- `serializeCapsule(capsule)` - Serialize capsule to JSON string
- `deserializeCapsule(data)` - Deserialize capsule from JSON
- `clearCapsule()` - Clear current capsule
- `flushCapsule()` - Flush and send capsule to backend

### Changed
- **SpanBuilder** now uses context for automatic `trace_id` and `parent_span_id` propagation
- **Router** integrates with context system for trace tracking
- Updated README with comprehensive documentation for all new features
- Improved error handling and logging throughout

### Technical Details
- ✅ All changes are **100% backward compatible**
- ✅ Zero breaking changes to existing SpanBuilder or Kalibr client APIs
- ✅ All peer dependencies are optional (install only what you need)
- ✅ Uses AsyncLocalStorage (Node.js 12.17.0+)
- ✅ Full TypeScript 5.0+ support with strict mode
- ✅ Wrapper-based auto-instrumentation (not proxy-based)
- ✅ Dynamic imports keep bundle size minimal

### Migration Guide
No migration needed! All new features are additive. Existing code continues to work unchanged.

To use new features:
```typescript
// Old way (still works)
const span = new SpanBuilder().setProvider('openai').start();

// New way - Router
const router = new Router({ goal: 'chat', paths: ['gpt-4o'] });
const response = await router.completion([...]);

// New way - Auto-instrumentation
const openai = createTracedOpenAI();
await openai.chat.completions.create({...});
```

## [1.0.0] - 2024-12-23

### Added

- Zero-dependency TypeScript SDK for Kalibr LLM observability
- `Kalibr` client with singleton support
- `SpanBuilder` for fluent span creation with auto-timing
- Built-in cost calculation for OpenAI, Anthropic, Google, and Cohere
- NDJSON batching for efficient span sending
- Full TypeScript types matching Python SDK schema
- Next.js integration examples
- `withSpan` utility for automatic span wrapping

## [0.0.3-alpha] - 2024-12-16

### Changed

- Bug fixes and improvements

## [0.0.2-alpha] - 2024-12-07

### Added

- Initial alpha release

---

[1.2.0]: https://github.com/kalibr-ai/kalibr-sdk-ts/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/kalibr-ai/kalibr-sdk-ts/compare/v0.0.3-alpha...v1.0.0
[0.0.3-alpha]: https://github.com/kalibr-ai/kalibr-sdk-ts/compare/v0.0.2-alpha...v0.0.3-alpha
[0.0.2-alpha]: https://github.com/kalibr-ai/kalibr-sdk-ts/releases/tag/v0.0.2-alpha
