"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/server/supabase/browser";

type Props = Readonly<{
  next: string | undefined;
  initialError?: string | undefined;
}>;

type Step = "email" | "code";

const RESEND_COOLDOWN_SECONDS = 60;

export function authRedirectUrl(origin: string, callbackUrl: string): string {
  return `${origin}${callbackUrl}`;
}

function errorMessage(
  result: Readonly<{ error?: { message?: unknown; code?: unknown } | null }>,
  fallback: string,
): string {
  if (!result.error) {
    return "";
  }
  // Supabase SDK 对 500 错误会把 message 设成 JSON.stringify(Response) === "{}"
  // 这类无意义消息直接过滤，回退到友好文案
  const message = result.error.message;
  if (
    typeof message === "string" &&
    message &&
    message !== "{}" &&
    message !== "[object Object]"
  ) {
    return message;
  }
  if (typeof result.error.code === "string" && result.error.code) {
    return result.error.code;
  }
  return fallback;
}

export function LoginForm({ next, initialError }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(initialError ?? null);
  const [loading, setLoading] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // 重发倒计时：countdown > 0 时每秒减 1，到 0 停止（此时允许重发）
  useEffect(() => {
    if (countdown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCountdown((value) => value - 1);
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const callbackUrl = next
    ? `/auth/callback?next=${encodeURIComponent(next)}`
    : "/auth/callback";

  async function google(): Promise<void> {
    // 点击瞬间先出全屏遮罩（await 之前），成功跳转 Google 时保持显示
    setGooglePending(true);
    setLoading(true);
    setMessage(null);
    try {
      const result = await createSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${callbackUrl}`,
        },
      });
      if (result.error) {
        setGooglePending(false);
        setMessage(result.error.message);
        setLoading(false);
      }
    } catch (error) {
      setGooglePending(false);
      setMessage(
        error instanceof Error
          ? "Google sign-in is temporarily unavailable. Check the Supabase configuration."
          : "Google sign-in is temporarily unavailable.",
      );
      setLoading(false);
    }
  }

  async function sendCode(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const result = await createSupabaseBrowserClient().auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: authRedirectUrl(window.location.origin, callbackUrl),
        },
      });
      if (result.error) {
        setMessage(
          errorMessage(
            result,
            "The sign-in code could not be sent. Please try again.",
          ),
        );
      } else {
        setStep("code");
        setCountdown(RESEND_COOLDOWN_SECONDS);
        setMessage(`We emailed a sign-in code to ${email}.`);
      }
    } catch {
      setMessage("The sign-in code could not be sent. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode(): Promise<void> {
    setLoading(true);
    setMessage(null);
    try {
      const result = await createSupabaseBrowserClient().auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: authRedirectUrl(window.location.origin, callbackUrl),
        },
      });
      if (result.error) {
        setMessage(
          errorMessage(
            result,
            "The sign-in code could not be sent. Please try again.",
          ),
        );
      } else {
        setCountdown(RESEND_COOLDOWN_SECONDS);
        setMessage("A new code is on its way.");
      }
    } catch {
      setMessage("The sign-in code could not be sent. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verify(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const token = code.trim();
    if (token.length !== 6) {
      setMessage("Enter the code from the email.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const result = await createSupabaseBrowserClient().auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (result.error) {
        setMessage(
          errorMessage(
            result,
            "That code is not valid. Check the email or request a new code.",
          ),
        );
        return;
      }
      router.push(next ?? "/account");
      router.refresh();
    } catch {
      setMessage("We could not verify that code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "code") {
    return (
      <div className="login-form">
        <p className="code-hint">
          Enter the code sent to <strong>{email}</strong>.{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setStep("email");
              setMessage(null);
              setCode("");
              setCountdown(0);
            }}
          >
            Change email
          </button>
        </p>
        <form onSubmit={(event) => void verify(event)}>
          <label className="field-label" htmlFor="login-code">
            Sign-in code
          </label>
          <div className="code-field">
            <input
              id="login-code"
              className="text-field"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              required
            />
            <button
              type="button"
              className="code-resend"
              onClick={() => void resendCode()}
              disabled={countdown > 0}
            >
              {countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
            </button>
          </div>
          <button
            className="solid-button wide"
            type="submit"
            disabled={loading}
          >
            {loading ? "Verifying..." : "Verify and sign in"}
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

  return (
    <div className="login-form">
      <button
        className="outline-button wide"
        type="button"
        onClick={() => void google()}
        disabled={loading}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Continue with Google
      </button>
      <div className="auth-divider">
        <span>or use email</span>
      </div>
      <form onSubmit={(event) => void sendCode(event)}>
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
          {loading ? "Sending..." : "Send me a sign-in code"}
        </button>
      </form>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {googlePending && (
        <div className="auth-overlay" role="status" aria-live="polite">
          <span className="auth-overlay-spinner spin" aria-hidden="true" />
          <p className="auth-overlay-label">Signing in with Google...</p>
        </div>
      )}
    </div>
  );
}
