# @kalibr/sdk

**AI Agent Execution Intelligence Platform** - Zero-dependency TypeScript SDK for Kalibr. Build AI agents that learn from every decision and continuously improve through outcome-conditioned routing.

[![npm version](https://img.shields.io/npm/v/@kalibr/sdk)](https://www.npmjs.com/package/@kalibr/sdk)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

## Features

- **Router** - Intelligent model routing that learns from outcomes
- **Auto-Instrumentation** - Zero-config tracing for OpenAI, Anthropic, Google, Cohere
- **Context Management** - AsyncLocalStorage-based trace/span/goal propagation
- **Function Wrappers** - Clean syntax for tracing any async function
- **TraceCapsule** - Span bundling for distributed tracing
- **Zero Dependencies** - Uses native `fetch`, works in Node.js 18+, Edge runtimes, and browsers
- **TypeScript-First** - Full type definitions with strict mode

## Installation

```bash
npm install @kalibr/sdk
# or
yarn add @kalibr/sdk
# or
pnpm add @kalibr/sdk
```

### Optional Peer Dependencies

Install only the providers you use:

```bash
# OpenAI
npm install openai

# Anthropic
npm install @anthropic-ai/sdk

# Google Gemini
npm install @google/generative-ai

# Cohere
npm install cohere-ai
```

## Quick Start

### Option 1: Router (Recommended for New Projects)

Build agents that learn which models work best for each task:

```typescript
import { Kalibr, Router } from '@kalibr/sdk';

// Initialize once at startup
Kalibr.init({
  apiKey: process.env.KALIBR_API_KEY!,
  tenantId: process.env.KALIBR_TENANT_ID!,
});

// Create a router with multiple model options
const router = new Router({
  goal: 'summarize',
  paths: ['gpt-4o', 'claude-3-sonnet', 'gemini-1.5-pro'],
  successWhen: (output) => output.length > 100, // Auto-report success
});

// Make calls - Router learns optimal routing over time
const response = await router.completion([
  { role: 'user', content: 'Summarize this article...' }
]);

console.log(response.choices[0].message.content);
```

### Option 2: Auto-Instrumentation (Easiest Migration)

Add tracing to existing code with zero changes:

```typescript
import { Kalibr, createTracedOpenAI } from '@kalibr/sdk';

Kalibr.init({
  apiKey: process.env.KALIBR_API_KEY!,
  tenantId: process.env.KALIBR_TENANT_ID!,
});

// Replace `new OpenAI()` with `createTracedOpenAI()`
const openai = createTracedOpenAI();

// Use normally - all calls are automatically traced!
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### Option 3: Manual SpanBuilder (Full Control)

For maximum control over what you trace:

```typescript
import { Kalibr, SpanBuilder } from '@kalibr/sdk';
import OpenAI from 'openai';

Kalibr.init({
  apiKey: process.env.KALIBR_API_KEY!,
  tenantId: process.env.KALIBR_TENANT_ID!,
});

const openai = new OpenAI();

async function chat(prompt: string) {
  const span = new SpanBuilder()
    .setProvider('openai')
    .setModel('gpt-4o')
    .setOperation('chat_completion')
    .start();

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    });

    await span.finish({
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    });

    return response.choices[0]?.message?.content;
  } catch (error) {
    await span.error(error as Error, { inputTokens: 0, outputTokens: 0 });
    throw error;
  }
}
```

---

## Router

The Router provides intelligent model selection based on learned outcomes.

### Basic Usage

```typescript
import { Router } from '@kalibr/sdk';

const router = new Router({
  goal: 'customer_support',
  paths: ['gpt-4o', 'claude-3-sonnet'],
});

const response = await router.completion([
  { role: 'system', content: 'You are a helpful support agent.' },
  { role: 'user', content: 'How do I reset my password?' }
]);
```

### Auto-Outcome Reporting

Use `successWhen` to automatically report outcomes:

```typescript
const router = new Router({
  goal: 'code_generation',
  paths: ['gpt-4o', 'claude-3-opus'],
  successWhen: (output) => {
    // Success if output contains code block
    return output.includes('```');
  },
});
```

### Provider-Specific Configuration

```typescript
const router = new Router({
  goal: 'summarize',
  paths: [
    // Simple string format
    'gpt-4o',

    // Object format with provider override
    { model: 'claude-3-sonnet', provider: 'anthropic' },

    // Google Gemini (requires API key)
    { model: 'gemini-1.5-pro', provider: 'google', apiKey: process.env.GOOGLE_API_KEY },

    // Cohere
    { model: 'command-r-plus', provider: 'cohere' },
  ],
});
```

### Manual Outcome Reporting

```typescript
const response = await router.completion([...]);

// Process response...
const wasSuccessful = validateResponse(response);

// Report outcome for learning
await router.reportOutcome(wasSuccessful, {
  score: 0.95,
  latencyMs: 1200,
});
```

---

## Auto-Instrumentation

Zero-config tracing for major LLM providers.

### OpenAI

```typescript
import { createTracedOpenAI, wrapOpenAI } from '@kalibr/sdk';

// Option 1: Create new traced client
const openai = createTracedOpenAI();

// Option 2: Wrap existing client
import OpenAI from 'openai';
const client = new OpenAI();
const tracedClient = wrapOpenAI(client);

// Both work identically
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### Anthropic

```typescript
import { createTracedAnthropic, wrapAnthropic } from '@kalibr/sdk';

// Option 1: Create new traced client
const anthropic = createTracedAnthropic();

// Option 2: Wrap existing client
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();
const tracedClient = wrapAnthropic(client);

const response = await anthropic.messages.create({
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### Google Gemini

```typescript
import { createTracedGoogle } from '@kalibr/sdk';

// Requires API key parameter
const gemini = createTracedGoogle(process.env.GOOGLE_API_KEY!);

const model = gemini.getGenerativeModel({ model: 'gemini-1.5-pro' });
const result = await model.generateContent('Hello!');
```

### Cohere

```typescript
import { createTracedCohere } from '@kalibr/sdk';

const cohere = createTracedCohere();

const response = await cohere.chat({
  model: 'command-r-plus',
  message: 'Hello!',
});
```

---

## Context Management

AsyncLocalStorage-based context propagation for automatic trace correlation.

### Trace Context

```typescript
import { withTraceId, getTraceId, newTraceId, setTraceId } from '@kalibr/sdk';

// Execute function with scoped trace ID
await withTraceId('my-trace-123', async () => {
  console.log(getTraceId()); // 'my-trace-123'

  // All SpanBuilders automatically use this trace ID
  const span = new SpanBuilder()
    .setProvider('openai')
    .setModel('gpt-4o')
    .start(); // trace_id is auto-set!
});

// Generate and set new trace ID
const traceId = newTraceId();
setTraceId(traceId);
```

### Span Context (Parent-Child Relationships)

```typescript
import { withSpanContext, getParentSpanId, setParentSpanId } from '@kalibr/sdk';

// Automatic parent-child linking
await withSpanContext('parent-span-123', async () => {
  console.log(getParentSpanId()); // 'parent-span-123'

  // Child spans automatically set parent_span_id
  const childSpan = new SpanBuilder()
    .setProvider('anthropic')
    .setModel('claude-3-sonnet')
    .start(); // parent_span_id is auto-set!
});
```

### Goal Context

```typescript
import { withGoal, getGoal, setGoal, clearGoal } from '@kalibr/sdk';

// Set goal for all nested operations
await withGoal('customer_support', async () => {
  console.log(getGoal()); // 'customer_support'

  // Router and spans can use this goal
  const router = new Router({
    goal: getGoal()!, // Uses context goal
    paths: ['gpt-4o'],
  });
});
```

### Combined Context

```typescript
import { traceContext } from '@kalibr/sdk';

// Set trace ID and goal together
await traceContext({ traceId: 'trace-123', goal: 'summarize' }, async () => {
  // Both are available in this scope
  const router = new Router({ goal: getGoal()!, paths: ['gpt-4o'] });
  await router.completion([...]);
});
```

---

## Function Wrappers

Clean syntax for tracing any async function.

### withTrace

Wrap a function to add automatic tracing:

```typescript
import { withTrace } from '@kalibr/sdk';

// Define a traced function
const chat = withTrace(
  async (prompt: string) => {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    });
    return {
      result: response.choices[0]?.message?.content ?? '',
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  },
  {
    operation: 'chat',
    provider: 'openai',
    model: 'gpt-4o',
  }
);

// Use the traced function
const response = await chat('Hello!');
```

### traced

Trace a code block inline:

```typescript
import { traced } from '@kalibr/sdk';

const result = await traced(
  { operation: 'process_document', provider: 'openai', model: 'gpt-4o' },
  async () => {
    const summary = await openai.chat.completions.create({...});
    return {
      result: summary.choices[0]?.message?.content ?? '',
      inputTokens: summary.usage?.prompt_tokens ?? 0,
      outputTokens: summary.usage?.completion_tokens ?? 0,
    };
  }
);
```

---

## TraceCapsule

Span bundling for efficient batch operations and distributed tracing.

### Basic Usage

```typescript
import {
  getOrCreateCapsule,
  addSpanToCapsule,
  flushCapsule,
  serializeCapsule,
  deserializeCapsule,
  clearCapsule,
} from '@kalibr/sdk';

// Get or create capsule for current trace
const capsule = getOrCreateCapsule();

// Add spans to capsule (instead of sending immediately)
const span = new SpanBuilder()
  .setProvider('openai')
  .setModel('gpt-4o')
  .start();

await span.finish({
  inputTokens: 100,
  outputTokens: 50,
  autoSend: false, // Don't send immediately
});

addSpanToCapsule(span.toSpan());

// Flush all spans at once
await flushCapsule();
```

### Distributed Tracing

```typescript
// Service A: Serialize capsule
const capsule = getOrCreateCapsule();
// ... add spans ...
const serialized = serializeCapsule(capsule);

// Send to Service B via HTTP header or message queue
await fetch('/service-b', {
  headers: { 'X-Trace-Capsule': serialized },
});

// Service B: Deserialize and continue
const capsule = deserializeCapsule(serializedData);
// ... add more spans ...
await flushCapsule();
```

---

## Intelligence API

Query Kalibr for optimal model recommendations.

### Get Policy

```typescript
import { KalibrIntelligence, getPolicy } from '@kalibr/sdk';

KalibrIntelligence.init({
  apiKey: process.env.KALIBR_API_KEY!,
  tenantId: process.env.KALIBR_TENANT_ID!,
});

const policy = await getPolicy('book_meeting', {
  includeTools: true,
  includeParams: ['temperature'],
  constraints: {
    max_cost_usd: 0.05,
    max_latency_ms: 3000,
  },
});

console.log(policy.recommended_model); // e.g., "gpt-4o"
```

### Report Outcome

```typescript
import { reportOutcome } from '@kalibr/sdk';

await reportOutcome(traceId, 'book_meeting', true, {
  score: 0.95,
  metadata: { attendees: 5 },
});
```

### Decide (Routing)

```typescript
import { registerPath, decide } from '@kalibr/sdk';

// Register available paths
await registerPath('book_meeting', 'gpt-4o', {
  toolId: 'calendar_api',
  riskLevel: 'low',
});

// Get routing decision
const decision = await decide('book_meeting');
console.log(decision.model_id);   // Selected model
console.log(decision.confidence); // Confidence score
```

---

## SpanBuilder Reference

Full control over span creation.

```typescript
const span = new SpanBuilder()
  // Required
  .setProvider('openai')           // 'openai' | 'anthropic' | 'google' | 'cohere' | 'custom'
  .setModel('gpt-4o')              // Model ID
  .setOperation('chat_completion') // Operation type

  // Optional identity (auto-set from context if available)
  .setTraceId(traceId)             // Link spans together
  .setParentSpanId(parentId)       // Create hierarchy

  // Optional context
  .setWorkflowId('my-workflow')
  .setEndpoint('api/chat')
  .setEnvironment('prod')
  .setService('chat-service')
  .setUserId('user-123')
  .setRequestId('req-456')
  .setMetadata({ custom: 'data' })

  // Start timing
  .start();

// Finish successfully
await span.finish({
  inputTokens: 100,
  outputTokens: 50,
  status: 'success',      // optional, default: 'success'
  costUsd: 0.001,         // optional, auto-calculated if omitted
  autoSend: true,         // optional, default: true
});

// Or finish with error
await span.error(error, { inputTokens: 0, outputTokens: 0 });

// Or finish with timeout
await span.timeout({ inputTokens: 100, outputTokens: 0 });
```

---

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

---

## Next.js Integration

### App Router Setup

```typescript
// lib/kalibr.ts
import { Kalibr } from '@kalibr/sdk';

if (!Kalibr.isInitialized()) {
  Kalibr.init({
    apiKey: process.env.KALIBR_API_KEY!,
    tenantId: process.env.KALIBR_TENANT_ID!,
    environment: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
    service: 'my-nextjs-app',
  });
}

export * from '@kalibr/sdk';
```

### API Route with Router

```typescript
// app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { Router } from '@/lib/kalibr';

const router = new Router({
  goal: 'chat',
  paths: ['gpt-4o', 'claude-3-sonnet'],
  successWhen: (output) => output.length > 10,
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const response = await router.completion(messages);

  return NextResponse.json({
    message: response.choices[0]?.message?.content,
  });
}
```

---

## Environment Variables

```bash
KALIBR_API_KEY=your-api-key
KALIBR_TENANT_ID=your-tenant-id

# Optional: Provider API keys
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
GOOGLE_API_KEY=your-google-key
COHERE_API_KEY=your-cohere-key
```

---

## Requirements

- Node.js 18+ (for native fetch)
- TypeScript 5.0+ (optional, for type checking)

---

## Development

```bash
git clone https://github.com/kalibr-ai/kalibr-sdk-ts.git
cd kalibr-sdk-ts

npm install
npm test
npm run build
npm run lint
```

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

Apache 2.0 - see [LICENSE](LICENSE).

---

## Links

- [Documentation](https://docs.kalibr.systems)
- [Dashboard](https://dashboard.kalibr.systems)
- [GitHub](https://github.com/kalibr-ai/kalibr-sdk-ts)
- [npm](https://www.npmjs.com/package/@kalibr/sdk)
- [Python SDK](https://github.com/kalibr-ai/kalibr-sdk-python)
- [CHANGELOG](./CHANGELOG.md)
