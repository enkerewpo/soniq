import { z } from "zod";
export declare const PROTOCOL_VERSION: "0.1.0";
export declare const Capability: z.ZodEnum<["tracks", "vst", "midi"]>;
export type Capability = z.infer<typeof Capability>;
export declare const HelloParams: z.ZodObject<{
    version: z.ZodString;
}, "strip", z.ZodTypeAny, {
    version: string;
}, {
    version: string;
}>;
export type HelloParams = z.infer<typeof HelloParams>;
export declare const HelloResult: z.ZodObject<{
    version: z.ZodString;
    capabilities: z.ZodArray<z.ZodEnum<["tracks", "vst", "midi"]>, "many">;
}, "strip", z.ZodTypeAny, {
    version: string;
    capabilities: ("tracks" | "vst" | "midi")[];
}, {
    version: string;
    capabilities: ("tracks" | "vst" | "midi")[];
}>;
export type HelloResult = z.infer<typeof HelloResult>;
export declare const VstParamSpec: z.ZodEffects<z.ZodObject<{
    index: z.ZodNumber;
    name: z.ZodString;
    min: z.ZodNumber;
    max: z.ZodNumber;
    default: z.ZodNumber;
    group: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    index: number;
    name: string;
    min: number;
    max: number;
    default: number;
    group?: string | undefined;
}, {
    index: number;
    name: string;
    min: number;
    max: number;
    default: number;
    group?: string | undefined;
}>, {
    index: number;
    name: string;
    min: number;
    max: number;
    default: number;
    group?: string | undefined;
}, {
    index: number;
    name: string;
    min: number;
    max: number;
    default: number;
    group?: string | undefined;
}>;
export type VstParamSpec = z.infer<typeof VstParamSpec>;
export declare const VstSchemaParams: z.ZodObject<{
    includeMidiPassthrough: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    includeMidiPassthrough: boolean;
}, {
    includeMidiPassthrough?: boolean | undefined;
}>;
export type VstSchemaParams = z.infer<typeof VstSchemaParams>;
export declare const VstSchemaResult: z.ZodObject<{
    pluginName: z.ZodNullable<z.ZodString>;
    paramCount: z.ZodNumber;
    params: z.ZodArray<z.ZodEffects<z.ZodObject<{
        index: z.ZodNumber;
        name: z.ZodString;
        min: z.ZodNumber;
        max: z.ZodNumber;
        default: z.ZodNumber;
        group: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        index: number;
        name: string;
        min: number;
        max: number;
        default: number;
        group?: string | undefined;
    }, {
        index: number;
        name: string;
        min: number;
        max: number;
        default: number;
        group?: string | undefined;
    }>, {
        index: number;
        name: string;
        min: number;
        max: number;
        default: number;
        group?: string | undefined;
    }, {
        index: number;
        name: string;
        min: number;
        max: number;
        default: number;
        group?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    params: {
        index: number;
        name: string;
        min: number;
        max: number;
        default: number;
        group?: string | undefined;
    }[];
    pluginName: string | null;
    paramCount: number;
}, {
    params: {
        index: number;
        name: string;
        min: number;
        max: number;
        default: number;
        group?: string | undefined;
    }[];
    pluginName: string | null;
    paramCount: number;
}>;
export type VstSchemaResult = z.infer<typeof VstSchemaResult>;
export declare const VstReadParams: z.ZodObject<{
    indices: z.ZodArray<z.ZodNumber, "many">;
}, "strip", z.ZodTypeAny, {
    indices: number[];
}, {
    indices: number[];
}>;
export type VstReadParams = z.infer<typeof VstReadParams>;
export declare const VstReadResult: z.ZodArray<z.ZodObject<{
    index: z.ZodNumber;
    value: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    value: number;
    index: number;
}, {
    value: number;
    index: number;
}>, "many">;
export type VstReadResult = z.infer<typeof VstReadResult>;
export declare const VstWriteParams: z.ZodObject<{
    writes: z.ZodArray<z.ZodObject<{
        index: z.ZodNumber;
        value: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        value: number;
        index: number;
    }, {
        value: number;
        index: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    writes: {
        value: number;
        index: number;
    }[];
}, {
    writes: {
        value: number;
        index: number;
    }[];
}>;
export type VstWriteParams = z.infer<typeof VstWriteParams>;
export declare const VstWriteResult: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    echo: z.ZodArray<z.ZodObject<{
        index: z.ZodNumber;
        actualValue: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        index: number;
        actualValue: number;
    }, {
        index: number;
        actualValue: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    ok: true;
    echo: {
        index: number;
        actualValue: number;
    }[];
}, {
    ok: true;
    echo: {
        index: number;
        actualValue: number;
    }[];
}>;
export type VstWriteResult = z.infer<typeof VstWriteResult>;
export declare const MIDI_PASSTHROUGH_NAME_REGEX: RegExp;
export declare const RPC_METHODS: {
    readonly hello: "soniq.hello";
    readonly vstSchema: "soniq.vst.schema";
    readonly vstRead: "soniq.vst.read";
    readonly vstWrite: "soniq.vst.write";
};
export type RpcMethod = (typeof RPC_METHODS)[keyof typeof RPC_METHODS];
export declare const RPC_ERROR_CODES: {
    readonly VersionMismatch: -32001;
    readonly LiveNotReachable: -32002;
    readonly VstNotLoaded: -32003;
    readonly RequestTimeout: -32004;
    readonly SchemaStale: -32005;
};
//# sourceMappingURL=protocol.d.ts.map