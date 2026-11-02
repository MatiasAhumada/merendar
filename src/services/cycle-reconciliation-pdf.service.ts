import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { MerchandisePeriodRecord } from "@/interfaces/merchandise.interface";

export interface CycleReconciliationFilters {
  destination: "ALL" | MerchandisePeriodRecord["destination"];
  periodId: string;
  from: string;
  to: string;
  dateBasis: "requested" | "received" | "delivered" | "submitted";
}

export function filterCyclePeriods(periods: MerchandisePeriodRecord[], filters: CycleReconciliationFilters) {
  return periods.filter((period) => (!filters.destination || filters.destination === "ALL" || period.destination === filters.destination)
    && (!filters.periodId || filters.periodId === "ALL" || period.id === filters.periodId));
}

function matchesRange(date: string, filters: CycleReconciliationFilters) {
  const normalizedDate = date.slice(0, 10);
  return (!filters.from || normalizedDate >= filters.from) && (!filters.to || normalizedDate <= filters.to);
}

export function periodEventsInDateRange(period: MerchandisePeriodRecord, filters: CycleReconciliationFilters) {
  return period.reportDetails.events.filter((event) => filters.dateBasis !== "delivered" || ((!filters.from && !filters.to) || matchesRange(event.scheduledAt, filters)));
}

export function periodsInDateRange(periods: MerchandisePeriodRecord[], filters: CycleReconciliationFilters) {
  return filterCyclePeriods(periods, filters).filter((period) => {
    if (!filters.from && !filters.to) {
      return true;
    }
    let dates: string[] = [];
    if (filters.dateBasis === "requested") {
      dates = period.requests.map((request) => request.requestedAt);
    } else if (filters.dateBasis === "received") {
      dates = period.requests.flatMap((request) => request.remittances.map((remittance) => remittance.receivedAt));
    } else if (filters.dateBasis === "delivered") {
      dates = period.reportDetails.events.map((event) => event.scheduledAt);
    } else {
      dates = period.renditions.flatMap((rendition) => rendition.submissions.map((submission) => submission.submittedAt));
    }
    return dates.some((date) => matchesRange(date, filters));
  });
}

export function cycleReconciliationRows(periods: MerchandisePeriodRecord[], filters: CycleReconciliationFilters) {
  if (filters.dateBasis === "delivered" || filters.dateBasis === "submitted") {
    return [];
  }
  return filterCyclePeriods(periods, filters).flatMap((period) => period.requests.flatMap((request) => {
    let dates = [request.requestedAt.slice(0, 10)];
    if (filters.dateBasis === "received") {
      dates = request.remittances.map((remittance) => remittance.receivedAt.slice(0, 10));
    }
    const matchesDateRange = (!filters.from && !filters.to) || dates.some((date) => (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to));
    if (!matchesDateRange) {
      return [];
    }
    let remittances = request.remittances;
    if (filters.dateBasis === "received" && (filters.from || filters.to)) {
      remittances = remittances.filter((remittance) => (!filters.from || remittance.receivedAt.slice(0, 10) >= filters.from) && (!filters.to || remittance.receivedAt.slice(0, 10) <= filters.to));
    }
    return [{ period, request, remittances }];
  }));
}

export function periodRenditionsInDateRange(period: MerchandisePeriodRecord, filters: CycleReconciliationFilters) {
  return period.renditions.flatMap((rendition) => {
    let submissions = rendition.submissions;
    if (filters.dateBasis === "submitted" && (filters.from || filters.to)) {
      submissions = submissions.filter((submission) => (!filters.from || submission.submittedAt.slice(0, 10) >= filters.from) && (!filters.to || submission.submittedAt.slice(0, 10) <= filters.to));
      if (!submissions.length) {
        return [];
      }
    }
    return [{ ...rendition, submissions }];
  });
}

export async function createCycleReconciliationPdf(periods: MerchandisePeriodRecord[], filters: CycleReconciliationFilters) {
  const rows = cycleReconciliationRows(periods, filters);
  const selectedPeriods = periodsInDateRange(periods, filters);
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 42;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - margin;

  function writeLine(text: string, strong = false) {
    let font = regularFont;
    let fontSize = 9;
    let lineHeight = 14;
    if (strong) {
      font = boldFont;
      fontSize = 11;
      lineHeight = 18;
    }
    const maxWidth = pageWidth - margin * 2;
    const words = text.split(/\s+/);
    let line = "";
    for (const word of words) {
      let candidate = word;
      if (line) {
        candidate = `${line} ${word}`;
      }
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) {
        if (cursorY < margin + lineHeight) {
          page = pdf.addPage([pageWidth, pageHeight]);
          cursorY = pageHeight - margin;
        }
        page.drawText(line, { x: margin, y: cursorY, size: fontSize, font, color: rgb(0.12, 0.17, 0.16) });
        cursorY -= lineHeight;
      }
      line = word;
    }
    if (line) {
      if (cursorY < margin + lineHeight) {
        page = pdf.addPage([pageWidth, pageHeight]);
        cursorY = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y: cursorY, size: fontSize, font, color: rgb(0.12, 0.17, 0.16) });
      cursorY -= lineHeight;
    }
  }

  const cutoff = new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  writeLine("Conciliación documental de módulos", true);
  writeLine(`Fecha de corte: ${cutoff}`);
  let destinationLabel = "Todos";
  if (filters.destination === "FAMILIES") {
    destinationLabel = "Familias";
  } else if (filters.destination === "MERENDERO") {
    destinationLabel = "Merendero";
  }
  writeLine(`Destino: ${destinationLabel}`);
  writeLine(`Rango de fechas: ${filters.from || "sin inicio"} a ${filters.to || "sin fin"} · criterio: ${filters.dateBasis}`);
  cursorY -= 8;

  const requestedByUnit = new Map<string, number>();
  const authorizedByUnit = new Map<string, number>();
  const receivedByUnit = new Map<string, number>();
  for (const { request, remittances } of rows) {
    let unit = "módulos";
    if (request.item?.unit) {
      unit = request.item.unit;
    }
    requestedByUnit.set(unit, (requestedByUnit.get(unit) ?? 0) + request.requestedQuantity);
    if (request.quota) {
      authorizedByUnit.set(unit, (authorizedByUnit.get(unit) ?? 0) + request.quota.approvedQuantity);
    }
    receivedByUnit.set(unit, (receivedByUnit.get(unit) ?? 0) + remittances.filter((remittance) => remittance.status === "VIGENTE").reduce((total, remittance) => total + remittance.receivedQuantity, 0));
  }
  for (const [unit, quantity] of requestedByUnit) {
    writeLine(`Totales · ${unit}: solicitado ${quantity} · autorizado ${authorizedByUnit.get(unit) ?? "desconocido"} · recibido vigente ${receivedByUnit.get(unit) ?? 0}`, true);
  }
  cursorY -= 8;

  for (const { period, request, remittances } of rows) {
      let unit = "insumos";
      if (period.destination === "FAMILIES") {
        unit = "módulos";
      }
      writeLine(`${period.label} · ${period.agency} · ${unit}`, true);
      unit = request.item?.unit ?? unit;
      const received = remittances.filter((remittance) => remittance.status === "VIGENTE").reduce((total, remittance) => total + remittance.receivedQuantity, 0);
      const approved = request.quota?.approvedQuantity;
      writeLine(`Solicitud ${request.requestNumber} · ${request.status} · solicitada ${request.requestedQuantity} ${unit}`);
      let approvedLabel = "desconocida";
      let balanceLabel = "desconocido";
      if (approved) {
        approvedLabel = `${approved} ${unit}`;
        balanceLabel = `${approved - received} ${unit}`;
      }
      writeLine(`Autorizada ${approvedLabel} · recibida ${received} ${unit} · saldo autorizado ${balanceLabel}`);
      for (const remittance of remittances) {
        writeLine(`Remito ${remittance.remittanceNumber} · ${remittance.status} · ${remittance.receivedQuantity} ${unit} · ${remittance.receivedAt.slice(0, 10)}`);
      }
  }
  for (const period of selectedPeriods) {
    for (const rendition of periodRenditionsInDateRange(period, filters)) {
      let submissionLabel = "sin presentación registrada";
      if (rendition.submissions.length) {
        submissionLabel = `${rendition.submissions.length} presentación(es) registrada(s)`;
      }
      writeLine(`${period.label} · planilla v${rendition.beneficiarySheet.version} · rendición ${rendition.reviewStatus.toLocaleLowerCase("es-AR")} · ${submissionLabel}`, true);
      for (const submission of rendition.submissions) {
        writeLine(`Presentación ${submission.submittedAt.slice(0, 10)} · destinatario ${submission.recipient} · emisión ${submission.emissionId}`);
      }
      const latestEmission = rendition.emissions[0];
      const reportSummary = latestEmission?.reportSummary;
      if (reportSummary) {
        writeLine(`Emisión ${latestEmission.version}: ${reportSummary.deliveredModules} módulos a ${reportSummary.familyCount} familias; ${reportSummary.participantCount} personas como detalle.`);
      }
    }
  }
  for (const period of selectedPeriods) {
    for (const event of periodEventsInDateRange(period, filters)) {
      const familyIds = new Set(event.familyDeliveries.map((delivery) => delivery.familyId));
      writeLine(`Jornada ${event.scheduledAt.slice(0, 10)} · ${event.location} · responsables ${event.responsibleNames}`, true);
      if (period.destination === "FAMILIES") {
        const preparedModules = event.allocations.reduce((total, allocation) => total + allocation.moduleQuantity, 0);
        const deliveredModules = event.familyDeliveries.reduce((total, delivery) => total + delivery.moduleQuantity, 0);
        writeLine(`Preparado/asignado: ${preparedModules} módulos · entregado registrado: ${deliveredModules} módulos a ${familyIds.size} familias únicas · participantes ${event.familyDeliveries.reduce((total, delivery) => total + delivery.participants.length, 0)}`);
        for (const allocation of event.allocations) {
          writeLine(`Asignación · ${allocation.familyName} · remito ${allocation.remittanceNumber} · ${allocation.moduleQuantity} módulos`);
        }
        for (const delivery of event.familyDeliveries) {
          writeLine(`Entrega · ${delivery.familyName} · ${delivery.moduleQuantity} módulos · ${delivery.participants.length} personas en el detalle de retiro`);
        }
      } else {
        writeLine("Preparación registrada; entrega de insumos a familias desconocida porque el ciclo no registra ese movimiento.");
        for (const allocation of event.supplyAllocations) {
          writeLine(`Preparación · ${allocation.productName} · ${allocation.presentation} · remito ${allocation.remittanceNumber} · ${allocation.quantity} ${allocation.unit}`);
        }
      }
    }
  }

  return pdf.save();
}
