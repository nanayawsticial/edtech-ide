"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle, Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import AuthPageShell from "@/components/auth/AuthPageShell";
import { Button } from "@/components/ui/Button";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, safeJson } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

async function waitForSupabaseSession() {
  const supabase = getSupabaseBrowserClient();
  const current = await supabase.auth.getSession();

  if (current.error) {
    throw current.error;
  }

  if (current.data.session?.access_token) {
    return current.data.session;
  }

  return await new Promise<any>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      subscription.unsubscribe();
      resolve(null);
    }, 4000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        window.clearTimeout(timeoutId);
        subscription.unsubscribe();
        resolve(session);
      }
    });
  });
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [passwordWasUpdated, setPasswordWasUpdated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const prepareReset = async () => {
      try {
        const returnedError = searchParams.get("error_description");
        if (returnedError) {
          throw new Error(returnedError);
        }

        const session = await waitForSupabaseSession();
        const email = session?.user?.email?.trim().toLowerCase() ?? "";

        if (!session?.access_token || !email) {
          throw new Error("This password reset link is missing or has expired. Request a new one and try again.");
        }

        if (!cancelled) {
          setRecoveryEmail(email);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error && err.message
              ? err.message
              : "We could not verify your reset link. Request a fresh one and try again.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsPreparing(false);
        }
      }
    };

    void prepareReset();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Those passwords do not match yet. Check both fields and try again.");
      return;
    }

    setIsSaving(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        throw updateError;
      }

      setPasswordWasUpdated(true);

      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoveryEmail, password }),
      });
      const data = await safeJson<any>(response);

      if (!response.ok || !data?.token || !data?.user) {
        await supabase.auth.signOut().catch(() => undefined);
        throw new Error(
          data?.error || "Your password was updated, but we could not reopen your workspace. Sign in with your new password.",
        );
      }

      await login(data.token, data.user, { redirectTo: "/dashboard" });
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "We could not finish your password reset. Request a fresh link and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthPageShell
      title="Choose a new password."
      subtitle="Finish recovery here, then we will reopen your Sticial Studio workspace with the same account and saved projects."
      formTitle="Password reset"
      formSubtitle="Create a new password"
      helperTitle="Secure recovery"
      helperDescription="The recovery link verifies your email first, then the app stores your new password for normal email sign-in going forward."
      helperChips={["Recovery link", "New password", "Workspace access"]}
      footer={
        <p>
          Need a new email?{" "}
          <Link href="/forgot-password" className="font-semibold text-[color:var(--ui-color-primary)] transition-colors hover:underline">
            Request another reset link
          </Link>
        </p>
      }
    >
      <div className="space-y-4">
        {error ? (
          <StatusBanner
            tone={passwordWasUpdated ? "info" : "error"}
            appearance="immersive"
            title={passwordWasUpdated ? "Password updated" : "We could not reset your password"}
          >
            {error}
          </StatusBanner>
        ) : null}

        {isPreparing ? (
          <div className="rounded-[24px] border border-[color:var(--ui-border-soft)] bg-[color:var(--ui-color-surface)] px-5 py-6">
            <div className="flex items-start gap-4">
              <div className="mt-0.5 rounded-full bg-[color:var(--ui-color-primary)]/12 p-3 text-[color:var(--ui-color-primary)]">
                <LoaderCircle size={20} className="animate-spin" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--ui-color-text)]">
                  Verifying your recovery link
                </h3>
                <p className="text-sm leading-7 text-[color:var(--ui-color-text-muted)]">
                  Hold tight while we confirm the reset session and prepare your account for a new password.
                </p>
              </div>
            </div>
          </div>
        ) : recoveryEmail ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-[20px] border border-[color:var(--ui-border-soft)] bg-[color:var(--ui-color-surface)] px-4 py-3 text-sm text-[color:var(--ui-color-text-muted)]">
              Resetting password for <span className="font-semibold text-[color:var(--ui-color-text)]">{recoveryEmail}</span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-color-text-soft)]">
                New password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--ui-color-text-soft)]" size={18} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-[56px] w-full rounded-[20px] border border-[color:var(--ui-border-soft)] bg-[color:var(--ui-color-surface)] pl-12 pr-4 text-sm text-[color:var(--ui-color-text)] outline-none transition-colors placeholder:text-[color:var(--ui-color-text-soft)] focus:border-[color:var(--ui-color-primary)]"
                  placeholder="Enter a new password"
                />
              </div>
              <p className="text-xs leading-6 text-[color:var(--ui-color-text-muted)]">Use at least 8 characters.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-color-text-soft)]">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--ui-color-text-soft)]" size={18} />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="h-[56px] w-full rounded-[20px] border border-[color:var(--ui-border-soft)] bg-[color:var(--ui-color-surface)] pl-12 pr-4 text-sm text-[color:var(--ui-color-text)] outline-none transition-colors placeholder:text-[color:var(--ui-color-text-soft)] focus:border-[color:var(--ui-color-primary)]"
                  placeholder="Repeat your new password"
                />
              </div>
            </div>

            <Button
              type="submit"
              icon={<ArrowRight size={18} />}
              disabled={isSaving}
              fullWidth
              className="min-h-[58px] rounded-[20px] bg-[linear-gradient(135deg,#5cb2ff,#7b61ff)] text-white hover:bg-[linear-gradient(135deg,#56a7f0,#7157f5)]"
            >
              {isSaving ? "Saving new password..." : "Save new password"}
            </Button>
          </form>
        ) : (
          <Link href="/forgot-password" className="block">
            <Button fullWidth icon={<ArrowRight size={18} />}>
              Request a new reset link
            </Button>
          </Link>
        )}
      </div>
    </AuthPageShell>
  );
}
