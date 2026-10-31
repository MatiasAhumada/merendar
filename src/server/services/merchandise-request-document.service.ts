import { HTTP_CONTENT_TYPES } from "@/constants/http.constant";
import { merchandiseRequestDocumentPayloadSchema } from "@/schemas/merchandise-request-document.schema";
import { createMerchandiseRequestPdf } from "@/services/merchandise-request-document-pdf.service";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/utils/handlers/apiError.handler";

export async function issueMerchandiseRequestDocument(payload: unknown, issuerId: string) {
  const parsedPayload = merchandiseRequestDocumentPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    throw new ApiError({ status: 400, message: "Revisá los datos de la solicitud antes de generar el borrador." });
  }

  const data = parsedPayload.data;
  const existing = await prisma.merchandiseRequestDocument.findUnique({ where: { id: data.id } });
  if (existing) {
    if (existing.requestId !== data.requestId || existing.kind !== data.documentKind || existing.issuedById !== issuerId) {
      throw new ApiError({ status: 409, message: "El identificador de borrador ya pertenece a otra emisión." });
    }
    return { id: existing.id, version: existing.version, kind: existing.kind, originalName: existing.originalName, createdAt: existing.createdAt };
  }

  const request = await prisma.merchandiseRequest.findUnique({
    where: { id: data.requestId },
    include: { period: true, items: true },
  });
  if (!request || request.status === "CANCELADA" || request.status === "RECHAZADA") {
    throw new ApiError({ status: 404, message: "No encontramos una solicitud vigente para generar el borrador." });
  }

  const destinationMatches = (request.period.destination === "FAMILIES" && data.documentKind === "MODULES")
    || (request.period.destination === "MERENDERO" && data.documentKind === "MERENDERO_SUPPLIES");
  if (!destinationMatches) {
    throw new ApiError({ status: 422, message: "La variante del documento no coincide con el destino del período." });
  }

  const content = await createMerchandiseRequestPdf({
    kind: data.documentKind,
    template: data.template,
    request: {
      requestNumber: request.requestNumber,
      requestedAt: request.requestedAt,
      requestedQuantity: request.requestedQuantity.toNumber(),
      period: { label: request.period.label, agency: request.period.agency },
      items: request.items.map((item) => ({ ...item, requestedQuantity: item.requestedQuantity.toNumber() })),
    },
  });
  const latestDocument = await prisma.merchandiseRequestDocument.findFirst({
    where: { requestId: request.id, kind: data.documentKind },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  let version = 1;
  if (latestDocument) {
    version = latestDocument.version + 1;
  }
  let fileSuffix = "insumos-merendero";
  if (data.documentKind === "MODULES") {
    fileSuffix = "modulos";
  }
  const originalName = `borrador-solicitud-${fileSuffix}-${request.requestNumber}-v${version}.pdf`;
  const document = await prisma.merchandiseRequestDocument.create({
    data: {
      id: data.id,
      requestId: request.id,
      kind: data.documentKind,
      version,
      templateVersion: 1,
      snapshot: {
        template: data.template,
        request: {
          requestNumber: request.requestNumber,
          requestedAt: request.requestedAt.toISOString(),
          requestedQuantity: request.requestedQuantity.toNumber(),
          period: { label: request.period.label, agency: request.period.agency },
          items: request.items.map((item) => ({ productName: item.productName, presentation: item.presentation, unit: item.unit, requestedQuantity: item.requestedQuantity.toNumber() })),
        },
      },
      originalName,
      contentType: HTTP_CONTENT_TYPES.PDF,
      content,
      issuedById: issuerId,
    },
    select: { id: true, version: true, kind: true, originalName: true, createdAt: true },
  });

  return document;
}
