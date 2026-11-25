"use client";

import { useEffect } from "react";
import { getSupabaseCallbackUrl, getSupabasePasswordResetUrl } from "@/lib/supabase/authRedirect";

function hasSupabaseTokenHash(hash: string) {
  return hash.includes("access_token=") || hash.includes("refresh_token=");
}

function getSupabaseHashType(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(normalizedHash).get("type");
}

export default function SupabaseAuthHashBridge() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasSupabaseTokenHash(window.location.hash)) return;

    const pathname = window.location.pathname;
    if (pathname === "/auth/callback" || pathname === "/reset-password") {
      return;
    }

    const nextBaseUrl = getSupabaseHashType(window.location.hash) === "recovery"
      ? getSupabasePasswordResetUrl()
      : getSupabaseCallbackUrl();
    const nextUrl = `${nextBaseUrl}${window.location.search}${window.location.hash}`;
    window.location.replace(nextUrl);
  }, []);

  return null;
}
