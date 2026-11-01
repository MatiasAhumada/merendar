import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { MerchandisePeriodRecord, MerchandiseRequestRecord } from "@/interfaces/merchandise.interface";

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(value);
}

export async function createMerchandiseReconciliationPdf(period: MerchandisePeriodRecord, request: MerchandiseRequestRecord) {
  if (!request.quota) {
    throw new Error("La solicitud todavía no tiene una autorización registrada.");
  }

  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  const width = 595.28 - margin * 2;
  let page = document.addPage([595.28, 841.89]);
  const unit = request.item?.unit ?? "módulos";
  const received = request.remittances.filter((item) => item.status === "VIGENTE").reduce((total, item) => total + item.receivedQuantity, 0);
  const difference = request.quota.approvedQuantity - received;
  let y = 790;

  function line(text: string, strong = false, size = 10) {
    let font = regular;
    if (strong) {
      font = bold;
    }
    const words = text.split(/\s+/);
    let current = "";
    const rows: string[] = [];
    for (const word of words) {
      let candidate = word;
      if (current) {
        candidate = `${current} ${word}`;
      }
      if (font.widthOfTextAtSize(candidate, size) > width && current) {
        rows.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) rows.push(current);
    for (const row of rows) {
      if (y < margin) {
        page = document.addPage([595.28, 841.89]);
        y = 790;
        page.drawText("INFORME INTERNO DE RECEPCIÓN · CONTINUACIÓN", { x: margin, y, size: 9, font: bold, color: rgb(0.12, 0.17, 0.16) });
        y -= 20;
      }
      page.drawText(row, { x: margin, y, size, font, color: rgb(0.12, 0.17, 0.16) });
      y -= size + 7;
    }
  }

  line("INFORME INTERNO DE RECEPCIÓN", true, 16);
  line("Conciliación de autorización y recepción · No reemplaza la orden externa", false, 9);
  y -= 12;
  let destinationLabel = "Módulos para familias";
  if (period.destination === "MERENDERO") {
    destinationLabel = "Insumos del merendero";
  }
  line(`Destino: ${destinationLabel}`, true);
  line(`Período: ${period.label} · Organismo: ${period.agency}`);
  line(`Solicitud: ${request.requestNumber} · Emitida el ${new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(request.requestedAt))}`);
  line(`Orden externa: ${request.quota.externalOrderNumber || "Sin referencia cargada"}`);
  line(`Autorizado a retirar: ${request.quota.authorizedRecipient || "Sin dato cargado"}`);
  line(`Cantidad autorizada: ${formatQuantity(request.quota.approvedQuantity)} ${unit}`);
  if (request.quota.authorizationValidUntil) {
    line(`Vigencia indicada: ${new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(request.quota.authorizationValidUntil))}`);
  }
  if (request.item) {
    line(`Producto: ${request.item.productName} · Presentación: ${request.item.presentation}`);
  }
  y -= 10;
  line("RECEPCIONES REGISTRADAS", true, 12);
  if (!request.remittances.some((item) => item.status === "VIGENTE")) {
    line("No hay recepciones confirmadas. La autorización por sí sola no acredita retiro ni recepción.");
  }
  for (const remittance of request.remittances) {
    let state = "Anulado";
    if (remittance.status === "VIGENTE") {
      state = "Vigente";
    }
    line(`${state} · Remito ${remittance.remittanceNumber} · ${formatQuantity(remittance.receivedQuantity)} ${unit} · ${new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(remittance.receivedAt))}`);
    let receiptNotes = "";
    if (remittance.notes) {
      receiptNotes = ` · Observaciones: ${remittance.notes}`;
    }
    line(`Responsable: ${remittance.responsibleName}${receiptNotes}`);
  }
  y -= 10;
  line(`Total recibido vigente: ${formatQuantity(received)} ${unit}`, true);
  let differenceLabel = "Exceso respecto de lo autorizado";
  if (difference >= 0) {
    differenceLabel = "Faltante respecto de lo autorizado";
  }
  line(`${differenceLabel}: ${formatQuantity(Math.abs(difference))} ${unit}`, true);
  line(`Documentos adjuntos: ${request.documents.length + request.remittances.reduce((total, item) => total + item.documents.length, 0)} archivo(s) privado(s).`);
  line("Informe generado desde los registros disponibles en esta cuenta. Revisar inconsistencias antes de rendir.", false, 9);

  return document.save();
}
