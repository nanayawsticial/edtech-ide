import type { NextConfig } from "next";
import path from "path";

// `npm run build:desktop` sets this: a static export (out/) for the Tauri desktop app in
// apps/desktop. scripts/build-desktop.mjs moves the server-only files (API proxy, auth guard)
// aside for that build; the desktop app answers /api/* itself (src/lib/desktop/desktopApi.ts).
const isDesktopBuild = process.env.STICIAL_DESKTOP_BUILD === "1";

const nextConfig: NextConfig = {
  ...(isDesktopBuild
    ? {
        output: "export" as const,
        // Next 16 writes a static export into distDir. Using out/ (not .next) also means a desktop
        // build never disturbs a running `next dev`. apps/desktop/src-tauri/tauri.conf.json reads it.
        distDir: "out",
        images: { unoptimized: true },
        // Next's own type check would also read `next dev`'s generated route types, which point
        // at the API files this build moves aside. CI runs `tsc --noEmit` before this build instead.
        typescript: { ignoreBuildErrors: true },
      }
    : {}),

  // Prevent Turbopack from bundling native Node.js modules used by the API layer.
  // These modules use native bindings that cannot be compiled by the bundler.
  serverExternalPackages: ['sqlite3', 'bcryptjs', 'jsonwebtoken', '@prisma/client', 'prisma'],

  // Fix Next.js workspace root detection in this monorepo.
  // Without this, Next.js infers the wrong root from the top-level package.json.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
