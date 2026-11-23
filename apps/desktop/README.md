# Sticial Studio desktop app

A Windows app (Tauri) that runs the same IDE as the web version, including Circuit Lab, with no
server and no sign-in. App id: `com.sticialstudio.ide` (installs alongside the older
`com.sticialstudio.app` build).

## Getting the installer

GitHub builds it: **Actions → "Desktop app (Windows)" → Run workflow** (it also runs on pushes that
change `apps/web` or `apps/desktop`). Download the `sticial-studio-windows` artifact from the run;
it contains the `.exe` installer. The workflow is `.github/workflows/desktop-app.yml`.

## How it works

| Web version | Desktop app |
| --- | --- |
| Sign-in through the API service | One local user, signed in automatically |
| Projects in the API database | `projects.json` in the app data folder (with a `.bak` of the previous save) |
| `/api/compile/arduino` on the server | `arduino-cli` bundled with the app |
| Library manager through the server | `arduino-cli lib …` on this computer |
| Web Serial (upload, serial monitor, MicroPython) | Native serial ports behind the same `navigator.serial` API |

- `apps/web` is exported as static pages with `npm run build:desktop` (`apps/web/out`).
- On the desktop, `apiFetch` (`apps/web/src/lib/api.ts`) answers `/api/*` locally
  (`apps/web/src/lib/desktop/desktopApi.ts`), and `navigator.serial` is provided by
  `apps/web/src/lib/desktop/desktopSerial.ts`. Both only activate inside the app
  (`window.__TAURI__`), so the web version is unchanged.
- The native side is `src-tauri/src/main.rs`: project file, `arduino-cli` commands (library
  commands are limited to `lib list/search/install/uninstall`) and serial ports.
- The installer bundles the Arduino AVR core download cache, so the first compile works offline:
  the app installs it into the usual `Arduino15` folder the first time something is compiled.

## Building locally

Needs Rust (stable, MSVC) and the Visual Studio C++ Build Tools, plus Node 22.

```powershell
npm ci
npm run build:desktop --workspace web
# Put arduino-cli.exe and LICENSE.txt in apps/desktop/src-tauri/bin/ (arduino-cli 1.4.1).
cd apps/desktop/src-tauri
npx @tauri-apps/cli@2 icon ../app-icon.png
npx @tauri-apps/cli@2 build
```

Without `src-tauri/arduino-staging/` the app downloads the Arduino AVR core on first compile
instead (needs internet once). The icon source is drawn by `scripts/make-app-icon.mjs`.
