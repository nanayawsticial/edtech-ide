"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import AuthPageShell from "@/components/auth/AuthPageShell";
import { Button } from "@/components/ui/Button";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { getSupabasePasswordResetUrl } from "@/lib/supabase/authRedirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");
    setIsLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getSupabasePasswordResetUrl(),
      });

      if (resetError) {
        throw resetError;
      }

      setSuccessMessage(
        "If an account exists for this email, we sent a reset link. Check your inbox and spam folder, then open it on this device.",
      );
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "We could not start password recovery right now. Try again in a moment.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthPageShell
      title="Reset your password."
      subtitle="Use your email address to get a secure recovery link and set a new password for the same Sticial Studio workspace."
      formTitle="Password recovery"
      formSubtitle="Send reset link"
      helperTitle="One account"
      helperDescription="This recovery link lets you set an email password for the same account you already use across projects, lessons, and the simulator."
      helperChips={["Recovery email", "Secure reset", "Workspace access"]}
      footer={
        <p>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-[color:var(--ui-color-primary)] transition-colors hover:underline">
            Return to sign in
          </Link>
        </p>
      }
    >
      <div className="space-y-4">
        {error ? (
          <StatusBanner tone="error" appearance="immersive" title="We could not send the reset link">
            {error}
          </StatusBanner>
        ) : null}

        {successMessage ? (
          <StatusBanner tone="info" appearance="immersive" title="Check your inbox">
            {successMessage}
          </StatusBanner>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-color-text-soft)]">
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--ui-color-text-soft)]" size={18} />
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-[56px] w-full rounded-[20px] border border-[color:var(--ui-border-soft)] bg-[color:var(--ui-color-surface)] pl-12 pr-4 text-sm text-[color:var(--ui-color-text)] outline-none transition-colors placeholder:text-[color:var(--ui-color-text-soft)] focus:border-[color:var(--ui-color-primary)]"
                placeholder="you@example.com"
              />
            </div>
            <p className="text-xs leading-6 text-[color:var(--ui-color-text-muted)]">
              We will send a secure reset link without revealing whether this email already has an account.
            </p>
          </div>

          <Button
            type="submit"
            icon={<ArrowRight size={18} />}
            disabled={isLoading}
            fullWidth
            className="min-h-[58px] rounded-[20px] bg-[linear-gradient(135deg,#5cb2ff,#7b61ff)] text-white hover:bg-[linear-gradient(135deg,#56a7f0,#7157f5)]"
          >
            {isLoading ? "Sending reset link..." : "Send reset link"}
          </Button>
        </form>
      </div>
    </AuthPageShell>
  );
}
