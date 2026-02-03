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
  /** Exploration rate for the routing algorithm (0-1) */
  explorationRate?: number;
  /** Whether to auto-register paths on init (default: true) */
  autoRegister?: boolean;
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

// ============================================================================
// Provider Detection
// ============================================================================

/**
 * Supported LLM providers.
 */
type LLMProvider = 'openai' | 'anthropic' | 'google' | 'cohere';

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
    modelLower.startsWith('o3-')
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

  throw new Error(
    `Cannot determine provider for model: ${model}. ` +
      'Supported prefixes: gpt-, o1-, o3- (OpenAI), claude- (Anthropic), ' +
      'gemini-, models/gemini (Google), command (Cohere)'
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
  /** Exploration rate for routing decisions (stored for future use) */
  readonly explorationRate: number;
  private readonly autoRegister: boolean;

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
    this.explorationRate = config.explorationRate ?? 0.1;
    this.autoRegister = config.autoRegister ?? true;

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
   * @returns OpenAI-compatible ChatCompletion response
   */
  async completion(
    messages: Message[],
    options: CompletionOptions = {}
  ): Promise<ChatCompletion> {
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
    const selectedPath = this.paths.find(p => p.model === selectedModel);
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

    // Auto-evaluate outcome if callback provided
    if (this.successWhen && !this.outcomeReported) {
      const output = response.choices[0]?.message?.content || '';
      const success = this.successWhen(output);
      await this.report(success, success ? undefined : 'Output did not meet success criteria');
    }

    return response;
  }

  /**
   * Report the outcome of the last completion.
   *
   * @param success - Whether the completion was successful
   * @param reason - Optional reason for failure
   * @param score - Optional numeric score (0-1)
   */
  async report(
    success: boolean,
    reason?: string,
    score?: number
  ): Promise<void> {
    if (this.outcomeReported) {
      console.warn('[Kalibr Router] Outcome already reported for this completion');
      return;
    }

    // Use lastTraceId or fall back to context trace ID
    const traceId = this.lastTraceId || getTraceId();
    if (!traceId) {
      console.warn('[Kalibr Router] No completion to report outcome for');
      return;
    }

    try {
      await reportOutcome(traceId, this.goal, success, {
        score,
        failureReason: success ? undefined : reason,
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
