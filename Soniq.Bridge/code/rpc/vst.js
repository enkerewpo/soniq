function registerVst(router, vstBridge) {
  router.register("soniq.vst.schema", async (params) => {
    const opts = (params && typeof params === "object") ? params : {};
    const includeMidiPassthrough = opts.includeMidiPassthrough === true;
    // Trust the bridge: if it returns paramCount>0, return as-is. pluginName=null
    // is acceptable since the patch may not wire a pluginName outlet yet.
    return vstBridge.getSchema({ includeMidiPassthrough });
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
