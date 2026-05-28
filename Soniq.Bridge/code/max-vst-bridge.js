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
//     "pluginName <name>"            — from vst~'s name introspection (patch wiring TBD)
//
// MIDI passthrough filter is applied in getSchema(), not at storage time.

const MIDI_PASSTHROUGH_NAME_REGEX = /^(CC\d+|Pitch Bend|Aftertouch) Chan \d+$/;

function createMaxVstBridge(maxApi) {
  const state = {
    pluginName: null,
    params: [],
    values: {},
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

  // Optional verbose logging: set SONIQ_DEBUG=1 to trace handler invocations.
  // Off by default to keep the Max console clean during normal use.
  const debug = process.env.SONIQ_DEBUG === "1";
  const dbg = { pluginName: 0, paramCount: 0, paramName: 0, paramValue: 0 };
  const tick = (key) => {
    if (!debug) return;
    dbg[key]++;
    if (dbg[key] === 1 || dbg[key] === 500 || dbg[key] === 2000 || dbg[key] % 1000 === 0) {
      maxApi.post(`[soniq][debug] ${key} fired ${dbg[key]} times`);
    }
  };

  maxApi.addHandler("pluginName", (name) => {
    tick("pluginName");
    state.pluginName = name ? String(name) : null;
    if (debug) maxApi.post(`[soniq][debug] pluginName='${state.pluginName}'`);
  });

  maxApi.addHandler("paramCount", (count) => {
    tick("paramCount");
    state.expectedCount = Number(count);
    state.params = [];
    state.values = {};
    if (debug) maxApi.post(`[soniq][debug] paramCount=${count}`);
    fireReady();
  });

  maxApi.addHandler("paramName", (name) => {
    tick("paramName");
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

  maxApi.addHandler("paramValue", (vstIdx, value) => {
    tick("paramValue");
    const protocolIndex = Number(vstIdx) - 1;
    const v = Number(value);
    state.values[protocolIndex] = v;
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
      const vstIdx = w.index + 1;
      maxApi.outlet("list", vstIdx, w.value);
      state.values[w.index] = w.value;
      echo.push({ index: w.index, actualValue: w.value });
    }
    return { ok: true, echo };
  }

  maxApi.outlet("query-schema");

  return { getSchema, readValues, writeValues };
}

module.exports = { createMaxVstBridge, MIDI_PASSTHROUGH_NAME_REGEX };
