# @kalibr/sdk

Zero-dependency TypeScript SDK for Kalibr LLM observability. Track costs, latency, and token usage across OpenAI, Anthropic, Google, and Cohere models.

[![npm version](https://img.shields.io/npm/v/@kalibr/sdk)](https://www.npmjs.com/package/@kalibr/sdk)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

## Features

- **Zero dependencies** - Uses native `fetch`, works in Node.js 18+, Edge runtimes, and browsers
- **Intelligent Router** - Automatic model routing with outcome learning across OpenAI, Anthropic, Google, Cohere
- **Execution Intelligence** - Query optimal models based on historical performance with `getPolicy()` and `decide()`
- **Outcome Tracking** - Report success/failure to continuously improve routing decisions
- **Auto-Instrumentation** - Wrap LLM clients for zero-config tracing
- **Context Propagation** - Automatic trace ID and goal propagation across async boundaries
- **Cost Calculation** - Built-in pricing tables for all major LLM providers
- **TypeScript-first** - Full type definitions with strict mode

## Installation

```bash
npm install @kalibr/sdk
# or
yarn add @kalibr/sdk
# or
pnpm add @kalibr/sdk
```

## Quick Start

### 1. Initialize the SDK

```typescript
import { Kalibr } from '@kalibr/sdk';

// Initialize once at app startup
Kalibr.init({
  apiKey: process.env.KALIBR_API_KEY!,
  tenantId: process.env.KALIBR_TENANT_ID!,
  environment: 'prod',    // optional: 'prod' | 'staging' | 'dev'
  service: 'my-app',      // optional: service name
  debug: true,            // optional: enable console logging
});
```

### 2. Track LLM Calls with SpanBuilder (Recommended)

```typescript
import { SpanBuilder } from '@kalibr/sdk';
import OpenAI from 'openai';

const openai = new OpenAI();

async function chat(prompt: string) {
  // Start timing
  const span = new SpanBuilder()
    .setProvider('openai')
    .setModel('gpt-4o')
    .setOperation('chat_completion')
    .setEndpoint('chat.completions.create')
    .start();

  try {
    // Make the LLM call
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    });

    // Finish and send span (auto-calculates duration and cost)
    await span.finish({
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    });

    return response.choices[0]?.message?.content;
  } catch (error) {
    // Record error and send span
    await span.error(error as Error, {
      inputTokens: 0,
      outputTokens: 0,
    });
    throw error;
  }
}
```

### 3. Track Nested Spans (Multi-step Workflows)

```typescript
import { SpanBuilder, generateId } from '@kalibr/sdk';

async function processDocument(document: string) {
  // Create a shared trace ID for the workflow
  const traceId = generateId();

  // Step 1: Summarize
  const summarySpan = new SpanBuilder()
    .setTraceId(traceId)
    .setProvider('openai')
    .setModel('gpt-4o')
    .setOperation('summarize')
    .setWorkflowId('document-processor')
    .start();

  const summary = await callLLM('Summarize this: ' + document);

  await summarySpan.finish({
    inputTokens: summary.usage.prompt_tokens,
    outputTokens: summary.usage.completion_tokens,
  });

  // Step 2: Extract entities (child span)
  const extractSpan = new SpanBuilder()
    .setTraceId(traceId)
    .setParentSpanId(summarySpan.getSpanId())
    .setProvider('anthropic')
    .setModel('claude-3-sonnet-20240229')
    .setOperation('extract_entities')
    .setWorkflowId('document-processor')
    .start();

  const entities = await callClaude('Extract entities: ' + summary.text);

  await extractSpan.finish({
    inputTokens: entities.usage.input_tokens,
    outputTokens: entities.usage.output_tokens,
  });

  return { summary: summary.text, entities: entities.text };
}
```

## Router (Recommended)

The Router is the easiest way to use Kalibr. It handles model selection, tracing, and outcome reporting automatically.

### Basic Usage

```typescript
import { Router } from '@kalibr/sdk';

const router = new Router({
  goal: 'summarize_article',
  paths: ['gpt-4o', 'claude-3-sonnet', 'gemini-1.5-pro'],
  successWhen: (output) => output.length > 100 && output.length < 500
});

// Router automatically:
// 1. Queries intelligence API for best model
// 2. Makes the LLM call
// 3. Evaluates success using your callback
// 4. Reports outcome to improve future routing
const response = await router.completion([
  { role: 'user', content: 'Summarize this article...' }
]);

console.log(response.choices[0].message.content);
```

### Manual Outcome Reporting

For complex validation logic, omit `successWhen` and report manually:

```typescript
const router = new Router({
  goal: 'book_meeting',
  paths: ['gpt-4o', 'claude-3-sonnet'],
});

const response = await router.completion([
  { role: 'user', content: 'Schedule a meeting with Alice tomorrow at 2pm' }
]);

// Your custom validation logic
const meetingBooked = await checkCalendarAPI();

// Report the outcome
await router.report(meetingBooked, meetingBooked ? undefined : 'Calendar conflict');
```

### Advanced Path Configuration

```typescript
const router = new Router({
  goal: 'code_review',
  paths: [
    { model: 'gpt-4o', tools: ['code_analyzer'], params: { temperature: 0.2 } },
    { model: 'claude-3-opus', params: { detailed: true } },
    'gemini-1.5-pro',  // Simple string also works
  ],
  explorationRate: 0.1,  // 10% exploration of new paths
  autoRegister: true,    // Register paths with intelligence API (default)
});
```

### Router API

| Method | Description |
|--------|-------------|
| `completion(messages, options?)` | Make a routed completion request |
| `report(success, reason?, score?)` | Report outcome for last completion |
| `addPath(model, tools?, params?)` | Add a new path dynamically |
| `getLastDecision()` | Get the last routing decision (for debugging) |
| `getLastTraceId()` | Get the trace ID from last completion |

### Forcing a Specific Model

```typescript
// Bypass routing and use a specific model
const response = await router.completion(messages, {
  forceModel: 'gpt-4o',
});
```

## Intelligence API

The Intelligence API provides outcome-conditioned routing - your agents learn which models work best for each goal.

### Initialize

```typescript
import { KalibrIntelligence } from '@kalibr/sdk';

KalibrIntelligence.init({
  apiKey: process.env.KALIBR_API_KEY!,
  tenantId: process.env.KALIBR_TENANT_ID!,
});
```

### Core Functions

#### getPolicy() - Get Model Recommendation

```typescript
import { getPolicy } from '@kalibr/sdk';

const policy = await getPolicy('book_meeting', {
  taskType: 'scheduling',
  constraints: {
    max_cost_usd: 0.05,
    max_latency_ms: 3000,
  },
  windowHours: 168,  // Look at last 7 days of data
});

console.log(policy.model_id);           // Recommended model
console.log(policy.confidence);         // Confidence score
console.log(policy.outcome_success_rate); // Historical success rate
```

#### decide() - Intelligent Routing Decision

```typescript
import { decide } from '@kalibr/sdk';

const decision = await decide('book_meeting', {
  taskRiskLevel: 'low',  // 'low' | 'medium' | 'high'
});

console.log(decision.model_id);     // Selected model
console.log(decision.tool_id);      // Selected tool (if any)
console.log(decision.confidence);   // Confidence score
console.log(decision.exploration);  // True if exploring new path
console.log(decision.reason);       // Human-readable explanation
```

#### reportOutcome() - Report Success/Failure

```typescript
import { reportOutcome } from '@kalibr/sdk';

await reportOutcome(traceId, 'book_meeting', true, {
  score: 0.95,              // Quality score 0-1
  modelId: 'gpt-4o',        // Which model was used
  toolId: 'calendar_api',   // Which tool was used
  metadata: { attendees: 5 },
});

// Report failure
await reportOutcome(traceId, 'book_meeting', false, {
  failureReason: 'calendar_conflict',
  modelId: 'gpt-4o',
});
```

#### registerPath() - Register Execution Paths

```typescript
import { registerPath } from '@kalibr/sdk';

await registerPath('book_meeting', 'gpt-4o', {
  toolId: 'calendar_api',
  params: { temperature: 0.3 },
  riskLevel: 'low',  // 'low' | 'medium' | 'high'
});
```

#### listPaths() - List Registered Paths

```typescript
import { listPaths } from '@kalibr/sdk';

const { paths } = await listPaths({
  goal: 'book_meeting',
  includeDisabled: false,
});

paths.forEach(p => {
  console.log(`${p.path_id}: ${p.model_id} - ${p.success_rate}% success`);
});
```

#### disablePath() - Disable a Path

```typescript
import { disablePath } from '@kalibr/sdk';

await disablePath('path-123');
```

#### getRecommendation() - Task-Based Recommendation

```typescript
import { getRecommendation } from '@kalibr/sdk';

const rec = await getRecommendation('summarization', {
  goal: 'summarize_article',
  optimizeFor: 'quality',  // 'cost' | 'quality' | 'latency' | 'balanced'
  windowHours: 24,
});

console.log(rec.model_id);
console.log(rec.confidence);
```

#### Exploration Configuration

```typescript
import { setExplorationConfig, getExplorationConfig } from '@kalibr/sdk';

// Configure exploration/exploitation balance
await setExplorationConfig({
  goal: 'book_meeting',
  explorationRate: 0.1,           // 10% exploration
  minSamplesBeforeExploit: 20,    // Need 20 samples before exploiting
  rollbackThreshold: 0.3,         // Rollback if performance drops 30%
  stalenessDays: 7,               // Re-explore after 7 days
});

// Get current config
const config = await getExplorationConfig('book_meeting');
console.log(config.exploration_rate);
```

## Context Management

Propagate trace IDs and goals across async boundaries using AsyncLocalStorage.

### Trace Context

```typescript
import { withTraceId, getTraceId, newTraceId, setTraceId } from '@kalibr/sdk';

// Generate a new trace ID
const traceId = newTraceId();

// Run code within a trace context
await withTraceId(traceId, async () => {
  console.log(getTraceId());  // Returns traceId
  await nestedOperation();     // Also has access to traceId
});

// Or set imperatively
setTraceId(traceId);
```

### Goal Context

```typescript
import { withGoal, getGoal, setGoal, clearGoal } from '@kalibr/sdk';

// Run code within a goal context
await withGoal('book_meeting', async () => {
  console.log(getGoal());  // 'book_meeting'
  // All Kalibr operations inherit this goal
});

// Or set imperatively
setGoal('book_meeting');
// ... do work ...
clearGoal();
```

### Combined Context

```typescript
import { traceContext } from '@kalibr/sdk';

await traceContext(
  { traceId: 'my-trace', goal: 'summarize' },
  async () => {
    // Both trace ID and goal available here
  }
);
```

## Auto-Instrumentation

Wrap LLM clients for automatic tracing with zero code changes.

### OpenAI

```typescript
import { createTracedOpenAI } from '@kalibr/sdk';

// Creates a traced OpenAI client
const openai = createTracedOpenAI();

// All calls automatically traced!
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### Anthropic

```typescript
import { createTracedAnthropic } from '@kalibr/sdk';

const anthropic = createTracedAnthropic();

const response = await anthropic.messages.create({
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### Google (Gemini)

```typescript
import { createTracedGoogle } from '@kalibr/sdk';

const google = createTracedGoogle();
// Use with Google Generative AI SDK
```

### Cohere

```typescript
import { createTracedCohere } from '@kalibr/sdk';

const cohere = createTracedCohere();
// Use with Cohere SDK
```

### Wrapping Existing Clients

```typescript
import { wrapOpenAI, wrapAnthropic } from '@kalibr/sdk';
import OpenAI from 'openai';

const openai = new OpenAI();
const tracedOpenAI = wrapOpenAI(openai);
```

## API Reference

### Kalibr (Client)

The main client class with singleton support.

```typescript
// Singleton pattern
Kalibr.init(config);
await Kalibr.sendSpan(span);
await Kalibr.sendSpans([span1, span2]);

// Direct instantiation
const client = new Kalibr(config);
await client.sendSpan(span);
```

#### Config Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | `string` | Yes | API key for X-API-Key header |
| `tenantId` | `string` | Yes | Your tenant identifier |
| `endpoint` | `string` | No | API URL (default: `https://api.kalibr.systems/api/ingest`) |
| `environment` | `'prod' \| 'staging' \| 'dev'` | No | Deployment environment |
| `service` | `string` | No | Service name |
| `debug` | `boolean` | No | Enable debug logging |
| `fetch` | `typeof fetch` | No | Custom fetch implementation |

### SpanBuilder

Fluent builder for creating spans with automatic timing.

```typescript
const span = new SpanBuilder()
  // Required
  .setProvider('openai')           // 'openai' | 'anthropic' | 'google' | 'cohere' | 'custom'
  .setModel('gpt-4o')              // Model ID
  .setOperation('chat_completion') // Operation type

  // Optional identity
  .setTraceId(traceId)             // Link spans together
  .setParentSpanId(parentId)       // Create hierarchy
  .setTenantId(tenantId)           // Override client default

  // Optional context
  .setWorkflowId('my-workflow')
  .setSandboxId('sandbox-123')
  .setRuntimeEnv('vercel_vm')
  .setEndpoint('api/chat')
  .setEnvironment('prod')
  .setService('chat-service')

  // Optional user context
  .setUserId('user-123')
  .setRequestId('req-456')

  // Optional metadata
  .setMetadata({ custom: 'data' })
  .setDataClass('economic')

  // Start timing
  .start();
```

#### StartedSpan Methods

```typescript
// Get IDs
span.getTraceId();  // Returns trace ID
span.getSpanId();   // Returns span ID

// Finish successfully
await span.finish({
  inputTokens: 100,
  outputTokens: 50,
  status: 'success',      // optional, default: 'success'
  costUsd: 0.001,         // optional, auto-calculated if omitted
  metadata: { key: 'val' }, // optional, merged with builder metadata
  autoSend: true,         // optional, default: true
});

// Finish with error
await span.error(error, { inputTokens: 0, outputTokens: 0 });

// Finish with timeout
await span.timeout({ inputTokens: 100, outputTokens: 0 });
```

### Utility Functions

```typescript
import { generateId, timestamp, calculateCost, createSpan, withSpan } from '@kalibr/sdk';

// Generate 32-char hex ID
const id = generateId(); // e.g., "a1b2c3d4e5f6789012345678abcdef01"

// Get ISO 8601 timestamp
const ts = timestamp(); // e.g., "2024-01-15T10:30:00.000Z"

// Calculate cost from tokens
const cost = calculateCost('openai', 'gpt-4o', 1000, 500); // $0.0075

// Create a span manually
const span = createSpan({
  tenantId: 'my-tenant',
  provider: 'anthropic',
  modelId: 'claude-3-opus-20240229',
  operation: 'generate',
  durationMs: 1500,
  inputTokens: 500,
  outputTokens: 200,
});

// Wrap a function with automatic span tracking
const result = await withSpan(
  { provider: 'openai', modelId: 'gpt-4o', operation: 'chat' },
  async () => {
    const response = await llmCall();
    return {
      result: response.text,
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
    };
  }
);
```

### KalibrSpan Type

Full type definition matching the Python SDK's TraceEvent:

```typescript
interface KalibrSpan {
  // Required fields
  schema_version: '1.0';
  trace_id: string;       // min 16 chars
  span_id: string;        // min 16 chars
  tenant_id: string;
  provider: 'openai' | 'anthropic' | 'google' | 'cohere' | 'custom';
  model_id: string;
  operation: string;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  status: 'success' | 'error' | 'timeout';
  timestamp: string;      // ISO 8601

  // Optional fields
  parent_span_id?: string | null;
  workflow_id?: string | null;
  sandbox_id?: string | null;
  runtime_env?: string | null;
  model_name?: string | null;
  endpoint?: string | null;
  latency_ms?: number | null;
  total_tokens?: number | null;
  total_cost_usd?: number | null;
  unit_price_usd?: number | null;
  error_type?: string | null;
  error_message?: string | null;
  stack_trace?: string | null;
  ts_start?: string | null;
  ts_end?: string | null;
  environment?: 'prod' | 'staging' | 'dev' | null;
  service?: string | null;
  user_id?: string | null;
  request_id?: string | null;
  metadata?: Record<string, unknown> | null;
  data_class?: 'economic' | 'performance' | 'diagnostic' | null;
  vendor?: string | null;  // legacy, same as provider
}
```

## Next.js Integration

### App Router (app/layout.tsx)

```typescript
// lib/kalibr.ts
import { Kalibr } from '@kalibr/sdk';

// Initialize once
if (!Kalibr.isInitialized()) {
  Kalibr.init({
    apiKey: process.env.KALIBR_API_KEY!,
    tenantId: process.env.KALIBR_TENANT_ID!,
    environment: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
    service: 'my-nextjs-app',
  });
}

export { Kalibr, SpanBuilder } from '@kalibr/sdk';
```

### API Route Handler

```typescript
// app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { SpanBuilder } from '@/lib/kalibr';
import OpenAI from 'openai';

const openai = new OpenAI();

export async function POST(request: Request) {
  const { messages } = await request.json();

  const span = new SpanBuilder()
    .setProvider('openai')
    .setModel('gpt-4o')
    .setOperation('chat_completion')
    .setEndpoint('/api/chat')
    .setRequestId(request.headers.get('x-request-id') ?? undefined)
    .start();

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
    });

    await span.finish({
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    });

    return NextResponse.json({
      message: response.choices[0]?.message?.content,
    });
  } catch (error) {
    await span.error(error as Error, { inputTokens: 0, outputTokens: 0 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
```

## Pricing Tables

Built-in pricing for automatic cost calculation (per 1M tokens):

### OpenAI
| Model | Input | Output |
|-------|-------|--------|
| gpt-4 | $30.00 | $60.00 |
| gpt-4-turbo | $10.00 | $30.00 |
| gpt-4o | $2.50 | $10.00 |
| gpt-4o-mini | $0.15 | $0.60 |
| gpt-3.5-turbo | $0.50 | $1.50 |

### Anthropic
| Model | Input | Output |
|-------|-------|--------|
| claude-3-opus | $15.00 | $75.00 |
| claude-3-sonnet | $3.00 | $15.00 |
| claude-3.5-sonnet | $3.00 | $15.00 |
| claude-3-haiku | $0.25 | $1.25 |

### Google
| Model | Input | Output |
|-------|-------|--------|
| gemini-pro | $1.25 | $5.00 |
| gemini-1.5-pro | $1.25 | $5.00 |
| gemini-1.5-flash | $0.075 | $0.30 |

### Cohere
| Model | Input | Output |
|-------|-------|--------|
| command | $1.00 | $2.00 |
| command-r | $0.50 | $1.50 |
| command-r-plus | $3.00 | $15.00 |

## Environment Variables

```bash
KALIBR_API_KEY=your-api-key
KALIBR_TENANT_ID=your-tenant-id
```

## Requirements

- Node.js 18+ (for native fetch)
- TypeScript 5.0+ (optional, for type checking)

## Development

```bash
git clone https://github.com/kalibr-ai/kalibr-sdk-ts.git
cd kalibr-sdk-ts

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Lint
npm run lint
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Links

- [Documentation](https://kalibr.systems/docs)
- [Kalibr Dashboard](https://dashboard.kalibr.systems)
- [GitHub](https://github.com/kalibr-ai/kalibr-sdk-ts)
- [npm](https://www.npmjs.com/package/@kalibr/sdk)
- [Python SDK](https://github.com/kalibr-ai/kalibr-sdk-python)
