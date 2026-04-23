/**
 * kalibr/feedback — User behavioral signal → Kalibr learning loop
 *
 * Wire user rejection/acceptance signals back to Kalibr so the routing
 * engine learns from real user behavior, not just structural evals.
 *
 * Usage:
 * ```typescript
 * import { trackRun, userRejected, userAccepted } from '@kalibr/sdk';
 *
 * // After every pipeline run:
 * const response = await router.completion([...]);
 * trackRun({ traceId: router.lastTraceId, goal: 'summarization' });
 *
 * // When user rejects:
 * await userRejected('output was too short');
 *
 * // When user accepts:
 * await userAccepted(0.9);
 * ```
 *
 * Signals flow into updateOutcome() → ClickHouse → global priors.
 * Rejections set failureCategory: 'user_unsatisfied'.
 * No user prompt content is ever stored or sent.
 */

import { updateOutcome } from './intelligence.js';

/**
 * KalibrFeedback — per-instance feedback tracker.
 * Use the module-level functions (trackRun, userRejected, userAccepted)
 * for simple cases. Use this class when you need multiple independent trackers.
 */
export class KalibrFeedback {
  private _traceId: string | null = null;
  private _goal: string | null = null;

  /** Store the trace context from the last pipeline run. */
  setLastRun(traceId: string, goal: string): void {
    this._traceId = traceId;
    this._goal = goal;
  }

  /** Signal that the user rejected the last output. */
  async reject(reason = ''): Promise<boolean> {
    if (!this._traceId || !this._goal) return false;
    try {
      await updateOutcome(this._traceId, this._goal, {
        success: false,
        failureCategory: 'user_unsatisfied',
        failureReason: reason || 'user rejected output',
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Signal that the user accepted the last output. */
  async accept(score = 0.85): Promise<boolean> {
    if (!this._traceId || !this._goal) return false;
    try {
      await updateOutcome(this._traceId, this._goal, {
        success: true,
        score,
      });
      return true;
    } catch {
      return false;
    }
  }

  get hasContext(): boolean {
    return !!(this._traceId && this._goal);
  }
}

// ── Module-level singleton ─────────────────────────────────────────────────

const _globalFeedback = new KalibrFeedback();

/**
 * Track the last pipeline run context.
 * Call this after every router.completion() or pipeline execution.
 *
 * @param result - Object with traceId and goal fields
 */
export function trackRun(result: { traceId?: string; trace_id?: string; goal?: string; goal_id?: string }): void {
  const traceId = result.traceId ?? result.trace_id;
  const goal = result.goal ?? result.goal_id;
  if (traceId && goal) {
    _globalFeedback.setLastRun(traceId, goal);
  }
}

/**
 * Signal that the user rejected the last output.
 * Sends failure_category='user_unsatisfied' to Kalibr.
 * Updates global priors immediately.
 *
 * @param reason - Optional description of why the user rejected
 */
export async function userRejected(reason = ''): Promise<boolean> {
  return _globalFeedback.reject(reason);
}

/**
 * Signal that the user accepted the last output.
 * Score 0.85 = good (used without complaint). Score 1.0 = explicitly great.
 *
 * @param score - Quality score 0.0-1.0 (default 0.85)
 */
export async function userAccepted(score = 0.85): Promise<boolean> {
  return _globalFeedback.accept(score);
}

/** Get the global feedback instance for direct access. */
export function getFeedback(): KalibrFeedback {
  return _globalFeedback;
}
