import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Transitional cleanup: keep lint usable while larger typing/refactor work lands.
    rules: {
      "@typescript-eslint/no-duplicate-enum-values": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      // Became errors with eslint-config-next 16.4. The 4 existing hits (SimulationCanvas,
      // WiringDiagramViewer, useArduinoFlash) are in the simulator and board-flashing code,
      // which need hardware testing to change safely, so they stay warnings until fixed.
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local scratch scripts that should not affect app lint quality.
    "extract_uno.js",
    "fix_display.js",
    "update_glass.js",
  ]),
]);

export default eslintConfig;