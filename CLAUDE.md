# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**n8n-nodes-mcp** is an [n8n](https://n8n.io/) community node package that lets n8n workflows act as a **Model Context Protocol (MCP) client**. It connects to MCP servers, lists/reads resources, lists/executes tools, and lists/runs prompts — and can be used as a tool inside n8n AI Agent nodes.

This is a TypeScript library published to npm as `n8n-nodes-mcp`; n8n loads the compiled output from `dist/`.

## Tech Stack

- **Language**: TypeScript (`~5.8`), compiled with `tsc`
- **Runtime target**: n8n community node API v1
- **Core deps**: `@modelcontextprotocol/sdk`, `@langchain/core`, `zod` (pinned `3.24.0`), `zod-to-json-schema`
- **Build**: `tsc` + `gulp` (icon copy)
- **Test**: Jest + ts-jest
- **Lint/format**: ESLint (`eslint-plugin-n8n-nodes-base`) + Prettier

## Commands

```bash
npm install            # or pnpm install (pnpm-lock.yaml present)
npm run build          # tsc + gulp build:icons → dist/
npm run dev            # tsc --watch
npm test               # Jest
npm run lint           # ESLint over nodes/, credentials/, package.json
npm run lintfix        # ESLint --fix
npm run format         # Prettier over nodes/ and credentials/
```

`prepublishOnly` runs a stricter build + lint with `.eslintrc.prepublish.js`. Only `dist/` is published (see `files` in `package.json`).

## Architecture

```text
nodes/McpClient/
├── McpClient.node.ts        # the node implementation (operations, transport, params)
├── McpClient.node.test.ts   # node unit tests
└── mcpClient.svg            # node icon
credentials/
├── McpClientApi.credentials.ts       # STDIO (command/env) credential
├── McpClientSseApi.credentials.ts    # SSE transport credential (legacy)
├── McpClientHttpApi.credentials.ts   # HTTP Streamable transport credential (recommended)
└── mcpClient.svg
index.js                     # package entry
gulpfile.js                  # icon build task
__tests__/McpClient.test.ts  # package-level tests
```

The three credential types map to the three ways to reach an MCP server:
- **STDIO** (`McpClientApi`) — spawn a local command with env vars.
- **HTTP Streamable** (`McpClientHttpApi`) — **recommended** transport for new work.
- **SSE** (`McpClientSseApi`) — **deprecated**, kept for legacy compatibility.

The node registered with n8n is `dist/nodes/McpClient/McpClient.node.js`, and credentials are the three `dist/credentials/*.credentials.js` files (declared under the `n8n` key in `package.json`).

## Conventions

- Follow `eslint-plugin-n8n-nodes-base` rules — they enforce n8n's node/credential authoring conventions (display names, descriptions, defaults).
- Keep `zod` pinned at `3.24.0` (see `overrides`); version drift breaks the MCP SDK schema handling.
- Add tests alongside the code (`*.test.ts`) and run `npm test` before publishing.
- Build artifacts (`dist/`) are generated — never edit them by hand; edit the `.ts` sources.
- To use this node as a tool inside an AI Agent, n8n requires `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`.
