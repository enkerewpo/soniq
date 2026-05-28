import { z } from "zod";

export const PROTOCOL_VERSION = "0.1.0" as const;

export const Capability = z.enum(["tracks", "vst", "midi"]);
export type Capability = z.infer<typeof Capability>;

export const HelloParams = z.object({
  version: z.string(),
});
export type HelloParams = z.infer<typeof HelloParams>;

export const HelloResult = z.object({
  version: z.string(),
  capabilities: z.array(Capability),
});
export type HelloResult = z.infer<typeof HelloResult>;

// Per spike findings (2026-05-28): vst~ reports normalized 0..1 only, no unit/display.
// min/max are always 0/1 for VST3 normalized params; kept as fields for future-proofing.
export const VstParamSpec = z
  .object({
    index: z.number().int().nonnegative(),  // 0-based; Max patch converts to 1-based
    name: z.string().min(1),
    min: z.number(),
    max: z.number(),
    default: z.number(),
    group: z.string().optional(),
  })
  .refine((p) => p.min <= p.max, { message: "min must be <= max" });
export type VstParamSpec = z.infer<typeof VstParamSpec>;

export const VstSchemaParams = z.object({
  includeMidiPassthrough: z.boolean().default(false),
});
export type VstSchemaParams = z.infer<typeof VstSchemaParams>;

export const VstSchemaResult = z.object({
  pluginName: z.string().nullable(),
  paramCount: z.number().int().nonnegative(),
  params: z.array(VstParamSpec),
});
export type VstSchemaResult = z.infer<typeof VstSchemaResult>;

export const VstReadParams = z.object({
  indices: z.array(z.number().int().nonnegative()).min(1),
});
export type VstReadParams = z.infer<typeof VstReadParams>;

export const VstReadResult = z.array(
  z.object({
    index: z.number().int().nonnegative(),
    value: z.number(),
  })
);
export type VstReadResult = z.infer<typeof VstReadResult>;

export const VstWriteParams = z.object({
  writes: z
    .array(z.object({ index: z.number().int().nonnegative(), value: z.number() }))
    .min(1),
});
export type VstWriteParams = z.infer<typeof VstWriteParams>;

export const VstWriteResult = z.object({
  ok: z.literal(true),
  echo: z.array(
    z.object({ index: z.number().int().nonnegative(), actualValue: z.number() })
  ),
});
export type VstWriteResult = z.infer<typeof VstWriteResult>;

// Names matching this pattern are MIDI input passthrough and are filtered from
// vst.schema() by default (Serum 2 exposes ~2080 of them).
export const MIDI_PASSTHROUGH_NAME_REGEX = /^(CC\d+|Pitch Bend|Aftertouch) Chan \d+$/;

export const RPC_METHODS = {
  hello: "soniq.hello",
  vstSchema: "soniq.vst.schema",
  vstRead: "soniq.vst.read",
  vstWrite: "soniq.vst.write",
} as const;
export type RpcMethod = (typeof RPC_METHODS)[keyof typeof RPC_METHODS];

export const RPC_ERROR_CODES = {
  VersionMismatch: -32001,
  LiveNotReachable: -32002,
  VstNotLoaded: -32003,
  RequestTimeout: -32004,
  SchemaStale: -32005,
} as const;
