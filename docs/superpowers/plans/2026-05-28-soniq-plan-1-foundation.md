# Soniq Plan 1: Foundation + Serum Vertical Slice

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the end-to-end vertical slice that lets Claude Code read Serum's complete parameter schema and write a parameter value, proving the two-layer architecture works.

**Architecture:** TS MCP server (stdio ↔ WebSocket client) ↔ M4L device (Node for Max WebSocket server + Max patch with `vst~` hosting Serum). Single connection, JSON-RPC 2.0 on `127.0.0.1:9123`, no auth.

**Tech Stack:** TypeScript (Node ≥ 20), `@modelcontextprotocol/sdk`, `ws`, `zod`, `vitest`, Max for Live (Ableton Live 12 Suite), Node for Max (M4L built-in Node.js).

**Out of scope (deferred to Plan 2):** `tracks.*`, `midi.*`, events (`paramChanged` / `schemaReloaded`), preset save/load. Plan 1 covers only `hello`, `vst.schema`, `vst.read`, `vst.write`.

**Spike result (2026-05-28):** Task 0 spike PASSED on Serum 2 (Serum 1 deferred to Task 18 manual checklist by user). Real `vst~` API confirmed:
- Write by 1-based index: `list <num> <value>` (NOT `setparam`)
- Read by index: `get <num>` → outlet **5-from-right** outputs `<num-echo> <value>`
- Names list: `params` → outlet **6-from-right** outputs N symbols
- Count: `get -4` → outputs `-4 <count>`
- All values normalized 0..1
- Protocol uses 0-based indices; convert ±1 at Max boundary
- Serum 2 reports **2623 params**, of which ~2080 are MIDI passthrough (`CC<N> Chan <M>`, `Pitch Bend Chan <M>`, `Aftertouch Chan <M>`) — `vst.schema()` filters these by default.

---

## File Structure

This plan creates these files (no existing files modified beyond what's listed):

| Path | Responsibility | Created by Task |
|------|----------------|-----------------|
| `package.json` | Root workspace manifest | Task 2 |
| `pnpm-workspace.yaml` | Workspace package locations | Task 2 |
| `tsconfig.base.json` | Shared TS config | Task 2 |
| `.editorconfig` | Editor consistency | Task 2 |
| `shared/package.json` | `@soniq/shared` package manifest | Task 3 |
| `shared/tsconfig.json` | TS config for shared | Task 3 |
| `shared/src/protocol.ts` | JSON-RPC method signatures + zod schemas | Task 4 |
| `shared/src/index.ts` | Public exports | Task 4 |
| `shared/tests/protocol.test.ts` | Protocol schema unit tests | Task 4 |
| `tools/generate-json-schema.ts` | Generate JSON Schema from zod for Node for Max | Task 5 |
| `mcp-server/package.json` | `@soniq/mcp-server` manifest | Task 6 |
| `mcp-server/tsconfig.json` | TS config | Task 6 |
| `mcp-server/src/index.ts` | MCP stdio entry point | Task 7 |
| `mcp-server/src/client.ts` | WebSocket client with reconnect/timeout | Task 8 |
| `mcp-server/src/errors.ts` | Custom error classes | Task 8 |
| `mcp-server/src/tools/readVstSchema.ts` | `read_vst_schema` MCP tool | Task 12 |
| `mcp-server/src/tools/readVstParams.ts` | `read_vst_params` MCP tool | Task 13 |
| `mcp-server/src/tools/setVstParam.ts` | `set_vst_param` MCP tool | Task 14 |
| `mcp-server/tests/client.test.ts` | WS client tests (fake server) | Task 8 |
| `mcp-server/tests/tools.test.ts` | Tool integration tests | Tasks 12-14 |
| `mcp-server/tests/fake-server.ts` | Fake JSON-RPC WS server for tests | Task 8 |
| `Soniq.Bridge/code/package.json` | Node for Max script manifest | Task 9 |
| `Soniq.Bridge/code/server.js` | WebSocket server + RPC router | Task 9 |
| `Soniq.Bridge/code/rpc/vst.js` | `vst.*` RPC handlers | Task 10 |
| `Soniq.Bridge/code/protocol.schema.json` | (generated from shared) | Task 5 |
| `Soniq.Bridge/code/tests/server.test.js` | Node for Max server unit tests (with mocked max-api) | Task 9 |
| `Soniq.Bridge/patchers/main.maxpat` | Max patch top level (JSON export, committed) | Task 12 |
| `Soniq.Bridge/patchers/vst-host.maxpat` | `vst~` + param query subpatch (JSON export, committed) | Task 12 |
| `Soniq.Bridge/Soniq.Bridge.amxd` (gitignored during Plan 1) | M4L device file (binary; will be committed after Plan 1 stabilizes) | Task 12 |
| `Soniq.Bridge/Soniq.Bridge.maxproj` | Max Project descriptor (committed; required by Max to load the project) | Task 12 |
| `tests/manual-verify.md` | M4L manual verification checklist | Task 15 |
| `README.md` | How to install + run | Task 16 |

**Decomposition rationale:**
- `shared/` is its own package so both `mcp-server/` and `Soniq.Bridge/code/` can depend on the same protocol types (via JSON Schema for Node for Max which can't import .ts).
- Each MCP tool gets its own file (small, focused, easy to add Plan 2 tools later).
- Tests live next to the code they cover.

---

## Phase 0 — Spike: Verify `vst~` + Serum Works (Manual)

This phase has no code. If it fails, the entire architecture is wrong and we re-plan.

### Task 0: Verify `vst~` hosts Serum 1 and Serum 2

**Files:** none (manual).

- [ ] **Step 1: Open Ableton Live 12 Suite, create empty MIDI track**

- [ ] **Step 2: Drop a Max MIDI Effect onto the track**

Drag any built-in Max MIDI device (e.g. "Pitch") onto the track, then click the edit pencil icon to open Max patcher editor.

- [ ] **Step 3: Add a `vst~` object loading Serum 1**

In the Max editor, create a `vst~` object (type "n", then type `vst~`). Click on it, then in the inspector or via right-click → "open VST window", browse and load **Serum 1**.

Expected: Serum 1 UI opens. You can play notes via the MIDI track and hear sound.

- [ ] **Step 4: Verify parameter query works on Serum 1**

In Max editor, send `params` message to `vst~` (e.g. a `[message]` object with text `params` connected to `vst~`'s left inlet). Print outlet via `[print]`.

Expected: Max console prints a list of parameters with their indices, names, and ranges. Count should be > 128.

- [ ] **Step 5: Verify parameter write works on Serum 1**

Send `setparam 0 0.5` message to `vst~`. Then in Serum UI, observe parameter at index 0 changed.

Expected: visible/audible change.

- [ ] **Step 6: Repeat steps 3-5 with Serum 2**

Same checks, but load **Serum 2** instead.

Expected: same behavior. If Serum 2 fails where Serum 1 works, document the specific failure mode in `tests/manual-verify.md` (created later) and pause to discuss.

- [ ] **Step 7: Verify preset save / load via `vst~` state chunk**

Send `setstate` / `getstate` messages or equivalent (consult Max docs). Specifically try the chunk-based mechanism — `vst~` should respond to `dump` and accept the dumped data back.

Expected: round-trip preserves all parameters.

- [ ] **Step 8: Document spike result**

If all checks pass, record in conversation: "Spike passed for Serum 1 and Serum 2 on macOS Live 12 Suite." Then proceed to Task 1.

If any check fails, **stop**. The plan needs revision before continuing.

---

## Phase 1 — Workspace Setup

### Task 1: Verify environment prerequisites

**Files:** none.

- [ ] **Step 1: Verify Node ≥ 20**

Run: `node --version`
Expected: `v20.x.x` or higher.

If not, install via `nvm install 20` or `brew install node`.

- [ ] **Step 2: Verify pnpm available**

Run: `pnpm --version`
Expected: any version ≥ 8.

If not: `npm install -g pnpm`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx -y tsc --version`
Expected: version printed without error.

### Task 2: Initialize root workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.editorconfig`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "soniq",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "generate-schema": "tsx tools/generate-json-schema.ts"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "shared"
  - "mcp-server"
```

(Note: `Soniq.Bridge/code/` is intentionally NOT a workspace — it's loaded by Node for Max which manages its own deps via `npm install` inside the device folder. Treating it as a workspace would confuse the M4L runtime.)

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create `.editorconfig`**

```
root = true

[*]
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
charset = utf-8
trim_trailing_whitespace = true
```

- [ ] **Step 5: Install root deps**

Run: `pnpm install`
Expected: no errors; `pnpm-lock.yaml` created.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .editorconfig pnpm-lock.yaml
git commit -m "chore: init pnpm workspace with shared tsconfig"
```

---

## Phase 2 — Shared Protocol (TDD)

### Task 3: Create `shared` package skeleton

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`

- [ ] **Step 1: Create `shared/package.json`**

```json
{
  "name": "@soniq/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 2: Create `shared/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Install**

Run: `pnpm install`
Expected: `@soniq/shared` added; no errors.

- [ ] **Step 4: Commit**

```bash
git add shared/package.json shared/tsconfig.json pnpm-lock.yaml
git commit -m "feat(shared): create @soniq/shared package skeleton"
```

### Task 4: Write protocol schema with TDD

**Files:**
- Create: `shared/src/protocol.ts`
- Create: `shared/src/index.ts`
- Test: `shared/tests/protocol.test.ts`

- [ ] **Step 1: Write failing test for `HelloParams` schema**

Create `shared/tests/protocol.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { HelloParams, HelloResult, PROTOCOL_VERSION } from "../src/index.js";

describe("HelloParams", () => {
  it("accepts matching version", () => {
    const result = HelloParams.safeParse({ version: PROTOCOL_VERSION });
    expect(result.success).toBe(true);
  });

  it("rejects missing version", () => {
    const result = HelloParams.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string version", () => {
    const result = HelloParams.safeParse({ version: 1 });
    expect(result.success).toBe(false);
  });
});

describe("HelloResult", () => {
  it("accepts well-formed result", () => {
    const result = HelloResult.safeParse({
      version: "0.1.0",
      capabilities: ["vst"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown capability", () => {
    const result = HelloResult.safeParse({
      version: "0.1.0",
      capabilities: ["lasers"],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @soniq/shared test`
Expected: FAIL — cannot find module `../src/index.js`.

- [ ] **Step 3: Write minimal `shared/src/protocol.ts`**

```typescript
import { z } from "zod";

export const PROTOCOL_VERSION = "0.1.0" as const;

export const Capability = z.enum(["tracks", "vst", "midi"]);
export type Capability = z.infer<typeof Capability>;

export const HelloParams = z.object({
  version: z.string(),
});
export type HelloParams = z.infer<typeof HelloParams>;

export const HelloResult = z.object({
  version: z.string(),
  capabilities: z.array(Capability),
});
export type HelloResult = z.infer<typeof HelloResult>;
```

- [ ] **Step 4: Write `shared/src/index.ts`**

```typescript
export * from "./protocol.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @soniq/shared test`
Expected: 5 tests pass.

- [ ] **Step 6: Add failing tests for VST schema types**

Append to `shared/tests/protocol.test.ts`:

```typescript
import { VstSchemaResult, VstReadParams, VstWriteParams, VstParamSpec, MIDI_PASSTHROUGH_NAME_REGEX } from "../src/index.js";

describe("VstParamSpec", () => {
  it("accepts normalized 0..1 param (VST3 convention)", () => {
    const result = VstParamSpec.safeParse({
      index: 0,
      name: "Main Vol",
      min: 0,
      max: 1,
      default: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional group", () => {
    const result = VstParamSpec.safeParse({
      index: 0,
      name: "Filter Cutoff",
      min: 0,
      max: 1,
      default: 0.5,
      group: "Filter 1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects min > max", () => {
    const result = VstParamSpec.safeParse({
      index: 0,
      name: "Bad",
      min: 1,
      max: 0,
      default: 0.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("MIDI_PASSTHROUGH_NAME_REGEX", () => {
  it("matches MIDI CC params", () => {
    expect("CC0 Chan 1").toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
    expect("CC127 Chan 16").toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
  });
  it("matches Pitch Bend / Aftertouch params", () => {
    expect("Pitch Bend Chan 1").toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
    expect("Aftertouch Chan 16").toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
  });
  it("does NOT match synthesis params", () => {
    expect("Main Vol").not.toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
    expect("A Warp Mode").not.toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
    expect("LFO 3 Rate").not.toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
  });
});

describe("VstSchemaResult", () => {
  it("accepts loaded plugin", () => {
    const result = VstSchemaResult.safeParse({
      pluginName: "Serum 2",
      paramCount: 1,
      params: [{ index: 0, name: "Master Gain", min: 0, max: 1, default: 0.8 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts unloaded plugin (null name, zero count)", () => {
    const result = VstSchemaResult.safeParse({
      pluginName: null,
      paramCount: 0,
      params: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("VstWriteParams", () => {
  it("accepts batch", () => {
    const result = VstWriteParams.safeParse({
      writes: [{ index: 0, value: 0.5 }, { index: 12, value: 0.7 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty batch", () => {
    const result = VstWriteParams.safeParse({ writes: [] });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `pnpm --filter @soniq/shared test`
Expected: new tests FAIL — missing exports.

- [ ] **Step 8: Extend `shared/src/protocol.ts`**

Add to the bottom of the file:

```typescript
// Per spike findings (2026-05-28): vst~ reports normalized 0..1 only, no unit/display.
// min/max are always 0/1 for VST3 normalized params; kept as fields for future-proofing.
export const VstParamSpec = z
  .object({
    index: z.number().int().nonnegative(),  // 0-based; Max patch converts to 1-based
    name: z.string().min(1),
    min: z.number(),
    max: z.number(),
    default: z.number(),
    group: z.string().optional(),
  })
  .refine((p) => p.min <= p.max, { message: "min must be <= max" });
export type VstParamSpec = z.infer<typeof VstParamSpec>;

export const VstSchemaParams = z.object({
  includeMidiPassthrough: z.boolean().default(false),
});
export type VstSchemaParams = z.infer<typeof VstSchemaParams>;

export const VstSchemaResult = z.object({
  pluginName: z.string().nullable(),
  paramCount: z.number().int().nonnegative(),
  params: z.array(VstParamSpec),
});
export type VstSchemaResult = z.infer<typeof VstSchemaResult>;

export const VstReadParams = z.object({
  indices: z.array(z.number().int().nonnegative()).min(1),
});
export type VstReadParams = z.infer<typeof VstReadParams>;

export const VstReadResult = z.array(
  z.object({
    index: z.number().int().nonnegative(),
    value: z.number(),
  })
);
export type VstReadResult = z.infer<typeof VstReadResult>;

export const VstWriteParams = z.object({
  writes: z
    .array(z.object({ index: z.number().int().nonnegative(), value: z.number() }))
    .min(1),
});
export type VstWriteParams = z.infer<typeof VstWriteParams>;

export const VstWriteResult = z.object({
  ok: z.literal(true),
  echo: z.array(
    z.object({ index: z.number().int().nonnegative(), actualValue: z.number() })
  ),
});
export type VstWriteResult = z.infer<typeof VstWriteResult>;

// Names matching this pattern are MIDI input passthrough and are filtered from
// vst.schema() by default (Serum 2 exposes ~2080 of them).
export const MIDI_PASSTHROUGH_NAME_REGEX = /^(CC\d+|Pitch Bend|Aftertouch) Chan \d+$/;
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm --filter @soniq/shared test`
Expected: all tests pass.

- [ ] **Step 10: Add a method-name catalog at the end of `protocol.ts`**

Append:

```typescript
export const RPC_METHODS = {
  hello: "soniq.hello",
  vstSchema: "soniq.vst.schema",
  vstRead: "soniq.vst.read",
  vstWrite: "soniq.vst.write",
} as const;
export type RpcMethod = (typeof RPC_METHODS)[keyof typeof RPC_METHODS];
```

- [ ] **Step 11: Add error code constants**

Append:

```typescript
export const RPC_ERROR_CODES = {
  VersionMismatch: -32001,
  LiveNotReachable: -32002,
  VstNotLoaded: -32003,
  RequestTimeout: -32004,
  SchemaStale: -32005,
} as const;
```

- [ ] **Step 12: Build shared package**

Run: `pnpm --filter @soniq/shared build`
Expected: `shared/dist/index.js` and `shared/dist/index.d.ts` produced.

- [ ] **Step 13: Commit**

```bash
git add shared/src/ shared/tests/ shared/dist/
git commit -m "feat(shared): define protocol schemas for hello and vst.* methods"
```

(`dist/` is committed intentionally — Node for Max consumes the JSON Schema artifact, and committing built TS makes the build deterministic for casual consumers. If this bothers you long-term, swap to a publish-time-only build.)

### Task 5: Generate JSON Schema for Node for Max

**Files:**
- Create: `tools/generate-json-schema.ts`
- Create: `Soniq.Bridge/code/protocol.schema.json` (generated)

- [ ] **Step 1: Install `zod-to-json-schema`**

Run: `pnpm add -D -w zod-to-json-schema`
Expected: package added to root.

- [ ] **Step 2: Write `tools/generate-json-schema.ts`**

```typescript
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  HelloParams,
  HelloResult,
  VstSchemaParams,
  VstSchemaResult,
  VstReadParams,
  VstReadResult,
  VstWriteParams,
  VstWriteResult,
  PROTOCOL_VERSION,
} from "../shared/src/protocol.js";

const out = {
  protocolVersion: PROTOCOL_VERSION,
  schemas: {
    HelloParams: zodToJsonSchema(HelloParams, "HelloParams"),
    HelloResult: zodToJsonSchema(HelloResult, "HelloResult"),
    VstSchemaParams: zodToJsonSchema(VstSchemaParams, "VstSchemaParams"),
    VstSchemaResult: zodToJsonSchema(VstSchemaResult, "VstSchemaResult"),
    VstReadParams: zodToJsonSchema(VstReadParams, "VstReadParams"),
    VstReadResult: zodToJsonSchema(VstReadResult, "VstReadResult"),
    VstWriteParams: zodToJsonSchema(VstWriteParams, "VstWriteParams"),
    VstWriteResult: zodToJsonSchema(VstWriteResult, "VstWriteResult"),
  },
};

const target = "Soniq.Bridge/code/protocol.schema.json";
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out, null, 2));
console.log(`Wrote ${target}`);
```

- [ ] **Step 3: Run the generator**

Run: `pnpm generate-schema`
Expected: prints `Wrote Soniq.Bridge/code/protocol.schema.json`; file exists.

- [ ] **Step 4: Spot-check the JSON**

Run: `head -20 Soniq.Bridge/code/protocol.schema.json`
Expected: well-formed JSON with `protocolVersion: "0.1.0"` and schema entries.

- [ ] **Step 5: Commit**

```bash
git add tools/ Soniq.Bridge/code/protocol.schema.json package.json pnpm-lock.yaml
git commit -m "feat: generate JSON Schema artifact for Node for Max consumer"
```

---

## Phase 3 — MCP Server (TDD with Fake M4L)

### Task 6: Create `mcp-server` package skeleton

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`

- [ ] **Step 1: Create `mcp-server/package.json`**

```json
{
  "name": "@soniq/mcp-server",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "soniq-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@soniq/shared": "workspace:*",
    "ws": "^8.16.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.10",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 2: Create `mcp-server/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Install**

Run: `pnpm install`
Expected: `@soniq/mcp-server` linked, deps installed.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/package.json mcp-server/tsconfig.json pnpm-lock.yaml
git commit -m "feat(mcp-server): create @soniq/mcp-server package skeleton"
```

### Task 7: MCP entry-point skeleton

**Files:**
- Create: `mcp-server/src/index.ts`

- [ ] **Step 1: Write `mcp-server/src/index.ts`**

```typescript
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "soniq", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  throw new Error(`Unknown tool: ${req.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[soniq-mcp] started");
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @soniq/mcp-server build`
Expected: `mcp-server/dist/index.js` produced.

- [ ] **Step 3: Smoke-test stdio handshake**

Run:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node mcp-server/dist/index.js
```

Expected: stderr `[soniq-mcp] started`; stdout one JSON-RPC response with `"tools":[]`.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/src/index.ts
git commit -m "feat(mcp-server): stdio entry with empty tool list"
```

### Task 8: WS client + fake server + tests

**Files:**
- Create: `mcp-server/src/client.ts`
- Create: `mcp-server/src/errors.ts`
- Test: `mcp-server/tests/fake-server.ts`
- Test: `mcp-server/tests/client.test.ts`

- [ ] **Step 1: Write `mcp-server/src/errors.ts`**

```typescript
import { RPC_ERROR_CODES } from "@soniq/shared";

export class SoniqError extends Error {
  constructor(public code: number, message: string, public data?: unknown) {
    super(message);
    this.name = "SoniqError";
  }
}

export const LiveNotReachable = (cause?: string) =>
  new SoniqError(
    RPC_ERROR_CODES.LiveNotReachable,
    "Cannot reach Soniq.Bridge.amxd via WebSocket. Is Ableton Live open and the device loaded on a track?",
    { cause }
  );

export const RequestTimeout = (method: string, ms: number) =>
  new SoniqError(
    RPC_ERROR_CODES.RequestTimeout,
    `RPC call ${method} timed out after ${ms}ms`,
    { method, ms }
  );

export const VersionMismatch = (clientVersion: string, serverVersion: string) =>
  new SoniqError(
    RPC_ERROR_CODES.VersionMismatch,
    `Protocol version mismatch: client=${clientVersion}, server=${serverVersion}`,
    { clientVersion, serverVersion }
  );
```

- [ ] **Step 2: Write `mcp-server/tests/fake-server.ts`**

```typescript
import { WebSocketServer, WebSocket } from "ws";
import { PROTOCOL_VERSION } from "@soniq/shared";

export type Behavior = {
  acceptHello?: boolean;
  helloVersion?: string;
  capabilities?: string[];
  customHandler?: (msg: any, send: (out: any) => void) => void;
  closeOnConnect?: boolean;
};

export class FakeBridge {
  private wss: WebSocketServer;
  public port: number;
  public connections = 0;

  constructor(private behavior: Behavior = {}) {
    this.wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    this.port = (this.wss.address() as any).port;
    this.wss.on("connection", (ws) => {
      this.connections++;
      if (behavior.closeOnConnect) {
        ws.close();
        return;
      }
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        const send = (out: any) => ws.send(JSON.stringify(out));
        if (msg.method === "soniq.hello") {
          if (behavior.acceptHello === false) {
            send({
              jsonrpc: "2.0",
              id: msg.id,
              error: { code: -32001, message: "version mismatch" },
            });
            return;
          }
          send({
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              version: behavior.helloVersion ?? PROTOCOL_VERSION,
              capabilities: behavior.capabilities ?? ["vst"],
            },
          });
          return;
        }
        behavior.customHandler?.(msg, send);
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((res) => this.wss.close(() => res()));
  }
}
```

- [ ] **Step 3: Write failing client test for happy-path connect**

Create `mcp-server/tests/client.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { SoniqClient } from "../src/client.js";
import { FakeBridge } from "./fake-server.js";

let bridge: FakeBridge | undefined;
let client: SoniqClient | undefined;

afterEach(async () => {
  await client?.close();
  await bridge?.close();
  client = undefined;
  bridge = undefined;
});

describe("SoniqClient.connect", () => {
  it("connects and completes hello handshake", async () => {
    bridge = new FakeBridge();
    client = new SoniqClient({ url: `ws://127.0.0.1:${bridge.port}` });
    await client.connect();
    expect(client.isReady()).toBe(true);
    expect(client.serverCapabilities()).toContain("vst");
  });

  it("throws LiveNotReachable when nothing is listening", async () => {
    client = new SoniqClient({ url: "ws://127.0.0.1:1" }); // port 1, refused
    await expect(client.connect()).rejects.toMatchObject({
      code: -32002, // LiveNotReachable
    });
  });

  it("throws VersionMismatch when hello fails", async () => {
    bridge = new FakeBridge({ acceptHello: false });
    client = new SoniqClient({ url: `ws://127.0.0.1:${bridge.port}` });
    await expect(client.connect()).rejects.toMatchObject({
      code: -32001, // VersionMismatch
    });
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @soniq/mcp-server test`
Expected: FAIL — `SoniqClient` not defined.

- [ ] **Step 5: Write `mcp-server/src/client.ts`**

```typescript
import { WebSocket } from "ws";
import {
  PROTOCOL_VERSION,
  RPC_METHODS,
  HelloResult,
  type Capability,
} from "@soniq/shared";
import { LiveNotReachable, RequestTimeout, VersionMismatch, SoniqError } from "./errors.js";

export interface SoniqClientOptions {
  url: string;
  requestTimeoutMs?: number;
  connectTimeoutMs?: number;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  method: string;
}

export class SoniqClient {
  private ws?: WebSocket;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private ready = false;
  private capabilities: Capability[] = [];
  private readonly url: string;
  private readonly requestTimeoutMs: number;
  private readonly connectTimeoutMs: number;

  constructor(opts: SoniqClientOptions) {
    this.url = opts.url;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 5000;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 3000;
  }

  isReady(): boolean {
    return this.ready;
  }

  serverCapabilities(): readonly Capability[] {
    return this.capabilities;
  }

  async connect(): Promise<void> {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(LiveNotReachable(`connect timeout after ${this.connectTimeoutMs}ms`));
      }, this.connectTimeoutMs);

      ws.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.once("error", (err) => {
        clearTimeout(timer);
        reject(LiveNotReachable(err.message));
      });
    });

    ws.on("message", (raw) => this.onMessage(raw.toString()));
    ws.on("close", () => this.onClose());

    const helloResult = await this.call<typeof HelloResult._type>(
      RPC_METHODS.hello,
      { version: PROTOCOL_VERSION }
    );
    const parsed = HelloResult.safeParse(helloResult);
    if (!parsed.success) {
      throw new SoniqError(-32001, "Malformed hello result", parsed.error);
    }
    if (parsed.data.version !== PROTOCOL_VERSION) {
      throw VersionMismatch(PROTOCOL_VERSION, parsed.data.version);
    }
    this.capabilities = parsed.data.capabilities;
    this.ready = true;
  }

  async call<T>(method: string, params: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw LiveNotReachable("socket not open");
    }
    const id = this.nextId++;
    const frame = { jsonrpc: "2.0", id, method, params };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(RequestTimeout(method, this.requestTimeoutMs));
      }, this.requestTimeoutMs);
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
        method,
      });
      this.ws!.send(JSON.stringify(frame));
    });
  }

  async close(): Promise<void> {
    this.ws?.close();
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(LiveNotReachable("client closed"));
    }
    this.pending.clear();
    this.ready = false;
  }

  private onMessage(text: string): void {
    let msg: any;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof msg.id !== "number") return; // event/notification — not handled in Plan 1
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.error) {
      pending.reject(new SoniqError(msg.error.code, msg.error.message, msg.error.data));
    } else {
      pending.resolve(msg.result);
    }
  }

  private onClose(): void {
    this.ready = false;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(LiveNotReachable("socket closed"));
    }
    this.pending.clear();
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @soniq/mcp-server test`
Expected: 3 tests pass.

- [ ] **Step 7: Add timeout test**

Append to `mcp-server/tests/client.test.ts`:

```typescript
describe("SoniqClient.call timeout", () => {
  it("rejects with RequestTimeout when server never replies", async () => {
    bridge = new FakeBridge({
      customHandler: () => {
        /* ignore — never respond */
      },
    });
    client = new SoniqClient({
      url: `ws://127.0.0.1:${bridge.port}`,
      requestTimeoutMs: 200,
    });
    await client.connect();
    await expect(
      client.call("soniq.vst.schema", undefined)
    ).rejects.toMatchObject({ code: -32004 });
  });
});
```

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @soniq/mcp-server test`
Expected: 4 tests pass.

- [ ] **Step 9: Commit**

```bash
git add mcp-server/src/ mcp-server/tests/
git commit -m "feat(mcp-server): WS client with hello handshake, timeout, error mapping"
```

---

## Phase 4 — Node for Max RPC Server (TDD where possible)

### Task 9: `Soniq.Bridge/code` package + server skeleton

**Files:**
- Create: `Soniq.Bridge/code/package.json`
- Create: `Soniq.Bridge/code/server.js`
- Test: `Soniq.Bridge/code/tests/server.test.js`

- [ ] **Step 1: Create `Soniq.Bridge/code/package.json`**

```json
{
  "name": "soniq-device-code",
  "version": "0.1.0",
  "description": "Node for Max script — WebSocket RPC server inside Soniq.Bridge.amxd",
  "private": true,
  "type": "commonjs",
  "main": "server.js",
  "scripts": {
    "test": "node --test tests/"
  },
  "dependencies": {
    "ws": "^8.16.0"
  }
}
```

Notes:
- `type: "commonjs"` because Node for Max's bundled Node is older and `require`-friendly. Verify the installed Max version's Node first (Max 8+ usually supports ES modules but CJS is safer baseline).
- Uses node's built-in test runner — no extra dev deps needed in M4L's runtime.

- [ ] **Step 2: Install deps for `Soniq.Bridge/code`**

Run: `cd Soniq.Bridge/code && npm install && cd ../..`
Expected: `Soniq.Bridge/code/node_modules/` populated with `ws`.

- [ ] **Step 3: Write failing test for protocol-version handshake**

Create `Soniq.Bridge/code/tests/server.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const WebSocket = require("ws");
const { startServer } = require("../server.js");
const schema = require("../protocol.schema.json");

const PROTOCOL_VERSION = schema.protocolVersion;

async function withServer(fn) {
  const srv = await startServer({ port: 0, maxApi: makeFakeMaxApi() });
  try {
    await fn(srv);
  } finally {
    await srv.close();
  }
}

function makeFakeMaxApi() {
  return {
    outlet: () => {},
    post: () => {},
    addHandler: () => {},
    handlers: {},
  };
}

function rpc(ws, method, params) {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        ws.off("message", onMessage);
        resolve(msg);
      }
    };
    ws.on("message", onMessage);
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
}

test("hello handshake returns matching version and capabilities", async () => {
  await withServer(async (srv) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    await new Promise((r) => ws.once("open", r));
    const response = await rpc(ws, "soniq.hello", { version: PROTOCOL_VERSION });
    assert.equal(response.result.version, PROTOCOL_VERSION);
    assert.ok(Array.isArray(response.result.capabilities));
    ws.close();
  });
});

test("unknown method returns -32601", async () => {
  await withServer(async (srv) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    await new Promise((r) => ws.once("open", r));
    const response = await rpc(ws, "soniq.nonexistent", {});
    assert.equal(response.error.code, -32601);
    ws.close();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd Soniq.Bridge/code && npm test && cd ../..`
Expected: FAIL — cannot find `./server.js`.

- [ ] **Step 5: Write `Soniq.Bridge/code/server.js`**

```javascript
const WebSocket = require("ws");
const schema = require("./protocol.schema.json");

const PROTOCOL_VERSION = schema.protocolVersion;

const ERROR_CODES = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  VersionMismatch: -32001,
  VstNotLoaded: -32003,
};

function makeError(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function makeResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function createRouter() {
  const handlers = new Map();

  function register(method, handler) {
    handlers.set(method, handler);
  }

  async function dispatch(msg) {
    if (msg.method === "soniq.hello") {
      if (!msg.params || typeof msg.params.version !== "string") {
        return makeError(msg.id, ERROR_CODES.InvalidParams, "version required");
      }
      if (msg.params.version !== PROTOCOL_VERSION) {
        return makeError(
          msg.id,
          ERROR_CODES.VersionMismatch,
          `client=${msg.params.version} server=${PROTOCOL_VERSION}`
        );
      }
      return makeResult(msg.id, {
        version: PROTOCOL_VERSION,
        capabilities: Array.from(handlers.keys())
          .filter((m) => m.startsWith("soniq.") && m !== "soniq.hello")
          .map((m) => m.split(".")[1])
          .filter((cap, i, arr) => arr.indexOf(cap) === i),
      });
    }

    const handler = handlers.get(msg.method);
    if (!handler) {
      return makeError(msg.id, ERROR_CODES.MethodNotFound, `unknown method: ${msg.method}`);
    }

    try {
      const result = await handler(msg.params);
      return makeResult(msg.id, result);
    } catch (err) {
      if (err && typeof err.code === "number") {
        return makeError(msg.id, err.code, err.message, err.data);
      }
      return makeError(msg.id, ERROR_CODES.InternalError, err.message || String(err));
    }
  }

  return { register, dispatch };
}

async function startServer({ port = 9123, host = "127.0.0.1", maxApi } = {}) {
  const router = createRouter();
  const wss = new WebSocket.Server({ port, host });
  await new Promise((res) => wss.once("listening", res));
  const actualPort = wss.address().port;

  wss.on("connection", (ws) => {
    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify(makeError(null, ERROR_CODES.ParseError, "parse error")));
        return;
      }
      if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
        ws.send(JSON.stringify(makeError(msg.id ?? null, ERROR_CODES.InvalidRequest, "bad frame")));
        return;
      }
      const response = await router.dispatch(msg);
      ws.send(JSON.stringify(response));
    });
  });

  return {
    port: actualPort,
    router,
    close: () =>
      new Promise((res) => {
        wss.close(() => res());
      }),
  };
}

module.exports = { startServer, ERROR_CODES, PROTOCOL_VERSION };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd Soniq.Bridge/code && npm test && cd ../..`
Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add Soniq.Bridge/code/package.json Soniq.Bridge/code/server.js Soniq.Bridge/code/tests/ Soniq.Bridge/code/package-lock.json
git commit -m "feat(device): Node for Max RPC server with hello handshake and routing"
```

### Task 10: `vst.*` RPC handlers (with mocked vst~ bridge)

**Files:**
- Create: `Soniq.Bridge/code/rpc/vst.js`
- Modify: `Soniq.Bridge/code/server.js` (register handlers)
- Test: `Soniq.Bridge/code/tests/vst.test.js`

- [ ] **Step 1: Write failing tests for `vst.*` handlers**

Create `Soniq.Bridge/code/tests/vst.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const WebSocket = require("ws");
const { startServer } = require("../server.js");
const { registerVst } = require("../rpc/vst.js");

function makeFakeVstBridge(initial) {
  const state = { ...initial };
  return {
    state,
    getSchema: ({ includeMidiPassthrough = false } = {}) => {
      if (!state.schema) return { pluginName: null, paramCount: 0, params: [] };
      const MIDI_RE = /^(CC\d+|Pitch Bend|Aftertouch) Chan \d+$/;
      const params = includeMidiPassthrough
        ? state.schema.params
        : state.schema.params.filter((p) => !MIDI_RE.test(p.name));
      return { ...state.schema, params, paramCount: params.length };
    },
    readValues: (indices) =>
      indices.map((idx) => {
        const v = state.values[idx];
        if (v === undefined) {
          const err = new Error(`unknown index ${idx}`);
          err.code = -32003;
          throw err;
        }
        return { index: idx, value: v };
      }),
    writeValues: (writes) => {
      const echo = [];
      for (const w of writes) {
        if (state.values[w.index] === undefined) {
          const err = new Error(`unknown index ${w.index}`);
          err.code = -32003;
          throw err;
        }
        state.values[w.index] = w.value;
        echo.push({ index: w.index, actualValue: w.value });
      }
      return { ok: true, echo };
    },
  };
}

async function withServerAndVst(initial, fn) {
  const srv = await startServer({ port: 0 });
  const bridge = makeFakeVstBridge(initial);
  registerVst(srv.router, bridge);
  try {
    await fn(srv, bridge);
  } finally {
    await srv.close();
  }
}

function rpc(ws, method, params) {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve) => {
    const onMessage = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        ws.off("message", onMessage);
        resolve(msg);
      }
    };
    ws.on("message", onMessage);
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
}

const fixture = {
  schema: {
    pluginName: "FakeSynth",
    paramCount: 4,
    params: [
      { index: 0, name: "Cutoff", min: 0, max: 1, default: 0.5 },
      { index: 1, name: "Resonance", min: 0, max: 1, default: 0.2 },
      { index: 2, name: "CC0 Chan 1", min: 0, max: 1, default: 0 },
      { index: 3, name: "Pitch Bend Chan 1", min: 0, max: 1, default: 0.5 },
    ],
  },
  values: { 0: 0.5, 1: 0.2, 2: 0, 3: 0.5 },
};

test("vst.schema returns plugin schema with MIDI passthrough filtered by default", async () => {
  await withServerAndVst(fixture, async (srv) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    await new Promise((r) => ws.once("open", r));
    const response = await rpc(ws, "soniq.vst.schema", {});
    assert.equal(response.result.pluginName, "FakeSynth");
    assert.equal(response.result.paramCount, 2);  // 4 - 2 MIDI
    assert.equal(response.result.params.length, 2);
    assert.deepEqual(
      response.result.params.map((p) => p.name).sort(),
      ["Cutoff", "Resonance"]
    );
    ws.close();
  });
});

test("vst.schema with includeMidiPassthrough returns full set", async () => {
  await withServerAndVst(fixture, async (srv) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    await new Promise((r) => ws.once("open", r));
    const response = await rpc(ws, "soniq.vst.schema", { includeMidiPassthrough: true });
    assert.equal(response.result.paramCount, 4);
    ws.close();
  });
});

test("vst.read returns values for requested indices", async () => {
  await withServerAndVst(fixture, async (srv) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    await new Promise((r) => ws.once("open", r));
    const response = await rpc(ws, "soniq.vst.read", { indices: [0, 1] });
    assert.deepEqual(
      response.result.map((p) => p.index),
      [0, 1]
    );
    assert.equal(response.result[0].value, 0.5);
    assert.equal(response.result[0].displayValue, undefined);  // displayValue removed per spike findings
    ws.close();
  });
});

test("vst.read returns VstNotLoaded for unknown index", async () => {
  await withServerAndVst(fixture, async (srv) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    await new Promise((r) => ws.once("open", r));
    const response = await rpc(ws, "soniq.vst.read", { indices: [99] });
    assert.equal(response.error.code, -32003);
    ws.close();
  });
});

test("vst.write updates value and echoes", async () => {
  await withServerAndVst(fixture, async (srv, bridge) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    await new Promise((r) => ws.once("open", r));
    const response = await rpc(ws, "soniq.vst.write", {
      writes: [{ index: 0, value: 0.9 }],
    });
    assert.equal(response.result.ok, true);
    assert.equal(response.result.echo[0].actualValue, 0.9);
    assert.equal(bridge.state.values[0], 0.9);
    ws.close();
  });
});

test("vst.write rejects empty writes batch", async () => {
  await withServerAndVst(fixture, async (srv) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    await new Promise((r) => ws.once("open", r));
    const response = await rpc(ws, "soniq.vst.write", { writes: [] });
    assert.equal(response.error.code, -32602); // InvalidParams
    ws.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Soniq.Bridge/code && npm test && cd ../..`
Expected: FAIL — `registerVst` not found.

- [ ] **Step 3: Write `Soniq.Bridge/code/rpc/vst.js`**

```javascript
function registerVst(router, vstBridge) {
  router.register("soniq.vst.schema", async (params) => {
    const opts = (params && typeof params === "object") ? params : {};
    const includeMidiPassthrough = opts.includeMidiPassthrough === true;
    const schema = vstBridge.getSchema({ includeMidiPassthrough });
    if (!schema || schema.pluginName === null) {
      return { pluginName: null, paramCount: 0, params: [] };
    }
    return schema;
  });

  router.register("soniq.vst.read", async (params) => {
    if (!params || !Array.isArray(params.indices) || params.indices.length === 0) {
      const err = new Error("indices array required and non-empty");
      err.code = -32602;
      throw err;
    }
    return vstBridge.readValues(params.indices);
  });

  router.register("soniq.vst.write", async (params) => {
    if (!params || !Array.isArray(params.writes) || params.writes.length === 0) {
      const err = new Error("writes array required and non-empty");
      err.code = -32602;
      throw err;
    }
    return vstBridge.writeValues(params.writes);
  });
}

module.exports = { registerVst };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Soniq.Bridge/code && npm test && cd ../..`
Expected: 7 tests pass total (2 from Task 9 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add Soniq.Bridge/code/rpc/ Soniq.Bridge/code/tests/vst.test.js
git commit -m "feat(device): vst.schema/read/write RPC handlers with bridge abstraction"
```

### Task 11: Real `vstBridge` that talks to `vst~` via Max

**Files:**
- Modify: `Soniq.Bridge/code/server.js` (add Node for Max bootstrap)
- Create: `Soniq.Bridge/code/max-vst-bridge.js`

- [ ] **Step 1: Write `Soniq.Bridge/code/max-vst-bridge.js`**

```javascript
// Bridge between the JSON-RPC server and the Max patch hosting vst~.
// Protocol with the Max patch (confirmed by spike 2026-05-28):
//
//   Outbound (Node for Max → vst~ left inlet, prefixed by [route] in patch):
//     "list <1-based-idx> <value>"   set parameter (vst~ accepts as: list N V)
//     "params"                       request param-name list
//     "get <num>"                    request value (-4 = count, 1..N = param value)
//
//   Inbound (vst~ outlets → Node for Max handlers, routed by patch):
//     "paramName <name>"             — one per param, from vst~ 6-from-right outlet
//                                       (patch sends them in order; index inferred by position)
//     "paramValue <num> <value>"     — from vst~ 5-from-right outlet's `get <num>` response
//                                       (patch formats raw `<num> <value>` as this message)
//     "paramCount <count>"           — from `get -4`
//     "pluginName <name>"            — from `get -8`-style call (TBD: see patch wiring)
//
// MIDI passthrough filter is applied on read in getSchema(), not at storage time —
// keeps the cache exact and matches Max output 1:1.

const MIDI_PASSTHROUGH_NAME_REGEX = /^(CC\d+|Pitch Bend|Aftertouch) Chan \d+$/;

function createMaxVstBridge(maxApi) {
  // params[i] is the 0-based protocol view of vst~ param at vst-index (i+1).
  const state = {
    pluginName: null,
    params: [],            // [{index:0..N-1, name, min:0, max:1, default:value}]
    values: {},            // { protocolIndex: value }
    expectedCount: null,
    schemaReady: false,
    pendingResolvers: [],
  };

  function fireReady() {
    if (
      state.expectedCount !== null &&
      state.params.length === state.expectedCount &&
      Object.keys(state.values).length === state.expectedCount
    ) {
      state.schemaReady = true;
      const rs = state.pendingResolvers.splice(0);
      for (const r of rs) r();
    }
  }

  maxApi.addHandler("pluginName", (name) => {
    state.pluginName = name ? String(name) : null;
  });

  maxApi.addHandler("paramCount", (count) => {
    state.expectedCount = Number(count);
    // Pre-allocate so out-of-order paramValue messages don't crash.
    state.params = [];
    state.values = {};
    fireReady();
  });

  // paramName arrives in vst~ order (1-based in vst, 0-based here).
  // We rely on the patch to send paramName messages sequentially, one per param.
  maxApi.addHandler("paramName", (name) => {
    const protocolIndex = state.params.length;
    state.params.push({
      index: protocolIndex,
      name: String(name),
      min: 0,
      max: 1,
      default: state.values[protocolIndex] ?? 0,
    });
    fireReady();
  });

  // paramValue echoes are formatted by patch as "paramValue <vst-1based-idx> <value>".
  maxApi.addHandler("paramValue", (vstIdx, value) => {
    const protocolIndex = Number(vstIdx) - 1;
    const v = Number(value);
    state.values[protocolIndex] = v;
    // Backfill default if schema already populated.
    if (state.params[protocolIndex]) {
      state.params[protocolIndex].default = v;
    }
    fireReady();
  });

  function getSchema({ includeMidiPassthrough = false } = {}) {
    if (!state.schemaReady) {
      return { pluginName: state.pluginName, paramCount: 0, params: [] };
    }
    const filtered = includeMidiPassthrough
      ? state.params
      : state.params.filter((p) => !MIDI_PASSTHROUGH_NAME_REGEX.test(p.name));
    return {
      pluginName: state.pluginName,
      paramCount: filtered.length,
      params: filtered,
    };
  }

  function readValues(indices) {
    return indices.map((idx) => {
      if (state.values[idx] === undefined) {
        const err = new Error(`unknown param index ${idx}`);
        err.code = -32003;
        throw err;
      }
      return { index: idx, value: state.values[idx] };
    });
  }

  function writeValues(writes) {
    const echo = [];
    for (const w of writes) {
      if (state.values[w.index] === undefined) {
        const err = new Error(`unknown param index ${w.index}`);
        err.code = -32003;
        throw err;
      }
      // Protocol 0-based → vst~ 1-based at the boundary.
      const vstIdx = w.index + 1;
      maxApi.outlet("list", vstIdx, w.value);
      // Optimistic local update; the patch will follow up with a `get <vstIdx>` echo
      // (see Task 12 wiring) which lands on paramValue handler and reconfirms.
      state.values[w.index] = w.value;
      echo.push({ index: w.index, actualValue: w.value });
    }
    return { ok: true, echo };
  }

  // Tell the patch we want a fresh schema. Patch responds by sending
  // pluginName, paramCount, paramName×N, paramValue×N back.
  maxApi.outlet("query-schema");

  return { getSchema, readValues, writeValues };
}

module.exports = { createMaxVstBridge, MIDI_PASSTHROUGH_NAME_REGEX };
```

- [ ] **Step 2: Modify `Soniq.Bridge/code/server.js` to bootstrap inside Node for Max**

Append to the bottom of `server.js` (after the `module.exports`):

```javascript
// --- Node for Max bootstrap ---
// When loaded by Max's [node.script], the `max-api` module is available.
// When loaded by tests, this block does nothing (require is wrapped).
if (require.main === module || process.env.SONIQ_NFM_BOOTSTRAP === "1") {
  let maxApi;
  try {
    maxApi = require("max-api");
  } catch {
    maxApi = null;
  }
  if (maxApi) {
    const { createMaxVstBridge } = require("./max-vst-bridge.js");
    const { registerVst } = require("./rpc/vst.js");

    (async () => {
      const srv = await startServer({ port: 9123, host: "127.0.0.1" });
      const bridge = createMaxVstBridge(maxApi);
      registerVst(srv.router, bridge);
      maxApi.post(`[soniq] WebSocket RPC listening on 127.0.0.1:${srv.port}`);
    })().catch((err) => {
      if (maxApi) maxApi.post(`[soniq] startup error: ${err.message}`);
      else console.error(err);
    });
  }
}
```

- [ ] **Step 3: Run unit tests to verify nothing regressed**

Run: `cd Soniq.Bridge/code && npm test && cd ../..`
Expected: still 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add Soniq.Bridge/code/max-vst-bridge.js Soniq.Bridge/code/server.js
git commit -m "feat(device): bridge Node for Max to vst~ via outlet messages"
```

### Task 12: Build the Max patch for `Soniq.Bridge.amxd` (manual)

**Files:**
- Create: `Soniq.Bridge/patchers/main.maxpat` (saved from Max GUI)
- Create: `Soniq.Bridge/patchers/vst-host.maxpat`
- Create: `Soniq.Bridge/Soniq.Bridge.amxd` (binary, saved from Max)

This task is **manual** (Max patcher GUI). Each step is small.

- [ ] **Step 1: Open Live, create new MIDI track, add a new Max MIDI Effect**

Drag any Max MIDI device onto the track, click edit pencil to open Max editor.

- [ ] **Step 2: Save the empty patcher as `Soniq.Bridge.amxd`**

File → Save As → navigate to `<repo>/Soniq.Bridge/` → name `Soniq.Bridge.amxd`.

- [ ] **Step 3: Add a `node.script` object pointing at `server.js`**

Create object: `node.script server.js`. Right-click → `Open node.script Window`. Click `start`.

Expected: in the Max console, you see `[soniq] WebSocket RPC listening on 127.0.0.1:9123`.

- [ ] **Step 4: Add `vst~` object and a `[message setparam 0 0.5]` testbed**

Create `vst~`. Load Serum 1 into it. Create a `[message]` with `setparam 0 0.5` and a button connected to it; connect button → message → `vst~` left inlet. Click the button.

Expected: Serum's parameter 0 changes visibly.

- [ ] **Step 5: Wire `node.script` ↔ `vst~` per the spike-confirmed `vst~` protocol**

`vst~` outlet topology (confirmed by spike 2026-05-28, [Max 9 docs](https://docs.cycling74.com/reference/vst~/)):

| LtR position | Role | This patch uses? |
|--------------|------|------------------|
| 1 | Audio L | passes to device output |
| 2 | Audio R | passes to device output |
| 3 (= 6-from-right) | Parameter **names** (from `params` message) | yes |
| 4 (= 5-from-right) | Parameter **values / info** (from `get` message; format `<query-echo> <value>`) | yes |
| 5 (= 4-from-right) | MIDI bytes | no (Plan 1) |
| 6 (= 3-from-right) | Program names | no (Plan 1) |
| 7 (= 2-from-right) | Shell sub-names | no |
| 8 (= 1-from-right) | AU preset filenames | no |

**Outbound side (Node for Max → vst~):**

`node.script` has one outlet emitting Max messages. Route them with `[route query-schema list]`:

- `query-schema` → fires a sequence:
  1. `[message params]` → `vst~` left inlet (dumps names to outlet 3)
  2. `[message get -4]` → `vst~` left inlet (dumps count to outlet 4)
  3. After receiving `paramCount`, iterate `i` from 1 to count with `[uzi]` → `[prepend get]` → `vst~` left inlet (collects default values via outlet 4)
- `list <vst-idx> <val>` → `[prepend list]` → `vst~` left inlet (writes parameter; vst~ documented syntax `list <num> <value>` 1-based)

**Inbound side (vst~ → Node for Max):**

- `vst~` outlet 3 (param names) → straight to `[prepend paramName]` → `node.script` inlet
  - Each name arrives as one symbol; `node.script` receives `paramName <name>` and accumulates in order
- `vst~` outlet 4 (param values / info) → `[route -4 -8]` and one default branch:
  - `-4 <count>` (response to `get -4`) → `[prepend paramCount]` → `node.script`
  - default `<vst-idx> <value>` (response to `get <i>`) → `[prepend paramValue]` → `node.script`
- Plugin name: send `[message get -8]`... actually `get -8` returns plugin name per Max docs (negative-index info queries); if `-8` doesn't work, alternatives: read patch's `vst~` argument symbol, or use `[message plug]` with a separate text-out object. Verify in Max console during Task 13. Route as `pluginName <name>` to `node.script`.

**Critical guarantee:** `paramCount` must arrive before all `paramName`/`paramValue` complete, so `max-vst-bridge.js` (Task 11) waits for the full set before flipping `schemaReady`. Send `get -4` AFTER `params` to ensure ordering in the Max message stream.

- [ ] **Step 6: Save the patch**

In Max: File → Save (saves `.amxd` to wherever you chose — by default `~/Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/Soniq.Bridge.amxd`). The `.amxd` binary is **intentionally gitignored**; it stays in your Ableton User Library and is not committed yet (per user preference, the binary will be added to the repo only after the M4L side has stabilized in Plan 1).

- [ ] **Step 7: Export the patcher JSON for version control**

In Max editor, File → Export as Text. Save as `Soniq.Bridge/patchers/main.maxpat`. Repeat for any sub-patchers (e.g. `vst-host.maxpat`).

The `.maxpat` text format is diffable and is what we commit. The `.amxd` stays local.

- [ ] **Step 8: Commit the JSON exports (not the .amxd)**

```bash
git add Soniq.Bridge/patchers/
git commit -m "feat(device): Soniq.Bridge patcher exports with vst~ + node.script wiring"
```

Verify: `git status` should show no `.amxd` staged (it's gitignored). If you see it listed, double-check `.gitignore` includes `Soniq.Bridge/*.amxd`.

### Task 13: End-to-end smoke test (manual)

**Files:** none.

- [ ] **Step 1: Restart Live, drop `Soniq.Bridge.amxd` on a MIDI track, load Serum 1 in its `vst~`**

Expected: Max console shows `[soniq] WebSocket RPC listening on 127.0.0.1:9123`.

- [ ] **Step 2: From a terminal, hit the WS with `wscat`**

Install if needed: `npm install -g wscat`.

Run:
```bash
wscat -c ws://127.0.0.1:9123
> {"jsonrpc":"2.0","id":1,"method":"soniq.hello","params":{"version":"0.1.0"}}
```

Expected: response contains `"result":{"version":"0.1.0","capabilities":["vst"]}`.

- [ ] **Step 3: Query schema**

```
> {"jsonrpc":"2.0","id":2,"method":"soniq.vst.schema"}
```

Expected: result with `pluginName: "Serum"` (or "Serum 1" depending on the plugin's reported name), `paramCount` matches Serum's actual count (likely 300+), `params` array populated.

- [ ] **Step 4: Read a parameter**

Pick a known index from the schema (e.g. `index: 0`). Run:
```
> {"jsonrpc":"2.0","id":3,"method":"soniq.vst.read","params":{"indices":[0]}}
```

Expected: result has the current value.

- [ ] **Step 5: Write a parameter**

```
> {"jsonrpc":"2.0","id":4,"method":"soniq.vst.write","params":{"writes":[{"index":0,"value":0.8}]}}
```

Expected: result `{"ok":true,"echo":[{"index":0,"actualValue":0.8}]}`; Serum UI shows the change.

- [ ] **Step 6: Repeat steps 1-5 swapping Serum 1 for Serum 2**

Same expectations. If schema/read/write all work for both, Phase 4 is verified.

- [ ] **Step 7: Document the smoke test result**

Note in conversation: pass/fail for each of Serum 1 and Serum 2. If fail, identify which RPC step broke and revise Task 12 wiring.

---

## Phase 5 — MCP Tools

### Task 14: `read_vst_schema` tool (TDD)

**Files:**
- Create: `mcp-server/src/tools/readVstSchema.ts`
- Modify: `mcp-server/src/index.ts`
- Test: `mcp-server/tests/tools.test.ts`

- [ ] **Step 1: Write failing tool test**

Create `mcp-server/tests/tools.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/server.js";
import { FakeBridge } from "./fake-server.js";

let bridge: FakeBridge | undefined;
let mcpClient: Client | undefined;
let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  await bridge?.close();
  bridge = undefined;
  cleanup = undefined;
  mcpClient = undefined;
});

async function setup(bridgeBehavior: any = {}) {
  bridge = new FakeBridge(bridgeBehavior);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const { server, soniqClient } = await createMcpServer({
    bridgeUrl: `ws://127.0.0.1:${bridge.port}`,
  });
  await server.connect(serverTransport);

  mcpClient = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
  await mcpClient.connect(clientTransport);

  cleanup = async () => {
    await mcpClient!.close();
    await soniqClient.close();
    await server.close();
  };
}

describe("read_vst_schema tool", () => {
  it("returns schema from bridge", async () => {
    await setup({
      customHandler: (msg, send) => {
        if (msg.method === "soniq.vst.schema") {
          send({
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              pluginName: "FakeSynth",
              paramCount: 1,
              params: [{ index: 0, name: "Cutoff", min: 0, max: 1, default: 0.5 }],
            },
          });
        }
      },
    });

    const result = await mcpClient!.callTool({ name: "read_vst_schema", arguments: {} });
    const payload = JSON.parse((result.content as any[])[0].text);
    expect(payload.pluginName).toBe("FakeSynth");
    expect(payload.params).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @soniq/mcp-server test`
Expected: FAIL — `createMcpServer` not exported, `read_vst_schema` not registered.

- [ ] **Step 3: Write `mcp-server/src/tools/readVstSchema.ts`**

```typescript
import { z } from "zod";
import { RPC_METHODS, VstSchemaResult } from "@soniq/shared";
import type { SoniqClient } from "../client.js";

export const READ_VST_SCHEMA = {
  name: "read_vst_schema",
  description:
    "Read the parameter schema of the currently loaded VST inside Soniq.Bridge.amxd. Returns plugin name, parameter count, and an array of parameter specs (index, name, min, max, default, group?). All values normalized 0..1. By default, MIDI passthrough parameters (CC<N> Chan <M>, Pitch Bend Chan <M>, Aftertouch Chan <M>) are filtered out — pass include_midi_passthrough:true to get the full set.",
  inputSchema: {
    type: "object",
    properties: {
      include_midi_passthrough: {
        type: "boolean",
        description: "If true, include MIDI passthrough params (~2080 of them for Serum 2). Default false.",
      },
    },
  } as const,
} as const;

const ArgsSchema = z.object({
  include_midi_passthrough: z.boolean().optional(),
});

export async function handleReadVstSchema(
  client: SoniqClient,
  args: unknown
): Promise<string> {
  const parsed = ArgsSchema.parse(args ?? {});
  const result = await client.call(RPC_METHODS.vstSchema, {
    includeMidiPassthrough: parsed.include_midi_passthrough ?? false,
  });
  const ok = VstSchemaResult.safeParse(result);
  if (!ok.success) {
    throw new Error(`Malformed vst.schema response: ${ok.error.message}`);
  }
  return JSON.stringify(ok.data, null, 2);
}
```

- [ ] **Step 4: Refactor `mcp-server/src/index.ts` to expose `createMcpServer`**

Replace `mcp-server/src/index.ts` with two files:

Create `mcp-server/src/server.ts`:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SoniqClient } from "./client.js";
import { READ_VST_SCHEMA, handleReadVstSchema } from "./tools/readVstSchema.js";

export interface CreateOptions {
  bridgeUrl?: string;
}

export async function createMcpServer(opts: CreateOptions = {}) {
  const bridgeUrl = opts.bridgeUrl ?? process.env.SONIQ_WS_URL ?? "ws://127.0.0.1:9123";
  const soniqClient = new SoniqClient({ url: bridgeUrl });

  const server = new Server(
    { name: "soniq", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [READ_VST_SCHEMA],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (!soniqClient.isReady()) {
      await soniqClient.connect();
    }
    switch (req.params.name) {
      case READ_VST_SCHEMA.name: {
        const text = await handleReadVstSchema(soniqClient, req.params.arguments);
        return { content: [{ type: "text", text }] };
      }
      default:
        throw new Error(`Unknown tool: ${req.params.name}`);
    }
  });

  return { server, soniqClient };
}
```

Replace `mcp-server/src/index.ts` with:

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

const { server } = await createMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[soniq-mcp] started");
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @soniq/mcp-server test`
Expected: previous 4 client tests + 1 new tool test = 5 pass.

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/ mcp-server/tests/tools.test.ts
git commit -m "feat(mcp-server): read_vst_schema tool wired to SoniqClient"
```

### Task 15: `read_vst_params` and `set_vst_param` tools (TDD)

**Files:**
- Create: `mcp-server/src/tools/readVstParams.ts`
- Create: `mcp-server/src/tools/setVstParam.ts`
- Modify: `mcp-server/src/server.ts`
- Modify: `mcp-server/tests/tools.test.ts`

- [ ] **Step 1: Append failing tests to `tools.test.ts`**

```typescript
describe("read_vst_params tool", () => {
  it("returns values for requested indices", async () => {
    await setup({
      customHandler: (msg, send) => {
        if (msg.method === "soniq.vst.read") {
          send({
            jsonrpc: "2.0",
            id: msg.id,
            result: [{ index: 0, value: 0.5 }],
          });
        }
      },
    });
    const result = await mcpClient!.callTool({
      name: "read_vst_params",
      arguments: { indices: [0] },
    });
    const payload = JSON.parse((result.content as any[])[0].text);
    expect(payload[0].value).toBe(0.5);
    expect(payload[0].displayValue).toBeUndefined();  // not exposed in Plan 1
  });

  it("rejects empty indices array at tool level", async () => {
    await setup();
    await expect(
      mcpClient!.callTool({ name: "read_vst_params", arguments: { indices: [] } })
    ).rejects.toThrow();
  });
});

describe("set_vst_param tool", () => {
  it("writes a single parameter", async () => {
    let received: any;
    await setup({
      customHandler: (msg, send) => {
        if (msg.method === "soniq.vst.write") {
          received = msg.params;
          send({
            jsonrpc: "2.0",
            id: msg.id,
            result: { ok: true, echo: [{ index: 0, actualValue: 0.8 }] },
          });
        }
      },
    });
    const result = await mcpClient!.callTool({
      name: "set_vst_param",
      arguments: { index: 0, value: 0.8 },
    });
    expect(received.writes).toEqual([{ index: 0, value: 0.8 }]);
    const payload = JSON.parse((result.content as any[])[0].text);
    expect(payload.echo[0].actualValue).toBe(0.8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @soniq/mcp-server test`
Expected: FAIL — tools not registered.

- [ ] **Step 3: Write `mcp-server/src/tools/readVstParams.ts`**

```typescript
import { z } from "zod";
import { RPC_METHODS, VstReadResult } from "@soniq/shared";
import type { SoniqClient } from "../client.js";

export const READ_VST_PARAMS = {
  name: "read_vst_params",
  description:
    "Read current values of one or more VST parameters by 0-based index. Returns an array of {index, value} where value is normalized 0..1. Use read_vst_schema first to discover indices.",
  inputSchema: {
    type: "object",
    properties: {
      indices: {
        type: "array",
        items: { type: "integer", minimum: 0 },
        minItems: 1,
        description: "0-based parameter indices to read",
      },
    },
    required: ["indices"],
  } as const,
} as const;

const ArgsSchema = z.object({
  indices: z.array(z.number().int().nonnegative()).min(1),
});

export async function handleReadVstParams(
  client: SoniqClient,
  args: unknown
): Promise<string> {
  const parsed = ArgsSchema.parse(args);
  const result = await client.call(RPC_METHODS.vstRead, { indices: parsed.indices });
  const ok = VstReadResult.safeParse(result);
  if (!ok.success) {
    throw new Error(`Malformed vst.read response: ${ok.error.message}`);
  }
  return JSON.stringify(ok.data, null, 2);
}
```

- [ ] **Step 4: Write `mcp-server/src/tools/setVstParam.ts`**

```typescript
import { z } from "zod";
import { RPC_METHODS, VstWriteResult } from "@soniq/shared";
import type { SoniqClient } from "../client.js";

export const SET_VST_PARAM = {
  name: "set_vst_param",
  description:
    "Set a single VST parameter by index. Returns the actual value written (may be quantized by the plugin). For batch writes use set_vst_params (Plan 2).",
  inputSchema: {
    type: "object",
    properties: {
      index: { type: "integer", minimum: 0, description: "Parameter index" },
      value: { type: "number", description: "Value (typically 0..1 for VST normalized params)" },
    },
    required: ["index", "value"],
  } as const,
} as const;

const ArgsSchema = z.object({
  index: z.number().int().nonnegative(),
  value: z.number(),
});

export async function handleSetVstParam(
  client: SoniqClient,
  args: unknown
): Promise<string> {
  const parsed = ArgsSchema.parse(args);
  const result = await client.call(RPC_METHODS.vstWrite, {
    writes: [{ index: parsed.index, value: parsed.value }],
  });
  const ok = VstWriteResult.safeParse(result);
  if (!ok.success) {
    throw new Error(`Malformed vst.write response: ${ok.error.message}`);
  }
  return JSON.stringify(ok.data, null, 2);
}
```

- [ ] **Step 5: Register tools in `mcp-server/src/server.ts`**

Modify the file. Update imports:

```typescript
import { READ_VST_SCHEMA, handleReadVstSchema } from "./tools/readVstSchema.js";
import { READ_VST_PARAMS, handleReadVstParams } from "./tools/readVstParams.js";
import { SET_VST_PARAM, handleSetVstParam } from "./tools/setVstParam.js";
```

Update list-tools handler:

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [READ_VST_SCHEMA, READ_VST_PARAMS, SET_VST_PARAM],
}));
```

Update call-tool handler's switch:

```typescript
switch (req.params.name) {
  case READ_VST_SCHEMA.name: {
    const text = await handleReadVstSchema(soniqClient, req.params.arguments);
    return { content: [{ type: "text", text }] };
  }
  case READ_VST_PARAMS.name: {
    const text = await handleReadVstParams(soniqClient, req.params.arguments);
    return { content: [{ type: "text", text }] };
  }
  case SET_VST_PARAM.name: {
    const text = await handleSetVstParam(soniqClient, req.params.arguments);
    return { content: [{ type: "text", text }] };
  }
  default:
    throw new Error(`Unknown tool: ${req.params.name}`);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @soniq/mcp-server test`
Expected: 5 previous + 3 new = 8 tests pass.

- [ ] **Step 7: Commit**

```bash
git add mcp-server/src/tools/ mcp-server/src/server.ts mcp-server/tests/tools.test.ts
git commit -m "feat(mcp-server): read_vst_params and set_vst_param tools"
```

---

## Phase 6 — Wire to Claude Code & Manual Verify

### Task 16: Build distributable MCP server

**Files:** none new.

- [ ] **Step 1: Build all packages**

Run: `pnpm -r build`
Expected: `shared/dist/` and `mcp-server/dist/` populated.

- [ ] **Step 2: Verify binary works**

Run:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node mcp-server/dist/index.js
```

Expected: stdout one JSON-RPC response listing 3 tools.

- [ ] **Step 3: Commit built artifacts**

```bash
git add mcp-server/dist/ shared/dist/
git commit -m "build: produce mcp-server/dist for Claude Code consumption"
```

### Task 17: Register MCP server with Claude Code

**Files:** none in repo (user's Claude Code settings).

- [ ] **Step 1: Locate Claude Code MCP config**

The MCP server registration lives in Claude Code's settings. On macOS, this is typically `~/.claude/settings.json` (workspace) or registered via `claude mcp add`.

- [ ] **Step 2: Add `soniq` MCP server**

Run from the repo root:
```bash
claude mcp add soniq node "$(pwd)/mcp-server/dist/index.js"
```

Or, if preferred via JSON config, add to user `settings.json`:

```json
{
  "mcpServers": {
    "soniq": {
      "command": "node",
      "args": ["/Users/wheatfox/Code/abletone_live_claude/mcp-server/dist/index.js"]
    }
  }
}
```

- [ ] **Step 3: Verify Claude Code sees the server**

In Claude Code, run `/mcp`.
Expected: `soniq` listed; status `connected` if Live is running with the device loaded, else `error` with `LiveNotReachable` (acceptable for now).

### Task 18: End-to-end manual verification

**Files:**
- Create: `tests/manual-verify.md`

- [ ] **Step 1: Write `tests/manual-verify.md`**

```markdown
# Soniq — Manual Verification Checklist

Run before each release / after any change to `Soniq.Bridge/` or `mcp-server/src/{client,server}.ts`.

## Setup
- [ ] Ableton Live 12 Suite open
- [ ] `Soniq.Bridge.amxd` loaded on a MIDI track
- [ ] Serum 1 OR Serum 2 loaded in the device's `vst~`
- [ ] Max console shows `[soniq] WebSocket RPC listening on 127.0.0.1:9123`
- [ ] `mcp-server/dist/index.js` built and registered with Claude Code

## Tool checks (from Claude Code)
- [ ] `read_vst_schema` returns a non-empty `params` array (paramCount > 128 for Serum)
- [ ] `read_vst_params {indices: [0]}` returns a numeric value
- [ ] `set_vst_param {index: 0, value: 0.8}` succeeds; Serum UI reflects the change
- [ ] `set_vst_param {index: 0, value: 1.5}` — out-of-range — should be either clamped (per VST spec) or fail with a sensible error message; whichever, document the observed behavior here

## Resilience
- [ ] Disable the device (yellow button) → tool call returns `LiveNotReachable`
- [ ] Re-enable the device → next tool call connects again
- [ ] Quit Live entirely → tool call returns `LiveNotReachable`
- [ ] Restart Live → reload device → next tool call connects again

## Repeat for both Serums
- [ ] All above checks pass with Serum 1 loaded
- [ ] All above checks pass with Serum 2 loaded
```

- [ ] **Step 2: Execute the checklist**

Walk through it once and check every box. If any fail, file it as a follow-up — the plan is "done" when the checklist passes for **both Serum 1 and Serum 2**.

- [ ] **Step 3: Commit**

```bash
git add tests/manual-verify.md
git commit -m "test: manual verification checklist for end-to-end Serum vertical slice"
```

### Task 19: README with quickstart

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Soniq

A two-layer bridge that lets coding agents (Claude Code, etc.) read and write the
full parameter space of Serum (or any VST) inside Ableton Live 12, bypassing
Live's 128-Configure-parameter limit.

## Architecture

```
Claude Code  ──stdio──▶  MCP server (TS)  ──WebSocket──▶  M4L device (Node for Max + vst~)
```

See `docs/superpowers/specs/2026-05-28-soniq-design.md` for the full design.

## Quickstart (macOS, Ableton Live 12 Suite)

1. **Install deps**
   ```bash
   pnpm install
   ```

2. **Build**
   ```bash
   pnpm -r build && pnpm generate-schema
   ```

3. **Run tests**
   ```bash
   pnpm test
   cd Soniq.Bridge/code && npm test && cd ../..
   ```

4. **Load the M4L device**
   - Open Ableton Live 12.
   - From your User Library → MIDI Effects → Max MIDI Effect, drag `Soniq.Bridge.amxd` onto a MIDI track (during Plan 1 the `.amxd` is not yet committed to the repo; it lives in your Ableton User Library).
   - Inside the device, load Serum 1 or Serum 2 into the `vst~` object.
   - The Max console should print `[soniq] WebSocket RPC listening on 127.0.0.1:9123`.

5. **Register with Claude Code**
   ```bash
   claude mcp add soniq node "$(pwd)/mcp-server/dist/index.js"
   ```

6. **Try it**
   In Claude Code, ask: "List Serum's parameter schema." It should call
   `read_vst_schema` and return ~300+ parameters.

## Manual verification

See `tests/manual-verify.md`.

## Scope (Plan 1)

Plan 1 ships only `hello`, `vst.schema`, `vst.read`, `vst.write`. Plan 2 will add
`tracks.*`, `midi.*`, and event notifications.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with quickstart and architecture summary"
```

---

## Done Criteria

Plan 1 is complete when **all** of the following are true:
1. `pnpm test` passes
2. `cd Soniq.Bridge/code && npm test` passes
3. `tests/manual-verify.md` checklist is fully ticked for **both Serum 1 and Serum 2**
4. Claude Code can call `read_vst_schema` and get a non-trivial response
5. Claude Code can call `set_vst_param` and you hear the audible change

If 3 fails specifically on Serum 2 but works on Serum 1, **don't merge** — investigate the divergence first.

---

## Self-Review

Done after writing the plan; issues fixed inline:

1. **Spec coverage:** Plan 1 deliberately covers only §4.3 `vst.*` methods + `hello`. `tracks.*`, `midi.*`, events explicitly deferred to Plan 2 in the header. The §9 spike risk is Task 0. The §6 testing strategy (unit/integration/manual) is reflected in Phase 2-3 unit tests, Phase 5 integration tests, and Task 18 manual checklist.

2. **Placeholder scan:** Searched for TBD/TODO — none. Each step has either complete code or an exact command. Task 12 step 5 contains a conditional note about `vst~` message names possibly differing — this is genuine (Max version variance), not a placeholder; the instruction says verify-then-edit.

3. **Type consistency:**
   - `SoniqClient` constructor option named `url` throughout (Task 8 declaration + tests + Task 14 `createMcpServer`).
   - `RPC_METHODS.vstSchema/vstRead/vstWrite` constants used in both `client.ts` calls and tool handlers.
   - `VstReadResult` returns `displayValue: string` — fake bridges in tests return strings (Task 10) and the real `max-vst-bridge` formats `String(value)` (Task 11) — consistent.
   - `RPC_ERROR_CODES.VstNotLoaded = -32003` used in `errors.ts`, Task 10 fake bridge, and Task 12 patch wiring guidance — consistent.

4. **Ambiguity check:**
   - "Both Serum 1 and Serum 2" — explicit in Task 0 step 6, Task 13 step 6, Task 18 checklist.
   - `Soniq.Bridge/code` not being a pnpm workspace — explicitly explained in Task 2 step 2.
