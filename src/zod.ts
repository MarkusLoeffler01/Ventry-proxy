import { z } from "zod";

export const ToParam = z.string().regex(/^[a-zA-Z0-9-]+$/, "Invalid target environment");

export const googleQuerySchema = z.object({
    to: ToParam
});

export const GoogleCallbackSchema = z.object({
    state: z.string().min(1),
    code: z.string().min(1),
    scope: z.string().optional(),
    authuser: z.string().optional(),
    prompt: z.string().optional(),
});

export const StateSchema = z.object({
    to: ToParam,
    nonce: z.string().min(1)
});

export default googleQuerySchema;