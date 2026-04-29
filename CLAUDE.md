# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An EasyEDA Pro extension that integrates the open-source FreeRouting auto-router. It exports PCB data as DSN, sends it to a local FreeRouting instance via WebSocket, and imports the routed SES result back into EasyEDA.

## Commands

- `npm run compile` — esbuild bundle to `dist/` (production)
- `npm run build` — compile + package into `.eext` file (output: `build/dist/`)
- `npm run fix` — run prettier then eslint with auto-fix
- `npm run prettier:all` — format all files
- `npm run eslint:all` — lint all TypeScript files

There are no tests in this project.

## Architecture

The extension runs inside EasyEDA Pro's browser-based runtime. Global `eda.*` APIs (WebSocket, IFrame, MessageBus, ToastMessage, PCB document/manufacture) are provided by the host — they are not imported, just used directly.

Two routing modes share the same pipeline:

1. **Quick route** (`autoRoute`) — uses `FreeRoutingRouter` directly with `QUICK_ROUTE_OPTIONS` (10 passes, JLCEDA postprocess enabled, 0.1 improvement threshold).
2. **Custom route** (`autoRouteCustom`) — opens an IFrame panel (`iframe/routing.html`) that manages its own WebSocket connection to FreeRouting and communicates with the extension via `eda.sys_MessageBus`.

Core flow (quick route): `getDsnFile()` → base64 encode → WebSocket connect (`ws://127.0.0.1:37865`) → send `RoutingRequest` → receive progress/log/realtime_ses/complete messages → `SESImporter.import()` (base64 → File → `eda.pcb_Document.importAutoRouteSesFile`).

Key modules:
- `src/index.ts` — entry point, exports `autoRoute` and `autoRouteCustom` (registered in `extension.json` headerMenus)
- `src/router/FreeRoutingRouter.ts` — orchestrates DSN export → WS → SES import for quick mode
- `src/websocket/WebSocketManager.ts` — wraps `eda.sys_WebSocket` register/send/close
- `src/importer/SESImporter.ts` — converts base64 SES back to File and calls EDA import API
- `src/types/index.ts` — all interfaces, constants, and defaults (WS_URL, WS_ID, routing options)
- `iframe/routing.html` — self-contained HTML panel with its own direct WebSocket connection for custom mode

## Build System

esbuild bundles `src/index.ts` into `dist/index.js` as a browser IIFE (`globalName: edaEsbuildExportName`). The `build` script then zips non-ignored files (per `.edaignore`) into a `.eext` package via `build/packaged.ts` using JSZip.

## Code Style

- Tabs, printWidth 150, single quotes, trailing commas
- Import order enforced by `@trivago/prettier-plugin-sort-imports`: third-party first, then relative
- ESLint extends `alloy/typescript`; TSDoc syntax warnings enabled
- Strict TypeScript (`strict: true`, all strict sub-flags enabled)
- Target: ESNext, module: CommonJS, platform: browser

## Extension Manifest

`extension.json` defines the extension metadata, UUID, menu registration, and entry point. The `headerMenus.pcb` array registers two menu items under a "Freerouting" group, each mapped to an exported function name via `registerFn`.

## Localization

`locales/en.json` and `locales/zh-Hans.json` provide i18n strings. Extension-store metadata translations are in `locales/extensionJson/`.
