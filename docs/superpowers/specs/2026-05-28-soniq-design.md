# Soniq — Ableton Live 12 ↔ Coding Agent 桥接系统 设计文档

- **日期**：2026-05-28
- **代号**：`soniq`
- **目标用户**：单用户（本机），希望让 coding agent（Claude Code 等）辅助 Serum 音色设计与基础 track/MIDI 操作

## 1. 目标与非目标

### 1.1 目标
1. 让外部 coding agent（默认 Claude Code，通过 MCP）能：
   - 列出 / 创建 / 选择 Ableton Live 12 的 track
   - 读取与写入 Serum 1 / Serum 2 的**完整参数空间**（突破 Live 自身 128 参数 Configure 限制）
   - 生成基础 MIDI（在某条 clip 上写音符）、播放试听音
2. 系统应**VST agnostic**：协议本身不绑死 Serum，更换其他 VST 时通过运行时反射拿到 schema 即可工作。
3. 严格本机 single-user，无鉴权，WebSocket 监听 `127.0.0.1`。
4. Agent 拿到的"参数意义"只来自参数名与运行时元数据；专家知识由 agent 自行获取（联网查手册或读用户提供的本地文档）——本系统**不**内置 Serum 知识库。

### 1.2 非目标（MVP 范围之外）
- 不做多用户 / SaaS / 鉴权
- 不内置 Serum / 任何 VST 的领域知识库
- 不做完整 Live 远控（如完整 transport、scene 编辑、mixer 自动化）—— track / MIDI 都只做"吃透一点"的最小子集
- 不做 audio 录制 / 让 agent 听声音
- 不做 .fxp 离线解析（Serum 自身的 preset save/load 路径已够 MVP）

## 2. 架构总图

```
┌─────────────────────────────────────┐         ┌─────────────────────────┐
│  Claude Code / 任何 MCP-aware agent   │ stdio  │  MCP Server (TS)         │
│  调 MCP tools                        │◄──────►│  - 包装 WS RPC 为 tools   │
└─────────────────────────────────────┘         │  - 缓存 schema、节流写入   │
                                                 │  - 错误规范化              │
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
                          │  │  │  RPC router) │  │  - vst~ (host Serum)      │ │  │
                          │  │  └──────┬───────┘  │  - live.observer 桥接     │ │  │
                          │  └─────────┼──────────┴──────────────────────────┘  │
                          │            │                                          │
                          │      Live Object Model (LOM)                           │
                          │      - live_set.tracks / clip_slots / clips           │
                          │      - this_device.parameters                          │
                          └──────────────────────────────────────────────────────┘
```

### 2.1 三个进程
1. **MCP Server**（独立 Node 进程，用户启动 Claude Code 时由 Claude Code 自动启动）
2. **M4L 设备 `Soniq.Bridge.amxd`**（装在 Live 的一条 MIDI track 上，内部跑 Node for Max + Max patch + `vst~` 加载 Serum）
3. **Agent 本身**（Claude Code / 别的 MCP client）

### 2.2 两条独立的功能链路
| 功能 | 路径 |
|------|------|
| Track / MIDI / 通用 LOM 操作 | M4L 通过 `live.path` + `live.object` 直接走 Live API |
| Serum 参数读写 | M4L 内 `vst~` 直接操作 Serum 实例 —— **完全绕开** Live 128 Configure 限 |

### 2.3 关键技术决策记录
- **Serum 装进 M4L 而非常规 track**：唯一能拿到全部参数的路径。代价：失去 track 上 VST 的部分原生体验（Push 集成、原生预设浏览器一致性）。这是已知接受的权衡。
- **Node for Max + TS MCP**：M4L 现代脚本路径，能跑 `ws` npm 包；TS 是 MCP SDK 头等公民；两端共享 JSON 协议 schema。
- **JSON-RPC 2.0 over WebSocket**：行业标准、错误码体系完整、易于调试。

## 3. 模块分解

### 3.1 仓库布局

```
soniq/
├── device/                          # M4L 设备
│   ├── Soniq.Bridge.amxd            # Max 设备文件（二进制）
│   ├── patchers/                    # 拆分的子 patch（便于版本控制 / diff）
│   │   ├── main.maxpat              # 顶层
│   │   ├── vst-host.maxpat          # vst~ + 参数桥接
│   │   └── lom-bridge.maxpat        # live.path / observer 包装
│   └── code/                        # Node for Max 脚本
│       ├── server.js                # WebSocket server + RPC 路由
│       ├── rpc/
│       │   ├── tracks.js            # tracks.* 方法
│       │   ├── vst.js               # vst.* 方法
│       │   └── midi.js              # midi.* 方法
│       ├── protocol.schema.json     # 构建时从 shared/protocol.ts 生成
│       └── package.json
├── mcp-server/                      # MCP 转接层
│   ├── src/
│   │   ├── index.ts                 # stdio MCP server 入口
│   │   ├── tools/                   # 每个 MCP tool 一个文件
│   │   │   ├── listTracks.ts
│   │   │   ├── readVstSchema.ts
│   │   │   ├── setVstParam.ts
│   │   │   └── ...
│   │   ├── client.ts                # WS client，管理重连/超时
│   │   └── schema.ts                # 共享类型（zod）
│   └── package.json
├── shared/
│   └── protocol.ts                  # JSON-RPC 方法签名、wire 类型定义（单一可信源）
├── tests/
│   └── manual-verify.md             # M4L 端手测 checklist
└── docs/superpowers/specs/          # 设计文档
```

### 3.2 组件职责矩阵

| 组件 | 职责 | 依赖 | 不负责 |
|------|------|------|--------|
| **M4L Max patch** | 提供 LOM 接入点（`live.path` / `live.object`）和 `vst~` 宿主 | Live API、Max 对象 | 任何 RPC 路由逻辑 |
| **Node for Max 脚本** | WS server + JSON-RPC 路由 + 把请求翻译成 Max 消息 | `ws` npm 包、`max-api` | 不直接调 LOM（通过 Max patch 中转） |
| **MCP server (TS)** | stdio↔WS 适配；把 JSON-RPC 包装为 MCP tools；schema 缓存 | `@modelcontextprotocol/sdk`、`ws`、`zod` | 不直接连 Live |
| **shared/protocol.ts** | 单一可信源的 wire 协议类型 | 无 | 无行为 |

### 3.3 边界检验
- 不读 Max patch 内部就能回答"Node for Max 暴露什么 RPC 方法吗" —— `rpc/*.js` 一看即知
- MCP server 不知道 Live 存在 —— 只知道有个 WS endpoint 说 JSON-RPC
- Max patch 不知道 WebSocket 存在 —— 只知道 Node for Max 给它发 Max 消息

### 3.4 Schema 共享
`shared/protocol.ts` 是 TS 源；构建步骤将其编译为 `device/code/protocol.schema.json`（运行时校验）和 `mcp-server/src/schema.ts`（类型）。版本号写入协议，握手时双向校验。Node for Max 不能直接 import `.ts`，所以走"TS → JSON Schema"的构建路径。

## 4. 协议规范

### 4.1 Wire 格式
JSON-RPC 2.0 over WebSocket，UTF-8，每个 WS message 一个 JSON-RPC frame。

### 4.2 握手
M4L 设备实例化时 Node for Max 启动 WS server（监听 `127.0.0.1:9123`）。MCP server 启动后连入并发握手：

```
client → server:  {"jsonrpc":"2.0","method":"soniq.hello","params":{"version":"0.1.0"},"id":1}
server → client:  {"jsonrpc":"2.0","result":{"version":"0.1.0","capabilities":["tracks","vst","midi"]},"id":1}
```

版本不匹配 → server 返回 JSON-RPC error `code: -32001 VersionMismatch`，client 断开。

### 4.3 方法清单（MVP）

#### `soniq.tracks.*`
```
tracks.list()                        → [{index, name, type:"midi"|"audio", armed, muted}]
tracks.select(index)                 → {ok:true}
tracks.create(type:"midi"|"audio", name?) → {index}
```

#### `soniq.vst.*`
```
vst.schema()                         → {pluginName, paramCount,
                                         params:[{index,name,min,max,default,unit,group?}]}
vst.read(indices:number[])           → [{index, value, displayValue}]
vst.write(writes:[{index,value}])    → {ok:true, echo:[{index,actualValue}]}
vst.savePreset(path:string)          → {path}      # 走 vst~ 的 state-chunk 保存机制
vst.loadPreset(path:string)          → {ok:true}   # 读取上一行保存的 state-chunk 文件
```

#### `soniq.midi.*`
```
midi.testTone(note:number, velocity:number, durationMs:number) → {ok:true}
midi.setClipNotes(trackIdx, clipIdx,
                  notes:[{pitch,start,duration,velocity}])      → {ok:true}
```

### 4.4 Server → Client 通知（无 id）
```
soniq.event.paramChanged       {index, value, source:"user"|"agent"}
soniq.event.schemaReloaded     {pluginName, paramCount}
```
（`transportChanged` 事件留待 §8 阶段引入，MVP 不实现，避免实现没有对应方法的事件源。）

### 4.5 端到端示例：一次 Serum 参数写入

```
1. Claude Code 调 MCP tool: set_vst_param(index=12, value=0.7)
2. MCP server → WS:
   {"method":"soniq.vst.write","params":{"writes":[{"index":12,"value":0.7}]},"id":42}
3. Node for Max 路由 vst.js handler，发 Max 消息: [vst-host setparam 12 0.7]
4. Max patch 把消息送到 vst~ → Serum 内部参数被改写
5. live.observer 监听到参数变化
6. Node for Max 回 client:
   {"result":{"ok":true,"echo":[{"index":12,"actualValue":0.6996}]},"id":42}
7. MCP tool 返回给 Claude，含实际写入值（量化后可能略不同）
```

### 4.6 Schema 反射
M4L 设备首次实例化时：
1. Max patch 向 `vst~` 发 `params` 查询 → 收到 N 个 `param N name min max` 消息
2. Node for Max 累积成 schema 数组并缓存
3. Client 调 `vst.schema()` 时直接返回缓存
4. 换 Serum 1 ↔ Serum 2 或替换 VST 时触发 `soniq.event.schemaReloaded`，client 清缓存重取

### 4.7 节流与顺序
- MCP server 端把 50ms 内的多个 `vst.write` 同一 index 调用合并为最后一个值
- 不同 index 的写入按到达顺序一对一映射成一个 batch 请求
- Live API 调用本身在 Max patch 端是顺序消息流，天然单线程

## 5. 错误处理

### 5.1 分层失败模式

| 失败点 | 表现 | 处理 |
|--------|------|------|
| MCP client 启动时 WS 连不上 | M4L 设备没装 / Live 没开 | MCP server 进入"等待"状态，每 2s 重连；tool 调用返回 `LiveNotReachable`，错误信息告诉 agent 让用户检查 |
| WS 连接中途断开 | 用户拔了 M4L 设备 / 重启 Live | 标记所有未完成请求 fail，停止接受新请求，进入重连循环 |
| `vst~` 没加载 Serum | Serum 没装 / 用户没选 VST | `vst.schema()` 返回 `{pluginName:null, paramCount:0}`；写参数返回 `VstNotLoaded` |
| JSON-RPC 调用超时（>5s） | Live 卡了 / Max 死锁 | client 端超时 → `RequestTimeout`；不重试 |
| 参数 index 越界 / 值超范围 | agent 传错 | server 端立即返回 `-32602 InvalidParams`，不传给 Live |
| 用户在 Serum UI 同时改参数 | 与 agent 写入冲突 | "后写者胜" + 通过 `paramChanged` 事件通知 agent，不做锁 |

### 5.2 错误码（自定义部分）
- `-32001 VersionMismatch`
- `-32002 LiveNotReachable`
- `-32003 VstNotLoaded`
- `-32004 RequestTimeout`
- `-32005 SchemaStale`（client schema 缓存与 server 不一致，须重取）

### 5.3 反模式（明确禁止）
- 不静默吞错
- 不对 Live API 调用做内部重试（写入重试有副作用风险，让 agent 决策）
- 不为不可能的状态加防御代码（信任 Max 单线程消息流）

## 6. 测试策略

### 6.1 三层覆盖

1. **`shared/protocol.ts` 单元测试**（vitest）
   - zod schema 编解码
   - 版本号匹配
   - 完全离线，秒级反馈

2. **MCP server 集成测试**（vitest + fake WS server）
   - 连不上场景
   - 连接中断恢复
   - 调用超时
   - 错误码透传
   - 节流合并
   - **不需要 Live 在运行**

3. **手测 + 录脚本验收 M4L 端**
   - 写一份 `tests/manual-verify.md` checklist
   - 装设备 → 看 schema 返回 → 写参数听到声音变化 → 拔设备 client 报错正确
   - 每个 PR 跑一次

### 6.2 不写的测试
- 不写 Live API 的 mock（成本高且行为不稳）
- 不为 Serum 写专门 fixture（VST agnostic 是目标，靠真实 `vst~` 加载验证）

## 7. 环境前提（实施前用户需准备）

| 项 | 说明 |
|----|------|
| macOS | Darwin（已确认） |
| Ableton Live 12 Suite | 含 Max for Live |
| Max 8 / Max 9 | M4L 自带的就够，开发期可能想装独立 Max 编辑器 |
| Serum 1 和/或 Serum 2 | VST3 64-bit |
| Node.js ≥ 20 | MCP server 运行时 |
| Claude Code | MCP client |

## 8. 演进路径（MVP 之后）

明确**不**在 MVP 里，但协议设计要为之留口子：
- 更多 LOM 操作（device chain、send、return）
- Transport 控制
- `soniq.audio.*`（让 agent "听" 输出，配合 audio capture）
- 内置参数变更历史 / undo
- 多 VST 实例并行（不仅 Serum，比如同时挂 Vital、Pigments）
- 远程接入（绑定 0.0.0.0 + token 鉴权 + Tailscale）

## 9. 已知风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| `vst~` 在 M4L 中加载 Serum 2 的稳定性未验证 | 整个核心方案不通 | **实施第一步就是 spike**：手动建 M4L 设备，`vst~` 分别加载 Serum 1 与 Serum 2，能开 UI、改参数、保存预设 —— 两者都通过才继续 |
| Node for Max 的 WS server 跨平台稳定性（macOS focus） | 仅 macOS 用 OK | MVP 仅承诺 macOS |
| Live 12 升级到 12.x 后 LOM 行为变 | 后续维护成本 | 协议版本号 + capabilities 协商已留 |
| Serum 2 参数名变化 / 内部 index 不稳 | 用户保存的"参数 12 = X"在 Serum 升级后失效 | 始终按 name 寻参（schema 自动重建），不按 index 长期持久化 |

---

**本文档收敛后续步骤：**
1. 用户审阅本 spec
2. 通过后，由 `superpowers:writing-plans` skill 生成实施计划（`docs/superpowers/plans/...`）
3. 实施计划首步必须是 §9 的"vst~ 加载 Serum spike"
