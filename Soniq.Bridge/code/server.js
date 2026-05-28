const WebSocket = require("ws");
const { execSync } = require("node:child_process");
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

function killZombiesOnPort(port, maxApi) {
  try {
    const out = execSync(`lsof -ti :${port}`, { encoding: "utf8", timeout: 2000 }).trim();
    if (!out) return false;
    const ownPid = String(process.pid);
    const pids = out.split("\n").filter((p) => p && p !== ownPid);
    if (pids.length === 0) return false;
    if (maxApi) maxApi.post(`[soniq] killing zombie PID(s) holding port ${port}: ${pids.join(",")}`);
    execSync(`kill -9 ${pids.join(" ")}`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

function listenWithRetry(port, host, { maxApi, softRetries = 3, delayMs = 500 } = {}) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    let killedZombies = false;
    const tryOnce = () => {
      const wss = new WebSocket.Server({ port, host });
      const onError = (err) => {
        wss.removeAllListeners();
        if (err.code !== "EADDRINUSE") {
          reject(err);
          return;
        }
        // First, soft retries with short delay (lets the old process exit
        // naturally on SIGTERM and the kernel release the socket).
        if (attempt < softRetries) {
          attempt++;
          if (maxApi) {
            maxApi.post(`[soniq] port ${port} busy; soft retry ${attempt}/${softRetries} in ${delayMs}ms`);
          }
          setTimeout(tryOnce, delayMs);
          return;
        }
        // After soft retries fail, find and kill whoever holds the port.
        // Last-resort recovery for stuck zombie processes.
        if (!killedZombies) {
          killedZombies = killZombiesOnPort(port, maxApi);
          setTimeout(tryOnce, delayMs);
          return;
        }
        // Already killed zombies and still EADDRINUSE → give up.
        reject(err);
      };
      wss.once("error", onError);
      wss.once("listening", () => {
        wss.removeListener("error", onError);
        resolve(wss);
      });
    };
    tryOnce();
  });
}

async function startServer({ port = 9123, host = "127.0.0.1", maxApi } = {}) {
  const router = createRouter();
  const wss = await listenWithRetry(port, host, { maxApi });
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
    wss,
    close: () =>
      new Promise((res) => {
        // Force-terminate any active client sockets so wss.close() does not
        // block waiting for them. Without this, an MCP client that is still
        // connected keeps the port held until OS-level timeout (~minutes).
        for (const client of wss.clients) {
          try { client.terminate(); } catch {}
        }
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
    let activeSrv = null;
    (async () => {
      activeSrv = await startServer({ port: 9123, host: "127.0.0.1", maxApi });
      const bridge = createMaxVstBridge(maxApi);
      registerVst(activeSrv.router, bridge);
      maxApi.post(`[soniq] node ${process.version} ${process.platform}/${process.arch}`);
      maxApi.post(`[soniq] WebSocket RPC listening on 127.0.0.1:${activeSrv.port}`);
    })().catch((err) => {
      maxApi.post(`[soniq] startup error: ${err.message}`);
    });

    // Graceful shutdown: when node.script stops the process, force-close any
    // open WS connections and the server socket so the port releases before
    // the next start tries to bind it. Bound a hard 500ms deadline so even if
    // close() hangs we still exit.
    let shuttingDown = false;
    const shutdown = (sig) => {
      if (shuttingDown) return;
      shuttingDown = true;
      maxApi.post(`[soniq] received ${sig}, releasing port`);
      const hardExit = setTimeout(() => process.exit(0), 500);
      if (activeSrv) {
        activeSrv.close().finally(() => {
          clearTimeout(hardExit);
          process.exit(0);
        });
      } else {
        clearTimeout(hardExit);
        process.exit(0);
      }
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGHUP", () => shutdown("SIGHUP"));
    // Synchronous last-ditch cleanup if Node for Max calls process.exit()
    // without sending a signal first. We can't await close() here, but we
    // can terminate clients and close the listen socket synchronously.
    process.on("exit", () => {
      if (activeSrv) {
        try {
          for (const c of activeSrv.wss.clients) c.terminate();
          activeSrv.wss.close();
        } catch {}
      }
    });
  }
}
