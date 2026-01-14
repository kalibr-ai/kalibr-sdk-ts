# @kalibr/sdk

**AI Agent Execution Intelligence Platform**

Zero-dependency TypeScript SDK for Kalibr. Build intelligent agents that learn from execution history to route, retry, and optimize automatically.

[![npm version](https://img.shields.io/npm/v/@kalibr/sdk)](https://www.npmjs.com/package/@kalibr/sdk)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)

## What is Kalibr?

Kalibr provides **execution intelligence** for AI agents — enabling them to learn from outcomes and automatically improve their decisions. Unlike traditional observability tools that just show you what broke, Kalibr helps your agents route around failures in real-time.

### Key Capabilities

- 🎯 **Intelligent Routing** - Agents query for model recommendations based on learned outcomes
- 🔄 **Auto-Instrumentation** - Zero-config tracing for OpenAI, Anthropic, Google, Cohere
- 📊 **Observability** - Track costs, latency, and token usage across all providers
- 🧠 **Outcome Learning** - Report successes/failures to improve future routing decisions
- 🚀 **Production-Ready** - Zero dependencies, works in Node.js 18+, Edge runtimes, browsers

## Installation

```bash
npm install @kalibr/sdk
# or
yarn add @kalibr/sdk
# or
pnpm add @kalibr/sdk
```

## Quick Start

### Option 1: High-Level Router (Recommended)

The easiest way to get started — automatic routing with outcome learning:

```typescript
import { Router } from '@kalibr/sdk';

// Initialize router with goal and available models
const router = new Router({
  goal: 'summarize_article',
  paths: ['gpt-4o', 'claude-3-sonnet', 'gemini-1.5-pro'],
  successWhen: (output) => output.length > 100 && output.length < 500
});

// Router automatically picks the best model and reports outcomes
const response = await router.completion([
  { role: 'user', content: 'Summarize this article...' }
]);

console.log(response.choices[0].message.content);
```

**What just happened?**
1. Router called the intelligence API to decide which model to use
2. Made the LLM call with unified interface (works with any provider)
3. Auto-evaluated success using your `successWhen` function
4. Reported outcome to improve future routing decisions

### Option 2: Auto-Instrumentation (Zero Config)

Wrap your existing LLM clients for automatic tracing:

```typescript
import { createTracedOpenAI } from '@kalibr/sdk';

// Use traced client instead of regular OpenAI
const openai = createTracedOpenAI();

// All calls now automatically traced!
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

**Available wrappers:**
- `createTracedOpenAI()` - OpenAI
- `createTracedAnthropic()` - Anthropic
- `createTracedGoogle(apiKey)` - Google Gemini
- `createTracedCohere()` - Cohere

### Option 3: Manual Tracing (Full Control)

Use SpanBuilder for fine-grained control:

```typescript
import { Kalibr, SpanBuilder } from '@kalibr/sdk';

// Initialize once at app startup
Kalibr.init({
  apiKey: process.env.KALIBR_API_KEY!,
  tenantId: process.env.KALIBR_TENANT_ID!,
  environment: 'prod',
});

// Track an LLM call
const span = new SpanBuilder()
  .setProvider('openai')
  .setModel('gpt-4o')
  .setOperation('chat_completion')
  .start();

try {
  const response = await openai.chat.completions.create({...});

  await span.finish({
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
  });
} catch (error) {
  await span.error(error as Error);
  throw error;
}
```

---

## Core Features

### 🎯 Intelligent Router

Build agents that learn from outcomes and automatically improve routing decisions.

#### Basic Router

```typescript
import { Router } from '@kalibr/sdk';

const router = new Router({
  goal: 'book_meeting',
  paths: ['gpt-4o', 'claude-3-sonnet']
});

const response = await router.completion([
  { role: 'user', content: 'Schedule a meeting with Alice tomorrow at 2pm' }
]);

// Manually report outcome
router.report(true); // success
```

#### Router with Auto-Evaluation

```typescript
const router = new Router({
  goal: 'extract_entities',
  paths: ['gpt-4o-mini', 'claude-3-haiku'],
  successWhen: (output) => {
    // Auto-evaluate based on output
    const entities = JSON.parse(output);
    return entities.length > 0 && entities.every(e => e.type && e.value);
  }
});

// Router automatically evaluates and reports outcome
const response = await router.completion([...]);
```

#### Advanced Configuration

```typescript
const router = new Router({
  goal: 'code_generation',
  paths: [
    { model: 'gpt-4o', tools: ['web_search'], params: { temperature: 0.7 } },
    { model: 'claude-3-opus', tools: ['code_executor'] }
  ],
  explorationRate: 0.1, // 10% exploration for learning
  autoRegister: true // Register paths on initialization
});
```

#### Cross-Provider API

Router provides a unified OpenAI-compatible interface for all providers:

```typescript
// Works with any provider - same interface!
const response = await router.completion([
  { role: 'system', content: 'You are a helpful assistant' },
  { role: 'user', content: 'Hello!' }
]);

// Force a specific model
const response = await router.completion(
  messages,
  { forceModel: 'claude-3-opus' }
);
```

---

### 🔄 Auto-Instrumentation

Wrap your LLM clients for automatic tracing with zero configuration changes.

#### OpenAI

```typescript
import { createTracedOpenAI } from '@kalibr/sdk';

const openai = createTracedOpenAI(process.env.OPENAI_API_KEY);

// All calls automatically traced
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

#### Anthropic

```typescript
import { createTracedAnthropic } from '@kalibr/sdk';

const anthropic = createTracedAnthropic(process.env.ANTHROPIC_API_KEY);

const response = await anthropic.messages.create({
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

#### Google Gemini

```typescript
import { createTracedGoogle } from '@kalibr/sdk';

const google = createTracedGoogle(process.env.GOOGLE_API_KEY);
const model = google.getGenerativeModel({ model: 'gemini-pro' });

const result = await model.generateContent('Hello!');
```

#### Cohere

```typescript
import { createTracedCohere } from '@kalibr/sdk';

const cohere = createTracedCohere(process.env.COHERE_API_KEY);

const response = await cohere.chat({
  model: 'command-r-plus',
  message: 'Hello!'
});
```

#### Wrap Existing Clients

Already have clients? Wrap them:

```typescript
import OpenAI from 'openai';
import { wrapOpenAI } from '@kalibr/sdk';

const openai = new OpenAI({ apiKey: '...' });
wrapOpenAI(openai); // Now traced!
```

---

### 🧠 Context Management

Automatic trace and span propagation using AsyncLocalStorage.

#### Basic Context

```typescript
import { withTraceId, getTraceId } from '@kalibr/sdk';

await withTraceId('order-123', async () => {
  console.log(getTraceId()); // 'order-123'

  // All spans created here will use this trace ID
  const span = new SpanBuilder().start();
  console.log(span.getTraceId()); // 'order-123'
});
```

#### Nested Spans (Automatic Parent-Child)

```typescript
import { withSpanContext } from '@kalibr/sdk';

const parentSpan = new SpanBuilder()
  .setOperation('parent')
  .start();

await withSpanContext(parentSpan.getSpanId(), async () => {
  // Child span automatically gets parent_span_id set
  const childSpan = new SpanBuilder()
    .setOperation('child')
    .start();

  console.log(childSpan.span.parent_span_id); // parentSpan's ID
});
```

#### Goal-Based Context

```typescript
import { withGoal, getGoal } from '@kalibr/sdk';

await withGoal('book_meeting', async () => {
  // All operations tagged with this goal
  const router = new Router({ goal: getGoal()! });
  await router.completion([...]);
});
```

#### Combined Context

```typescript
import { traceContext } from '@kalibr/sdk';

await traceContext(
  { traceId: 'custom-trace', goal: 'summarize' },
  async () => {
    // Both trace ID and goal are set
    // All nested operations inherit this context
  }
);
```

---

### 🎨 Function Wrappers

Wrap any async function with automatic tracing.

#### Wrap a Function

```typescript
import { withTrace } from '@kalibr/sdk';

const chat = withTrace(
  async (prompt: string) => {
    return openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }]
    });
  },
  { operation: 'chat', provider: 'openai', model: 'gpt-4o' }
);

// Now traced automatically
const response = await chat('Hello!');
```

#### Trace a Code Block

```typescript
import { traced } from '@kalibr/sdk';

const result = await traced(
  { operation: 'process_order', metadata: { orderId: '123' } },
  async () => {
    await validateOrder();
    await processPayment();
    await sendConfirmation();
    return { success: true };
  }
);
```

---

### 📦 TraceCapsule

Bundle and serialize spans for distributed tracing.

#### Basic Usage

```typescript
import { getOrCreateCapsule, serializeCapsule, clearCapsule } from '@kalibr/sdk';

// Collect spans
const capsule = getOrCreateCapsule();

// Spans are added automatically
const span1 = new SpanBuilder().setOperation('step1').start();
await span1.finish();

const span2 = new SpanBuilder().setOperation('step2').start();
await span2.finish();

// Serialize and send
const json = serializeCapsule(capsule);
await fetch('/traces', { method: 'POST', body: json });

clearCapsule();
```

#### Distributed Tracing

```typescript
// Service A: Serialize and send
const capsule = serializeCapsule(getOrCreateCapsule());
await fetch('service-b', {
  headers: { 'X-Trace-Capsule': capsule }
});

// Service B: Receive and continue trace
const capsuleData = request.headers['X-Trace-Capsule'];
const capsule = deserializeCapsule(capsuleData);
// Continue trace with same trace_id
```

---

## Intelligence API

Query Kalibr's intelligence service for optimal routing decisions based on learned outcomes.

### Initialize Intelligence Client

```typescript
import { KalibrIntelligence } from '@kalibr/sdk';

KalibrIntelligence.init({
  apiKey: process.env.KALIBR_API_KEY!,
  tenantId: process.env.KALIBR_TENANT_ID!,
});
```

### Get Policy (Model Recommendation)

```typescript
import { getPolicy } from '@kalibr/sdk';

const policy = await getPolicy('book_meeting');
console.log(policy.recommended_model); // 'gpt-4o'
console.log(policy.confidence); // 0.85
```

### Report Outcome

```typescript
import { reportOutcome } from '@kalibr/sdk';

await reportOutcome(traceId, 'book_meeting', true, {
  score: 0.95,
  metadata: { attendees: 5 }
});
```

### Register Paths

```typescript
import { registerPath } from '@kalibr/sdk';

await registerPath('book_meeting', 'gpt-4o', {
  toolId: 'calendar_api',
  riskLevel: 'low'
});
```

### Get Routing Decision

```typescript
import { decide } from '@kalibr/sdk';

const decision = await decide('book_meeting');
console.log(decision.model_id); // Selected model
console.log(decision.tool_id); // Recommended tool
console.log(decision.params); // Recommended parameters
console.log(decision.exploration); // true if exploring
```

---

## Advanced Usage

### Multi-Step Workflows with Context

```typescript
import { withTraceId, withSpanContext } from '@kalibr/sdk';

async function processDocument(doc: string) {
  await withTraceId('doc-processing', async () => {
    // Step 1: Summarize
    const summarySpan = new SpanBuilder()
      .setOperation('summarize')
      .start();

    const summary = await llm.summarize(doc);
    await summarySpan.finish({...});

    // Step 2: Extract entities (child of summarize)
    await withSpanContext(summarySpan.getSpanId(), async () => {
      const extractSpan = new SpanBuilder()
        .setOperation('extract')
        .start();

      const entities = await llm.extract(summary);
      await extractSpan.finish({...});
    });
  });
}
```

### Custom Metadata and Tagging

```typescript
const span = new SpanBuilder()
  .setProvider('openai')
  .setModel('gpt-4o')
  .setOperation('generate')
  .setMetadata({
    userId: 'user-123',
    experiment: 'variant-A',
    custom: { any: 'data' }
  })
  .setWorkflowId('document-processor')
  .setSandboxId('sandbox-prod-1')
  .setEnvironment('prod')
  .setService('api-server')
  .start();
```

### Manual Span Creation

```typescript
import { createSpan } from '@kalibr/sdk';

const span = createSpan({
  tenantId: 'my-tenant',
  provider: 'anthropic',
  modelId: 'claude-3-opus',
  operation: 'generate',
  durationMs: 1500,
  inputTokens: 500,
  outputTokens: 200,
  status: 'success'
});

await Kalibr.sendSpan(span);
```

---

## Framework Integrations

### Next.js App Router

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

export { Router, createTracedOpenAI } from '@kalibr/sdk';
```

```typescript
// app/api/chat/route.ts
import { Router } from '@/lib/kalibr';

const router = new Router({
  goal: 'chat',
  paths: ['gpt-4o', 'claude-3-sonnet']
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const response = await router.completion(messages);

  return Response.json({
    message: response.choices[0].message.content
  });
}
```

### Vercel Edge Functions

```typescript
import { createTracedOpenAI } from '@kalibr/sdk';

export const runtime = 'edge';

const openai = createTracedOpenAI();

export async function GET(request: Request) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello!' }]
  });

  return Response.json(response);
}
```

---

## API Reference

### Router

```typescript
class Router {
  constructor(config: RouterConfig);

  completion(messages: Message[], options?: CompletionOptions): Promise<ChatCompletion>;
  report(success: boolean, reason?: string, score?: number): Promise<void>;
  addPath(model: string, tools?: string[], params?: Record<string, any>): Promise<void>;
}

interface RouterConfig {
  goal: string;
  paths?: PathSpec[];
  successWhen?: (output: string) => boolean;
  explorationRate?: number;
  autoRegister?: boolean;
}

type PathSpec = string | {
  model: string;
  tools?: string | string[];
  params?: Record<string, any>;
};
```

### Auto-Instrumentation

```typescript
function createTracedOpenAI(apiKey?: string): OpenAI;
function wrapOpenAI(client: OpenAI): OpenAI;

function createTracedAnthropic(apiKey?: string): Anthropic;
function wrapAnthropic(client: Anthropic): Anthropic;

function createTracedGoogle(apiKey: string): GoogleGenerativeAI;
function createTracedCohere(apiKey?: string): CohereClient;
```

### Context Management

```typescript
function getTraceId(): string | undefined;
function setTraceId(traceId: string): void;
function withTraceId<T>(traceId: string, fn: () => Promise<T>): Promise<T>;
function newTraceId(): string;

function getParentSpanId(): string | undefined;
function setParentSpanId(spanId: string): void;
function withSpanContext<T>(spanId: string, fn: () => Promise<T>): Promise<T>;

function getGoal(): string | undefined;
function setGoal(goal: string): void;
function withGoal<T>(goal: string, fn: () => Promise<T>): Promise<T>;
function clearGoal(): void;

function traceContext<T>(
  options: { traceId?: string; goal?: string },
  fn: () => Promise<T>
): Promise<T>;
```

### Function Wrappers

```typescript
function withTrace<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: TraceConfig
): T;

function traced<T>(
  config: TraceConfig,
  fn: () => Promise<T>
): Promise<T>;

interface TraceConfig {
  operation: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, any>;
}
```

### SpanBuilder

```typescript
class SpanBuilder {
  // Required
  setProvider(provider: Provider): this;
  setModel(model: string): this;
  setOperation(operation: string): this;

  // Optional identity
  setTraceId(traceId: string): this;
  setParentSpanId(parentSpanId: string): this;
  setTenantId(tenantId: string): this;

  // Optional context
  setWorkflowId(workflowId: string): this;
  setSandboxId(sandboxId: string): this;
  setEnvironment(env: Environment): this;
  setService(service: string): this;
  setEndpoint(endpoint: string): this;
  setUserId(userId: string): this;
  setRequestId(requestId: string): this;
  setMetadata(metadata: Record<string, any>): this;
  setDataClass(dataClass: DataClass): this;

  // Start timing
  start(): StartedSpan;
}

class StartedSpan {
  getTraceId(): string;
  getSpanId(): string;

  finish(options?: FinishOptions): Promise<void>;
  error(error: Error, options?: FinishOptions): Promise<void>;
  timeout(options?: FinishOptions): Promise<void>;
}
```

### TraceCapsule

```typescript
interface TraceCapsule {
  trace_id: string;
  spans: KalibrSpan[];
  metadata: Record<string, any>;
  created_at: number;
}

function getOrCreateCapsule(): TraceCapsule;
function addSpanToCapsule(span: KalibrSpan): void;
function serializeCapsule(capsule: TraceCapsule): string;
function deserializeCapsule(data: string): TraceCapsule;
function clearCapsule(): void;
function flushCapsule(): Promise<void>;
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

## Requirements

- Node.js 18+ (for native fetch and AsyncLocalStorage)
- TypeScript 5.0+ (optional, for type checking)

## Peer Dependencies (Optional)

Install only the providers you need:

```bash
npm install openai              # For OpenAI support
npm install @anthropic-ai/sdk   # For Anthropic support
npm install @google/generative-ai  # For Google support
npm install cohere-ai           # For Cohere support
```

All peer dependencies are optional — only install what you use.

---

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

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Support

- 📧 Email: support@kalibr.systems
- 💬 Discord: [Join our community](https://discord.gg/kalibr)
- 📖 Docs: [docs.kalibr.systems](https://docs.kalibr.systems)
- 🐛 Issues: [GitHub Issues](https://github.com/kalibr-ai/kalibr-sdk-ts/issues)

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Links

- [Kalibr Platform](https://kalibr.systems)
- [Dashboard](https://dashboard.kalibr.systems)
- [Documentation](https://docs.kalibr.systems)
- [Python SDK](https://github.com/kalibr-ai/kalibr-sdk-python)
- [npm Package](https://www.npmjs.com/package/@kalibr/sdk)

---

**Built with ❤️ by the Kalibr team**
