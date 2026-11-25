"use client";

function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, "");
}

function isLocalhostHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function buildAppUrl(pathname: string) {
  return `${getSupabaseAppOrigin()}${pathname}`;
}

export function getSupabaseAppOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (typeof window === "undefined") {
    return configuredOrigin ? normalizeOrigin(configuredOrigin) : "http://localhost:3000";
  }

  const currentOrigin = normalizeOrigin(window.location.origin);
  if (isLocalhostHost(window.location.hostname)) {
    return currentOrigin;
  }

  return configuredOrigin ? normalizeOrigin(configuredOrigin) : currentOrigin;
}

export function getSupabaseCallbackUrl() {
  return buildAppUrl("/auth/callback");
}

export function getSupabasePasswordResetUrl() {
  return buildAppUrl("/reset-password");
}
