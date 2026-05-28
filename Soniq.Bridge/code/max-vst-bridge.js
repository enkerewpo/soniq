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

  maxApi.addHandler("pluginName", (name) => {
    state.pluginName = name ? String(name) : null;
  });

  maxApi.addHandler("paramCount", (count) => {
    state.expectedCount = Number(count);
    state.params = [];
    state.values = {};
    fireReady();
  });

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

  maxApi.addHandler("paramValue", (vstIdx, value) => {
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
