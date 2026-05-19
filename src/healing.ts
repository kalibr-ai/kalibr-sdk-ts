/**
 * Kalibr self-healing harness — v1.14.1 parity with Python SDK.
 *
 * - Gate 1: structural eval (pure, no HTTP) — length/shape checks per goal
 * - Gate 2: judge LLM eval (optional, opt-in) — calls DeepSeek/OpenAI to score
 * - Failure classification + deterministic prompt repair
 * - Model swap across a list of candidate paths
 * - KalibrPipeline: multi-step pipelines that chain results
 *
 * @example
 * ```typescript
 * const heal = new HealLoop();
 * const result = await heal.run(
 *   'summarization',
 *   [{ role: 'user', content: 'Summarize this article...' }],
 *   ['deepseek-chat', 'gpt-4o-mini'],
 *   async (model, msgs) => callMyLLM(model, msgs),
 *   { maxRetries: 2, gate2Enabled: true }
 * );
 * ```
 */

import type { Kalibr } from './kalibr';
import { reportPipeline } from './feedback';

// ============================================================================
// Types
// ============================================================================

export interface HealConfig {
  /** Maximum repair attempts per model before swapping (default 2) */
  maxRetries?: number;
  /** Whether to invoke the Gate 2 judge LLM (default false) */
  gate2Enabled?: boolean;
  /** Judge LLM model id (default 'deepseek-chat') */
  judgeModel?: string;
  /** Repair model id — null = use same model that produced bad output */
  repairModel?: string | null;
  /** When true, generate a task-specific system prompt via DeepSeek/OpenAI before each run (default false) */
  metaPromptEnabled?: boolean;
}

export interface HealResult {
  success: boolean;
  result: string | null;
  modelUsed: string;
  healed: boolean;
  healCount: number;
  modelsTried: string[];
  failureCategory: string | null;
  error: string | null;
}

export interface Gate2Result {
  score: number | null;
  issues: string[];
  skipped: boolean;
}

export interface PipelineStep {
  goal: string;
  messages: unknown[];
  /** If true, append previous step's result to this step's messages */
  chain?: boolean;
  /** Override paths/dispatchFn for this step */
  paths?: string[];
  dispatchFn?: DispatchFn;
}

export interface StepResult {
  goal: string;
  success: boolean;
  result: string | null;
  modelUsed: string;
  healed: boolean;
  healCount: number;
  error: string | null;
}

export interface PipelineResult {
  success: boolean;
  steps: StepResult[];
  totalHeals: number;
  pipelineId: string;
}

export type DispatchFn = (model: string, messages: unknown[]) => Promise<string>;

export interface PipelineRunOptions {
  /** Default model paths to try for each step (steps may override) */
  paths?: string[];
  /** Default dispatch function (steps may override) */
  dispatchFn?: DispatchFn;
}

// ============================================================================
// HealLoop
// ============================================================================

const DEFAULT_HEAL_CONFIG: Required<Omit<HealConfig, 'repairModel'>> & { repairModel: string | null } = {
  maxRetries: 2,
  gate2Enabled: false,
  judgeModel: 'deepseek-chat',
  repairModel: null,
  metaPromptEnabled: false,
};

const META_PROMPT_TTL_MS = 300000;
const metaPromptCache = new Map<string, { prompt: string; ts: number }>();

function _hashKey(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  const a = (h1 >>> 0).toString(16).padStart(8, '0');
  const b = (h2 >>> 0).toString(16).padStart(8, '0');
  return (a + b).slice(0, 16);
}

export class HealLoop {
  /**
   * Pure structural eval. No async, no HTTP.
   * Returns true if the output looks plausibly valid for the given goal.
   */
  gate1Eval(goal: string, output: string): boolean {
    if (!output || !output.trim()) return false;
    const text = output.trim();

    switch (goal) {
      case 'code_generation': {
        const codeBlock = /```[\s\S]*?```/.exec(text);
        if (codeBlock) return codeBlock[0].length > 20;
        return text.length > 20;
      }
      case 'summarization': {
        const sentenceCount = (text.match(/\.\s/g) || []).length;
        return text.length > 50 && sentenceCount >= 2;
      }
      case 'outreach_generation':
        return text.length >= 50 && text.length <= 2000;
      case 'classification':
        return text.length < 200 && text.length > 0;
      default:
        return text.length > 20;
    }
  }

  /**
   * Categorize a failure based on the error string and output.
   */
  classifyFailure(_goal: string, output: string, error: string | null): string {
    const errLower = (error || '').toLowerCase();
    if (errLower.includes('timeout')) return 'timeout';
    if (errLower.includes('context')) return 'context_exceeded';
    if (errLower.includes('rate')) return 'rate_limited';
    if (!output || !output.trim()) return 'empty_response';
    return 'unknown';
  }

  /**
   * Deterministic prompt repair instructions per goal.
   * Returns a system-style hint to append; null if no repair available.
   */
  repairPrompt(goal: string, output: string, gate2Issues: string[] = []): string | null {
    const issuesNote = gate2Issues.length > 0
      ? ` Specific issues to fix: ${gate2Issues.join('; ')}.`
      : '';
    const sample = output ? output.slice(0, 200) : '(empty)';

    switch (goal) {
      case 'code_generation':
        return `Your previous response was insufficient. Return runnable code in a fenced \`\`\` block, at least 20 characters long.${issuesNote} Previous output: ${sample}`;
      case 'summarization':
        return `Your previous summary was too short or malformed. Produce a coherent summary of at least 50 characters with two or more complete sentences ending in periods.${issuesNote} Previous output: ${sample}`;
      case 'outreach_generation':
        return `Your previous outreach message did not meet length requirements. Produce a message between 50 and 2000 characters.${issuesNote} Previous output: ${sample}`;
      case 'classification':
        return `Your previous classification was malformed. Respond with a concise label under 200 characters.${issuesNote} Previous output: ${sample}`;
      default:
        return `Your previous response was insufficient. Provide a more complete answer of at least 20 characters.${issuesNote} Previous output: ${sample}`;
    }
  }

  /**
   * Optional Gate 2 judge — calls DeepSeek (or OpenAI fallback) to score the output.
   * NEVER throws — returns skipped:true on any error or missing API key.
   */
  async gate2Judge(goal: string, output: string, judgeModel: string): Promise<Gate2Result> {
    const skipped: Gate2Result = { score: null, issues: [], skipped: true };

    const env = typeof process !== 'undefined' ? process.env : {};
    const deepseekKey = env['DEEPSEEK_API_KEY'];
    const openaiKey = env['OPENAI_API_KEY'];

    let endpoint: string;
    let apiKey: string;
    let model: string;
    if (deepseekKey) {
      endpoint = 'https://api.deepseek.com/chat/completions';
      apiKey = deepseekKey;
      model = judgeModel;
    } else if (openaiKey) {
      endpoint = 'https://api.openai.com/v1/chat/completions';
      apiKey = openaiKey;
      model = judgeModel.startsWith('deepseek') ? 'gpt-4o-mini' : judgeModel;
    } else {
      return skipped;
    }

    const judgePrompt =
      `You are evaluating an LLM output for the goal "${goal}".\n` +
      `Score the output from 0.0 (terrible) to 1.0 (perfect) and list concrete issues.\n` +
      `Respond ONLY with strict JSON of the form {"score": <number>, "issues": ["...", "..."]}.\n\n` +
      `Output to evaluate:\n${output.slice(0, 2000)}`;

    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: judgePrompt }],
          temperature: 0,
          max_tokens: 256,
        }),
        signal: controller ? controller.signal : undefined,
      });
      if (timer) clearTimeout(timer);

      if (!res.ok) return skipped;
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content ?? '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return skipped;
      const parsed = JSON.parse(jsonMatch[0]) as { score?: number; issues?: string[] };
      const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : null;
      const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String) : [];
      return { score, issues, skipped: false };
    } catch {
      return skipped;
    }
  }

  /**
   * Generate a task-specific system prompt via DeepSeek/OpenAI.
   * NEVER throws — returns null on any error or missing API key.
   * Results are cached for 5 minutes keyed by goal + first 100 chars of user content.
   */
  async generateMetaPrompt(goal: string, messages: any[], modelId: string): Promise<string | null> {
    const userPreview = messages.filter((m) => m && m.role === 'user').pop()?.content || '';
    const cacheKey = _hashKey(`${goal}::${String(userPreview).slice(0, 100)}`);

    const now = Date.now();
    const cached = metaPromptCache.get(cacheKey);
    if (cached && now - cached.ts < META_PROMPT_TTL_MS) {
      return cached.prompt;
    }

    const env = typeof process !== 'undefined' ? process.env : {};
    const deepseekKey = env['DEEPSEEK_API_KEY'];
    const openaiKey = env['OPENAI_API_KEY'];

    let endpoint: string;
    let apiKey: string;
    let model: string;
    if (deepseekKey) {
      endpoint = 'https://api.deepseek.com/chat/completions';
      apiKey = deepseekKey;
      model = 'deepseek-chat';
    } else if (openaiKey) {
      endpoint = 'https://api.openai.com/v1/chat/completions';
      apiKey = openaiKey;
      model = 'gpt-4o-mini';
    } else {
      return null;
    }

    void modelId;
    const prompt =
      `Generate a concise system prompt (under 150 words) for an AI completing this task.\n` +
      `Goal type: ${goal}\n` +
      `Task preview: ${String(userPreview).slice(0, 300)}\n` +
      `Output ONLY the system prompt text.`;

    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 300,
        }),
        signal: controller ? controller.signal : undefined,
      });
      if (timer) clearTimeout(timer);

      if (!res.ok) return null;
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) return null;
      const out = content.trim();
      metaPromptCache.set(cacheKey, { prompt: out, ts: now });
      return out;
    } catch {
      return null;
    }
  }

  /**
   * Run the heal loop: try each candidate model, repair on failure, swap on exhaust.
   */
  async run(
    goal: string,
    messages: unknown[],
    paths: string[],
    dispatchFn: DispatchFn,
    config: HealConfig = {},
    pipelineId?: string,
  ): Promise<HealResult> {
    const cfg = { ...DEFAULT_HEAL_CONFIG, ...config };
    const candidates = paths.length > 0 ? paths : [cfg.repairModel ?? cfg.judgeModel];

    let metaSysPrompt: string | null = null;
    if (cfg.metaPromptEnabled && candidates.length > 0) {
      metaSysPrompt = await this.generateMetaPrompt(goal, messages as any[], candidates[0] ?? '');
    }
    const buildInitial = (): unknown[] => {
      if (metaSysPrompt) {
        return [{ role: 'system', content: metaSysPrompt }, ...messages];
      }
      return messages.slice();
    };

    const modelsTried: string[] = [];
    let healCount = 0;
    let healed = false;
    let lastError: string | null = null;
    let lastFailureCategory: string | null = null;
    let currentMessages: unknown[] = buildInitial();

    if (pipelineId) {
      try {
        reportPipeline(pipelineId, goal, 'heal_loop_start');
      } catch {
        // telemetry best-effort
      }
    }

    for (const model of candidates) {
      modelsTried.push(model);

      for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
        let output = '';
        let dispatchError: string | null = null;

        try {
          output = await dispatchFn(model, currentMessages);
        } catch (err) {
          dispatchError = err instanceof Error ? err.message : String(err);
          lastError = dispatchError;
        }

        if (this.gate1Eval(goal, output)) {
          if (cfg.gate2Enabled) {
            const g2 = await this.gate2Judge(goal, output, cfg.judgeModel);
            if (!g2.skipped && g2.score !== null && g2.score < 0.5) {
              const repair = this.repairPrompt(goal, output, g2.issues);
              if (repair && attempt < cfg.maxRetries) {
                const combined = metaSysPrompt ? `${metaSysPrompt}\n\n${repair}` : repair;
                currentMessages = this._appendRepairTurn(currentMessages, combined);
                healCount++;
                healed = true;
                lastFailureCategory = 'gate2_low_score';
                continue;
              }
              lastFailureCategory = 'gate2_low_score';
            } else {
              return {
                success: true,
                result: output,
                modelUsed: model,
                healed,
                healCount,
                modelsTried,
                failureCategory: null,
                error: null,
              };
            }
          } else {
            return {
              success: true,
              result: output,
              modelUsed: model,
              healed,
              healCount,
              modelsTried,
              failureCategory: null,
              error: null,
            };
          }
        } else {
          lastFailureCategory = this.classifyFailure(goal, output, dispatchError);
          if (attempt < cfg.maxRetries) {
            const repair = this.repairPrompt(goal, output);
            if (repair) {
              const combined = metaSysPrompt ? `${metaSysPrompt}\n\n${repair}` : repair;
              currentMessages = this._appendRepairTurn(currentMessages, combined);
              healCount++;
              healed = true;
              continue;
            }
          }
        }
      }

      // exhausted retries for this model — reset prompt and try next
      currentMessages = buildInitial();
    }

    return {
      success: false,
      result: null,
      modelUsed: modelsTried[modelsTried.length - 1] ?? '',
      healed,
      healCount,
      modelsTried,
      failureCategory: lastFailureCategory,
      error: lastError,
    };
  }

  private _appendRepairTurn(messages: unknown[], repair: string): unknown[] {
    return [...messages, { role: 'user', content: repair }];
  }
}

// ============================================================================
// KalibrPipeline
// ============================================================================

/**
 * Orchestrates a multi-step pipeline. Each step may opt into the heal loop.
 *
 * The `kalibr` instance is used for telemetry (pipeline anchor signals).
 * Pass a `dispatchFn` either on the run() options or per-step.
 */
export class KalibrPipeline {
  private readonly _kalibr: Kalibr;
  private readonly _pipelineId: string;

  constructor(kalibr: Kalibr, pipelineId?: string) {
    this._kalibr = kalibr;
    this._pipelineId = pipelineId || _generatePipelineId();
  }

  get pipelineId(): string {
    return this._pipelineId;
  }

  get kalibr(): Kalibr {
    return this._kalibr;
  }

  async run(
    steps: PipelineStep[],
    healing: boolean = true,
    healConfig?: HealConfig,
    options?: PipelineRunOptions,
  ): Promise<PipelineResult> {
    const heal = new HealLoop();
    const stepResults: StepResult[] = [];
    let totalHeals = 0;
    let previousOutput: string | null = null;

    for (const step of steps) {
      const paths = step.paths ?? options?.paths ?? [];
      const dispatch = step.dispatchFn ?? options?.dispatchFn;

      if (!dispatch) {
        stepResults.push({
          goal: step.goal,
          success: false,
          result: null,
          modelUsed: '',
          healed: false,
          healCount: 0,
          error: 'no dispatchFn provided (set on step or run options)',
        });
        continue;
      }

      let messages = step.messages.slice();
      if (step.chain && previousOutput !== null) {
        messages = [...messages, { role: 'user', content: previousOutput }];
      }

      try {
        reportPipeline(this._pipelineId, step.goal);
      } catch {
        // telemetry best-effort
      }

      if (healing) {
        const r = await heal.run(step.goal, messages, paths, dispatch, healConfig ?? {}, this._pipelineId);
        totalHeals += r.healCount;
        stepResults.push({
          goal: step.goal,
          success: r.success,
          result: r.result,
          modelUsed: r.modelUsed,
          healed: r.healed,
          healCount: r.healCount,
          error: r.error,
        });
        if (r.success) {
          previousOutput = r.result;
        } else {
          return {
            success: false,
            steps: stepResults,
            totalHeals,
            pipelineId: this._pipelineId,
          };
        }
      } else {
        const model = paths[0] ?? '';
        try {
          const output = await dispatch(model, messages);
          stepResults.push({
            goal: step.goal,
            success: true,
            result: output,
            modelUsed: model,
            healed: false,
            healCount: 0,
            error: null,
          });
          previousOutput = output;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stepResults.push({
            goal: step.goal,
            success: false,
            result: null,
            modelUsed: model,
            healed: false,
            healCount: 0,
            error: msg,
          });
          return {
            success: false,
            steps: stepResults,
            totalHeals,
            pipelineId: this._pipelineId,
          };
        }
      }
    }

    return {
      success: true,
      steps: stepResults,
      totalHeals,
      pipelineId: this._pipelineId,
    };
  }
}

function _generatePipelineId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `pipe_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `pipe_${Math.random().toString(36).slice(2, 18)}`;
}
