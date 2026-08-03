"use client";

import ky, { HTTPError } from "ky";
import { useState } from "react";

type Props = Readonly<{
  plan: "monthly" | "yearly";
  isPro: boolean;
  isSignedIn: boolean;
}>;

export function PricingAction({ plan, isPro, isSignedIn }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(): Promise<void> {
    setLoading(true);
    setError(null);
    window.umami?.track("checkout_started");
    try {
      const result = await ky
        .post("/api/checkout", { json: { plan } })
        .json<Readonly<{ checkoutUrl: string }>>();
      const checkoutWindow = window.open(
        result.checkoutUrl,
        "_blank",
        "noopener,noreferrer",
      );
      if (!checkoutWindow) {
        window.location.assign(result.checkoutUrl);
      }
    } catch (checkoutError) {
      if (checkoutError instanceof HTTPError) {
        const body: unknown = await checkoutError.response
          .json()
          .catch(() => null);
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "Checkout could not be started.";
        setError(message);
      } else {
        setError("Checkout could not be started.");
      }
      setLoading(false);
    }
  }

  if (isPro) {
    return (
      <a className="outline-button" href="/account/billing">
        Manage subscription
      </a>
    );
  }
  if (!isSignedIn) {
    return (
      <a className="solid-button" href="/login?next=/pricing">
        Sign in to start
      </a>
    );
  }

  return (
    <div className="pricing-action">
      <button
        className="solid-button"
        type="button"
        onClick={() => void startCheckout()}
        disabled={loading}
      >
        {loading
          ? "Opening checkout..."
          : plan === "monthly"
            ? "Start monthly"
            : "Choose yearly"}
      </button>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

declare global {
  interface Window {
    umami?: Readonly<{ track: (event: string) => void }>;
  }
}
