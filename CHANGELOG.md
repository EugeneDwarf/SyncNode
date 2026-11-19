# Changelog

All notable changes to the **SyncNode** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2026-10-30

### Added
- **Ingestion Template Engine (`applyIngestionTemplate`):** Automatically formats newly downloaded Markdown notes using customizable templates.
  - **Dynamic Placeholders:** Supports `{{title}}`, `{{date}}`, `{{time}}`, `{{mtime_date}}`, `{{mtime_time}}`, `{{source_url}}`, and `{{content}}`.
  - **URL Auto-Extraction:** Automatically detects source URLs from incoming YAML frontmatter (`url`, `source`), Markdown links (`[text](url)`), or plaintext URLs.
  - **Smart Frontmatter Merging:** Preserves existing YAML frontmatter in incoming notes while seamlessly injecting template metadata and Callouts without syntax corruption.
  - **New File Isolation:** Applies strictly to newly ingested `.md` files (`!exists`), preserving updates and ignoring binary attachments or canvas files.
  - **Dedicated Settings Section:** Toggle to enable/disable, full-width template editor, and 1-click "Reset to Default" button supporting English and Russian default templates.
  - **Configuration Token Transfer:** Preserves template preferences across 1-click token export/import (`syncnode://...`).

### Refactored
- **TypeScript & Modular Architecture:** Re-engineered entire codebase from a monolithic JavaScript script into strict, modular TypeScript (`src/`):
  - `src/types.ts`: Strict typings for settings, WebDAV entities, and template structures.
  - `src/constants.ts`: System defaults and localized templates.
  - `src/utils/`: Safe Base64 (`TextEncoder`/`TextDecoder`), date formatters, and path sanitization.
  - `src/i18n/`: Modular dictionaries for English and Russian.
  - `src/engine/`: Template parser and YAML frontmatter merging with fallback error handling.
  - `src/api/`: RFC 4918 namespace-agnostic WebDAV client.
  - `src/ui/`: Dedicated setting tab and onboarding modal components.
- **Obsidian Lifecycle Compliance:** Replaced manual `setInterval` with `this.registerInterval()`, guaranteeing memory leak prevention on plugin unload.
- **Worker Pool Parallel Ingestion (`asyncPool`):** Implemented a high-performance, zero-dependency concurrency queue processing downloads in 5 parallel streams (`CONCURRENCY_LIMIT = 5`). Drastically reduces synchronization time for hundreds of notes and attachments with per-file error isolation.
- **Strict UI Type Safety:** Refactored `ISyncNodePlugin` to inherit from `Plugin`, eliminating all `as any` typecasts in `PluginSettingTab` and ensuring complete compile-time type verification.
- **Modern Build Pipeline:** Integrated `esbuild` and `tsc` for sub-second production builds and developer watch mode (`npm run build`, `npm run dev`).

---

## [1.1.0] - 2026-10-30

### Added
- **Interactive Onboarding Wizard (`OnboardingModal`):** 4-step guided setup wizard that automatically opens on first install or via command/settings.
  - **Step 1: Provider Presets:** Interactive cards for **SFTPGo**, **Nextcloud / ownCloud**, **Synology NAS**, and **Custom WebDAV** with automatic URL template insertion.
  - **Step 2: Smart Credentials & URL Normalization:** Automatically sanitizes input by prepending `https://` and ensuring trailing slashes `/`. Includes an integrated 1-click token import option.
  - **Step 3: Real-Time Connection Diagnostics:** Built-in connection tester with immediate success/failure banners and diagnostic explanations before saving.
  - **Step 4: Target Vault Folder & Dedicated Attachments:** Selection of target folder and optional dedicated attachments folder, with an automatic initial sync trigger on finish.
- **Setup Wizard Command & Settings Button:** Added "Open Setup Wizard" command (`syncnode-open-wizard`) and a prominent "Launch Setup Wizard" button at the top of plugin settings.

---

## [1.0.0] - 2026-10-25

### Added
- **Connection Diagnostics (`testConnection`):** Interactive "Test Connection" button in settings. Performs non-destructive `PROPFIND` (`Depth: 0`) requests with exact diagnostic feedback for HTTP `200/207` (OK), `401` (Unauthorized), `403` (Forbidden), `404` (Not Found), `405` (Method Not Allowed), and network/SSL exceptions.
- **1-Click Configuration Transfer (Token Setup):** Secure Base64 token serialization (`syncnode://...`) to export and import complete configurations between Desktop and Mobile Obsidian vaults without manual typing.
- **Dedicated Attachments Folder:** Setting to redirect all downloaded media files (images, audio, video, documents, archives) into a designated attachments folder (default: `Notes/attachments`), keeping note folders clean while maintaining native Obsidian `![[photo.jpg]]` link resolution.
- **Bilingual Interface (EN / RU):** Multi-language support with an instant in-app selector in the settings tab. Defaults to English with complete Russian localization.
- **Automatic Directory Creation:** Recursive folder creation (`ensureDirectory`) ensuring all target vault and attachment directories exist before binary writes.

### Changed
- **Default Target Folder:** Set default target vault folder to `Notes`.
- **Default Language:** Interface default set to English (`en`).
- **Clean Default Settings:** Cleared pre-filled WebDAV endpoint URLs (`''`) in `DEFAULT_SETTINGS` to guarantee zero exposure of private server addresses.
- **Community Manifest Description:** Standardized `manifest.json` description to English for Obsidian Community Plugins registry compliance.
- **Author Metadata:** Set author to `EugeneDwarf` with repository URL.

### Fixed
- **Cross-Platform UTF-8 Base64 Encoding:** Implemented universal encoding/decoding supporting special characters and Cyrillic text across both Desktop (Node.js `Buffer`) and Mobile (Capacitor/Webview `btoa`/`atob`).
- **Sync Race Conditions:** Added an atomic `isSyncing` guard preventing concurrent duplicate download jobs.
- **Filesystem Timestamp Delta:** Added 2000 ms modification time delta tolerance to eliminate false-positive file updates caused by filesystem timestamp precision differences (FAT/NTFS/ext4).
