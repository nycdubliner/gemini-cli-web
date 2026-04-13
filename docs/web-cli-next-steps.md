# Web CLI Next Steps

This fork carries an experimental browser frontend and local web server bridge
for controlling a Gemini CLI instance from another device on the same network.
The current goal is to preserve the experiment in source form first, then refine
it when the workflow is revisited.

## Current Shape

- `packages/web-client` provides the Vite/React frontend.
- `packages/web-server` provides the HTTP and WebSocket bridge to the SDK.
- Root `npm run dev:web` starts the web server and frontend together.
- Local development remains localhost-only by default.
- LAN mode is explicit and requires a shared token:

  ```bash
  WEB_HOST=0.0.0.0 GEMINI_WEB_TOKEN=<shared-token> npm run dev:web
  ```

- Ports are kept in the `3000` range for predictable multi-agent local use:
  - Web client: `3000`
  - Web server: `3001`
  - A2A server: `3002`
  - Devtools: `3003`
  - Sandbox debug: `3999`
- The policy flow should default to the app's normal tool approval behavior and
  continue to respect the `Ctrl+Y` toggle. The UI labels this as `Safe` or
  `Auto-approve`.

## Revisit Before Regular Use

- Replace the single shared token with a better auth model before exposing this
  outside a trusted LAN.
- Decide whether `GEMINI_WEB_ORIGIN` should be required in LAN mode or whether
  the Vite proxy is the only supported browser entrypoint.
- Decide whether policy state should stay process-wide or become per session.
- Replace shell-based metadata collection with Node or existing repo utilities.
- Add reconnect and stale-session behavior in the client.
- Add focused tests for session creation, message streaming, and confirmation
  requests.
- Add a production serving path for the built web client if Vite dev server is
  not the long-term entrypoint.

## Suggested Validation

Run these checks before relying on the branch:

```bash
npm run build -w @google/gemini-cli-sdk
npm run build -w @google/gemini-cli-web-server
npm run build -w @google/gemini-cli-web-client
npm run dev:web
```
