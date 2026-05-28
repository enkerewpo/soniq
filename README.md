# Soniq

> Let coding agents read and write the **full** parameter space of any VST inside Ableton Live 12 — bypassing Live's 128-parameter Configure ceiling.

Soniq is a two-layer bridge:

- A **Max for Live device** (`Soniq.Bridge.amxd`) hosts a VST via Max's `vst~` object and exposes a local WebSocket JSON-RPC server.
- A **TypeScript MCP server** wraps that WebSocket as [Model Context Protocol](https://modelcontextprotocol.io) tools, so Claude Code (or any MCP client) can drive Live as if it were a synth-design partner.

Tested on macOS with Ableton Live 12 Suite, Max 9, and Serum 2 (2,623 parameters exposed, ~543 musical parameters after filtering MIDI passthrough).

```
Claude Code  ──stdio──▶  MCP server (TS)  ──WebSocket──▶  M4L device (Node for Max + vst~)
                                                              │
                                                              ▼
                                                         Serum / any VST3
```

## Why

Ableton Live can only "Configure" up to 128 parameters per VST for automation. Serum 2 has 2,623. By hosting Serum inside an M4L device with `vst~`, Soniq accesses every parameter — names, current values, normalized 0..1 writes — and exposes them to AI agents through a clean MCP interface.

The protocol is **VST-agnostic**: schema is reflected from `vst~` at runtime. Swap Serum for Vital, Pigments, or anything else, and Soniq adapts.

## Status

Plan 1 (foundation + Serum vertical slice) is operational:

- ✅ Schema reflection (`read_vst_schema`)
- ✅ Parameter read (`read_vst_params`)
- ✅ Parameter write (`set_vst_param`)
- ✅ MIDI passthrough filtering (2,080 of 2,623 Serum 2 params hidden by default)

Plan 2 will add: tracks, MIDI generation, events, preset save/load.

## Requirements

| Item | Version |
|------|---------|
| macOS | tested on Darwin / Apple Silicon |
| Ableton Live 12 Suite | includes Max for Live |
| Max | 9.x (bundled with M4L); Node for Max ships Node 22.x |
| Node.js | ≥ 20 (for the MCP server) |
| pnpm | ≥ 8 |
| A VST3 instrument | Serum / Serum 2 recommended |

## Quickstart

```bash
# 1. Install dependencies
pnpm install
cd Soniq.Bridge/code && npm install && cd ../..

# 2. Build the TypeScript packages and generate the JSON Schema
pnpm -r build
pnpm generate-schema

# 3. Run tests (no Live required)
pnpm test
cd Soniq.Bridge/code && npm test && cd ../..
```

### Loading the device into Live

1. Open Ableton Live 12.
2. In Finder, double-click `Soniq.Bridge/Soniq.Bridge.amxd` (or drag it onto a MIDI track).
3. Inside the device, click the `vst~` object and load Serum (or your VST3).
4. The Max console should print:
   ```
   [soniq] node v22.x.x darwin/arm64
   [soniq] WebSocket RPC listening on 127.0.0.1:9123
   ```

### Registering with Claude Code

```bash
claude mcp add soniq node "$(pwd)/mcp-server/dist/index.js"
```

Then in Claude Code, ask "What synthesizer is loaded? Show me 5 oscillator parameters." Claude will call `read_vst_schema` and respond.

## Repo layout

```
soniq/
├── Soniq.Bridge/                  # M4L device + Max Project
│   ├── Soniq.Bridge.amxd          # the device itself (binary)
│   ├── Soniq.Bridge.maxproj       # Max Project descriptor
│   ├── soniq.bridge.launcher.js   # node.script entry point (launcher pattern)
│   ├── package.json               # scopes the folder to CommonJS
│   └── code/                      # Node for Max scripts
│       ├── server.js              # WebSocket JSON-RPC server
│       ├── max-vst-bridge.js      # bridge between Node and vst~
│       ├── rpc/vst.js             # vst.* RPC handlers
│       ├── protocol.schema.json   # generated from shared/protocol.ts
│       └── tests/                 # node --test
├── mcp-server/                    # MCP adapter (TypeScript)
│   ├── src/
│   │   ├── index.ts               # stdio entry
│   │   ├── client.ts              # WebSocket client
│   │   └── tools/                 # MCP tool handlers
│   └── tests/                     # vitest
├── shared/                        # protocol types (zod) — single source of truth
├── tools/generate-json-schema.ts  # TS schemas → JSON Schema for Node for Max
└── docs/superpowers/              # design specs and implementation plans
```

## MCP tools exposed

| Tool | Purpose |
|------|---------|
| `read_vst_schema` | Get plugin name, param count, and full schema (filtered for MIDI passthrough by default) |
| `read_vst_params` | Read current values of one or more 0-based parameter indices |
| `set_vst_param` | Set a parameter by index (normalized 0..1) |

More tools (`tracks.*`, `midi.*`, preset save/load, event notifications) are planned for Plan 2.

## Wire protocol

[JSON-RPC 2.0](https://www.jsonrpc.org/specification) over WebSocket on `127.0.0.1:9123`. Methods:

- `soniq.hello` — protocol handshake
- `soniq.vst.schema` — schema reflection
- `soniq.vst.read` — read values
- `soniq.vst.write` — set values

Direct testing without the MCP server:

```bash
npx wscat -c ws://127.0.0.1:9123
> {"jsonrpc":"2.0","id":1,"method":"soniq.hello","params":{"version":"0.1.0"}}
```

## Debug mode

Set `SONIQ_DEBUG=1` before launching node.script (via Max's environment, or by editing the `[node.script]` arguments) to enable verbose handler logging in the Max console.

## Architecture notes

See [`docs/superpowers/specs/2026-05-28-soniq-design.md`](docs/superpowers/specs/2026-05-28-soniq-design.md) for the full design and [`docs/superpowers/plans/2026-05-28-soniq-plan-1-foundation.md`](docs/superpowers/plans/2026-05-28-soniq-plan-1-foundation.md) for the implementation plan.

### Why the launcher

`node.script` resolves filenames through Max's file-search-path system rather than Node.js's `require()`. Subdirectory paths like `code/server.js` behave inconsistently across macOS/Windows. The launcher (`soniq.bridge.launcher.js`) sits at the top level of the project — a single uniquely-named file Max can always find — and from there uses Node's standard `require()` to load `./code/server.js`. This is the [Cycling '74 community-recommended pattern](https://cycling74.com/forums/nodescript-with-relative-path-windows-mac).

### Why Serum is hosted *inside* the M4L device

Live's regular VST track only exposes 128 parameters to LOM (`device.parameters`). To break that ceiling, Serum runs inside the M4L device's own `vst~` object — same audio quality and MIDI flow, but `vst~` exposes every parameter as a normalized 0..1 control.

## License

TBD.

## Author

[@enkerewpo](https://github.com/enkerewpo)
