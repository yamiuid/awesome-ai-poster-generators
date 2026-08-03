"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/server/supabase/browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function google(): Promise<void> {
    setLoading(true);
    setMessage(null);
    const result = await createSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (result.error) {
      setMessage(result.error.message);
      setLoading(false);
    }
  }

  async function magicLink(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const result = await createSupabaseBrowserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setMessage(
      result.error
        ? result.error.message
        : "Check your inbox for a secure sign-in link.",
    );
    setLoading(false);
  }

  return (
    <div className="login-form">
      <button
        className="outline-button wide"
        type="button"
        onClick={() => void google()}
        disabled={loading}
      >
        Continue with Google
      </button>
      <div className="auth-divider">
        <span>or use email</span>
      </div>
      <form onSubmit={(event) => void magicLink(event)}>
        <label className="field-label" htmlFor="login-email">
          Email address
        </label>
        <input
          id="login-email"
          className="text-field"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
        <button className="solid-button wide" type="submit" disabled={loading}>
          {loading ? "Sending..." : "Email me a magic link"}
        </button>
      </form>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
