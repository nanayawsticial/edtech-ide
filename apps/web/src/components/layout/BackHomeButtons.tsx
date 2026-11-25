"use client";

import { ArrowLeft, Home } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui/cn";

type NavButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "inverse";
type NavButtonSize = "sm" | "md" | "lg";

interface BackHomeButtonsProps {
  className?: string;
  buttonClassName?: string;
  backClassName?: string;
  homeClassName?: string;
  backFallbackHref?: string;
  homeHref?: string;
  backLabel?: string;
  homeLabel?: string;
  variant?: NavButtonVariant;
  size?: NavButtonSize;
}

function hasSameOriginReferrer() {
  if (typeof window === "undefined" || !document.referrer) {
    return false;
  }

  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

export default function BackHomeButtons({
  className,
  buttonClassName,
  backClassName,
  homeClassName,
  backFallbackHref = "/",
  homeHref = "/",
  backLabel = "Back",
  homeLabel = "Home",
  variant = "secondary",
  size = "sm",
}: BackHomeButtonsProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleBack = () => {
    if (typeof window === "undefined") {
      router.push(backFallbackHref);
      return;
    }

    if (hasSameOriginReferrer() && window.history.length > 1) {
      router.back();
      return;
    }

    if (pathname !== backFallbackHref) {
      router.push(backFallbackHref);
      return;
    }

    router.push(homeHref);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        variant={variant}
        size={size}
        icon={<ArrowLeft size={16} />}
        onClick={handleBack}
        className={cn(buttonClassName, backClassName)}
        title={backLabel}
      >
        {backLabel}
      </Button>
      <Button
        variant={variant}
        size={size}
        icon={<Home size={16} />}
        onClick={() => router.push(homeHref)}
        className={cn(buttonClassName, homeClassName)}
        title={homeLabel}
      >
        {homeLabel}
      </Button>
    </div>
  );
}
