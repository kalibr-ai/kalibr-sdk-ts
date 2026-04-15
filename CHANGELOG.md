# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.10.0] - 2026-04-15

### Added
- **OpenAI Responses API instrumentation** — `createTracedOpenAI()` and `wrapOpenAI()` now auto-trace `client.responses.create()` alongside `chat.completions.create()`
- **Voice methods on Router**
  - `Router.synthesize(text, voice?, options?)` — text-to-speech via ElevenLabs (`elevenlabs/`), OpenAI TTS (`openai/tts-*`), or Deepgram (`deepgram/`)
  - `Router.transcribe(audio, options?)` — speech-to-text via OpenAI Whisper (`openai/whisper-*`) or Deepgram (`deepgram/`)
  - Both methods use the same routing + outcome-learning loop as `completion()`
- **Nebius AI Studio provider** — `nebius/` prefix routes to Nebius (OpenAI-compatible). Set `NEBIUS_API_KEY` env var. Supported models: `nebius/meta-llama/Llama-3.3-70B-Instruct`, `nebius/Qwen/Qwen2.5-72B-Instruct`
- **Tavily Search provider** — `tavily/basic` and `tavily/advanced` paths for web search. Set `TAVILY_API_KEY` env var. Results returned as JSON in ChatCompletion shim
- **HuggingFace model pricing** — added per-token pricing for Llama 3.3 70B, Mixtral 8x22B, Qwen2.5 72B, DeepSeek R1

## [1.6.0] - 2026-03-05

### Added
- `updateOutcome()` — update late-arriving outcome signals after initial report (e.g. customer reopened ticket 48hrs later)
- `getInsights()` — structured per-goal diagnostics: health status, failure mode breakdowns, path comparisons, actionable signals
- `KalibrChatCompletion` type — extends ChatCompletion with `kalibr_trace_id: string` so callers can pass it directly to `report()`
- `Router.complete()` — alias for `Router.completion()` matching Python SDK naming
- `redactText()`, `hashText()`, `redactAndHash()` — PII redaction utilities in src/redaction.ts (emails, phones, SSNs, credit cards, IPs)

### Fixed
- `Router.report()` now throws `Error` instead of silently warning when called before `completion()` — matches Python SDK behavior
- `setExplorationConfig()` now sends goal `"*"` as default when no goal specified, enabling global config (previously omitted the field entirely)
- `DecideResponse` now includes both `exploration` and `is_exploration` fields to handle backend version differences

## [1.5.0] - 2026-03-02

### Added
- failure_category parameter to Router.report() for structured failure tracking
- FAILURE_CATEGORIES constant and FailureCategory type (matches Python SDK)
- Validation of failure_category values before API submission

### Fixed
- Router.completion() now uses decision.trace_id from intelligence service (outcomes correctly linked to decisions)
- Router.completion() handles intelligence-selected models not in local paths
- Router.report() now sends model_id to intelligence service
- ReportOutcomeOptions includes failureCategory field

## [1.4.3] - 2026-02-16

### Fixed
- Updated pricing table with current models (GPT-5, Claude 4/Sonnet 4, Gemini 2.0/2.5)
- Updated normalizeModelName to handle new model naming patterns and date suffixes
- Added o4- and chatgpt- prefix detection in Router's detectProvider()

### Changed
- Version synced with Python SDK v1.4.3

## [1.4.0] - 2026-02-02

### Added

- **In-request fallback for graceful degradation**
  - Router now tries remaining registered paths when primary path fails
  - Eliminates user-visible errors during provider outages
  - When OpenAI/Anthropic/Google experiences an outage, SDK automatically tries backup paths
  - All failures still reported to intelligence service for Thompson Sampling learning
  - Preserves intelligent routing - this is a defensive safety net on top of Thompson Sampling
  - Matches Python SDK v1.4.0 behavior

## [1.2.11] - 2025-01-26

### Changed
- TraceCapsule rewritten to match Python SDK
  - Now supports hop tracking with rolling window (max 5 hops)
  - Aggregate cost/latency tracking across hops
  - Context token propagation for cross-MCP tracing
  - `appendHop()` method for adding operations
- Version synced with Python SDK v1.2.11

### Added
- `CapsuleHop` interface for typed hop data
- `TraceCapsuleData` interface for serialization
- `addHopToCapsule()` convenience function
- `TraceCapsule` class export (was only type before)

### Removed
- `addSpanToCapsule()` - replaced by `addHopToCapsule()`

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
