import { createHash } from "node:crypto";
import { OFFLINE_OPERATION_MESSAGES, SYNC_MESSAGES } from "@/constants/offline.constant";
import { RENDITION_LIMITS } from "@/constants/rendition.constant";
import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AUTH } from "@/constants/auth.constant";
import { authService } from "@/server/services/auth.service";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { processSynchronizationRequest } from "@/server/services/synchronization-request.service";

const privateHeaders = PRIVATE_RESPONSE_HEADERS;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: privateHeaders });
}

async function validateAttachments(value: unknown, formData: FormData, consumedAttachments: Set<string>, attachments: Map<string, Uint8Array>, totalBytes: { value: number }): Promise<unknown> {
  const record = z.record(z.string(), z.unknown()).safeParse(value);
  if (!record.success) {
    if (Array.isArray(value)) {
      return await Promise.all(value.map((entry) => validateAttachments(entry, formData, consumedAttachments, attachments, totalBytes)));
    }
    return value;
  }

  const attachmentId = z.uuid().safeParse(record.data.attachmentId);
  if (attachmentId.success) {
    const file = formData.get(`attachment:${attachmentId.data}`);
    const byteSize = z.number().int().positive().safeParse(record.data.byteSize);
    const checksum = z.string().regex(/^[a-f0-9]{64}$/).safeParse(record.data.checksum);
    if (!(file instanceof File) || !byteSize.success || !checksum.success || file.size !== byteSize.data || file.size > RENDITION_LIMITS.MAX_DOCUMENT_BYTES || file.type !== "application/pdf") {
      throw new Error(SYNC_MESSAGES.INVALID_ATTACHMENT);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const actualChecksum = createHash("sha256").update(bytes).digest("hex");
    if (actualChecksum !== checksum.data) {
      throw new Error(SYNC_MESSAGES.INVALID_ATTACHMENT);
    }
    totalBytes.value += bytes.byteLength;
    if (totalBytes.value > RENDITION_LIMITS.MAX_UPLOAD_BYTES) {
      throw new Error(SYNC_MESSAGES.INVALID_ATTACHMENT);
    }
    consumedAttachments.add(attachmentId.data);
    attachments.set(attachmentId.data, new Uint8Array(bytes));
    return record.data;
  }

  const hydratedEntries = await Promise.all(Object.entries(record.data).map(async ([key, entry]) => [key, await validateAttachments(entry, formData, consumedAttachments, attachments, totalBytes)] as const));
  return Object.fromEntries(hydratedEntries);
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "invalid_origin", OFFLINE_OPERATION_MESSAGES.LA_SOLICITUD_NO_PERTENECE_A_ESTE_SITIO);
  }

  const session = await authService.getSession(request.cookies.get(AUTH.SESSION_COOKIE)?.value);

  if (!session) {
    return errorResponse(401, "session_expired", OFFLINE_OPERATION_MESSAGES.LA_SESION_VENCIO_INICIA_SESION_PARA_SINCRONIZAR_LOS_CAMBIOS_PENDIENTES);
  }

  let body: unknown;
  const attachments = new Map<string, Uint8Array>();

  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const contentLength = Number(request.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > RENDITION_LIMITS.MAX_UPLOAD_BYTES + 1_000_000) {
        return errorResponse(413, "attachment_too_large", SYNC_MESSAGES.INVALID_ATTACHMENT);
      }
      const formData = await request.formData();
      const serializedOperation = z.string().safeParse(formData.get("operation"));
      if (!serializedOperation.success) {
        return errorResponse(400, "invalid_body", OFFLINE_OPERATION_MESSAGES.EL_CUERPO_DE_LA_OPERACION_NO_ES_VALIDO);
      }
      const operation: unknown = JSON.parse(serializedOperation.data);
      const consumedAttachments = new Set<string>();
      body = await validateAttachments(operation, formData, consumedAttachments, attachments, { value: 0 });
      const receivedAttachments = [...formData.keys()].filter((key) => key.startsWith("attachment:"));
      if (receivedAttachments.length !== consumedAttachments.size || receivedAttachments.some((key) => !consumedAttachments.has(key.slice("attachment:".length)))) {
        return errorResponse(400, "invalid_attachment_set", SYNC_MESSAGES.INVALID_ATTACHMENT);
      }
    } else {
      body = await request.json();
    }
  } catch {
    return errorResponse(400, "invalid_attachment", SYNC_MESSAGES.INVALID_ATTACHMENT);
  }

  const result = await processSynchronizationRequest(session.user.id, session.user.role, body, attachments);
  return NextResponse.json(result.body, { status: result.status, headers: privateHeaders });
}
