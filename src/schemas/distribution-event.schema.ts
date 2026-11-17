import { z } from "zod";

export const distributionEventStatusChangeSchema = z.object({
  status: z.enum(["ABIERTA", "CERRADA"]),
  expectedStatus: z.enum(["ABIERTA", "CERRADA"]),
}).strict().refine((change) => change.status !== change.expectedStatus, {
  message: "La transición de estado no es válida.",
});
