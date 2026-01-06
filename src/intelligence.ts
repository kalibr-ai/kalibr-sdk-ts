/**
 * Kalibr Intelligence & Routing API
 *
 * TypeScript SDK for the Kalibr Intelligence service, providing
 * intelligent routing, policy management, and outcome tracking.
 *
 * @example
 * ```typescript
 * import { KalibrIntelligence, getPolicy, decide } from '@kalibr/sdk';
 *
 * // Using the class
 * const intelligence = new KalibrIntelligence({
 *   apiKey: process.env.KALIBR_API_KEY,
 *   tenantId: process.env.KALIBR_TENANT_ID,
 * });
 *
 * const policy = await intelligence.getPolicy('summarize document');
 * const decision = await intelligence.decide('translate text');
 *
 * // Using convenience functions (after init)
 * KalibrIntelligence.init({ apiKey: 'key', tenantId: 'tenant' });
 * const policy = await getPolicy('summarize document');
 * ```
 */

// ============================================================================
// Type Definitions
// ============================================================================

/** Configuration options for KalibrIntelligence client */
export interface KalibrIntelligenceConfig {
  /** API key for authentication */
  apiKey?: string;
  /** Tenant identifier */
  tenantId?: string;
  /** Base URL for the intelligence API */
  baseUrl?: string;
}

/** Options for getPolicy request */
export interface GetPolicyOptions {
  /** Type of task being performed */
  taskType?: string;
  /** Constraints to apply to policy selection */
  constraints?: Record<string, unknown>;
  /** Time window in hours for historical data */
  windowHours?: number;
  /** Whether to include tool recommendations */
  includeTools?: boolean;
  /** Parameters to include in the response */
  includeParams?: string[];
}

/** Options for reportOutcome request */
export interface ReportOutcomeOptions {
  /** Numeric score for the outcome (0-1) */
  score?: number;
  /** Reason for failure if success is false */
  failureReason?: string;
  /** Additional metadata about the outcome */
  metadata?: Record<string, unknown>;
  /** Tool ID that was used */
  toolId?: string;
  /** Parameters used during execution */
  executionParams?: Record<string, unknown>;
}

/** Options for registerPath request */
export interface RegisterPathOptions {
  /** Tool ID associated with this path */
  toolId?: string;
  /** Parameters for the path */
  params?: Record<string, unknown>;
  /** Risk level of this path */
  riskLevel?: string;
}

/** Options for listPaths request */
export interface ListPathsOptions {
  /** Filter by goal */
  goal?: string;
  /** Include disabled paths */
  includeDisabled?: boolean;
}

/** Options for decide request */
export interface DecideOptions {
  /** Risk level of the task */
  taskRiskLevel?: string;
}

/** Options for setExplorationConfig request */
export interface ExplorationConfigOptions {
  /** Goal to configure exploration for (optional for global config) */
  goal?: string;
  /** Exploration rate (0-1) */
  explorationRate?: number;
  /** Minimum samples before exploiting best path */
  minSamplesBeforeExploit?: number;
  /** Threshold for automatic rollback on performance drop */
  rollbackThreshold?: number;
  /** Days before path stats are considered stale */
  stalenessDays?: number;
  /** Whether to explore on high-risk tasks */
  explorationOnHighRisk?: boolean;
}

// ============================================================================
// Response Types
// ============================================================================

/** Response from getPolicy */
export interface PolicyResponse {
  /** Policy ID */
  policy_id: string;
  /** Recommended model ID */
  model_id: string;
  /** Recommended tool ID */
  tool_id?: string;
  /** Recommended parameters */
  params?: Record<string, unknown>;
  /** Policy constraints */
  constraints?: Record<string, unknown>;
  /** Risk level */
  risk_level?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Response from reportOutcome */
export interface OutcomeResponse {
  /** Whether the outcome was recorded successfully */
  success: boolean;
  /** Outcome ID */
  outcome_id?: string;
  /** Any message from the server */
  message?: string;
}

/** Response from registerPath */
export interface PathResponse {
  /** Whether the path was registered successfully */
  success: boolean;
  /** Path ID */
  path_id: string;
  /** Any message from the server */
  message?: string;
}

/** Individual path in listPaths response */
export interface PathInfo {
  /** Path ID */
  path_id: string;
  /** Goal this path is for */
  goal: string;
  /** Model ID */
  model_id: string;
  /** Tool ID */
  tool_id?: string;
  /** Parameters */
  params?: Record<string, unknown>;
  /** Risk level */
  risk_level?: string;
  /** Whether this path is enabled */
  enabled: boolean;
  /** Success rate of this path */
  success_rate?: number;
  /** Number of samples */
  sample_count?: number;
  /** Creation timestamp */
  created_at?: string;
  /** Last updated timestamp */
  updated_at?: string;
}

/** Response from listPaths */
export interface ListPathsResponse {
  /** List of paths */
  paths: PathInfo[];
  /** Total count */
  total: number;
}

/** Response from disablePath */
export interface DisablePathResponse {
  /** Whether the path was disabled successfully */
  success: boolean;
  /** Any message from the server */
  message?: string;
}

/** Response from decide */
export interface DecideResponse {
  /** Selected path ID */
  path_id: string;
  /** Selected model ID */
  model_id: string;
  /** Selected tool ID */
  tool_id?: string;
  /** Selected parameters */
  params?: Record<string, unknown>;
  /** Reason for this decision */
  reason: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Whether this is an exploration decision */
  exploration: boolean;
  /** Historical success rate */
  success_rate?: number;
  /** Number of samples this decision is based on */
  sample_count?: number;
}

/** Response from getExplorationConfig and setExplorationConfig */
export interface ExplorationConfigResponse {
  /** Goal this config applies to (null for global) */
  goal?: string | null;
  /** Current exploration rate */
  exploration_rate: number;
  /** Minimum samples before exploiting best path */
  min_samples_before_exploit: number;
  /** Threshold for automatic rollback on performance drop */
  rollback_threshold: number;
  /** Days before path stats are considered stale */
  staleness_days: number;
  /** Whether to explore on high-risk tasks */
  exploration_on_high_risk: boolean;
}

/** Options for getRecommendation request */
export interface GetRecommendationOptions {
  /** Goal for the recommendation */
  goal?: string;
  /** What to optimize for (e.g., 'cost', 'latency', 'quality') */
  optimizeFor?: string;
  /** Constraints to apply */
  constraints?: Record<string, unknown>;
  /** Time window in hours for historical data */
  windowHours?: number;
}

/** Response from getRecommendation */
export interface RecommendationResponse {
  /** Recommended model ID */
  model_id: string;
  /** Recommended tool ID */
  tool_id?: string;
  /** Recommended parameters */
  params?: Record<string, unknown>;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reason for this recommendation */
  reason: string;
  /** Historical success rate */
  success_rate?: number;
  /** Number of samples this recommendation is based on */
  sample_count?: number;
}

// ============================================================================
// KalibrIntelligence Client Class
// ============================================================================

/**
 * Kalibr Intelligence client for routing and policy management.
 *
 * Can be used as a singleton via static methods or instantiated directly.
 *
 * @example
 * ```typescript
 * // Singleton pattern
 * KalibrIntelligence.init({ apiKey: 'key', tenantId: 'tenant' });
 * const policy = await KalibrIntelligence.getInstance().getPolicy('summarize');
 *
 * // Direct instantiation
 * const client = new KalibrIntelligence({ apiKey: 'key', tenantId: 'tenant' });
 * const decision = await client.decide('translate text');
 * ```
 */
export class KalibrIntelligence {
  private static instance: KalibrIntelligence | null = null;

  private readonly apiKey: string;
  private readonly tenantId: string;
  private readonly baseUrl: string;

  /**
   * Create a new KalibrIntelligence client.
   *
   * @param options - Configuration options
   */
  constructor(options: KalibrIntelligenceConfig = {}) {
    // Read from environment if not provided
    this.apiKey = options.apiKey || this.getEnv('KALIBR_API_KEY') || '';
    this.tenantId = options.tenantId || this.getEnv('KALIBR_TENANT_ID') || '';
    this.baseUrl = options.baseUrl || 'https://kalibr-intelligence.fly.dev';

    if (!this.apiKey) {
      throw new Error(
        'KalibrIntelligence: apiKey is required. Provide it in options or set KALIBR_API_KEY environment variable.'
      );
    }
    if (!this.tenantId) {
      throw new Error(
        'KalibrIntelligence: tenantId is required. Provide it in options or set KALIBR_TENANT_ID environment variable.'
      );
    }
  }

  /**
   * Get environment variable value (works in Node.js and some browsers).
   */
  private getEnv(name: string): string | undefined {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name];
    }
    return undefined;
  }

  /**
   * Initialize the singleton KalibrIntelligence client.
   */
  static init(options: KalibrIntelligenceConfig = {}): KalibrIntelligence {
    KalibrIntelligence.instance = new KalibrIntelligence(options);
    return KalibrIntelligence.instance;
  }

  /**
   * Get the singleton instance (throws if not initialized).
   */
  static getInstance(): KalibrIntelligence {
    if (!KalibrIntelligence.instance) {
      throw new Error(
        'KalibrIntelligence not initialized. Call KalibrIntelligence.init() first.'
      );
    }
    return KalibrIntelligence.instance;
  }

  /**
   * Check if the singleton is initialized.
   */
  static isInitialized(): boolean {
    return KalibrIntelligence.instance !== null;
  }

  /**
   * Make an HTTP request to the intelligence API.
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'X-Tenant-ID': this.tenantId,
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `KalibrIntelligence API error ${response.status}: ${errorText}`
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get a policy recommendation for a given goal.
   *
   * @param goal - The goal or task description
   * @param options - Additional options
   * @returns Policy recommendation
   *
   * @example
   * ```typescript
   * const policy = await intelligence.getPolicy('summarize document', {
   *   taskType: 'text_processing',
   *   windowHours: 24,
   *   includeTools: true,
   * });
   * console.log(policy.model_id); // e.g., 'gpt-4o'
   * ```
   */
  async getPolicy(
    goal: string,
    options: GetPolicyOptions = {}
  ): Promise<PolicyResponse> {
    const body: Record<string, unknown> = {
      goal,
    };

    if (options.taskType !== undefined) body['task_type'] = options.taskType;
    if (options.constraints !== undefined) body['constraints'] = options.constraints;
    if (options.windowHours !== undefined) body['window_hours'] = options.windowHours;
    if (options.includeTools !== undefined) body['include_tools'] = options.includeTools;
    if (options.includeParams !== undefined) body['include_params'] = options.includeParams;

    return this.request<PolicyResponse>('POST', '/api/v1/intelligence/policy', body);
  }

  /**
   * Report the outcome of an operation.
   *
   * @param traceId - The trace ID of the operation
   * @param goal - The goal that was attempted
   * @param success - Whether the operation succeeded
   * @param options - Additional options
   * @returns Outcome response
   *
   * @example
   * ```typescript
   * await intelligence.reportOutcome(traceId, 'summarize document', true, {
   *   score: 0.95,
   *   metadata: { wordCount: 150 },
   * });
   * ```
   */
  async reportOutcome(
    traceId: string,
    goal: string,
    success: boolean,
    options: ReportOutcomeOptions = {}
  ): Promise<OutcomeResponse> {
    const body: Record<string, unknown> = {
      trace_id: traceId,
      goal,
      success,
    };

    if (options.score !== undefined) body['score'] = options.score;
    if (options.failureReason !== undefined) body['failure_reason'] = options.failureReason;
    if (options.metadata !== undefined) body['metadata'] = options.metadata;
    if (options.toolId !== undefined) body['tool_id'] = options.toolId;
    if (options.executionParams !== undefined) body['execution_params'] = options.executionParams;

    return this.request<OutcomeResponse>('POST', '/api/v1/intelligence/report-outcome', body);
  }

  /**
   * Register a new execution path for a goal.
   *
   * @param goal - The goal this path is for
   * @param modelId - The model ID for this path
   * @param options - Additional options
   * @returns Path registration response
   *
   * @example
   * ```typescript
   * const path = await intelligence.registerPath('summarize document', 'gpt-4o', {
   *   toolId: 'summarizer_v2',
   *   params: { maxLength: 500 },
   *   riskLevel: 'low',
   * });
   * console.log(path.path_id);
   * ```
   */
  async registerPath(
    goal: string,
    modelId: string,
    options: RegisterPathOptions = {}
  ): Promise<PathResponse> {
    const body: Record<string, unknown> = {
      goal,
      model_id: modelId,
    };

    if (options.toolId !== undefined) body['tool_id'] = options.toolId;
    if (options.params !== undefined) body['params'] = options.params;
    if (options.riskLevel !== undefined) body['risk_level'] = options.riskLevel;

    return this.request<PathResponse>('POST', '/api/v1/routing/paths', body);
  }

  /**
   * List registered paths.
   *
   * @param options - Filter options
   * @returns List of paths
   *
   * @example
   * ```typescript
   * const { paths } = await intelligence.listPaths({
   *   goal: 'summarize document',
   *   includeDisabled: false,
   * });
   * paths.forEach(p => console.log(p.path_id, p.success_rate));
   * ```
   */
  async listPaths(options: ListPathsOptions = {}): Promise<ListPathsResponse> {
    const params = new URLSearchParams();

    if (options.goal !== undefined) params.set('goal', options.goal);
    if (options.includeDisabled !== undefined) {
      params.set('include_disabled', String(options.includeDisabled));
    }

    const queryString = params.toString();
    return this.request<ListPathsResponse>(
      'GET',
      `/api/v1/routing/paths${queryString ? `?${queryString}` : ''}`
    );
  }

  /**
   * Disable a path.
   *
   * @param pathId - The path ID to disable
   * @returns Disable response
   *
   * @example
   * ```typescript
   * await intelligence.disablePath('path-123');
   * ```
   */
  async disablePath(pathId: string): Promise<DisablePathResponse> {
    return this.request<DisablePathResponse>(
      'DELETE',
      `/api/v1/routing/paths/${encodeURIComponent(pathId)}`
    );
  }

  /**
   * Get an intelligent routing decision for a goal.
   *
   * Uses historical performance data and exploration strategies
   * to select the best path for executing a goal.
   *
   * @param goal - The goal to get a decision for
   * @param options - Additional options
   * @returns Routing decision
   *
   * @example
   * ```typescript
   * const decision = await intelligence.decide('translate text', {
   *   taskRiskLevel: 'low',
   * });
   *
   * console.log(decision.model_id);    // Selected model
   * console.log(decision.confidence);  // Confidence score
   * console.log(decision.exploration); // Whether this is exploration
   * ```
   */
  async decide(
    goal: string,
    options: DecideOptions = {}
  ): Promise<DecideResponse> {
    const body: Record<string, unknown> = {
      goal,
    };

    if (options.taskRiskLevel !== undefined) {
      body['task_risk_level'] = options.taskRiskLevel;
    }

    return this.request<DecideResponse>('POST', '/api/v1/routing/decide', body);
  }

  /**
   * Set exploration configuration.
   *
   * @param options - Exploration configuration options
   * @returns Updated exploration config
   *
   * @example
   * ```typescript
   * await intelligence.setExplorationConfig({
   *   goal: 'summarize document',
   *   explorationRate: 0.1,
   *   minSamplesBeforeExploit: 10,
   *   rollbackThreshold: 0.2,
   * });
   * ```
   */
  async setExplorationConfig(
    options: ExplorationConfigOptions
  ): Promise<ExplorationConfigResponse> {
    const body: Record<string, unknown> = {};

    if (options.goal !== undefined) body['goal'] = options.goal;
    if (options.explorationRate !== undefined) body['exploration_rate'] = options.explorationRate;
    if (options.minSamplesBeforeExploit !== undefined) body['min_samples_before_exploit'] = options.minSamplesBeforeExploit;
    if (options.rollbackThreshold !== undefined) body['rollback_threshold'] = options.rollbackThreshold;
    if (options.stalenessDays !== undefined) body['staleness_days'] = options.stalenessDays;
    if (options.explorationOnHighRisk !== undefined) body['exploration_on_high_risk'] = options.explorationOnHighRisk;

    return this.request<ExplorationConfigResponse>(
      'POST',
      '/api/v1/routing/config',
      body
    );
  }

  /**
   * Get exploration configuration.
   *
   * @param goal - Optional goal to get specific config for
   * @returns Exploration config
   *
   * @example
   * ```typescript
   * // Get global config
   * const globalConfig = await intelligence.getExplorationConfig();
   *
   * // Get goal-specific config
   * const goalConfig = await intelligence.getExplorationConfig('summarize');
   * ```
   */
  async getExplorationConfig(
    goal?: string
  ): Promise<ExplorationConfigResponse> {
    const params = new URLSearchParams();

    if (goal !== undefined) {
      params.set('goal', goal);
    }

    const queryString = params.toString();
    return this.request<ExplorationConfigResponse>(
      'GET',
      `/api/v1/routing/config${queryString ? `?${queryString}` : ''}`
    );
  }

  /**
   * Get a model recommendation for a task type.
   *
   * Uses historical performance data and configured policies
   * to recommend the best model for a given task.
   *
   * @param taskType - The type of task to get a recommendation for
   * @param options - Additional options
   * @returns Model recommendation
   *
   * @example
   * ```typescript
   * const recommendation = await intelligence.getRecommendation('summarization', {
   *   goal: 'summarize document',
   *   optimizeFor: 'quality',
   *   windowHours: 24,
   * });
   *
   * console.log(recommendation.model_id);   // Recommended model
   * console.log(recommendation.confidence); // Confidence score
   * ```
   */
  async getRecommendation(
    taskType: string,
    options: GetRecommendationOptions = {}
  ): Promise<RecommendationResponse> {
    const body: Record<string, unknown> = {
      task_type: taskType,
    };

    if (options.goal !== undefined) body['goal'] = options.goal;
    if (options.optimizeFor !== undefined) body['optimize_for'] = options.optimizeFor;
    if (options.constraints !== undefined) body['constraints'] = options.constraints;
    if (options.windowHours !== undefined) body['window_hours'] = options.windowHours;

    return this.request<RecommendationResponse>('POST', '/api/v1/intelligence/recommend', body);
  }
}

// ============================================================================
// Module-Level Convenience Functions
// ============================================================================

/**
 * Get a policy recommendation for a given goal.
 * Uses the singleton KalibrIntelligence instance.
 *
 * @param goal - The goal or task description
 * @param options - Additional options
 * @returns Policy recommendation
 *
 * @example
 * ```typescript
 * import { KalibrIntelligence, getPolicy } from '@kalibr/sdk';
 *
 * KalibrIntelligence.init({ apiKey: 'key', tenantId: 'tenant' });
 * const policy = await getPolicy('summarize document');
 * ```
 */
export async function getPolicy(
  goal: string,
  options?: GetPolicyOptions
): Promise<PolicyResponse> {
  return KalibrIntelligence.getInstance().getPolicy(goal, options);
}

/**
 * Report the outcome of an operation.
 * Uses the singleton KalibrIntelligence instance.
 *
 * @param traceId - The trace ID of the operation
 * @param goal - The goal that was attempted
 * @param success - Whether the operation succeeded
 * @param options - Additional options
 * @returns Outcome response
 *
 * @example
 * ```typescript
 * import { KalibrIntelligence, reportOutcome } from '@kalibr/sdk';
 *
 * KalibrIntelligence.init({ apiKey: 'key', tenantId: 'tenant' });
 * await reportOutcome(traceId, 'summarize document', true, { score: 0.95 });
 * ```
 */
export async function reportOutcome(
  traceId: string,
  goal: string,
  success: boolean,
  options?: ReportOutcomeOptions
): Promise<OutcomeResponse> {
  return KalibrIntelligence.getInstance().reportOutcome(
    traceId,
    goal,
    success,
    options
  );
}

/**
 * Register a new execution path for a goal.
 * Uses the singleton KalibrIntelligence instance.
 *
 * @param goal - The goal this path is for
 * @param modelId - The model ID for this path
 * @param options - Additional options
 * @returns Path registration response
 *
 * @example
 * ```typescript
 * import { KalibrIntelligence, registerPath } from '@kalibr/sdk';
 *
 * KalibrIntelligence.init({ apiKey: 'key', tenantId: 'tenant' });
 * const path = await registerPath('summarize', 'gpt-4o', { toolId: 'tool1' });
 * ```
 */
export async function registerPath(
  goal: string,
  modelId: string,
  options?: RegisterPathOptions
): Promise<PathResponse> {
  return KalibrIntelligence.getInstance().registerPath(goal, modelId, options);
}

/**
 * Get an intelligent routing decision for a goal.
 * Uses the singleton KalibrIntelligence instance.
 *
 * @param goal - The goal to get a decision for
 * @param options - Additional options
 * @returns Routing decision
 *
 * @example
 * ```typescript
 * import { KalibrIntelligence, decide } from '@kalibr/sdk';
 *
 * KalibrIntelligence.init({ apiKey: 'key', tenantId: 'tenant' });
 * const decision = await decide('translate text');
 * console.log(decision.model_id, decision.confidence);
 * ```
 */
export async function decide(
  goal: string,
  options?: DecideOptions
): Promise<DecideResponse> {
  return KalibrIntelligence.getInstance().decide(goal, options);
}

/**
 * Get a model recommendation for a task type.
 * Uses the singleton KalibrIntelligence instance.
 *
 * @param taskType - The type of task to get a recommendation for
 * @param options - Additional options
 * @returns Model recommendation
 *
 * @example
 * ```typescript
 * import { KalibrIntelligence, getRecommendation } from '@kalibr/sdk';
 *
 * KalibrIntelligence.init({ apiKey: 'key', tenantId: 'tenant' });
 * const recommendation = await getRecommendation('summarization', {
 *   goal: 'summarize document',
 *   optimizeFor: 'quality',
 * });
 * console.log(recommendation.model_id, recommendation.confidence);
 * ```
 */
export async function getRecommendation(
  taskType: string,
  options?: GetRecommendationOptions
): Promise<RecommendationResponse> {
  return KalibrIntelligence.getInstance().getRecommendation(taskType, options);
}
