interface SubscriptionAccessFields {
  status: string;
  trialEnd: Date | null;
}

/** Paid, currently-billing access — the only status that lifts every free-tier limit. */
export function hasPaidAccess(subscription?: SubscriptionAccessFields | null): boolean {
  return subscription?.status === "ACTIVE";
}

/** Still inside the 3-day trial window where premium features (calling, voice notes) are unlocked. */
export function isWithinTrialFeatureWindow(subscription?: SubscriptionAccessFields | null): boolean {
  if (!subscription || subscription.status !== "TRIALING" || !subscription.trialEnd) return false;
  return new Date() <= new Date(subscription.trialEnd);
}

/** Gate for premium, time-limited-on-trial features: calling and voice messaging. */
export function canUsePremiumFeature(subscription?: SubscriptionAccessFields | null): boolean {
  return hasPaidAccess(subscription) || isWithinTrialFeatureWindow(subscription);
}

/**
 * Calling requires BOTH participants to have calling access when both sides
 * are providers. Pass `undefined` for `otherProviderSubscription` when the
 * other participant is a guest/client (no subscription concept) — only the
 * host provider is checked in that case. Pass `null` when the other side IS
 * a provider but has no subscription row (correctly counts as no access).
 */
export function canBothPartiesCall(
  providerSubscription: SubscriptionAccessFields | null | undefined,
  otherProviderSubscription?: SubscriptionAccessFields | null,
): boolean {
  if (!canUsePremiumFeature(providerSubscription)) return false;
  if (otherProviderSubscription === undefined) return true;
  return canUsePremiumFeature(otherProviderSubscription);
}
