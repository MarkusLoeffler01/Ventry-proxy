import { z } from "zod";


export const googleQuerySchema = z.object({
    to: z.string()
});

const ToParam = z.string().regex(/^pr-\d+$/, "Invalid PR target")

export const GoogleCallbackSchema = z.object({
    state: z.string().min(1),
    code: z.string().min(1),
    scope: z.string().min(1).optional(),
    authUser: z.string().optional(),
    prompt: z.string().optional(),
    to: ToParam.optional()
})


export default googleQuerySchema;
export { ToParam };