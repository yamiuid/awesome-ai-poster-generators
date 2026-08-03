"use client";

import ky from "ky";
import { useState } from "react";

export function CancelSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function cancel(): Promise<void> {
    if (!window.confirm("Cancel Pro at the end of the current billing period?"))
      return;
    setLoading(true);
    try {
      await ky.post("/api/subscription/cancel");
      setMessage(
        "Cancellation requested. Your access stays active until the period ends.",
      );
    } catch {
      setMessage(
        "We could not cancel the subscription. Please contact support.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="cancel-action">
      <button
        className="text-button danger"
        type="button"
        onClick={() => void cancel()}
        disabled={loading}
      >
        {loading ? "Requesting..." : "Cancel subscription"}
      </button>
      {message && <p className="form-message">{message}</p>}
    </div>
  );
}
