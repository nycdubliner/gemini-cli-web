# Upstream Sync Workflow

This fork is intended to stay close to `google-gemini/gemini-cli` while adding a
browser-first remote CLI experience.

## Remotes

- `origin`: `nycdubliner/gemini-cli-web`
- `upstream`: `google-gemini/gemini-cli`
- `upstream` push URL should remain disabled.

Verify before syncing:

```bash
git remote -v
```

## Sync Process

Create a dedicated sync branch instead of merging upstream directly into
`main`:

```bash
git fetch origin
git fetch upstream
git switch main
git pull --ff-only origin main
git switch -c chore/sync-upstream-YYYY-MM-DD
git merge upstream/main
```

Resolve conflicts, then run the focused web checks:

```bash
npm test -w @google/gemini-cli-web-server
npm run build -w @google/gemini-cli-web-client
npm run build -w @google/gemini-cli-web-server
npm run build -w @google/gemini-cli-sdk
```

For larger upstream updates, also run the repository-level checks that upstream
expects before opening the sync PR.

## Conflict Hotspots

- `packages/sdk/src/session.ts`: keep this as the narrow adapter boundary for
  web access to Gemini CLI session state.
- `packages/web-server`: web-specific API and websocket behavior should stay
  isolated here.
- `packages/web-client`: browser UI should stay isolated here.
- Shared `packages/core` or `packages/cli` changes are higher-risk and should be
  avoided unless the terminal CLI benefits too.

## Design Rule

When the browser needs terminal behavior, prefer adapting the existing upstream
capability through a stable boundary instead of copying the behavior. The
highest-priority example is slash commands: the web CLI should converge on the
terminal command registry and command result model, not maintain a separate
parallel command implementation forever.

## PR Checklist

- Sync PR explains the upstream commit range.
- Web-specific conflicts are resolved without deleting local web packages.
- Generated files and local browser artifacts are excluded.
- Web checks pass.
- Any intentional divergence is captured in `docs/web-cli-parity.md`.
