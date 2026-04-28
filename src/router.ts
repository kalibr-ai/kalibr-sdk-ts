/**
 * Kalibr Router - Intelligent Model Routing with Automatic Outcome Reporting
 *
 * Provides intelligent routing across multiple LLM providers with automatic
 * path registration, outcome tracking, and response format unification.
 *
 * @example
 * ```typescript
 * import { Router } from '@kalibr/sdk';
 *
 * const router = new Router({
 *   goal: 'summarize_article',
 *   paths: ['gpt-4o', 'claude-3-sonnet'],
 *   successWhen: (output) => output.length > 100 && output.length < 500
 * });
 *
 * const response = await router.completion([
 *   { role: 'user', content: 'Summarize this article...' }
 * ]);
 *
 * console.log(response.choices[0].message.content);
 * console.log(response.kalibr_trace_id); // trace ID for reporting
 * ```
 */

import {
  decide,
  reportOutcome,
  registerPath,
  type DecideResponse,
} from './intelligence';
import { generateId } from './kalibr';
import { getTraceId, newTraceId } from './context';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration for a path including model, tools, and parameters.
 */
export interface PathConfig {
  /** Model identifier (e.g., 'gpt-4o', 'claude-3-sonnet') */
  model: string;
  /** Tool ID or array of tool IDs */
  tools?: string | string[] | null;
  /** Additional parameters for this path */
  params?: Record<string, unknown>;
}

/**
 * A path can be specified as just a model string or a full PathConfig.
 */
export type PathSpec = string | PathConfig;

/**
 * Configuration options for the Router.
 */
export interface RouterConfig {
  /** The goal/task this router is optimized for */
  goal: string;
  /** Available paths (models or configs) for routing */
  paths?: PathSpec[];
  /** Callback to evaluate if output is successful (enables auto-reporting) */
  successWhen?: (output: string) => boolean;
  /** Callback for continuous quality scoring (0.0-1.0). Takes priority over successWhen. */
  scoreWhen?: (output: string) => number;
  /** Exploration rate for the routing algorithm (0-1) */
  explorationRate?: number;
  /** Whether to auto-register paths on init (default: true) */
  autoRegister?: boolean;
  /** Model to use as LLM-as-a-judge Gate 2 eval */
  judgeModel?: string;
  /** Retry if judge score below this (default 0.7) */
  judgeThreshold?: number;
  /** Rewrite prompt on Gate 2 failure before model swap */
  repairPrompt?: boolean;
}

/**
 * Options for completion requests.
 */
export interface CompletionOptions {
  /** Force a specific model instead of using intelligent routing */
  forceModel?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for sampling (0-2) */
  temperature?: number;
  /** Top-p nucleus sampling */
  topP?: number;
  /** Stop sequences */
  stop?: string | string[];
  /** Additional provider-specific options */
  [key: string]: unknown;
}

/**
 * A message in the conversation.
 */
export interface Message {
  /** Role of the message sender */
  role: 'system' | 'user' | 'assistant';
  /** Content of the message */
  content: string;
}

/**
 * OpenAI-compatible chat completion response format.
 * All providers' responses are converted to this format.
 */
export interface ChatCompletion {
  /** Unique identifier for the completion */
  id: string;
  /** Object type (always 'chat.completion') */
  object: 'chat.completion';
  /** Unix timestamp of creation */
  created: number;
  /** Model used for the completion */
  model: string;
  /** Array of completion choices */
  choices: Array<{
    /** Index of this choice */
    index: number;
    /** The generated message */
    message: {
      /** Role (always 'assistant' for completions) */
      role: 'assistant';
      /** Generated content */
      content: string;
    };
    /** Reason for stopping generation */
    finish_reason: string;
  }>;
  /** Token usage statistics */
  usage: {
    /** Tokens in the prompt */
    prompt_tokens: number;
    /** Tokens in the completion */
    completion_tokens: number;
    /** Total tokens used */
    total_tokens: number;
  };
}

/**
 * A ChatCompletion response enriched with a Kalibr trace ID.
 *
 * Returned by {@link Router.completion} so callers can pass the trace ID
 * to {@link Router.report} or any other downstream tracking.
 */
export interface KalibrChatCompletion extends ChatCompletion {
  /** Kalibr trace ID associated with this completion */
  kalibr_trace_id: string;
}

// ============================================================================
// Provider Detection
// ============================================================================

/**
 * Supported LLM providers.
 */
type LLMProvider = 'openai' | 'anthropic' | 'google' | 'cohere' | 'deepseek' | 'huggingface' | 'nebius' | 'tavily' | 'ollama';

/**
 * Detect the provider from a model identifier.
 *
 * @param model - Model identifier
 * @returns The detected provider
 * @throws Error if provider cannot be determined
 */
function detectProvider(model: string): LLMProvider {
  const modelLower = model.toLowerCase();

  // OpenAI models
  if (
    modelLower.startsWith('gpt-') ||
    modelLower.startsWith('o1-') ||
    modelLower.startsWith('o3-') ||
    modelLower.startsWith('o4-') ||
    modelLower.startsWith('chatgpt-')
  ) {
    return 'openai';
  }

  // Anthropic models
  if (modelLower.startsWith('claude-')) {
    return 'anthropic';
  }

  // Google models
  if (modelLower.startsWith('gemini-') || modelLower.includes('models/gemini')) {
    return 'google';
  }

  // Cohere models
  if (modelLower.startsWith('command')) {
    return 'cohere';
  }

  // DeepSeek models
  if (modelLower.startsWith("deepseek-")) {
    return "deepseek";
  }

  // Nebius AI Studio models (nebius/ prefix)
  if (modelLower.startsWith("nebius/")) {
    return "nebius";
  }

  // Tavily Search (tavily/ prefix)
  if (modelLower.startsWith("tavily/")) {
    return "tavily";
  }

  // Ollama local models (ollama/ prefix)
  if (modelLower.startsWith("ollama/")) {
    return "ollama";
  }

  // HuggingFace models (org/model format, e.g. "meta-llama/Llama-3.3-70B-Instruct")
  if (modelLower.includes("/") && !modelLower.startsWith("models/")) {
    return "huggingface";
  }

  throw new Error(
    `Cannot determine provider for model: ${model}. ` +
      'Supported prefixes: gpt-, o1-, o3-, o4-, chatgpt- (OpenAI), claude- (Anthropic), ' +
      'gemini-, models/gemini (Google), command (Cohere), deepseek- (DeepSeek), ' +
      'nebius/ (Nebius), tavily/ (Tavily), ollama/ (Ollama), org/model (HuggingFace)'
  );
}

// ============================================================================
// Path Normalization
// ============================================================================

/**
 * Normalize a path spec to a PathConfig object.
 */
function normalizePath(path: PathSpec): PathConfig {
  if (typeof path === 'string') {
    return { model: path };
  }
  return path;
}

/**
 * Get the tool ID string from a PathConfig.
 */
function getToolId(config: PathConfig): string | undefined {
  if (!config.tools) return undefined;
  if (Array.isArray(config.tools)) {
    return config.tools.length > 0 ? config.tools.join(',') : undefined;
  }
  return config.tools;
}

// ============================================================================
// Response Converters
// ============================================================================

/**
 * Convert an Anthropic response to OpenAI ChatCompletion format.
 */
function convertAnthropicResponse(response: {
  id: string;
  model: string;
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}): ChatCompletion {
  // Extract text from content blocks
  const textContent = response.content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text!)
    .join('');

  return {
    id: response.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: textContent,
        },
        finish_reason: response.stop_reason === 'end_turn' ? 'stop' : (response.stop_reason || 'stop'),
      },
    ],
    usage: {
      prompt_tokens: response.usage?.input_tokens || 0,
      completion_tokens: response.usage?.output_tokens || 0,
      total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    },
  };
}

/**
 * Convert a Google Gemini response to OpenAI ChatCompletion format.
 */
function convertGoogleResponse(
  response: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  },
  model: string
): ChatCompletion {
  const candidate = response.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';

  return {
    id: `gemini-${generateId()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text,
        },
        finish_reason: candidate?.finishReason === 'STOP' ? 'stop' : (candidate?.finishReason?.toLowerCase() || 'stop'),
      },
    ],
    usage: {
      prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
      completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: response.usageMetadata?.totalTokenCount || 0,
    },
  };
}

/**
 * Convert a Cohere response to OpenAI ChatCompletion format.
 */
function convertCohereResponse(
  response: {
    text?: string;
    generation_id?: string;
    meta?: {
      tokens?: {
        input_tokens?: number;
        output_tokens?: number;
      };
      billed_units?: {
        input_tokens?: number;
        output_tokens?: number;
      };
    };
    finish_reason?: string;
  },
  model: string
): ChatCompletion {
  const tokens = response.meta?.tokens || response.meta?.billed_units || {};

  return {
    id: response.generation_id || `cohere-${generateId()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: response.text || '',
        },
        finish_reason: response.finish_reason || 'stop',
      },
    ],
    usage: {
      prompt_tokens: tokens.input_tokens || 0,
      completion_tokens: tokens.output_tokens || 0,
      total_tokens: (tokens.input_tokens || 0) + (tokens.output_tokens || 0),
    },
  };
}

/**
 * HuggingFace task types supported by router.execute().
 * Matches PATCHED_METHODS in the Python SDK huggingface_instr.py exactly.
 */
export const HF_SUPPORTED_TASKS = [
  "chat_completion",
  "text_generation",
  "automatic_speech_recognition",
  "text_to_speech",
  "text_to_image",
  "feature_extraction",
  "text_classification",
  "translation",
  "summarization",
  "token_classification",
  "fill_mask",
  "audio_classification",
  "image_to_text",
  "image_classification",
  "image_segmentation",
  "object_detection",
  "table_question_answering",
] as const;

export type HFTask = typeof HF_SUPPORTED_TASKS[number];

// ============================================================================
// Router Class
// ============================================================================

/**
 * Intelligent model router with automatic outcome reporting.
 *
 * Routes requests across multiple LLM providers using the Kalibr Intelligence
 * API for optimal path selection. Automatically registers paths, tracks outcomes,
 * and unifies response formats across all providers.
 *
 * @example
 * ```typescript
 * // Basic usage with auto-outcome evaluation
 * const router = new Router({
 *   goal: 'summarize_article',
 *   paths: ['gpt-4o', 'claude-3-sonnet', 'gemini-1.5-pro'],
 *   successWhen: (output) => output.length > 100 && output.length < 500
 * });
 *
 * const response = await router.completion([
 *   { role: 'user', content: 'Summarize: ...' }
 * ]);
 *
 * // Advanced usage with path configs
 * const router = new Router({
 *   goal: 'code_review',
 *   paths: [
 *     { model: 'gpt-4o', tools: 'code_analyzer', params: { language: 'typescript' } },
 *     { model: 'claude-3-opus', params: { detailed: true } },
 *   ],
 *   explorationRate: 0.1,
 * });
 *
 * const response = await router.completion(messages);
 * await router.report(true, 'Review was helpful');
 * ```
 */
export class Router {
  private readonly goal: string;
  private readonly paths: PathConfig[];
  private readonly successWhen?: (output: string) => boolean;
  private readonly scoreWhen?: (output: string) => number;
  /** Exploration rate for routing decisions (stored for future use) */
  readonly explorationRate: number;
  private readonly autoRegister: boolean;
  private judgeModel?: string;
  private judgeThreshold: number;
  private repairPrompt: boolean;

  // State tracking
  private lastTraceId: string | null = null;
  private lastDecision: DecideResponse | null = null;
  private lastModel: string | null = null;
  private outcomeReported: boolean = false;
  private initialized: boolean = false;

  /**
   * Create a new Router instance.
   *
   * @param config - Router configuration
   */
  constructor(config: RouterConfig) {
    this.goal = config.goal;
    this.paths = (config.paths || []).map(normalizePath);
    this.successWhen = config.successWhen;
    this.scoreWhen = config.scoreWhen;
    this.explorationRate = config.explorationRate ?? 0.1;
    this.autoRegister = config.autoRegister ?? true;
    this.judgeModel = config.judgeModel;
    this.judgeThreshold = config.judgeThreshold ?? 0.7;
    this.repairPrompt = config.repairPrompt ?? false;

    // Validate at least one path
    if (this.paths.length === 0) {
      throw new Error('Router requires at least one path');
    }

    // Auto-register paths asynchronously if enabled
    if (this.autoRegister) {
      this.registerPaths().catch((err) => {
        console.warn('[Kalibr Router] Failed to register paths:', err.message);
      });
    }
  }

  /**
   * Register all paths with the Kalibr Intelligence API.
   */
  private async registerPaths(): Promise<void> {
    if (this.initialized) return;

    const registrations = this.paths.map(async (path) => {
      try {
        await registerPath(this.goal, path.model, {
          toolId: getToolId(path),
          params: path.params,
        });
      } catch (err) {
        // Silently ignore registration errors (path might already exist)
        // The API should handle duplicates gracefully
      }
    });

    await Promise.all(registrations);
    this.initialized = true;
  }

  /**
   * Add a new path dynamically.
   *
   * @param model - Model identifier
   * @param tools - Optional tool ID(s)
   * @param params - Optional parameters
   */
  async addPath(
    model: string,
    tools?: string | string[] | null,
    params?: Record<string, unknown>
  ): Promise<void> {
    const path: PathConfig = { model, tools, params };
    this.paths.push(path);

    if (this.autoRegister) {
      try {
        await registerPath(this.goal, model, {
          toolId: getToolId(path),
          params,
        });
      } catch (err) {
        console.warn('[Kalibr Router] Failed to register new path:', (err as Error).message);
      }
    }
  }

  /**
   * Make a completion request with intelligent routing.
   *
   * @param messages - Array of conversation messages
   * @param options - Completion options
   * @returns OpenAI-compatible ChatCompletion response with `kalibr_trace_id`
   *
   * @example
   * ```typescript
   * const response = await router.completion([
   *   { role: 'user', content: 'Summarize this article...' }
   * ]);
   * console.log(response.choices[0].message.content);
   * console.log(response.kalibr_trace_id); // pass to report() if needed
   * ```
   */
  async completion(
    messages: Message[],
    options: CompletionOptions = {}
  ): Promise<KalibrChatCompletion> {
    // Reset outcome state for new completion
    this.outcomeReported = false;
    // Use context trace ID if available, otherwise generate new one
    this.lastTraceId = getTraceId() || newTraceId();

    let selectedModel: string;
    let decision: DecideResponse | null = null;

    // Determine which model to use
    if (options.forceModel) {
      selectedModel = options.forceModel;
    } else {
      try {
        decision = await decide(this.goal);
        this.lastDecision = decision;
        selectedModel = decision.model_id;
        if (decision.trace_id) {
          this.lastTraceId = decision.trace_id;
        }
        // Log exploration status for debugging (handles both field name variants)
        const isExploration = decision.is_exploration ?? decision.exploration;
        if (isExploration) {
          console.warn(`[Kalibr Router] Exploration decision for goal '${this.goal}': model=${selectedModel}`);
        }
      } catch (err) {
        // Fallback to first path if routing fails
        console.warn('[Kalibr Router] Routing failed, using fallback:', (err as Error).message);
        selectedModel = this.paths[0]!.model;
      }
    }

    // Build ordered candidate paths for fallback
    // First: intelligence-selected path, then remaining registered paths
    const candidatePaths: Array<{ model: string; tools?: string | string[] | null; params?: Record<string, unknown> }> = [];

    // Add selected path first
    let selectedPath = this.paths.find(p => p.model === selectedModel);
    if (!selectedPath && decision) {
      selectedPath = {
        model: selectedModel,
        tools: decision.tool_id || null,
        params: decision.params || {},
      };
    }
    if (selectedPath) {
      candidatePaths.push(selectedPath);
    }

    // Add remaining paths, skipping duplicates of selected model
    for (const path of this.paths) {
      if (path.model !== selectedModel) {
        candidatePaths.push(path);
      }
    }

    // Try each candidate path with fallback
    let lastError: Error | null = null;
    let response: ChatCompletion | null = null;

    for (let i = 0; i < candidatePaths.length; i++) {
      const candidate = candidatePaths[i]!;
      const isFallback = i > 0;

      if (isFallback) {
        console.warn(`[Kalibr Router] Primary path failed, trying fallback: ${candidate.model}`);
      }

      try {
        const candidateProvider = detectProvider(candidate.model);
        response = await this.dispatch(candidateProvider, candidate.model, messages, options);

        // Success! Update last model
        this.lastModel = candidate.model;
        break;
      } catch (err) {
        lastError = err as Error;
        console.warn(`[Kalibr Router] Model ${candidate.model} failed: ${lastError.message}`);

        // Report failure for this path to enable Thompson Sampling learning
        await this.reportFailure('provider_error', lastError.message);

        // Continue to next candidate
        continue;
      }
    }

    // All paths failed - throw the last error
    if (!response) {
      throw lastError || new Error('All paths failed');
    }

    // Gate 2: LLM-as-a-judge evaluation
    if (this.judgeModel && response) {
      const output = response.choices[0]?.message?.content || '';
      try {
        const judgeScore = await this.runJudge(output, messages);
        if (judgeScore < this.judgeThreshold) {
          // Attempt repair if enabled
          let retryMessages = messages;
          if (this.repairPrompt) {
            retryMessages = await this.repairFailingPrompt(output, messages, judgeScore);
          }
          // Try next candidate path
          const currentIdx = candidatePaths.findIndex(p => p.model === this.lastModel);
          for (let j = (currentIdx >= 0 ? currentIdx : 0) + 1; j < candidatePaths.length; j++) {
            const fallback = candidatePaths[j];
            try {
              if (!fallback) continue;
              const fallbackProvider = detectProvider(fallback.model);
              response = await this.dispatch(fallbackProvider, fallback.model, retryMessages, options);
              this.lastModel = fallback.model;
              break;
            } catch {
              continue;
            }
          }
        }
      } catch (err) {
        console.warn('[Kalibr Router] Judge evaluation failed:', (err as Error).message);
      }
    }

    // Attach trace ID to the response so callers can forward it
    const enrichedResponse: KalibrChatCompletion = Object.assign(response, {
      kalibr_trace_id: this.lastTraceId!,
    });

    // Auto-evaluate outcome — three priority levels
    if (!this.outcomeReported) {
      const output = enrichedResponse.choices[0]?.message?.content || "";

      if (this.scoreWhen) {
        // Priority 1: continuous scorer
        const score = Math.min(1.0, Math.max(0.0, this.scoreWhen(output)));
        await this.report(score >= 0.5, score < 0.5 ? "Score below threshold" : undefined, score);
      } else if (this.successWhen) {
        // Priority 2: binary scorer
        const success = this.successWhen(output);
        await this.report(success, success ? undefined : "Output did not meet success criteria");
      } else {
        // Priority 3: default heuristic scoring (zero-config)
        const score = this._defaultScore(enrichedResponse);
        await this.report(score >= 0.5, score < 0.5 ? "Heuristic score below threshold" : undefined, score);
      }
    }

    return enrichedResponse;
  }

  /**
   * Route any HuggingFace task with the same outcome-learning loop as completion().
   * Works for transcription, image generation, embeddings, classification, and all
   * 17 HuggingFace task types.
   *
   * @param task - HuggingFace task type (e.g. "automatic_speech_recognition")
   * @param inputData - Task-appropriate input (audio bytes, text string, image, etc.)
   * @param options - Additional options passed to the HuggingFace InferenceClient
   * @returns Task-appropriate response from HuggingFace
   *
   * @example
   * ```typescript
   * const router = new Router({
   *   goal: "transcribe_calls",
   *   paths: ["openai/whisper-large-v3", "facebook/wav2vec2-large-960h"],
   *   successWhen: (output) => output.length > 50,
   * });
   * const text = await router.execute("automatic_speech_recognition", audioBytes);
   * ```
   */
  async execute(task: HFTask, inputData: unknown, options: Record<string, unknown> = {}): Promise<unknown> {
    // Reset state
    this.outcomeReported = false;
    this.lastTraceId = getTraceId() || newTraceId();

    // Get routing decision
    let selectedModel: string;
    try {
      const decision = await decide(this.goal);
      this.lastDecision = decision;
      selectedModel = decision.model_id;
      if (decision.trace_id) this.lastTraceId = decision.trace_id;
    } catch {
      selectedModel = this.paths[0]!.model;
    }
    this.lastModel = selectedModel;

    // Validate task
    if (!(HF_SUPPORTED_TASKS as readonly string[]).includes(task)) {
      throw new Error(
        `Unsupported task "${task}". Supported tasks: ${HF_SUPPORTED_TASKS.join(", ")}`
      );
    }

    // Dispatch to HuggingFace InferenceClient
    let response: unknown;
    try {
      // @ts-expect-error - huggingface_hub is an optional peer dependency
      const { InferenceClient } = await import("@huggingface/inference");
      const token = this.getEnv("HF_API_TOKEN") || this.getEnv("HUGGING_FACE_HUB_TOKEN");
      const client = new InferenceClient(token);
      const method = (client as Record<string, unknown>)[task];
      if (typeof method !== "function") {
        throw new Error(`InferenceClient has no method: ${task}`);
      }
      response = await (method as Function).call(client, inputData, { model: selectedModel, ...options });
    } catch (err) {
      await reportOutcome(this.lastTraceId!, this.goal, false, {
        failureReason: `provider_error: ${(err as Error).message}`,
        modelId: selectedModel,
      });
      this.outcomeReported = true;
      throw err;
    }

    // Auto-report if scorer provided
    if (!this.outcomeReported) {
      if (this.scoreWhen) {
        const output = typeof response === "string" ? response : JSON.stringify(response);
        const score = Math.min(1.0, Math.max(0.0, this.scoreWhen(output)));
        await this.report(score >= 0.5, undefined, score);
      } else if (this.successWhen) {
        const output = typeof response === "string" ? response : JSON.stringify(response);
        const success = this.successWhen(output);
        await this.report(success);
      } else {
        // Default: non-null response = success
        await this.report(response != null, undefined, response != null ? 0.7 : 0.0);
      }
    }

    return response;
  }

  /**
   * Report the outcome of the last completion.
   *
   * @param success - Whether the completion was successful
   * @param reason - Optional reason for failure
   * @param score - Optional numeric score (0-1)
   * @throws Error if called before `completion()` (no trace ID available)
   */
  async report(
    success: boolean,
    reason?: string,
    score?: number,
    failureCategory?: string
  ): Promise<void> {
    if (this.outcomeReported) {
      console.warn('[Kalibr Router] Outcome already reported for this completion');
      return;
    }

    // Use lastTraceId or fall back to context trace ID
    const traceId = this.lastTraceId || getTraceId();
    if (!traceId) {
      throw new Error('Must call completion() before report(). No trace_id available.');
    }

    if (failureCategory) {
      const { FAILURE_CATEGORIES } = await import('./intelligence');
      if (!FAILURE_CATEGORIES.includes(failureCategory as any)) {
        throw new Error(`Invalid failure_category '${failureCategory}'. Must be one of: ${FAILURE_CATEGORIES.join(', ')}`);
      }
    }

    try {
      await reportOutcome(traceId, this.goal, success, {
        score,
        failureReason: success ? undefined : reason,
        failureCategory,
        modelId: this.lastModel ?? undefined,
      });
      this.outcomeReported = true;
    } catch (err) {
      console.warn('[Kalibr Router] Failed to report outcome:', (err as Error).message);
    }
  }

  /**
   * Report a failure outcome.
   */
  private async reportFailure(errorType: string, errorMessage: string): Promise<void> {
    if (this.outcomeReported || !this.lastTraceId) return;

    try {
      await reportOutcome(this.lastTraceId, this.goal, false, {
        failureReason: `${errorType}: ${errorMessage}`,
        metadata: { error_type: errorType },
      });
      this.outcomeReported = true;
    } catch (err) {
      // Silently ignore reporting errors
    }
  }

  /**
   * @alias completion
   */
  complete = this.completion.bind(this);

  /**
   * Get the last routing decision for debugging.
   */
  getLastDecision(): DecideResponse | null {
    return this.lastDecision;
  }

  /**
   * Get the last trace ID.
   */
  getLastTraceId(): string | null {
    return this.lastTraceId;
  }

  /**
   * Get the last model that was actually used (may differ from selected if fallback occurred).
   */
  getLastModel(): string | null {
    return this.lastModel;
  }

  /**
   * Compute a heuristic quality score from an LLM response.
   * Used when no successWhen or scoreWhen is provided.
   * Gives day-one quality metrics without writing evaluation code.
   */
  private _defaultScore(response: KalibrChatCompletion): number {
    const content = response.choices[0]?.message?.content || "";

    // Empty response is always 0
    if (!content.trim()) return 0.0;

    // Signal 1: length score (sigmoid around 200 chars)
    const charCount = content.length;
    const lengthScore = 1.0 / (1.0 + Math.exp(-0.005 * (charCount - 200)));

    // Signal 2: structure score
    let structureScore = 0.5;
    const stripped = content.trim();
    try {
      JSON.parse(stripped);
      structureScore = 1.0; // valid JSON
    } catch {
      if (stripped.startsWith("{") || stripped.startsWith("[")) {
        structureScore = 0.3; // malformed JSON
      } else if (content.includes("## ") || content.includes("- ") || content.includes("```")) {
        structureScore = 0.8; // markdown
      }
    }

    // Signal 3: finish reason
    const finishReason = response.choices[0]?.finish_reason || "";
    const finishScore = finishReason === "stop" ? 1.0 : finishReason === "length" ? 0.5 : 0.3;

    const score = 0.1 * 1.0 + 0.3 * lengthScore + 0.3 * structureScore + 0.3 * finishScore;
    return Math.round(Math.min(1.0, Math.max(0.0, score)) * 1000) / 1000;
  }

  // ============================================================================
  // Judge & Repair Methods
  // ============================================================================

  private async runJudge(output: string, originalMessages: Message[]): Promise<number> {
    const originalPrompt = originalMessages.find(m => m.role === 'user')?.content || '';
    const judgePrompt = `You are a quality evaluator. Score the following output 0.0 to 1.0.\n\nOriginal request: ${String(originalPrompt).slice(0, 500)}\n\nOutput:\n${output.slice(0, 1000)}\n\nScoring: 1.0=perfect, 0.7-0.9=good, 0.4-0.6=mediocre, 0.0-0.3=bad/wrong language/malformed.\nRespond with ONLY a number between 0.0 and 1.0.`;

    const judgeProvider = detectProvider(this.judgeModel!);
    const judgeResponse = await this.dispatch(judgeProvider, this.judgeModel!, [{ role: 'user', content: judgePrompt }], {});
    const scoreText = (judgeResponse.choices[0]?.message?.content ?? '0.5').trim() || '0.5';
    const matches = scoreText.match(/\d+\.?\d*/);
    if (matches) {
      return Math.min(1.0, Math.max(0.0, parseFloat(matches[0])));
    }
    return 0.5;
  }

  private async repairFailingPrompt(output: string, originalMessages: Message[], judgeScore: number): Promise<Message[]> {
    const originalPrompt = originalMessages.find(m => m.role === 'user')?.content || '';
    const repairRequest = `The following prompt produced a low-quality output (score: ${judgeScore.toFixed(2)}).\n\nOriginal prompt:\n${String(originalPrompt).slice(0, 800)}\n\nBad output:\n${output.slice(0, 600)}\n\nRewrite the prompt to be clearer and more specific so the model produces better output. Keep the intent identical. Return ONLY the rewritten prompt, no explanation.`;

    const repairProvider = detectProvider(this.judgeModel!);
    const repairResponse = await this.dispatch(repairProvider, this.judgeModel!, [{ role: 'user', content: repairRequest }], {});
    const rewritten = repairResponse.choices[0]?.message?.content?.trim();
    if (!rewritten) return originalMessages;

    return originalMessages.map(m => m.role === 'user' ? { ...m, content: rewritten } : m);
  }

  // ============================================================================
  // Provider Dispatch Methods
  // ============================================================================

  /**
   * Dispatch a completion request to the appropriate provider.
   */
  private async dispatch(
    provider: LLMProvider,
    model: string,
    messages: Message[],
    options: CompletionOptions
  ): Promise<ChatCompletion> {
    switch (provider) {
      case 'openai':
        return this.callOpenAI(model, messages, options);
      case 'anthropic':
        return this.callAnthropic(model, messages, options);
      case 'google':
        return this.callGoogle(model, messages, options);
      case 'cohere':
        return this.callCohere(model, messages, options);
      case 'deepseek':
        return this.callDeepSeek(model, messages, options);
      case 'huggingface':
        return this.callHuggingFaceChat(model, messages, options);
      case 'nebius':
        return this.callNebius(model, messages, options);
      case 'tavily':
        return this.callTavily(model, messages, options);
      case 'ollama':
        return this.callOllama(model, messages, options);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Make a completion request to OpenAI.
   */
  private async callOpenAI(
    model: string,
    messages: Message[],
    options: CompletionOptions
  ): Promise<ChatCompletion> {
    // @ts-expect-error - openai is an optional peer dependency
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI();

    const response = await client.chat.completions.create({
      model,
      messages: messages.map((m: Message) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      stop: options.stop,
    });

    // OpenAI response is already in the correct format
    return {
      id: response.id,
      object: 'chat.completion',
      created: response.created,
      model: response.model,
      choices: response.choices.map((choice: { message: { content: string | null }; finish_reason: string | null }, index: number) => ({
        index,
        message: {
          role: 'assistant' as const,
          content: choice.message.content || '',
        },
        finish_reason: choice.finish_reason || 'stop',
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  /**
   * Make a completion request to Anthropic.
   */
  private async callAnthropic(
    model: string,
    messages: Message[],
    options: CompletionOptions
  ): Promise<ChatCompletion> {
    // @ts-expect-error - @anthropic-ai/sdk is an optional peer dependency
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic();

    // Extract system message (Anthropic requires it as a separate parameter)
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');
    const systemPrompt = systemMessages.map((m) => m.content).join('\n');

    const response = await client.messages.create({
      model,
      max_tokens: options.maxTokens || 4096,
      system: systemPrompt || undefined,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      temperature: options.temperature,
      top_p: options.topP,
      stop_sequences: options.stop
        ? Array.isArray(options.stop)
          ? options.stop
          : [options.stop]
        : undefined,
    });

    return convertAnthropicResponse(response as {
      id: string;
      model: string;
      content: Array<{ type: string; text?: string }>;
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    });
  }

  /**
   * Make a completion request to Google Gemini.
   */
  private async callGoogle(
    model: string,
    messages: Message[],
    options: CompletionOptions
  ): Promise<ChatCompletion> {
    // @ts-expect-error - @google/generative-ai is an optional peer dependency
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = this.getEnv('GOOGLE_API_KEY') || this.getEnv('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required');
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Extract model name (remove 'models/' prefix if present)
    const modelName = model.replace(/^models\//, '');
    const generativeModel = genAI.getGenerativeModel({ model: modelName });

    // Build chat history and current message
    const history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    let currentMessage = '';

    // Extract system message as a preamble
    const systemMessages = messages.filter((m) => m.role === 'system');
    const systemPrompt = systemMessages.map((m) => m.content).join('\n');

    // Convert messages to Gemini format
    for (const msg of messages) {
      if (msg.role === 'system') continue; // System messages handled separately

      const role = msg.role === 'assistant' ? 'model' : 'user';
      const content = msg.content;

      // If this is the last user message, save it as the current message
      if (msg === messages[messages.length - 1] && msg.role === 'user') {
        currentMessage = systemPrompt ? `${systemPrompt}\n\n${content}` : content;
      } else {
        history.push({
          role,
          parts: [{ text: content }],
        });
      }
    }

    // If no user message at the end, concatenate all messages
    if (!currentMessage) {
      const allContent = messages
        .map((m) => (m.role === 'system' ? m.content : `${m.role}: ${m.content}`))
        .join('\n\n');
      currentMessage = allContent;
    }

    // Start chat and send message
    const chat = generativeModel.startChat({
      history: history.length > 0 ? history : undefined,
      generationConfig: {
        maxOutputTokens: options.maxTokens,
        temperature: options.temperature,
        topP: options.topP,
        stopSequences: options.stop
          ? Array.isArray(options.stop)
            ? options.stop
            : [options.stop]
          : undefined,
      },
    });

    const result = await chat.sendMessage(currentMessage);
    const response = await result.response;

    return convertGoogleResponse(
      {
        candidates: response.candidates,
        usageMetadata: response.usageMetadata,
      },
      model
    );
  }

  /**
   * Make a completion request to Cohere.
   */
  private async callCohere(
    model: string,
    messages: Message[],
    options: CompletionOptions
  ): Promise<ChatCompletion> {
    // @ts-expect-error - cohere-ai is an optional peer dependency
    const { CohereClient } = await import('cohere-ai');
    const client = new CohereClient();

    // Convert messages to Cohere format
    // Cohere expects chat_history and a final message
    const chatHistory: Array<{
      role: 'USER' | 'CHATBOT' | 'SYSTEM';
      message: string;
    }> = [];

    let preamble: string | undefined;
    let lastUserMessage = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        preamble = preamble ? `${preamble}\n${msg.content}` : msg.content;
      } else if (msg === messages[messages.length - 1] && msg.role === 'user') {
        lastUserMessage = msg.content;
      } else {
        chatHistory.push({
          role: msg.role === 'user' ? 'USER' : 'CHATBOT',
          message: msg.content,
        });
      }
    }

    // If no final user message, use the last message content
    if (!lastUserMessage) {
      const lastMsg = messages[messages.length - 1];
      lastUserMessage = lastMsg?.content || '';
    }

    const response = await client.chat({
      model,
      message: lastUserMessage,
      chatHistory: chatHistory.length > 0 ? chatHistory : undefined,
      preamble,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      p: options.topP,
      stopSequences: options.stop
        ? Array.isArray(options.stop)
          ? options.stop
          : [options.stop]
        : undefined,
    });

    return convertCohereResponse(response as {
      text?: string;
      generation_id?: string;
      meta?: {
        tokens?: { input_tokens?: number; output_tokens?: number };
        billed_units?: { input_tokens?: number; output_tokens?: number };
      };
      finish_reason?: string;
    }, model);
  }

  /**
   * Make a completion request to DeepSeek (OpenAI-compatible API).
   */
  private async callDeepSeek(
    model: string,
    messages: Message[],
    options: CompletionOptions
  ): Promise<ChatCompletion> {
    // @ts-expect-error - openai is an optional peer dependency
    const OpenAI = (await import('openai')).default;
    const apiKey = this.getEnv("DEEPSEEK_API_KEY");
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY environment variable is required for DeepSeek models");
    }
    const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
    const response = await client.chat.completions.create({
      model,
      messages: messages.map((m: Message) => ({ role: m.role, content: m.content })),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      stop: options.stop,
    });
    return {
      id: response.id,
      object: "chat.completion",
      created: response.created,
      model: response.model,
      choices: response.choices.map((choice: { message: { content: string | null }; finish_reason: string | null }, index: number) => ({
        index,
        message: { role: "assistant" as const, content: choice.message.content || "" },
        finish_reason: choice.finish_reason || "stop",
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  /**
   * Make a chat completion request via HuggingFace InferenceClient.
   */
  private async callHuggingFaceChat(
    model: string,
    messages: Message[],
    options: CompletionOptions
  ): Promise<ChatCompletion> {
    // @ts-expect-error - @huggingface/inference is an optional peer dependency
    const { InferenceClient } = await import("@huggingface/inference");
    const token = this.getEnv("HF_API_TOKEN") || this.getEnv("HUGGING_FACE_HUB_TOKEN");
    const client = new InferenceClient(token);
    const response = await client.chatCompletion({
      model,
      messages: messages.map((m: Message) => ({ role: m.role, content: m.content })),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    });
    return {
      id: `hf-${model}-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: (response.choices || []).map((choice: { message: { content: string | null }; finish_reason?: string }, index: number) => ({
        index,
        message: { role: "assistant" as const, content: choice.message?.content || "" },
        finish_reason: choice.finish_reason || "stop",
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  /**
   * Make a completion request to Nebius AI Studio (OpenAI-compatible API).
   */
  private async callNebius(
    model: string,
    messages: Message[],
    options: CompletionOptions
  ): Promise<ChatCompletion> {
    // @ts-expect-error - openai is an optional peer dependency
    const OpenAI = (await import('openai')).default;
    const apiKey = this.getEnv("NEBIUS_API_KEY");
    if (!apiKey) {
      throw new Error("NEBIUS_API_KEY environment variable is required for Nebius models");
    }
    // Strip the "nebius/" prefix to get the actual model ID
    const nebiusModel = model.replace(/^nebius\//, '');
    const client = new OpenAI({ apiKey, baseURL: "https://api.studio.nebius.ai/v1" });
    const response = await client.chat.completions.create({
      model: nebiusModel,
      messages: messages.map((m: Message) => ({ role: m.role, content: m.content })),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      stop: options.stop,
    });
    return {
      id: response.id,
      object: "chat.completion",
      created: response.created,
      model: response.model,
      choices: response.choices.map((choice: { message: { content: string | null }; finish_reason: string | null }, index: number) => ({
        index,
        message: { role: "assistant" as const, content: choice.message.content || "" },
        finish_reason: choice.finish_reason || "stop",
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  /**
   * Call Ollama local model via OpenAI-compatible API.
   * Default endpoint: http://localhost:11434/v1
   * Override with OLLAMA_BASE_URL env var. No API key required.
   */
  private async callOllama(
    model: string,
    messages: Message[],
    options: CompletionOptions
  ): Promise<ChatCompletion> {
    // @ts-expect-error - openai is an optional peer dependency
    const OpenAI = (await import('openai')).default;
    const baseURL = this.getEnv("OLLAMA_BASE_URL") || "http://localhost:11434/v1";
    const apiKey = this.getEnv("OLLAMA_API_KEY") || "ollama"; // Ollama accepts any non-empty string
    const ollamaModel = model.replace(/^ollama\//, '');

    const client = new OpenAI({ apiKey, baseURL });
    const response = await client.chat.completions.create({
      model: ollamaModel,
      messages: messages.map((m: Message) => ({ role: m.role, content: m.content })),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      stop: options.stop,
    });
    return {
      id: response.id,
      object: "chat.completion",
      created: response.created,
      model: response.model,
      choices: response.choices.map((choice: { message: { content: string | null }; finish_reason: string | null }, index: number) => ({
        index,
        message: { role: "assistant" as const, content: choice.message.content || "" },
        finish_reason: choice.finish_reason || "stop",
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  /**
   * Make a search request via Tavily and wrap results in ChatCompletion format.
   */
  private async callTavily(
    model: string,
    messages: Message[],
    _options: CompletionOptions
  ): Promise<ChatCompletion> {
    const apiKey = this.getEnv("TAVILY_API_KEY");
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY environment variable is required for Tavily search");
    }
    // Determine search depth from model path: tavily/basic or tavily/advanced
    const depth = model.toLowerCase().includes("advanced") ? "advanced" : "basic";
    // Use the last user message as the search query
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const query = lastUserMsg?.content || '';
    if (!query) {
      throw new Error("Tavily search requires at least one user message as the query");
    }

    const fetchFn = globalThis.fetch;
    const response = await fetchFn("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: depth,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Tavily API error ${response.status}: ${errorText}`);
    }

    const results = await response.json();

    return {
      id: `tavily-${generateId()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: JSON.stringify(results),
        },
        finish_reason: "stop",
      }],
      // Tavily is credit-based, not token-based.
      // We send prompt_tokens=1 so calculateCost() fires against the tavily pricing table,
      // which stores per-call USD cost as a per-1M-token rate.
      // basic=1 credit=$0.008, advanced=2 credits=$0.016 (source: docs.tavily.com/documentation/api-credits)
      usage: {
        prompt_tokens: 1,
        completion_tokens: 0,
        total_tokens: 1,
      },
    };
  }

  /**
   * Synthesize text to speech.
   *
   * Detects the TTS vendor from the model prefix:
   * - `elevenlabs/` → ElevenLabs TTS (requires ELEVENLABS_API_KEY)
   * - `openai/tts-*` → OpenAI TTS
   * - `deepgram/` → Deepgram TTS (requires DEEPGRAM_API_KEY)
   *
   * @param text - The text to synthesize
   * @param voice - Optional voice identifier (provider-specific)
   * @param options - Additional provider-specific options
   * @returns Base64-encoded audio string
   */
  async synthesize(
    text: string,
    voice?: string,
    options: Record<string, unknown> = {}
  ): Promise<string> {
    this.outcomeReported = false;
    this.lastTraceId = getTraceId() || newTraceId();

    let selectedModel: string;
    try {
      const decision = await decide(this.goal);
      this.lastDecision = decision;
      selectedModel = decision.model_id;
      if (decision.trace_id) this.lastTraceId = decision.trace_id;
    } catch {
      selectedModel = this.paths[0]!.model;
    }
    this.lastModel = selectedModel;

    const modelLower = selectedModel.toLowerCase();
    let result: string;

    try {
      if (modelLower.startsWith('elevenlabs/')) {
        const apiKey = this.getEnv('ELEVENLABS_API_KEY');
        if (!apiKey) throw new Error('ELEVENLABS_API_KEY environment variable is required for ElevenLabs TTS');
        const voiceId = voice || 'Rachel';
        const modelId = selectedModel.replace(/^elevenlabs\//i, '') || 'eleven_monolingual_v1';
        const fetchFn = globalThis.fetch;
        const resp = await fetchFn(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({ text, model_id: modelId, ...options }),
        });
        if (!resp.ok) throw new Error(`ElevenLabs API error ${resp.status}`);
        const buf = await resp.arrayBuffer();
        result = Buffer.from(buf).toString('base64');

      } else if (modelLower.startsWith('openai/tts')) {
        // @ts-expect-error - openai is an optional peer dependency
        const OpenAI = (await import('openai')).default;
        const client = new OpenAI();
        const ttsModel = selectedModel.replace(/^openai\//i, '');
        const resp = await client.audio.speech.create({
          model: ttsModel,
          voice: voice || 'alloy',
          input: text,
          ...options,
        });
        const buf = await resp.arrayBuffer();
        result = Buffer.from(buf).toString('base64');

      } else if (modelLower.startsWith('deepgram/')) {
        const apiKey = this.getEnv('DEEPGRAM_API_KEY');
        if (!apiKey) throw new Error('DEEPGRAM_API_KEY environment variable is required for Deepgram TTS');
        const dgModel = selectedModel.replace(/^deepgram\//i, '') || 'aura-asteria-en';
        const fetchFn = globalThis.fetch;
        const resp = await fetchFn(`https://api.deepgram.com/v1/speak?model=${dgModel}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${apiKey}`,
          },
          body: JSON.stringify({ text }),
        });
        if (!resp.ok) throw new Error(`Deepgram TTS API error ${resp.status}`);
        const buf = await resp.arrayBuffer();
        result = Buffer.from(buf).toString('base64');

      } else {
        throw new Error(
          `Unsupported TTS model: ${selectedModel}. ` +
          'Supported prefixes: elevenlabs/, openai/tts-*, deepgram/'
        );
      }
    } catch (err) {
      await reportOutcome(this.lastTraceId!, this.goal, false, {
        failureReason: `provider_error: ${(err as Error).message}`,
        modelId: selectedModel,
      });
      this.outcomeReported = true;
      throw err;
    }

    if (!this.outcomeReported) {
      await this.report(true, undefined, 0.8);
    }

    return result;
  }

  /**
   * Transcribe audio to text.
   *
   * Detects the STT vendor from the model prefix:
   * - `openai/whisper-*` → OpenAI Whisper
   * - `deepgram/` → Deepgram STT (requires DEEPGRAM_API_KEY)
   *
   * @param audio - Audio data as Buffer or Uint8Array
   * @param options - Additional provider-specific options
   * @returns Transcript text
   */
  async transcribe(
    audio: Buffer | Uint8Array,
    options: Record<string, unknown> = {}
  ): Promise<string> {
    this.outcomeReported = false;
    this.lastTraceId = getTraceId() || newTraceId();

    let selectedModel: string;
    try {
      const decision = await decide(this.goal);
      this.lastDecision = decision;
      selectedModel = decision.model_id;
      if (decision.trace_id) this.lastTraceId = decision.trace_id;
    } catch {
      selectedModel = this.paths[0]!.model;
    }
    this.lastModel = selectedModel;

    const modelLower = selectedModel.toLowerCase();
    let transcript: string;

    try {
      if (modelLower.startsWith('openai/whisper') || modelLower === 'openai/whisper-1') {
        // @ts-expect-error - openai is an optional peer dependency
        const OpenAI = (await import('openai')).default;
        const client = new OpenAI();
        const whisperModel = selectedModel.replace(/^openai\//i, '');
        const file = new File([new Uint8Array(audio)], 'audio.wav', { type: 'audio/wav' });
        const resp = await client.audio.transcriptions.create({
          model: whisperModel,
          file,
          ...options,
        });
        transcript = typeof resp === 'string' ? resp : resp.text;

      } else if (modelLower.startsWith('deepgram/')) {
        const apiKey = this.getEnv('DEEPGRAM_API_KEY');
        if (!apiKey) throw new Error('DEEPGRAM_API_KEY environment variable is required for Deepgram STT');
        const dgModel = selectedModel.replace(/^deepgram\//i, '') || 'nova-2';
        const fetchFn = globalThis.fetch;
        const resp = await fetchFn(`https://api.deepgram.com/v1/listen?model=${dgModel}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'audio/wav',
            'Authorization': `Token ${apiKey}`,
          },
          body: new Uint8Array(audio),
        });
        if (!resp.ok) throw new Error(`Deepgram STT API error ${resp.status}`);
        const data = await resp.json();
        transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

      } else {
        throw new Error(
          `Unsupported STT model: ${selectedModel}. ` +
          'Supported prefixes: openai/whisper-*, deepgram/'
        );
      }
    } catch (err) {
      await reportOutcome(this.lastTraceId!, this.goal, false, {
        failureReason: `provider_error: ${(err as Error).message}`,
        modelId: selectedModel,
      });
      this.outcomeReported = true;
      throw err;
    }

    if (!this.outcomeReported) {
      if (this.successWhen) {
        const success = this.successWhen(transcript);
        await this.report(success, success ? undefined : 'Transcript did not meet success criteria');
      } else {
        await this.report(transcript.length > 0, undefined, transcript.length > 0 ? 0.8 : 0.0);
      }
    }

    return transcript;
  }

  /**
   * Get environment variable value.
   */
  private getEnv(name: string): string | undefined {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name];
    }
    return undefined;
  }
}

// ============================================================================
// Exports
// ============================================================================

export default Router;
