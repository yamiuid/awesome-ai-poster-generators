"use client";

import ky from "ky";
import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import { creditsForTier } from "@/lib/domain/plans";
import { SUBSCRIPTION_LIFECYCLE_STATES } from "@/lib/server/waffo-subscription";

const statusSchema = z.object({
  signedIn: z.boolean(),
  isPro: z.boolean(),
  subscriptionState: z.enum(SUBSCRIPTION_LIFECYCLE_STATES),
  subscription: z
    .object({
      status: z.string(),
      tier: z.enum(["creator", "studio"]),
    })
    .nullable()
    .optional(),
});
type Status = z.infer<typeof statusSchema>;

const MAX_CHECKS = 20;
const POLL_INTERVAL_MS = 3_000;

export function SubscriptionStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<
    "checking" | "error" | "timeout" | "active"
  >("checking");
  const [retryToken, setRetryToken] = useState(0);
  const credits = creditsForTier(status?.subscription?.tier ?? "creator");
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let checks = 0;
    const check = async (): Promise<void> => {
      try {
        const response = await ky
          .get(`/api/account/status?attempt=${retryToken}`)
          .json<unknown>();
        const result = statusSchema.parse(response);
        if (!active) return;
        setStatus(result);
        if (result.isPro) {
          setPhase("active");
          return;
        }
        setPhase("checking");
      } catch {
        if (!active) return;
        setPhase("error");
      }
      checks += 1;
      if (!active || checks >= MAX_CHECKS) {
        if (active) setPhase("timeout");
        return;
      }
      timer = window.setTimeout(() => void check(), POLL_INTERVAL_MS);
    };
    void check();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [retryToken]);

  function retry(): void {
    setStatus(null);
    setPhase("checking");
    setRetryToken((value) => value + 1);
  }

  return (
    <div
      className="status-pulse"
      role={phase === "error" || phase === "timeout" ? "alert" : "status"}
    >
      {phase === "active"
        ? `Pro is active. Your ${credits.toLocaleString("en-US")}-credit period is ready.`
        : phase === "timeout"
          ? "Payment received, but confirmation is taking longer than expected."
          : phase === "error"
            ? "We could not check the payment status right now."
            : "Waiting for the verified payment event..."}
      {phase === "timeout" || phase === "error" ? (
        <>
          <button className="text-button" type="button" onClick={retry}>
            Try again
          </button>{" "}
          <a href="mailto:support@texttoposter.com">Contact support</a>
        </>
      ) : phase === "active" ? (
        <div className="subscription-status-actions">
          <Link className="solid-button" href="/#studio">
            Create a poster
          </Link>
          <Link className="pricing-link" href="/account/billing">
            View billing
          </Link>
          <Link className="pricing-link" href="/account">
            View history
          </Link>
        </div>
      ) : null}
    </div>
  );
}
