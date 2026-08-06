/**
 * Decide whether an authoritative snapshot must replace local prediction.
 *
 * Held-key heartbeats maintain server input state but are not new locally
 * predicted input edges. Replaying every heartbeat acknowledgement as a visual
 * correction creates a periodic movement hitch without adding authority.
 */
export function shouldReconcilePrediction(
  requiresBaseline: boolean,
  requiresLifecycleReconcile: boolean,
  acknowledgedInputSequence: number,
  latestImmediatelyPredictedInputSequence: number,
  lastReconciledImmediatelyPredictedInputSequence: number,
): boolean {
  if (requiresBaseline || requiresLifecycleReconcile) {
    return true;
  }
  return (
    latestImmediatelyPredictedInputSequence >
      lastReconciledImmediatelyPredictedInputSequence &&
    acknowledgedInputSequence >= latestImmediatelyPredictedInputSequence
  );
}
