# Soniq — Ableton Live 12 ↔ Coding Agent Bridge: Design

- **Date:** 2026-05-28
- **Codename:** `soniq`
- **Target user:** single user (local), wants a coding agent (Claude Code, etc.) to assist with Serum sound design and basic track / MIDI operations

## 1. Goals and Non-Goals

### 1.1 Goals
1. Let an external coding agent (Claude Code by default, via MCP):
   - List / create / select tracks in Ableton Live 12
   - Read and write the **complete parameter space** of Serum 1 / Serum 2 (bypassing Live's 128-parameter Configure ceiling)
   - Generate minimal MIDI (write notes to a clip), play a test tone
2. **VST agnostic:** the protocol does not hard-code Serum. Swapping in another VST works via runtime schema reflection.
3. Strictly local single-user; no auth; WebSocket binds `127.0.0.1`.
4. The agent's understanding of parameter *meaning* comes only from the parameter name plus runtime metadata; subject-matter knowledge is the agent's own job (it can fetch manuals online or read user-provided docs). The system does **not** ship a built-in Serum knowledge base.

### 1.2 Non-Goals (out of MVP)
- No multi-user / SaaS / authentication
- No built-in domain knowledge of Serum or any VST
- No full Live remote control (full transport, scene editing, mixer automation) — `tracks.*` and `midi.*` are minimal "just enough" subsets
- No audio capture / no agent "listening" to output
- No `.fxp` offline parsing (the `vst~` state mechanism is enough for MVP and later phases)

## 2. Architecture

```
┌─────────────────────────────────────┐         ┌─────────────────────────┐
│  Claude Code / any MCP-aware agent   │ stdio  │  MCP Server (TS)         │
│  calls MCP tools                     │◄──────►│  - wraps WS RPC as tools │
└─────────────────────────────────────┘         │  - caches schema,        │
                                                 │    throttles writes      │
                                                 │  - normalizes errors     │
                                                 └────────────┬────────────┘
                                                              │
                                                       WebSocket (JSON-RPC 2.0)
                                                       ws://127.0.0.1:9123
                                                              │
                          ┌───────────────────────────────────┴───────────────────┐
                          │                Ableton Live 12                         │
                          │  ┌─────────────────────────────────────────────────┐  │
                          │  │  M4L Device: Soniq.Bridge.amxd                   │  │
                          │  │  ┌──────────────┐  ┌──────────────────────────┐ │  │
                          │  │  │ Node for Max │  │ Max patch                 │ │  │
                          │  │  │ (ws server,  │◄─┤  - live.path / live.object│ │  │
                          │  │  │  RPC router) │  │  - vst~ (hosts Serum)     │ │  │
                          │  │  └──────┬───────┘  │  - live.observer bridge   │ │  │
                          │  └─────────┼──────────┴──────────────────────────┘  │
                          │            │                                          │
                          │      Live Object Model (LOM)                           │
                          │      - live_set.tracks / clip_slots / clips           │
                          │      - this_device.parameters                          │
                          └──────────────────────────────────────────────────────┘
```

### 2.1 Three processes
1. **MCP Server** — standalone Node process, launched by Claude Code on demand
2. **M4L device `Soniq.Bridge.amxd`** — sits on a Live MIDI track; internally runs Node for Max + a Max patch + a `vst~` hosting Serum
3. **The agent itself** — Claude Code or any other MCP client

### 2.2 Two independent functional paths
| Functionality | Path |
|---------------|------|
| Track / MIDI / generic LOM operations | M4L uses `live.path` + `live.object` directly against the Live API |
| Serum parameter R/W | M4L's internal `vst~` operates Serum directly — **bypasses** Live's 128-Configure limit entirely |

### 2.3 Key technical decisions
- **Serum hosted inside the M4L device, not on the track:** the only path that exposes all parameters. Trade-off: loses some native-track-VST ergonomics (Push integration, native preset browser parity). Accepted.
- **Node for Max + TS MCP:** modern M4L scripting; can run the `ws` npm package; TS is first-class in the MCP SDK; both sides share a JSON schema.
- **JSON-RPC 2.0 over WebSocket:** industry-standard, well-defined error codes, easy to debug with `wscat`.

## 3. Module Breakdown

### 3.1 Repository layout

```
soniq/
├── Soniq.Bridge/                    # M4L device + Max Project (same folder name)
│   ├── Soniq.Bridge.amxd            # Max device file (binary; gitignored during Plan 1)
│   ├── Soniq.Bridge.maxproj         # Max Project descriptor (committed)
│   ├── patchers/                    # extracted sub-patches (version-controlled)
│   │   ├── main.maxpat
│   │   ├── vst-host.maxpat          # vst~ + param bridge
│   │   └── lom-bridge.maxpat        # live.path / observer wrapper
│   └── code/                        # Node for Max script (resolved via Max project)
│       ├── server.js                # WebSocket server + RPC router
│       ├── rpc/
│       │   ├── tracks.js
│       │   ├── vst.js
│       │   └── midi.js
│       ├── protocol.schema.json     # generated from shared/protocol.ts at build
│       └── package.json
├── mcp-server/                      # MCP adapter
│   ├── src/
│   │   ├── index.ts                 # stdio entry point
│   │   ├── tools/                   # one file per MCP tool
│   │   │   ├── readVstSchema.ts
│   │   │   ├── readVstParams.ts
│   │   │   ├── setVstParam.ts
│   │   │   └── ...
│   │   ├── client.ts                # WS client; reconnect / timeout
│   │   └── schema.ts                # shared types (zod)
│   └── package.json
├── shared/
│   └── protocol.ts                  # wire types — single source of truth
├── tests/
│   └── manual-verify.md             # M4L manual checklist
└── docs/superpowers/specs/          # design docs
```

### 3.2 Component responsibility matrix

| Component | Responsibility | Depends on | Does NOT do |
|-----------|----------------|------------|-------------|
| **M4L Max patch** | Provide LOM entry (`live.path` / `live.object`) and the `vst~` host | Live API, Max objects | RPC routing logic |
| **Node for Max scripts** | WS server + JSON-RPC routing + translate to Max messages | `ws` npm, `max-api` | Direct LOM calls (goes via patch) |
| **MCP server (TS)** | stdio↔WS adapter; wraps JSON-RPC as MCP tools; caches schema | `@modelcontextprotocol/sdk`, `ws`, `zod` | Direct connection to Live |
| **shared/protocol.ts** | Single source of truth for wire types | nothing | No behavior |

### 3.3 Boundary checks
- Without reading the Max patch internals, you can still answer "what RPC methods does Node for Max expose?" — see `rpc/*.js`.
- The MCP server has no knowledge of Live's existence; it only knows it talks JSON-RPC to some WS endpoint.
- The Max patch has no knowledge of WebSocket; it only sees Max messages from Node for Max.

### 3.4 Schema sharing
`shared/protocol.ts` is the TS source. A build step generates `Soniq.Bridge/code/protocol.schema.json` (runtime validation) and `mcp-server/src/schema.ts` types. A version number is embedded and exchanged at handshake. Node for Max cannot import `.ts` directly, hence the "TS → JSON Schema" build path.

## 4. Protocol

### 4.1 Wire format
JSON-RPC 2.0 over WebSocket, UTF-8, one JSON-RPC frame per WS message.

### 4.2 Handshake
On M4L device instantiation, Node for Max starts a WS server on `127.0.0.1:9123`. The MCP server connects and sends:

```
client → server:  {"jsonrpc":"2.0","method":"soniq.hello","params":{"version":"0.1.0"},"id":1}
server → client:  {"jsonrpc":"2.0","result":{"version":"0.1.0","capabilities":["tracks","vst","midi"]},"id":1}
```

Version mismatch → server returns JSON-RPC error `code: -32001 VersionMismatch`; client disconnects.

### 4.3 Method catalog (MVP)

#### `soniq.tracks.*`
```
tracks.list()                        → [{index, name, type:"midi"|"audio", armed, muted}]
tracks.select(index)                 → {ok:true}
tracks.create(type:"midi"|"audio", name?) → {index}
```

#### `soniq.vst.*`
```
vst.schema(opts?:{includeMidiPassthrough?:boolean})
                                     → {pluginName, paramCount,
                                         params:[{index,name,min,max,default,group?}]}
vst.read(indices:number[])           → [{index, value}]
vst.write(writes:[{index,value}])    → {ok:true, echo:[{index,actualValue}]}
vst.savePreset(path:string)          → {path}       # later phase (see §4.8)
vst.loadPreset(path:string)          → {ok:true}    # later phase
```

**Field conventions (based on observed `vst~` behavior from the spike):**
- `index` is **0-based** in the protocol (programmer-friendly); the Max boundary converts to/from `vst~`'s 1-based numbering.
- VST3 / `vst~` parameters are all **normalized 0..1**, so `min` is always 0 and `max` is always 1. The fields are kept for forward-compatibility with non-normalized VSTs.
- `default` is the value of `get <num>` at device init time (with Serum's default init preset loaded).
- `unit` field **removed** — `vst~` doesn't expose units; if needed later, `getparamtext` could be queried separately.
- `displayValue` field **removed** — same reason; Plan 2 can add `vst.readDisplay(indices)` if formatted text is needed.

**`includeMidiPassthrough` defaults to `false`**: Serum 2 exposes 2623 parameters, of which ~2080 are MIDI CC / Pitch Bend / Aftertouch routing (130 per channel × 16 channels). By default `vst.schema()` filters those out so the agent sees the ~540 synthesis-relevant params. Set the flag `true` to get the full set. Filter pattern: parameter names matching `^(CC\d+|Pitch Bend|Aftertouch) Chan \d+$`.

#### `soniq.midi.*`
```
midi.testTone(note:number, velocity:number, durationMs:number) → {ok:true}
midi.setClipNotes(trackIdx, clipIdx,
                  notes:[{pitch,start,duration,velocity}])      → {ok:true}
```

### 4.4 Server → client notifications (no id)
```
soniq.event.paramChanged       {index, value, source:"user"|"agent"}
soniq.event.schemaReloaded     {pluginName, paramCount}
```
(`transportChanged` deferred to §8; MVP doesn't implement it to avoid emitting events for which no corresponding method exists.)

### 4.5 End-to-end example: a single Serum parameter write

```
1. Claude Code calls MCP tool: set_vst_param(index=12, value=0.7)
2. MCP server → WS:
   {"method":"soniq.vst.write","params":{"writes":[{"index":12,"value":0.7}]},"id":42}
3. Node for Max routes to vst.js handler, converts 0-based→1-based and emits Max message:
   [vst-host list 13 0.7]
4. The Max patch forwards `list 13 0.7` to vst~'s leftmost inlet → Serum updates the param.
5. Node for Max immediately sends `get 13` to verify; receives `13 <actualValue>` on outlet 5-from-right.
6. Node for Max replies to client:
   {"result":{"ok":true,"echo":[{"index":12,"actualValue":0.6996}]},"id":42}
7. The MCP tool returns to Claude with the actual value (possibly quantized by the plugin).
```

### 4.6 Schema reflection (based on the spike-confirmed `vst~` protocol)

Real `vst~` interface (per [Max 9 vst~ reference](https://docs.cycling74.com/reference/vst~/)), validated by the spike:

1. Send `params` to `vst~`'s left inlet
   → Outlet **6-from-right** emits a long stream of symbols, one parameter name per atom (Serum 2 = 2623 entries).
2. Node for Max caches the name array (positional order = 1-based vst index, 0-based on the protocol).
3. Send `get -4` to `vst~`
   → Outlet **5-from-right** emits `-4 <count>`; cross-check against the name count.
4. For each `i ∈ [1..count]`, send `get <i>`
   → Outlet 5-from-right emits `<i> <value>`; accumulate into the `default` field.
5. Set `min=0`, `max=1` for all parameters (VST3 normalized convention).
6. Filter out names matching `^(CC\d+|Pitch Bend|Aftertouch) Chan \d+$` (unless `includeMidiPassthrough:true`).
7. `vst.schema()` returns the cached, filtered (or unfiltered) view.
8. Switching the loaded VST triggers `soniq.event.schemaReloaded`; clients flush their schema cache.

**Outlet numbering** (`vst~`, left → right):
1. Audio out L
2. Audio out R (Serum 2 is stereo)
3. 6-from-right: parameter name list (response to `params`)
4. 5-from-right: parameter values / info (response to `get`; format `<query-echo> <value>`)
5. 4-from-right: MIDI bytes
6. 3-from-right: program names
7. 2-from-right: shell sub-names
8. Right: AU preset filenames

Plan 1 only wires outlets 3 (names) and 4 (values).

### 4.7 Throttling and ordering
- The MCP server coalesces multiple `vst.write` calls to the same index within 50 ms, keeping only the last value.
- Writes to different indices preserve arrival order in a single batch request.
- Live API calls inside the Max patch are sequential by construction (single-threaded message stream).

## 5. Error Handling

### 5.1 Failure-mode matrix

| Failure point | Symptom | Behavior |
|---------------|---------|----------|
| MCP client cannot reach WS at startup | M4L device not loaded / Live not running | MCP server enters "waiting", reconnects every 2 s; tool calls return `LiveNotReachable` with an instructive message |
| WS disconnects mid-flight | User removed the M4L device / restarted Live | Mark all in-flight requests failed, stop accepting new ones, enter reconnect loop |
| `vst~` has no Serum loaded | Serum not installed / user hasn't selected a VST | `vst.schema()` returns `{pluginName:null, paramCount:0}`; writes return `VstNotLoaded` |
| JSON-RPC call timeout (>5 s) | Live stalled / Max deadlocked | Client times out → `RequestTimeout`; no retry |
| Parameter index out of range / value out of bounds | Agent error | Server returns `-32602 InvalidParams` immediately; never forwarded to Live |
| User changes a param in Serum's UI concurrently | Conflict with agent write | "Last writer wins" + `paramChanged` notification; no locking |

### 5.2 Custom error codes
- `-32001 VersionMismatch`
- `-32002 LiveNotReachable`
- `-32003 VstNotLoaded`
- `-32004 RequestTimeout`
- `-32005 SchemaStale` (client cache out of sync; must refresh)

### 5.3 Explicit anti-patterns
- Don't silently swallow errors.
- Don't internally retry Live API calls (write retries have side-effect risk; surface the failure to the agent).
- Don't add defensive code for impossible states (trust Max's single-threaded message stream).

## 6. Testing Strategy

### 6.1 Three layers

1. **`shared/protocol.ts` unit tests** (vitest)
   - zod schema encode/decode
   - Version-number matching
   - Fully offline, sub-second feedback

2. **MCP server integration tests** (vitest + fake WS server)
   - Cannot-connect scenarios
   - Mid-flight disconnects
   - Call timeouts
   - Error-code propagation
   - Throttling / coalescing
   - **No Live process required**

3. **Manual scripted validation of the M4L side**
   - `tests/manual-verify.md` checklist
   - Load device → see schema → write a param and hear the change → unplug device, see correct client error
   - Run once per PR

### 6.2 What we don't write
- No Live API mocks (high cost, behavior unstable).
- No Serum-specific fixtures (the goal is VST-agnostic; real `vst~` load validates).

## 7. Environment Prerequisites

| Item | Notes |
|------|-------|
| macOS | Darwin (confirmed) |
| Ableton Live 12 Suite | Includes Max for Live |
| Max 8 / Max 9 | The version bundled with M4L is sufficient; the standalone Max editor is useful for development |
| Serum 1 and/or Serum 2 | VST3 64-bit |
| Node.js ≥ 20 | MCP server runtime |
| Claude Code | MCP client |

## 8. Evolution Path (post-MVP)

Explicitly out of MVP, but the protocol leaves room:
- More LOM operations (device chain, send, return)
- Transport control
- `soniq.audio.*` (let the agent "listen" to output via audio capture)
- Built-in parameter change history / undo
- Multiple VST instances in parallel (not only Serum; e.g., Vital and Pigments simultaneously)
- Remote access (bind 0.0.0.0 + token auth + Tailscale)

## 9. Known Risks and Spike Outcome

### 9.1 Spike results (2026-05-28, Serum 2 on macOS Live 12 Suite + Max 9)

✅ **Directly verified:**
- `vst~` loads Serum 2 inside an M4L device; UI opens.
- `params` returns 2623 parameter names.
- `list <1-based-idx> <value>` actually updates Serum parameters.
- `get -4` returns `-4 2623` (with the query echo prefix).

🟡 **Inferred but not directly retested** (high confidence — same `get` infrastructure):
- `get <num>` reads a single param (outlet 5-from-right, format `<num> <value>`).
- `snapshot N` / `restore N` saves and restores state.

⚪ **Skipped:**
- **Serum 1** retest — deferred by user during the spike. The `vst~` mechanism is plugin-agnostic, so Serum 1 remains in Plan 1 scope but its first formal validation happens at the §6 manual checklist.
- Preset file read/write (`read`/`write`) — not in Plan 1 scope.

### 9.2 Other risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Node for Max's WS server stability across platforms | macOS-only is fine | MVP only commits to macOS |
| Live 12 minor releases change LOM behavior | Future maintenance burden | Protocol version + capability negotiation already in place |
| Serum bumping internal indices on upgrade | Persisted "index 12 = X" breaks | Schema is rebuilt on launch; agents should persist by name, not index |
| Serum 2 exposes ~2080 MIDI passthrough params, drowning the schema | Signal-to-noise drops for the agent | `vst.schema()` filters by default; `includeMidiPassthrough:true` is opt-in (§4.3) |

---

**Document end. Implementation follow-up:**
1. User reviews this spec.
2. On approval, the `superpowers:writing-plans` skill produces the implementation plan under `docs/superpowers/plans/...`.
3. Step 1 of that plan must be the §9 spike.
