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

// ── Gate 3: Behavioral feedback (v1.12.1 parity) ─────────────────────────────

// ── Session state (in-memory, single-threaded JS — no file locking needed) ──

interface SessionDelta {
  jaccard: number;
  lenRatio: number;
  frust: number;
  affirm: number;
}

interface SessionState {
  turns: string[];
  deltas: SessionDelta[];
  momentum: string;
}

const _sessions = new Map<string, SessionState>();

// ── Heuristic satisfaction classifier ───────────────────────────────────────

const _REJECTION_SIGNALS = [
  'wrong', 'incorrect', 'bad', 'not what', 'redo', 'again', 'fix',
  "that's not", 'doesnt', "doesn't",
];

const _ACCEPTANCE_SIGNALS = [
  'perfect', 'great', 'exactly', 'thanks', 'awesome', 'love it',
  'works', 'yes',
];

/**
 * Classify user satisfaction using heuristic keyword matching.
 * Does NOT call an LLM. Async for API consistency only.
 */
export async function classifySatisfaction(
  userMessage: string,
  priorOutput: string,
): Promise<'positive' | 'negative' | 'neutral'> {
  if (!userMessage || !priorOutput) return 'neutral';
  return _heuristicClassify(userMessage);
}

function _heuristicClassify(userMessage: string): 'positive' | 'negative' | 'neutral' {
  const lower = userMessage.toLowerCase();
  const rejectionHits = _REJECTION_SIGNALS.filter(w => lower.includes(w)).length;
  const acceptanceHits = _ACCEPTANCE_SIGNALS.filter(w => lower.includes(w)).length;

  if (rejectionHits > acceptanceHits && rejectionHits >= 1) return 'negative';
  if (acceptanceHits > rejectionHits && acceptanceHits >= 1) return 'positive';
  return 'neutral';
}

// ── Jaccard similarity ──────────────────────────────────────────────────────

function _jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0.5;
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0.5;
}

// ── Frustration / affirmation word sets (for delta computation) ─────────────

const _FRUST_WORDS = new Set([
  'again', 'wrong', 'bad', 'no', 'fix', 'redo', 'useless',
  'terrible', 'horrible', 'stop', 'different', 'change', 'not what',
]);
const _AFFIRM_WORDS = new Set([
  'thanks', 'perfect', 'great', 'yes', 'good', 'exactly',
  'awesome', 'love', 'correct', 'nice',
]);

function _computeDelta(prevMsg: string, currMsg: string): SessionDelta {
  const lower = currMsg.toLowerCase();
  return {
    jaccard: _jaccardSimilarity(prevMsg, currMsg),
    lenRatio: currMsg.length / Math.max(prevMsg.length, 1),
    frust: [..._FRUST_WORDS].filter(w => lower.includes(w)).length,
    affirm: [..._AFFIRM_WORDS].filter(w => lower.includes(w)).length,
  };
}

function _computeMomentum(deltas: SessionDelta[]): string {
  if (deltas.length < 2) return 'flat';
  const recent = deltas.slice(-4);
  const avgJaccard = recent.reduce((s, d) => s + d.jaccard, 0) / recent.length;
  const avgLen = recent.reduce((s, d) => s + d.lenRatio, 0) / recent.length;
  const totalFrust = recent.reduce((s, d) => s + d.frust, 0);
  const totalAffirm = recent.reduce((s, d) => s + d.affirm, 0);

  if (avgJaccard > 0.50 && avgLen < 1.1 && totalFrust === 0) return 'closing';
  if (totalAffirm >= 2 && totalFrust === 0 && avgLen < 1.2) return 'closing';
  if (avgJaccard < 0.35 || totalFrust > 1 || (avgLen > 1.3 && totalFrust >= 1)) return 'widening';
  return 'flat';
}

// ── Signal emission helper ──────────────────────────────────────────────────

function _getConfig(): { apiKey: string; tenantId: string; baseUrl: string } {
  const apiKey = typeof process !== 'undefined' ? process.env['KALIBR_API_KEY'] ?? '' : '';
  const tenantId = typeof process !== 'undefined' ? process.env['KALIBR_TENANT_ID'] ?? '' : '';
  const baseUrl = typeof process !== 'undefined'
    ? process.env['KALIBR_INTELLIGENCE_URL'] ?? 'https://kalibr-intelligence.fly.dev'
    : 'https://kalibr-intelligence.fly.dev';
  return { apiKey, tenantId, baseUrl };
}

async function _emitSignal(payload: Record<string, unknown>): Promise<boolean> {
  const { apiKey, tenantId, baseUrl } = _getConfig();
  if (!apiKey || !tenantId) return false;
  try {
    const res = await fetch(`${baseUrl}/api/v1/intelligence/signals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Tenant-ID': tenantId,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
    return res.status === 200 || res.status === 201;
  } catch {
    return false;
  }
}

// ── reportUserTurn ──────────────────────────────────────────────────────────

/**
 * Track a user turn within a session. Computes Jaccard delta between
 * consecutive messages to determine conversation momentum
 * (closing / widening / flat) and fires a signal to the backend.
 *
 * Session state is kept in-memory (last 8 turns).
 */
export function reportUserTurn(sessionId: string, userMessage: string): void {
  let state = _sessions.get(sessionId);
  if (!state) {
    state = { turns: [], deltas: [], momentum: 'flat' };
    _sessions.set(sessionId, state);
  }

  const prevMsg = state.turns.length > 0 ? state.turns[state.turns.length - 1] : '';
  state.turns.push(userMessage);
  if (state.turns.length > 8) state.turns = state.turns.slice(-8);

  if (prevMsg) {
    const delta = _computeDelta(prevMsg, userMessage);
    state.deltas.push(delta);
    if (state.deltas.length > 8) state.deltas = state.deltas.slice(-8);
    state.momentum = _computeMomentum(state.deltas);
  }

  // Fire-and-forget signal
  const classification = _heuristicClassify(userMessage);
  if (classification === 'neutral') return;

  const signalType = classification === 'negative' ? 'user_rejected' : 'user_accepted';
  const strength = classification === 'negative' ? 0.0 : 1.0;

  _emitSignal({
    signal_type: signalType,
    signal_source: 'user_implicit',
    strength,
    confidence: 0.7,
    session_id: sessionId,
    session_momentum: state.momentum,
  }).catch(() => {});
}

// ── reportSessionEnd ────────────────────────────────────────────────────────

/**
 * Fire a weak behavioral signal when a session ends.
 * Uses momentum from reportUserTurn delta history.
 *
 * - closing → strength=0.65, confidence=0.4 (positive inference)
 * - widening → strength=0.25, confidence=0.4 (negative inference)
 * - flat/no data → no signal emitted
 */
export function reportSessionEnd(sessionId: string): void {
  const state = _sessions.get(sessionId);
  if (!state || state.deltas.length < 2) return;

  const mom = _computeMomentum(state.deltas);
  if (mom === 'flat') return;

  const strength = mom === 'closing' ? 0.65 : 0.25;
  const signalType = mom === 'closing' ? 'user_accepted' : 'user_rejected';

  _emitSignal({
    signal_type: signalType,
    signal_source: 'session_end_inferred',
    strength,
    confidence: 0.4,
    session_id: sessionId,
    session_momentum: mom,
  }).catch(() => {});
}

// ── reportPipeline ──────────────────────────────────────────────────────────

/**
 * Send a pipeline step signal to the backend.
 */
export function reportPipeline(traceId: string, goal: string, stepName?: string): void {
  _emitSignal({
    trace_id: traceId,
    signal_type: 'pipeline_anchor',
    signal_source: 'pipeline',
    strength: 0.5,
    confidence: 1.0,
    goal,
    step_name: stepName ?? null,
  }).catch(() => {});
}

// ── reportAction ────────────────────────────────────────────────────────────

const _ACTION_STRENGTH: Record<string, number> = {
  copy: 0.8,
  share: 0.8,
  save: 0.8,
  dismiss: 0.3,
};

/**
 * Fire a signal based on user action type.
 * copy/share/save → positive (0.8 strength)
 * dismiss → negative (0.3 strength)
 */
export function reportAction(
  sessionId: string,
  action: 'copy' | 'share' | 'save' | 'dismiss',
): void {
  const strength = _ACTION_STRENGTH[action] ?? 0.5;
  _emitSignal({
    signal_type: `action_${action}`,
    signal_source: 'downstream',
    strength,
    confidence: 1.0,
    session_id: sessionId,
  }).catch(() => {});
}
