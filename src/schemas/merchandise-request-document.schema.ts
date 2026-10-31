import { z } from "zod";

export const merchandiseRequestDocumentTemplateSchema = z.object({
  associationName: z.string().trim().min(2).max(160),
  resolution: z.string().trim().max(120),
  address: z.string().trim().max(200),
  contact: z.string().trim().max(160),
  recipient: z.string().trim().min(2).max(160),
  recipientTitle: z.string().trim().max(160),
  locality: z.string().trim().min(2).max(120),
  issueDate: z.iso.date(),
  requestedPeriod: z.string().trim().min(2).max(120),
  purpose: z.string().trim().min(5).max(1000),
  population: z.string().trim().max(240),
  observations: z.string().trim().max(1000),
  signatories: z.array(z.object({ name: z.string().trim().min(2).max(120), title: z.string().trim().min(2).max(120) }).strict()).min(1).max(4),
  logoDataUrl: z.string().max(400_000).regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/),
}).strict();

export const merchandiseRequestDocumentPayloadSchema = z.object({
  kind: z.literal("request-document"),
  id: z.string().trim().min(1).max(80),
  requestId: z.string().trim().min(1).max(80),
  documentKind: z.enum(["MODULES", "MERENDERO_SUPPLIES"]),
  template: merchandiseRequestDocumentTemplateSchema,
}).strict();

export const merchandiseRequestDocumentSnapshotSchema = z.object({
  template: merchandiseRequestDocumentTemplateSchema,
  request: z.object({
    requestNumber: z.string(),
    requestedAt: z.iso.datetime(),
    requestedQuantity: z.number(),
    period: z.object({ label: z.string(), agency: z.string() }).strict(),
    items: z.array(z.object({
      productName: z.string(),
      presentation: z.string(),
      unit: z.string(),
      requestedQuantity: z.number(),
    }).strict()),
  }).strict(),
}).strict();
