/**
 * Kalibr TraceCapsule - Portable JSON payload for cross-MCP trace propagation.
 *
 * A capsule carries observability context across agent hops, maintaining a rolling
 * window of recent operations and aggregate metrics.
 *
 * @example
 * ```typescript
 * import { TraceCapsule, getOrCreateCapsule } from '@kalibr/sdk';
 *
 * // Create new capsule
 * const capsule = new TraceCapsule();
 *
 * // Append hop
 * capsule.appendHop({
 *   provider: 'openai',
 *   operation: 'summarize',
 *   model: 'gpt-4o',
 *   duration_ms: 1200,
 *   status: 'success',
 *   cost_usd: 0.005
 * });
 *
 * // Serialize for HTTP header
 * const headerValue = capsule.toJson();
 *
 * // Deserialize from header
 * const receivedCapsule = TraceCapsule.fromJson(headerValue);
 * ```
 */

import { getTraceId, newTraceId } from './context';

// ============================================================================
// Types
// ============================================================================

/**
 * A hop in the capsule representing a single operation.
 */
export interface CapsuleHop {
  /** LLM provider */
  provider?: string;
  /** Operation type */
  operation?: string;
  /** Model used */
  model?: string;
  /** Duration in milliseconds */
  duration_ms?: number;
  /** Execution status */
  status?: 'success' | 'error' | 'timeout';
  /** Cost in USD */
  cost_usd?: number;
  /** Input tokens */
  input_tokens?: number;
  /** Output tokens */
  output_tokens?: number;
  /** Error type if status is error */
  error_type?: string;
  /** Agent name for multi-agent systems */
  agent_name?: string;
  /** Hop index (auto-assigned) */
  hop_index?: number;
  /** Additional custom fields */
  [key: string]: unknown;
}

/**
 * Serialized TraceCapsule data structure.
 */
export interface TraceCapsuleData {
  /** Unique trace identifier */
  trace_id: string;
  /** ISO 8601 timestamp of last update */
  timestamp: string;
  /** Cumulative cost across all hops */
  aggregate_cost_usd: number;
  /** Cumulative latency across all hops */
  aggregate_latency_ms: number;
  /** Rolling window of last N hops */
  last_n_hops: CapsuleHop[];
  /** Tenant identifier */
  tenant_id?: string;
  /** Workflow identifier */
  workflow_id?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Context token for this runtime session */
  context_token?: string;
  /** Parent runtime's context token */
  parent_context_token?: string;
}

// ============================================================================
// TraceCapsule Class
// ============================================================================

/**
 * Portable JSON payload containing rolling trace history.
 *
 * TraceCapsule carries observability context across agent hops, maintaining a
 * rolling window of recent operations and aggregate metrics for cross-MCP
 * trace propagation.
 */
export class TraceCapsule {
  /** Maximum number of hops to keep (keeps payload compact for HTTP headers) */
  static readonly MAX_HOPS = 5;

  /** Unique identifier for the trace chain */
  traceId: string;

  /** ISO 8601 timestamp of last update */
  timestamp: string;

  /** Cumulative cost across all hops */
  aggregateCostUsd: number;

  /** Cumulative latency across all hops */
  aggregateLatencyMs: number;

  /** Rolling window of last N hops (max 5) */
  lastNHops: CapsuleHop[];

  /** Optional tenant identifier */
  tenantId?: string;

  /** Optional workflow identifier */
  workflowId?: string;

  /** Optional custom metadata */
  metadata: Record<string, unknown>;

  /** Context token for this runtime session */
  contextToken: string;

  /** Parent runtime's context token */
  parentContextToken?: string;

  constructor(options: {
    traceId?: string;
    lastNHops?: CapsuleHop[];
    aggregateCostUsd?: number;
    aggregateLatencyMs?: number;
    tenantId?: string;
    workflowId?: string;
    metadata?: Record<string, unknown>;
    contextToken?: string;
    parentContextToken?: string;
  } = {}) {
    this.traceId = options.traceId || newTraceId();
    this.timestamp = new Date().toISOString();
    this.aggregateCostUsd = options.aggregateCostUsd ?? 0.0;
    this.aggregateLatencyMs = options.aggregateLatencyMs ?? 0.0;
    this.lastNHops = options.lastNHops ?? [];
    this.tenantId = options.tenantId;
    this.workflowId = options.workflowId;
    this.metadata = options.metadata ?? {};
    this.contextToken = options.contextToken || newTraceId();
    this.parentContextToken = options.parentContextToken;
  }

  /**
   * Append a new hop to the capsule.
   * Maintains a rolling window of last N hops to keep payload compact.
   * Updates aggregate metrics automatically.
   */
  appendHop(hop: CapsuleHop): void {
    const indexedHop: CapsuleHop = {
      ...hop,
      hop_index: this.lastNHops.length,
    };

    this.lastNHops.push(indexedHop);

    if (this.lastNHops.length > TraceCapsule.MAX_HOPS) {
      this.lastNHops.shift();
    }

    this.aggregateCostUsd += hop.cost_usd ?? 0.0;
    this.aggregateLatencyMs += hop.duration_ms ?? 0.0;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Get the most recent hop.
   */
  getLastHop(): CapsuleHop | undefined {
    return this.lastNHops.length > 0
      ? this.lastNHops[this.lastNHops.length - 1]
      : undefined;
  }

  /**
   * Get total number of hops in capsule.
   */
  getHopCount(): number {
    return this.lastNHops.length;
  }

  /**
   * Serialize capsule to JSON string for HTTP header transmission.
   */
  toJson(): string {
    const data: TraceCapsuleData = {
      trace_id: this.traceId,
      timestamp: this.timestamp,
      aggregate_cost_usd: Math.round(this.aggregateCostUsd * 1_000_000) / 1_000_000,
      aggregate_latency_ms: Math.round(this.aggregateLatencyMs * 100) / 100,
      last_n_hops: this.lastNHops,
    };

    if (this.tenantId) data.tenant_id = this.tenantId;
    if (this.workflowId) data.workflow_id = this.workflowId;
    if (Object.keys(this.metadata).length > 0) data.metadata = this.metadata;
    if (this.contextToken) data.context_token = this.contextToken;
    if (this.parentContextToken) data.parent_context_token = this.parentContextToken;

    return JSON.stringify(data);
  }

  /**
   * Convert capsule to plain object.
   */
  toDict(): TraceCapsuleData {
    const data: TraceCapsuleData = {
      trace_id: this.traceId,
      timestamp: this.timestamp,
      aggregate_cost_usd: this.aggregateCostUsd,
      aggregate_latency_ms: this.aggregateLatencyMs,
      last_n_hops: this.lastNHops,
    };

    if (this.tenantId) data.tenant_id = this.tenantId;
    if (this.workflowId) data.workflow_id = this.workflowId;
    if (Object.keys(this.metadata).length > 0) data.metadata = this.metadata;
    if (this.contextToken) data.context_token = this.contextToken;
    if (this.parentContextToken) data.parent_context_token = this.parentContextToken;

    return data;
  }

  /**
   * Deserialize capsule from JSON string.
   */
  static fromJson(json: string): TraceCapsule {
    try {
      const data: TraceCapsuleData = JSON.parse(json);
      return new TraceCapsule({
        traceId: data.trace_id,
        lastNHops: data.last_n_hops ?? [],
        aggregateCostUsd: data.aggregate_cost_usd ?? 0.0,
        aggregateLatencyMs: data.aggregate_latency_ms ?? 0.0,
        tenantId: data.tenant_id,
        workflowId: data.workflow_id,
        metadata: data.metadata,
        contextToken: data.context_token,
        parentContextToken: data.parent_context_token,
      });
    } catch (e) {
      console.warn(`Failed to parse TraceCapsule: ${e}`);
      return new TraceCapsule();
    }
  }

  /**
   * Create capsule from plain object.
   */
  static fromDict(data: Partial<TraceCapsuleData>): TraceCapsule {
    return new TraceCapsule({
      traceId: data.trace_id,
      lastNHops: data.last_n_hops ?? [],
      aggregateCostUsd: data.aggregate_cost_usd ?? 0.0,
      aggregateLatencyMs: data.aggregate_latency_ms ?? 0.0,
      tenantId: data.tenant_id,
      workflowId: data.workflow_id,
      metadata: data.metadata,
    });
  }

  toString(): string {
    const hopsSummary = this.lastNHops
      .map((hop) => `${hop.provider ?? '?'}/${hop.operation ?? '?'}`)
      .join(', ');
    return (
      `TraceCapsule[${this.traceId}]: ` +
      `${this.lastNHops.length} hops (${hopsSummary}), ` +
      `$${this.aggregateCostUsd.toFixed(4)}, ` +
      `${this.aggregateLatencyMs.toFixed(0)}ms`
    );
  }
}

// ============================================================================
// Global State
// ============================================================================

let globalCapsule: TraceCapsule | null = null;

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get existing capsule from header or create new one.
 */
export function getOrCreateCapsule(headerValue?: string | null): TraceCapsule {
  if (headerValue) {
    return TraceCapsule.fromJson(headerValue);
  }
  if (!globalCapsule) {
    globalCapsule = new TraceCapsule({
      traceId: getTraceId() || newTraceId(),
    });
  }
  return globalCapsule;
}

/**
 * Get the current capsule without creating one if it doesn't exist.
 */
export function getCurrentCapsule(): TraceCapsule | null {
  return globalCapsule;
}

/**
 * Clear the current global capsule.
 */
export function clearCapsule(): void {
  globalCapsule = null;
}

/**
 * Set metadata on the current capsule.
 */
export function setCapsuleMetadata(key: string, value: unknown): void {
  const capsule = getOrCreateCapsule();
  capsule.metadata[key] = value;
}

/**
 * Serialize the current capsule to JSON.
 */
export function serializeCapsule(): string | undefined {
  return globalCapsule?.toJson();
}

/**
 * Deserialize a capsule from JSON and set as current.
 */
export function deserializeCapsule(json: string): TraceCapsule {
  globalCapsule = TraceCapsule.fromJson(json);
  return globalCapsule;
}

/**
 * Flush the current capsule (placeholder for future backend integration).
 */
export async function flushCapsule(): Promise<void> {
  if (!globalCapsule || globalCapsule.lastNHops.length === 0) {
    return;
  }
  clearCapsule();
}

/**
 * Add a hop to the current capsule.
 */
export function addHopToCapsule(hop: CapsuleHop): void {
  const capsule = getOrCreateCapsule();
  capsule.appendHop(hop);
}
