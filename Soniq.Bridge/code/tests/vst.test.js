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
    assert.equal(response.result.paramCount, 2);
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
    assert.equal(response.result[0].displayValue, undefined);
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
    assert.equal(response.error.code, -32602);
    ws.close();
  });
});
