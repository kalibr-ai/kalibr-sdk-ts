# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
