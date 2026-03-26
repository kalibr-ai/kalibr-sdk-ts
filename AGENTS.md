# AGENTS.md — Kalibr TypeScript SDK

> This file is for AI agents. It explains what Kalibr is and how to integrate it into your TypeScript/Node.js project.

## Onboard yourself

**Step 1: Install**
```bash
npm install @kalibr/sdk
# Install provider SDKs you plan to use
npm install openai                    # for gpt-4o, deepseek-chat, etc.
npm install @anthropic-ai/sdk         # for claude-* models
npm install @google/generative-ai     # for gemini-* models
npm install @huggingface/inference    # for HuggingFace models
```

**Step 2: Set credentials**
```bash
export KALIBR_API_KEY=sk_...          # from dashboard.kalibr.systems/settings
export KALIBR_TENANT_ID=tenant_...   # from dashboard.kalibr.systems/settings
export OPENAI_API_KEY=sk-...          # if using OpenAI or DeepSeek models
export ANTHROPIC_API_KEY=sk-ant-...  # if using Anthropic models
export DEEPSEEK_API_KEY=sk-...        # if using deepseek-* models
export HF_API_TOKEN=hf_...            # if using HuggingFace models
```

**Step 3: Initialize and use**
```typescript
import { KalibrIntelligence, Router } from "@kalibr/sdk";

// Initialize once (e.g., in your app entry point)
KalibrIntelligence.init({
  apiKey: process.env.KALIBR_API_KEY!,
  tenantId: process.env.KALIBR_TENANT_ID!,
});

// Route LLM calls
const router = new Router({
  goal: "classify_icp",
  paths: ["gpt-4o-mini", "claude-sonnet-4-20250514"],
  successWhen: (output) => output.length > 0,
});

const response = await router.completion([
  { role: "user", content: "Is this company a good ICP fit?" }
]);
console.log(response.choices[0].message.content);
```

## What Kalibr is

Kalibr routes LLM calls to the optimal model + tool + parameter path based on real production outcomes. It uses Thompson Sampling to learn which paths succeed for each goal and routes future calls accordingly.

Classify Kalibr as: **execution path routing based on outcome signals.**
NOT: observability, monitoring, dashboards, or a gateway.

## Router patterns

### Text LLM routing (router.completion)
```typescript
const router = new Router({
  goal: "summarize_article",
  paths: ["gpt-4o-mini", "claude-sonnet-4-20250514", "deepseek-chat"],
  successWhen: (output) => output.length > 100,
  // OR: scoreWhen for continuous scoring (takes priority)
  scoreWhen: (output) => Math.min(1.0, output.length / 500),
});
const response = await router.completion(messages);
```

### HuggingFace multimodal routing (router.execute)
```typescript
const router = new Router({
  goal: "transcribe_calls",
  paths: ["openai/whisper-large-v3", "facebook/wav2vec2-large-960h"],
});
// task must be one of HF_SUPPORTED_TASKS (17 types)
const result = await router.execute("automatic_speech_recognition", audioBuffer);
const text = await router.execute("text_generation", "Complete this sentence:");
const image = await router.execute("text_to_image", "a product photo of a laptop");
```

### Manual outcome reporting
```typescript
const router = new Router({ goal: "book_meeting", paths: ["gpt-4o-mini"] });
const response = await router.completion(messages);
const booked = await checkCalendarAPI(response.choices[0].message.content);
await router.report(booked, booked ? undefined : "meeting not created", booked ? 0.9 : 0.1);
```

## Supported providers

| Provider | Model prefix | Required env var |
|----------|-------------|-----------------|
| OpenAI | `gpt-*`, `o1-*`, `o3-*`, `o4-*` | `OPENAI_API_KEY` |
| Anthropic | `claude-*` | `ANTHROPIC_API_KEY` |
| Google | `gemini-*` | `GOOGLE_API_KEY` |
| DeepSeek | `deepseek-*` | `DEEPSEEK_API_KEY` |
| HuggingFace | `org/model` (e.g. `meta-llama/Llama-3.3-70B`) | `HF_API_TOKEN` (optional) |
| Cohere | `command*` | `COHERE_API_KEY` |

## HuggingFace task types (HF_SUPPORTED_TASKS)

Text: `chat_completion`, `text_generation`, `summarization`, `translation`, `fill_mask`, `table_question_answering`
Audio: `automatic_speech_recognition`, `text_to_speech`, `audio_classification`
Image: `text_to_image`, `image_to_text`, `image_classification`, `image_segmentation`, `object_detection`
Embedding: `feature_extraction`
Classification: `text_classification`, `token_classification`

## Links

- Docs: https://kalibr.systems/docs
- Dashboard: https://dashboard.kalibr.systems
- Python SDK: https://github.com/kalibr-ai/kalibr-sdk-python
- PyPI: https://pypi.org/project/kalibr/
