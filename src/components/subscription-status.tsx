"use client";

import ky from "ky";
import { useEffect, useState } from "react";
import { creditsForTier, type SubscriptionTier } from "@/lib/domain/plans";

type Status = Readonly<{
  signedIn: boolean;
  isPro: boolean;
  subscription?: Readonly<{
    status: string;
    tier: SubscriptionTier;
  }> | null;
}>;

export function SubscriptionStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const credits = creditsForTier(status?.subscription?.tier ?? "creator");
  useEffect(() => {
    let active = true;
    const check = async (): Promise<void> => {
      const result = await ky.get("/api/account/status").json<Status>();
      if (!active) return;
      setStatus(result);
      if (!result.isPro) window.setTimeout(() => void check(), 3_000);
    };
    void check();
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="status-pulse" role="status">
      {status?.isPro
        ? `Pro is active. Your ${credits}-credit period is ready.`
        : "Waiting for the verified payment event..."}
    </div>
  );
}
