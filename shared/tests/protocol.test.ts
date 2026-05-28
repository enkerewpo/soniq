import { describe, it, expect } from "vitest";
import { HelloParams, HelloResult, PROTOCOL_VERSION } from "../src/index.js";

describe("HelloParams", () => {
  it("accepts matching version", () => {
    const result = HelloParams.safeParse({ version: PROTOCOL_VERSION });
    expect(result.success).toBe(true);
  });

  it("rejects missing version", () => {
    const result = HelloParams.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string version", () => {
    const result = HelloParams.safeParse({ version: 1 });
    expect(result.success).toBe(false);
  });
});

describe("HelloResult", () => {
  it("accepts well-formed result", () => {
    const result = HelloResult.safeParse({
      version: "0.1.0",
      capabilities: ["vst"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown capability", () => {
    const result = HelloResult.safeParse({
      version: "0.1.0",
      capabilities: ["lasers"],
    });
    expect(result.success).toBe(false);
  });
});

import { VstSchemaResult, VstReadParams, VstWriteParams, VstParamSpec, MIDI_PASSTHROUGH_NAME_REGEX } from "../src/index.js";

describe("VstParamSpec", () => {
  it("accepts normalized 0..1 param (VST3 convention)", () => {
    const result = VstParamSpec.safeParse({
      index: 0,
      name: "Main Vol",
      min: 0,
      max: 1,
      default: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional group", () => {
    const result = VstParamSpec.safeParse({
      index: 0,
      name: "Filter Cutoff",
      min: 0,
      max: 1,
      default: 0.5,
      group: "Filter 1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects min > max", () => {
    const result = VstParamSpec.safeParse({
      index: 0,
      name: "Bad",
      min: 1,
      max: 0,
      default: 0.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("MIDI_PASSTHROUGH_NAME_REGEX", () => {
  it("matches MIDI CC params", () => {
    expect("CC0 Chan 1").toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
    expect("CC127 Chan 16").toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
  });
  it("matches Pitch Bend / Aftertouch params", () => {
    expect("Pitch Bend Chan 1").toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
    expect("Aftertouch Chan 16").toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
  });
  it("does NOT match synthesis params", () => {
    expect("Main Vol").not.toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
    expect("A Warp Mode").not.toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
    expect("LFO 3 Rate").not.toMatch(MIDI_PASSTHROUGH_NAME_REGEX);
  });
});

describe("VstSchemaResult", () => {
  it("accepts loaded plugin", () => {
    const result = VstSchemaResult.safeParse({
      pluginName: "Serum 2",
      paramCount: 1,
      params: [{ index: 0, name: "Master Gain", min: 0, max: 1, default: 0.8 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts unloaded plugin (null name, zero count)", () => {
    const result = VstSchemaResult.safeParse({
      pluginName: null,
      paramCount: 0,
      params: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("VstWriteParams", () => {
  it("accepts batch", () => {
    const result = VstWriteParams.safeParse({
      writes: [{ index: 0, value: 0.5 }, { index: 12, value: 0.7 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty batch", () => {
    const result = VstWriteParams.safeParse({ writes: [] });
    expect(result.success).toBe(false);
  });
});
