import { isDesktopApp } from "@/lib/desktop/runtime";

const LOCAL_DEV_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

export function isClientDevAuthBypassEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  // The desktop app has no accounts: it signs in one local user (lib/desktop/desktopApi.ts).
  if (isDesktopApp()) {
    return true;
  }

  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH_BYPASS === "true" &&
    LOCAL_DEV_HOSTNAMES.has(window.location.hostname)
  );
}
