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
