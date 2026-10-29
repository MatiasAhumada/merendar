import { z } from "zod";

export const stringSchema = z.string();
export const errorMessageSchema = z.object({ message: z.string() });
export const apiErrorResponseSchema = z.object({ error: errorMessageSchema });
