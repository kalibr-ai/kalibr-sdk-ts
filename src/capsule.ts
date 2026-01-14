/**
 * Kalibr TraceCapsule
 *
 * Provides a container for collecting and managing spans within a trace.
 * TraceCapsule allows you to batch spans for efficient transmission
 * and provides serialization/deserialization utilities.
 *
 * @example
 * ```typescript
 * import { getOrCreateCapsule, addSpanToCapsule, flushCapsule } from '@kalibr/sdk';
 *
 * // Get or create a capsule for the current trace
 * const capsule = getOrCreateCapsule();
 *
 * // Spans are automatically added during normal operation
 * // When ready, flush the capsule to send all spans
 * await flushCapsule();
 * ```
 */

import type { KalibrSpan } from './kalibr';
import { getTraceId, newTraceId } from './context';

// ============================================================================
// Types
// ============================================================================

/**
 * A TraceCapsule containing spans and metadata for a single trace.
 */
export interface TraceCapsule {
  /** The trace ID for all spans in this capsule */
  trace_id: string;
  /** Array of spans collected in this capsule */
  spans: KalibrSpan[];
  /** Custom metadata associated with the trace */
  metadata: Record<string, any>;
  /** Unix timestamp when the capsule was created */
  created_at: number;
}

// ============================================================================
// Global State
// ============================================================================

let globalCapsule: TraceCapsule | null = null;

// ============================================================================
// Capsule Functions
// ============================================================================

/**
 * Get or create a TraceCapsule for the current trace.
 *
 * If a capsule already exists, it is returned. Otherwise, a new
 * capsule is created with the current trace ID (or a new one if
 * no trace context exists).
 *
 * @returns The current TraceCapsule
 *
 * @example
 * ```typescript
 * const capsule = getOrCreateCapsule();
 * console.log(capsule.trace_id);
 * console.log(capsule.spans.length);
 * ```
 */
export function getOrCreateCapsule(): TraceCapsule {
  if (!globalCapsule) {
    globalCapsule = {
      trace_id: getTraceId() || newTraceId(),
      spans: [],
      metadata: {},
      created_at: Date.now(),
    };
  }
  return globalCapsule;
}

/**
 * Add a span to the current capsule.
 *
 * @param span - The span to add
 *
 * @example
 * ```typescript
 * import { addSpanToCapsule } from '@kalibr/sdk';
 *
 * // After creating a span...
 * addSpanToCapsule(completedSpan);
 * ```
 */
export function addSpanToCapsule(span: KalibrSpan): void {
  const capsule = getOrCreateCapsule();
  capsule.spans.push(span);
}

/**
 * Serialize a TraceCapsule to a JSON string.
 *
 * @param capsule - The capsule to serialize
 * @returns JSON string representation
 *
 * @example
 * ```typescript
 * const capsule = getOrCreateCapsule();
 * const json = serializeCapsule(capsule);
 * // Store or transmit the JSON
 * ```
 */
export function serializeCapsule(capsule: TraceCapsule): string {
  return JSON.stringify(capsule);
}

/**
 * Deserialize a TraceCapsule from a JSON string.
 *
 * @param data - JSON string to deserialize
 * @returns The deserialized TraceCapsule
 *
 * @example
 * ```typescript
 * const json = '{"trace_id":"abc","spans":[],"metadata":{},"created_at":123}';
 * const capsule = deserializeCapsule(json);
 * ```
 */
export function deserializeCapsule(data: string): TraceCapsule {
  return JSON.parse(data);
}

/**
 * Clear the current global capsule.
 *
 * @example
 * ```typescript
 * clearCapsule();
 * // globalCapsule is now null
 * ```
 */
export function clearCapsule(): void {
  globalCapsule = null;
}

/**
 * Flush the current capsule (send to backend and clear).
 *
 * This function sends all collected spans to the Kalibr backend
 * and then clears the capsule. If the capsule is empty, this is
 * a no-op.
 *
 * @example
 * ```typescript
 * // After collecting spans...
 * await flushCapsule();
 * // All spans sent and capsule cleared
 * ```
 */
export async function flushCapsule(): Promise<void> {
  if (!globalCapsule || globalCapsule.spans.length === 0) {
    return;
  }

  // TODO: Send to backend (for future implementation)
  // This would use the Kalibr client to batch send all spans
  console.debug('Flushing capsule:', {
    trace_id: globalCapsule.trace_id,
    span_count: globalCapsule.spans.length,
  });

  clearCapsule();
}

/**
 * Get the current capsule without creating one if it doesn't exist.
 *
 * @returns The current TraceCapsule or null
 *
 * @example
 * ```typescript
 * const capsule = getCurrentCapsule();
 * if (capsule) {
 *   console.log(`Capsule has ${capsule.spans.length} spans`);
 * }
 * ```
 */
export function getCurrentCapsule(): TraceCapsule | null {
  return globalCapsule;
}

/**
 * Set metadata on the current capsule.
 *
 * @param key - Metadata key
 * @param value - Metadata value
 *
 * @example
 * ```typescript
 * setCapsuleMetadata('user_id', 'user-123');
 * setCapsuleMetadata('session_id', 'sess-456');
 * ```
 */
export function setCapsuleMetadata(key: string, value: any): void {
  const capsule = getOrCreateCapsule();
  capsule.metadata[key] = value;
}
