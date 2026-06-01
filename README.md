# pi-cloakpipe

Pi package that uses CloakPipe as a privacy layer for prompt text, provider payloads, tool output, and assistant tool calls.

## Other CloakPipe plugins

If you use a different coding tool, similar CloakPipe integrations are also available for:

- [Claude Code (`claude-cloakpipe`)](https://github.com/borgius/claude-cloakpipe)
- [Hermes (`hermes-cloakpipe`)](https://github.com/borgius/hermes-cloakpipe)
- [OpenCode (`opencode-cloakpipe`)](https://github.com/borgius/opencode-cloakpipe)

## What it does

`pi-cloakpipe` registers a Pi extension that:

- pseudonymizes user input before Pi expands skills or persists the user message;
- pseudonymizes cloned conversation context before each model call;
- pseudonymizes the final provider payload as a defense-in-depth pass;
- pseudonymizes textual tool output before it enters later model context;
- rehydrates finalized assistant text and tool-call arguments;
- rehydrates tool input before local tools execute.

This design is provider-generic because it uses Pi extension events instead of a provider-specific proxy.

## Requirements

- Pi (`@earendil-works/pi-coding-agent`)
- Node.js compatible with Pi
- A running CloakPipe direct API, usually at `http://127.0.0.1:3100/v1`

## Local setup

Copy the example environment file and edit values if needed:

```bash
cp .env.example .env
```

Required setting:

- `CLOAKPIPE_BASE_URL` — CloakPipe direct privacy API, default `http://127.0.0.1:3100/v1`.

Common toggles:

- `PI_CLOAKPIPE_STRICT` — fail closed when CloakPipe is unavailable. Default: `1`.
- `PI_CLOAKPIPE_TRANSFORM_TOOL_DEFINITIONS` — pseudonymize tool descriptions and schemas in provider payloads. Default: `0`.
- `PI_CLOAKPIPE_TRANSFORM_THINKING` — transform thinking blocks. Default: `0`.
- `PI_CLOAKPIPE_AUDIT` — write safe operational audit events. Default: `1`.

The `.env` file is gitignored. Keep real local values there only.

## Install in Pi

Pi supports two standard install styles for extensions and packages:

- package-managed installs via `pi install`, which write to `~/.pi/agent/settings.json` by default;
- auto-discovered extensions under `~/.pi/agent/extensions/`.

`pi-cloakpipe` supports both.

### Standard package install

This is the normal Pi package flow. For a local path, Pi stores the path in settings and loads the package in place. It does not copy the directory.

```bash
pi install /Users/admin/dev/pi-cloakpipe
```

That updates the user settings file at `~/.pi/agent/settings.json`.

For a project-local install, use Pi's local scope flag instead of editing `.pi/settings.json` by hand:

```bash
pi install -l /Users/admin/dev/pi-cloakpipe
```

### Standard extension directory install

Pi also auto-discovers extensions from `~/.pi/agent/extensions/`. In the current Pi runtime, subdirectories in that folder can be package-style directories with `package.json` and `pi.extensions`, so this project works there too.

This repo now includes a helper that links the project into the standard extension directory:

```bash
npm run install:pi
```

That creates a link at `~/.pi/agent/extensions/pi-cloakpipe`.

To remove it later:

```bash
npm run uninstall:pi
```

If you use a custom Pi agent directory, set `PI_CODING_AGENT_DIR` first. The install and uninstall scripts respect that override.

After installing into the standard extension directory, restart Pi or run `/reload`.

### One-run test

To try the extension without installing it, use Pi's temporary extension flag:

```bash
pi -e /Users/admin/dev/pi-cloakpipe/src/index.ts
```

## Commands

Inside Pi, run:

```text
/cloakpipe-status
```

This reports whether CloakPipe is reachable and whether the extension is running in strict mode. It does not print secrets.

## Development

Install dependencies:

```bash
npm install
```

Run type checks:

```bash
npm run check
```

Run tests:

```bash
npm test
```

## Publishing

This repo now includes a release command that:

- checks for a clean git working tree by default;
- runs the build check and test suite;
- bumps the package version;
- creates the release commit and tag via `npm version`;
- publishes the package to npm.

Common release commands:

```bash
npm run release:patch
npm run release:minor
npm run release:major
```

You can also pass any `npm version` target directly, including an explicit version:

```bash
npm run release -- patch
npm run release -- 1.2.3
```

Helpful flags:

- `--dry-run` — print the release steps without changing anything.
- `--allow-dirty` — skip the clean working tree guard.
- `--tag <dist-tag>` — publish to a specific npm dist-tag such as `next`.

After a successful publish, push the generated release commit and tag:

```bash
git push --follow-tags
```

## Smoke test

1. Start CloakPipe.
2. Launch Pi with this extension.
3. Send a prompt that contains a synthetic sensitive value.
4. Confirm the provider payload contains placeholders, not the raw value.
5. Confirm assistant text and tool-call arguments are rehydrated before local use.
6. Point `CLOAKPIPE_BASE_URL` to an unused loopback port and confirm strict mode blocks the prompt.

## Limitations

- Images, binary payloads, URLs, encrypted content, IDs, and signatures are preserved by default.
- Thinking blocks are preserved by default because some providers sign or replay them.
- Pi does not expose an in-stream response transform hook. Placeholders may appear while streaming, then `message_end` rehydrates the finalized assistant message.
- If live token-by-token rehydration is required, add a provider-specific gateway or custom `streamSimple` provider wrapper later.
