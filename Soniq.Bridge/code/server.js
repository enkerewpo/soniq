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

// --- Node for Max bootstrap ---
// If max-api can be required, we're inside Max's node.script (M4L).
// Otherwise (tests in plain Node), this block is a no-op.
{
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
      maxApi.post(`[soniq] node ${process.version} ${process.platform}/${process.arch}`);
      maxApi.post(`[soniq] WebSocket RPC listening on 127.0.0.1:${srv.port}`);
    })().catch((err) => {
      maxApi.post(`[soniq] startup error: ${err.message}`);
    });
  }
}
