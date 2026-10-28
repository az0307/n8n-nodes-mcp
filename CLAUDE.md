# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`n8n-nodes-mcp` (package `n8n-nodes-mcp`, published as `n8n-nodes-mcp-client`) is an **n8n community node package** written in TypeScript. It exposes a single `MCP Client` node that lets n8n workflows connect to [Model Context Protocol](https://modelcontextprotocol.io/) servers — listing/reading resources, listing/getting prompts, and listing/executing tools — over three transports: STDIO (command-line), SSE (deprecated), and HTTP Streamable (recommended). The node can also be used as a **tool inside n8n AI Agent nodes**, exposing MCP tools as LangChain `DynamicStructuredTool`s.

## Commands

```bash
npm install

npm run build      # tsc compile to dist/ + gulp build:icons (copies .png/.svg into dist/)
npm run dev         # tsc --watch

npm run lint        # eslint nodes credentials package.json
npm run lintfix      # eslint --fix
npm run format       # prettier nodes credentials --write

npm test             # jest (runs everything under __tests__/**/*.test.ts)
npx jest __tests__/McpClient.test.ts             # single file
npx jest -t "environments parsing"               # single test/describe block by name

npm run prepublishOnly   # build + lint with .eslintrc.prepublish.js (stricter: package.json name check is 'error')
```

There is no `tsconfig.json` project reference for `nodes/McpClient/McpClient.node.test.ts` being excluded from Jest — only files under `__tests__/**/*.test.ts` are picked up by `jest.config.js`'s `testMatch`; `nodes/McpClient/McpClient.node.test.ts` exists alongside the node but is not currently discovered by the `npm test` glob.

### Local n8n testing (per README's linked community-node install flow)

To exercise the node inside a real n8n instance: `npm run build`, then either `npm link` this package and `npm link n8n-nodes-mcp` from your n8n install, or copy `dist/` into `~/.n8n/custom` (per the [n8n community nodes install guide](https://docs.n8n.io/integrations/community-nodes/installation/)). To use the node as a tool inside an AI Agent node, n8n must be started with `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`.

## Architecture

### Package shape

- `index.js` is the package entry point n8n loads; it requires the **compiled** `dist/nodes/...` and `dist/credentials/...` files and re-exports them as `nodeTypes`/`credentialTypes`. Source is TypeScript under `nodes/` and `credentials/`; nothing runs from source directly — always `npm run build` before testing the node inside n8n.
- `package.json`'s `n8n` field is the manifest n8n reads to discover nodes/credentials (`n8n.nodes`, `n8n.credentials`), all pointing at `dist/`.
- Icons (`.svg`/`.png`) live next to their `.ts` source in `nodes/` and `credentials/`; `gulpfile.js`'s `build:icons` task copies them into the parallel `dist/` location since `tsc` won't.

### The node: `nodes/McpClient/McpClient.node.ts`

Single file implementing `INodeType`. Key structure:

- **`description`** declares one `Connection Type` parameter (`cmd` / `sse` / `http`) and one `Operation` parameter (`listResources`, `listResourceTemplates`, `readResource`, `listTools`, `executeTool`, `listPrompts`, `getPrompt`). Each of the three transport credential types is registered with `displayOptions.show.connectionType` so only the matching credential UI shows. `usableAsTool: true` is what makes this node selectable as an AI Agent tool.
- **`execute()`** is one large method that, per transport type, builds an MCP SDK `Transport` (`StdioClientTransport`, `SSEClientTransport`, or `StreamableHTTPClientTransport` — the latter two are dynamically `import()`ed to sidestep type issues), opens a `Client` from `@modelcontextprotocol/sdk`, then switches on `operation` to call the corresponding MCP client method (`listResources`, `readResource`, `listTools`, `callTool`, `listPrompts`, `getPrompt`). The transport is always closed in a `finally` block.
- **STDIO env handling**: env vars come from two places merged together — (1) the credential's `environments` field (newline-separated `NAME=VALUE`, parsed manually — commas are *not* a delimiter despite older docs saying so, only newlines split entries and `=` splits name/value), and (2) any process env var prefixed `MCP_` (Docker-friendly), with the prefix stripped before being passed to the child process. `PATH` is always preserved into the child's env.
- **SSE/HTTP header handling**: the `headers` credential field is parsed the same newline-delimited `NAME=VALUE` way.
- **`listTools` → LangChain bridging**: MCP `inputSchema.properties` (JSON-Schema-ish) are translated by hand into a Zod object (`string`/`number`/`integer`/`boolean`/`array`/`object`/fallback `any`, honoring `required`), then wrapped in a `DynamicStructuredTool` whose `func` calls `client.callTool(...)`. The node's own output re-serializes those tools via `zodToJsonSchema` for display — this dual path (LangChain tool object internally, JSON schema in the returned `INodeExecutionData`) is the mechanism that lets the same operation serve both "list tools for a human to inspect" and "hand tools to an AI Agent".
- **`executeTool`** independently re-validates that the requested `toolName` exists (via a fresh `listTools()` call) before calling `client.callTool()`, and accepts `toolParameters` as a JSON string (typed manually in the node UI) or already-parsed object (when invoked as an Agent tool).
- All error paths wrap the underlying error in `NodeOperationError` so failures surface correctly in the n8n UI/execution log.

### Credentials (`credentials/*.credentials.ts`)

Three `ICredentialType` classes, one per transport, each gated to its `connectionType` value on the node:
- `McpClientApi` (`mcpClientApi`) — STDIO: `command`, `args` (space-separated), `environments` (password-masked, newline `NAME=VALUE`).
- `McpClientSseApi` (`mcpClientSseApi`) — SSE (deprecated): `sseUrl`, `sseTimeout`, optional `messagesPostEndpoint`, `headers`.
- `McpClientHttpApi` (`mcpClientHttpApi`) — HTTP Streamable (recommended): `httpStreamUrl`, `httpTimeout`, optional `messagesPostEndpoint`, `headers`.

All three share the same `mcpClient.svg` icon file (duplicated per-directory next to `nodes/McpClient/mcpClient.svg`).

### Linting notes

`.eslintrc.js` applies `eslint-plugin-n8n-nodes-base`'s community/credentials/nodes rule sets per path (`package.json`, `credentials/**/*.ts`, `nodes/**/*.ts` respectively), with a handful of n8n-base rules explicitly turned off (see the `overrides` block — e.g. missing `continueOnFail`, filename convention, unsorted fixed-collection items, input/output type mismatches are intentionally allowed here). `.eslintrc.prepublish.js` extends the base config but flips `n8n-nodes-base/community-package-json-name-still-default` to `'error'` — it's the stricter check run only via `prepublishOnly`, not `npm run lint`.

### CI/CD (`.github/workflows/`)

- `pr-validation.yml`: on every PR to `main`, runs `npm ci && npm run lint && npm run build && npm test` (all must pass — no `--if-present` fallback here).
- `ci-cd.yml`: on push to `main` (or manual `workflow_dispatch`), builds/lints/tests (failures here are non-blocking, prefixed `--if-present || echo ...`), then on `main` auto-bumps the patch version (or a chosen bump on manual dispatch), tags, publishes a GitHub Release, and `npm publish`s to the public npm registry using `NPM_TOKEN`.

## Compatibility

Requires n8n ≥ 1.0.0 and MCP protocol ≥ 1.0.0. Node version pinned via `.nvmrc` to `v20.11.0` for local dev (CI uses Node 18).
