"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyPromptButton({
  prompt,
  label,
}: Readonly<{ prompt: string; label: string }>) {
  const [status, setStatus] = useState("");

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus("Copied");
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setStatus("Copy unavailable. Select the prompt text above to copy it.");
    }
  }

  return (
    <div className="copy-prompt-action">
      <button
        className="outline-button"
        type="button"
        onClick={copyPrompt}
        aria-label={`Copy ${label} prompt`}
      >
        {status === "Copied" ? (
          <Check size={15} aria-hidden="true" />
        ) : (
          <Copy size={15} aria-hidden="true" />
        )}
        Copy prompt
      </button>
      <span role="status">{status}</span>
    </div>
  );
}
