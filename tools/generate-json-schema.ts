import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  HelloParams,
  HelloResult,
  VstSchemaParams,
  VstSchemaResult,
  VstReadParams,
  VstReadResult,
  VstWriteParams,
  VstWriteResult,
  PROTOCOL_VERSION,
} from "../shared/src/protocol.js";

const out = {
  protocolVersion: PROTOCOL_VERSION,
  schemas: {
    HelloParams: zodToJsonSchema(HelloParams, "HelloParams"),
    HelloResult: zodToJsonSchema(HelloResult, "HelloResult"),
    VstSchemaParams: zodToJsonSchema(VstSchemaParams, "VstSchemaParams"),
    VstSchemaResult: zodToJsonSchema(VstSchemaResult, "VstSchemaResult"),
    VstReadParams: zodToJsonSchema(VstReadParams, "VstReadParams"),
    VstReadResult: zodToJsonSchema(VstReadResult, "VstReadResult"),
    VstWriteParams: zodToJsonSchema(VstWriteParams, "VstWriteParams"),
    VstWriteResult: zodToJsonSchema(VstWriteResult, "VstWriteResult"),
  },
};

const target = "device/code/protocol.schema.json";
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out, null, 2));
console.log(`Wrote ${target}`);
