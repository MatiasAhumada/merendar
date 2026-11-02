import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { MerchandisePeriodRecord } from "@/interfaces/merchandise.interface";

export interface CycleReconciliationFilters {
  destination: "ALL" | MerchandisePeriodRecord["destination"];
  periodId: string;
  agency: string;
  responsible: string;
  from: string;
  to: string;
  dateBasis: "requested" | "received" | "delivered" | "submitted";
}

export interface CycleReconciliationPdfContext {
  offlineMode: boolean;
  capturedAt: string | null;
  pendingOperations: Array<{ description: string; status: string; createdAt: string }>;
}

export function filterCyclePeriods(periods: MerchandisePeriodRecord[], filters: CycleReconciliationFilters) {
  return periods.filter((period) => (!filters.destination || filters.destination === "ALL" || period.destination === filters.destination)
    && (!filters.periodId || filters.periodId === "ALL" || period.id === filters.periodId)
    && (!filters.agency.trim() || matchesText(period.agency, filters.agency))
    && hasResponsibleMatch(period, filters.responsible));
}

function matchesRange(date: string, filters: CycleReconciliationFilters) {
  const normalizedDate = date.slice(0, 10);
  return (!filters.from || normalizedDate >= filters.from) && (!filters.to || normalizedDate <= filters.to);
}

function matchesText(value: string, query: string) {
  return value.toLocaleLowerCase("es-AR").includes(query.trim().toLocaleLowerCase("es-AR"));
}

function hasResponsibleMatch(period: MerchandisePeriodRecord, query: string) {
  if (!query.trim()) {
    return true;
  }
  return period.reportDetails.events.some((event) => matchesText(event.responsibleNames, query))
    || period.requests.some((request) => matchesRequestResponsible(request, query) || request.remittances.some((remittance) => matchesText(remittance.responsibleName, query)))
    || period.renditions.some((rendition) => rendition.submissions.some((submission) => matchesText(submission.recordedBy.name, query)));
}

function matchesRequestResponsible(request: MerchandisePeriodRecord["requests"][number], query: string) {
  return matchesText(request.createdBy.name, query)
    || Boolean(request.quota?.approvedBy && matchesText(request.quota.approvedBy.name, query));
}

export function periodEventsInDateRange(period: MerchandisePeriodRecord, filters: CycleReconciliationFilters) {
  return period.reportDetails.events.filter((event) => (!filters.responsible.trim() || matchesText(event.responsibleNames, filters.responsible))
    && (filters.dateBasis !== "delivered" || ((!filters.from && !filters.to) || matchesRange(event.scheduledAt, filters))));
}

export function periodsInDateRange(periods: MerchandisePeriodRecord[], filters: CycleReconciliationFilters) {
  return filterCyclePeriods(periods, filters).filter((period) => {
    if (filters.dateBasis === "submitted" && filters.responsible.trim()) {
      return false;
    }
    if (!filters.from && !filters.to) {
      return true;
    }
    let dates: string[] = [];
    if (filters.dateBasis === "requested") {
      dates = period.requests.filter((request) => !filters.responsible.trim() || matchesRequestResponsible(request, filters.responsible)).map((request) => request.requestedAt);
    } else if (filters.dateBasis === "received") {
      dates = period.requests.flatMap((request) => request.remittances.filter((remittance) => !filters.responsible.trim() || matchesText(remittance.responsibleName, filters.responsible)).map((remittance) => remittance.receivedAt));
    } else if (filters.dateBasis === "delivered") {
      dates = period.reportDetails.events.filter((event) => !filters.responsible.trim() || matchesText(event.responsibleNames, filters.responsible)).map((event) => event.scheduledAt);
    } else {
      dates = period.renditions.flatMap((rendition) => rendition.submissions.filter((submission) => !filters.responsible.trim() || matchesText(submission.recordedBy.name, filters.responsible)).map((submission) => submission.submittedAt));
    }
    return dates.some((date) => matchesRange(date, filters));
  });
}

export function cycleReconciliationRows(periods: MerchandisePeriodRecord[], filters: CycleReconciliationFilters) {
  if (filters.dateBasis === "delivered" || filters.dateBasis === "submitted") {
    return [];
  }
  return filterCyclePeriods(periods, filters).flatMap((period) => period.requests.flatMap((request) => {
    let remittances = request.remittances;
    if (filters.responsible.trim()) {
      const requestMatchesResponsible = matchesRequestResponsible(request, filters.responsible);
      const matchingRemittances = remittances.filter((remittance) => matchesText(remittance.responsibleName, filters.responsible));
      if (filters.dateBasis === "received") {
        remittances = matchingRemittances;
      } else if (!requestMatchesResponsible) {
        remittances = matchingRemittances;
      }
      if (!requestMatchesResponsible && !matchingRemittances.length) {
        return [];
      }
    }
    let dates = [request.requestedAt.slice(0, 10)];
    if (filters.dateBasis === "received") {
      dates = remittances.map((remittance) => remittance.receivedAt.slice(0, 10));
    }
    const matchesDateRange = (!filters.from && !filters.to) || dates.some((date) => (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to));
    if (!matchesDateRange) {
      return [];
    }
    if (filters.dateBasis === "received" && (filters.from || filters.to)) {
      remittances = remittances.filter((remittance) => (!filters.from || remittance.receivedAt.slice(0, 10) >= filters.from) && (!filters.to || remittance.receivedAt.slice(0, 10) <= filters.to));
    }
    return [{ period, request, remittances }];
  }));
}

export function periodRenditionsInDateRange(period: MerchandisePeriodRecord, filters: CycleReconciliationFilters) {
  return period.renditions.flatMap((rendition) => {
    let submissions = rendition.submissions;
    if (filters.responsible.trim()) {
      submissions = submissions.filter((submission) => matchesText(submission.recordedBy.name, filters.responsible));
    }
    if (filters.dateBasis === "submitted" && (filters.from || filters.to)) {
      submissions = submissions.filter((submission) => (!filters.from || submission.submittedAt.slice(0, 10) >= filters.from) && (!filters.to || submission.submittedAt.slice(0, 10) <= filters.to));
      if (!submissions.length) {
        return [];
      }
    }
    return [{ ...rendition, submissions }];
  });
}

export async function createCycleReconciliationPdf(periods: MerchandisePeriodRecord[], filters: CycleReconciliationFilters, context: CycleReconciliationPdfContext) {
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
  if (context.offlineMode) {
    let capturedAtLabel = "fecha de captura desconocida";
    if (context.capturedAt) {
      capturedAtLabel = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(context.capturedAt));
    }
    writeLine(`Fuente: snapshot local preparado el ${capturedAtLabel}. Los totales confirmados provienen del snapshot.`);
    writeLine(`Cambios locales pendientes: ${context.pendingOperations.length}; no se suman a los totales confirmados.`, true);
    for (const operation of context.pendingOperations) {
      const createdAt = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(operation.createdAt));
      writeLine(`Pendiente local · ${operation.description} · ${operation.status} · capturado ${createdAt}`);
    }
  } else {
    writeLine("Fuente: lectura confirmada del servidor.");
  }
  let destinationLabel = "Todos";
  if (filters.destination === "FAMILIES") {
    destinationLabel = "Familias";
  } else if (filters.destination === "MERENDERO") {
    destinationLabel = "Merendero";
  }
  writeLine(`Destino: ${destinationLabel}`);
  let periodLabel = "Todos";
  if (filters.periodId !== "ALL") {
    const selectedPeriod = periods.find((candidate) => candidate.id === filters.periodId);
    if (selectedPeriod) {
      periodLabel = selectedPeriod.label;
    }
  }
  writeLine(`Período: ${periodLabel}`);
  writeLine(`Organismo: ${filters.agency || "Todos"} · responsable: ${filters.responsible || "Todos"}`);
  let dateBasisLabel = "Pedido";
  if (filters.dateBasis === "received") {
    dateBasisLabel = "Recepción";
  } else if (filters.dateBasis === "delivered") {
    dateBasisLabel = "Entrega";
  } else if (filters.dateBasis === "submitted") {
    dateBasisLabel = "Presentación";
  }
  writeLine(`Rango de fechas: ${filters.from || "sin inicio"} a ${filters.to || "sin fin"} · criterio: ${dateBasisLabel}`);
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
        writeLine(`Presentación ${submission.submittedAt.slice(0, 10)} · destinatario ${submission.recipient} · registrado por ${submission.recordedBy.name} · emisión ${submission.emissionId}`);
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
