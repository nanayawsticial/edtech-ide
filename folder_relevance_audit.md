# Sticial Studio: Directory & File Relevance Audit

Below is a comprehensive audit of the files and folders found across the `D:\SticialStudio\edtech-ide` workspace, categorized by their relevance to the actual Sticial Studio Web App.

---

## 🟢 1. Core Application Folders (Highly Relevant)
These are the files that actually make up your live, compiled application.

- **`apps/web/`** 
  - **Relevance:** **CRITICAL**. This is the core Next.js application, including the UI, Blockly integration, circuit simulator, and layout engine.
  - *Key subfolders:* `src/app` (routes), `src/components` (React UI), `src/contexts` & `src/stores` (State management), `src/lib` (core utilities and engines).
- **`apps/api/`**
  - **Relevance:** **CRITICAL**. This contains the Express.js / Node.js backend handling compiler requests, authentication, and external interactions.
- **`packages/database/`**
  - **Relevance:** **HIGH**. A shared Prisma database package bridging connections for both the web frontend and API instances.
- **`packages/compiler/`**
  - **Relevance:** **HIGH**. Dedicated compiler logic modularized into a workspace package.
- **`public/`**
  - **Relevance:** **HIGH**. Static assets (images, icons, fonts) served directly to users.

---

## 🟡 2. Tooling & Configuration (Relevant for Development)
These govern how the codebase builds, runs, styles itself, and enforces quality.

- **`package.json`, `package-lock.json`**: Controls all NPM dependencies.
- **`next.config.js`, `next.config.cjs`**: Next.js build and routing settings.
- **`tailwind.config.js`, `postcss.config.js`**: Defines the CSS framework guidelines.
- **`tsconfig.json`, `tsconfig.tsbuildinfo`**: TypeScript configurations determining how your source code is verified.
- **`middleware.ts`**: Edge routing/security for the Next.js app.
- **`.env.example`**: Secrets templating.

---

## 🟠 3. External Source / Reference Code (Low Relevance to Build)
These folders look like external forks, uncompiled references, or ZIP backups of libraries. They do not run in your final app but may be useful for looking up how a piece of hardware is supposed to work.

- **`wokwi-elements-main/`**: Likely an external repository of Wokwi components.
- **`velxio-master/`**: Another external repository (Note: The app *does* use a `velxio-adapter` inside `apps/web/src/vendor`, so this root folder is likely just reference material).
- **`hal-master/`**: Hardware Abstraction Layer examples.
- **`Adafruit-Motor-Shield-library-master.zip`**: Standard Arduino library file (not used by the web app directly).
- **`Board_Images/`**: Contains raw image assets that should likely be moved into `apps/web/public` if they are displayed in the app.

---

## 🔴 4. Irrelevant, Junk, and Ephemeral Files (Not Relevant)
These files play **no role** in the web app. They consist of system backups, IDE temp logs, git state dumps, and old scratch files. You can safely ignore (or even delete) these.

- **Git Status & Dumps:** 
  - `git_head_files.txt`, `git_head_files_utf8.txt`
  - `git_ls.txt`, `git_status_after_restore.txt`
  - `git_status_full.txt`, `git_status_src.txt`, `git_status_utf8.txt`
  - `recent_commits.txt`
- **Blob File Backups (Likely from LLM crashes or git recoveries):** 
  - `tmp_blobs/`
  - `tmp_blob_4c38f58a...txt`, `tmp_blob_5d80b801...txt`, etc...
  - `tmp/`
- **IDE & AI Assistant Logs:** 
  - `old_brain_files.txt`, `modified_files.csv`
  - `.codex/`, `.opencode/`, `.opencode-router/`
  - `opencode.jsonc`, `patch.py`
- **Server Logs:** 
  - `.codex-web-dev.log`, `.codex-ui1-dev.out.log`
  - `api-dev.out.log`, `err.html`
  - `status.txt`
- **Scratch / Legacy Files:**
  - `generate_svgs.js` / `generate_svgs.mjs` (Script intended for generating components manually, rather than part of the app build)
  - `implementation_plan_rebased.md`, `infrastructure_report.md` (Docs that are useful for humans but don't run as code).

---

### Conclusion
Your active workspace is well-structured inside of **`apps/`** and **`packages/`** as a standard monorepo.

However, the base directory (`D:\SticialStudio\edtech-ide`) is heavily cluttered with `.txt` diagnostic dumps, `.log` files, and `tmp_blob` files leftover from version control hiccups or AI generation. None of those files in the root (except configuration files like `package.json` and `tailwind.config`) impact the actual functioning of the web app.
