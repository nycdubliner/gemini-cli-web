# Gemini CLI Web

Run the web CLI on a trusted LAN:

```sh
printf '%s\n' "$(openssl rand -hex 24)" > .gemini-web-token
WEB_HOST=0.0.0.0 PORT=3001 GEMINI_WEB_TOKEN_FILE=.gemini-web-token npm run dev:web
```

Open `http://<host>:3000` from another device and enter the token from
`.gemini-web-token`.

Notes:

- Keep ports in the 3000 range. The API defaults to `3001`; the Vite client
  defaults to `3000`.
- `GEMINI_WEB_TOKEN_FILE` is read on every request, so replacing the file rotates
  the token without restarting the server.
- Set `GEMINI_WEB_ORIGIN=http://<host>:3000` if serving the browser client from a
  different origin. When omitted in LAN mode, the server assumes same-origin
  browser access and does not allow arbitrary cross-origin API calls.
- Use `GET /api/metadata` to inspect connected clients and the recent audit tail.
- Use `GET /api/audit-log` to inspect recent prompt and tool approval events.
