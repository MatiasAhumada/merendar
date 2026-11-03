"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MerchandisePeriodRecord } from "@/interfaces/merchandise.interface";
import { createCycleReconciliationPdf, cycleReconciliationRows, filterCyclePeriods, periodEventsInDateRange, periodRenditionsInDateRange, periodsInDateRange, type CycleReconciliationFilters } from "@/services/cycle-reconciliation-pdf.service";
import { merchandiseOperationPayloadSchema } from "@/schemas/merchandise.schema";
import type { OfflineOperation } from "@/types/offline-operation";

const INITIAL_FILTERS: CycleReconciliationFilters = {
  destination: "ALL",
  periodId: "ALL",
  agency: "",
  responsible: "",
  from: "",
  to: "",
  dateBasis: "requested",
};

function formatQuantity(quantity: number, unit: string) {
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(quantity)} ${unit}`;
}

function pendingOperationDescription(operation: OfflineOperation) {
  const parsedPayload = merchandiseOperationPayloadSchema.safeParse(operation.payload);
  let description = "Cambio de mercadería";
  if (parsedPayload.success) {
    const payload = parsedPayload.data;
    if (payload.kind === "request" && !("action" in payload)) {
      description = `Solicitud ${payload.requestNumber} · ${payload.requestedQuantity} unidades solicitadas`;
    } else if (payload.kind === "quota" && !("action" in payload)) {
      description = `Cupo pendiente · ${payload.approvedQuantity} unidades`;
    } else if (payload.kind === "remittance" && !("action" in payload)) {
      description = `Remito ${payload.remittanceNumber} · ${payload.receivedQuantity} unidades recibidas`;
    } else if (payload.kind === "period" && !("action" in payload)) {
      description = `Período pendiente · ${payload.label}`;
    }
  }
  return description;
}

export function CycleReconciliationReport({ periods, offlineMode, capturedAt, pendingOperations }: { periods: MerchandisePeriodRecord[]; offlineMode: boolean; capturedAt: string | null; pendingOperations: OfflineOperation[] }) {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [pageNumber, setPageNumber] = useState(0);
  const [exporting, setExporting] = useState(false);
  const reportRows = useMemo(() => cycleReconciliationRows(periods, filters), [filters, periods]);
  const selectedPeriods = useMemo(() => periodsInDateRange(periods, filters), [filters, periods]);
  const destinationPeriods = useMemo(() => filterCyclePeriods(periods, filters), [filters, periods]);
  const hasReportContent = reportRows.length > 0 || selectedPeriods.some((period) => periodRenditionsInDateRange(period, filters).length > 0 || periodEventsInDateRange(period, filters).length > 0);
  const visibleRows = reportRows.slice(pageNumber * 25, (pageNumber + 1) * 25);
  const pageCount = Math.ceil(reportRows.length / 25);
  let emptyMessage = "No hay solicitudes que coincidan con estos filtros.";
  if (filters.dateBasis === "delivered") {
    emptyMessage = "No hay jornadas de entrega que coincidan con estos filtros.";
  } else if (filters.dateBasis === "submitted") {
    emptyMessage = "No hay solicitudes en esta vista; las presentaciones coincidentes se muestran en Rendiciones y presentaciones.";
  }

  async function exportReport() {
    setExporting(true);
    try {
      const bytes = await createCycleReconciliationPdf(periods, filters, {
        offlineMode,
        capturedAt,
        pendingOperations: pendingOperations.map((operation) => ({ description: pendingOperationDescription(operation), status: operation.status, createdAt: operation.createdAt })),
      });
      const pdfBytes = new Uint8Array(bytes);
      const url = URL.createObjectURL(new Blob([pdfBytes.buffer], { type: "application/pdf" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "conciliacion-documental-modulos.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section aria-labelledby="cycle-report-title" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle id="cycle-report-title">Conciliación histórica del ciclo</CardTitle>
          <CardDescription>Seguimiento de solicitudes, autorizaciones, recepciones y rendiciones vinculadas. Las cantidades se cuentan desde sus registros de origen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {offlineMode && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Lectura sin conexión · datos preparados {capturedAt ? `el ${new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(capturedAt))}` : "sin fecha de captura disponible"}. Los cambios pendientes aparecen aparte.</p>}
          {pendingOperations.length ? <Card variant="muted"><CardHeader><CardTitle className="text-base">Cambios locales pendientes · no confirmados</CardTitle><CardDescription>Se muestran aparte y no se suman a cantidades confirmadas.</CardDescription></CardHeader><CardContent><ul className="space-y-2 text-sm">{pendingOperations.map((operation) => <li key={operation.operationId} className="flex flex-wrap justify-between gap-2"><span>{pendingOperationDescription(operation)}</span><span className="text-muted-foreground">{operation.status} · fecha local {new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(operation.createdAt))}</span></li>)}</ul></CardContent></Card> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <Field>
              <FieldLabel htmlFor="cycle-report-destination">Destino</FieldLabel>
              <Select value={filters.destination} onValueChange={(destination: CycleReconciliationFilters["destination"]) => { setFilters({ ...filters, destination, periodId: "ALL" }); setPageNumber(0); }}>
                <SelectTrigger id="cycle-report-destination"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">Todos</SelectItem><SelectItem value="FAMILIES">Familias</SelectItem><SelectItem value="MERENDERO">Merendero</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="cycle-report-period">Período</FieldLabel>
              <Select value={filters.periodId} onValueChange={(periodId) => { setFilters({ ...filters, periodId }); setPageNumber(0); }}>
                <SelectTrigger id="cycle-report-period"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">Todos</SelectItem>{periods.filter((period) => filters.destination === "ALL" || period.destination === filters.destination).map((period) => <SelectItem key={period.id} value={period.id}>{period.label} · {period.agency}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field><FieldLabel htmlFor="cycle-report-agency">Organismo</FieldLabel><Input id="cycle-report-agency" value={filters.agency} onChange={(event) => { setFilters({ ...filters, agency: event.target.value }); setPageNumber(0); }} /></Field>
            <Field><FieldLabel htmlFor="cycle-report-responsible">Responsable</FieldLabel><Input id="cycle-report-responsible" value={filters.responsible} onChange={(event) => { setFilters({ ...filters, responsible: event.target.value }); setPageNumber(0); }} /></Field>
            <Field>
              <FieldLabel htmlFor="cycle-report-date-basis">Fecha de</FieldLabel>
              <Select value={filters.dateBasis} onValueChange={(dateBasis: CycleReconciliationFilters["dateBasis"]) => { setFilters({ ...filters, dateBasis }); setPageNumber(0); }}>
                <SelectTrigger id="cycle-report-date-basis"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="requested">Pedido</SelectItem><SelectItem value="received">Recepción</SelectItem><SelectItem value="delivered">Entrega</SelectItem><SelectItem value="submitted">Presentación registrada</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field><FieldLabel htmlFor="cycle-report-from">Desde</FieldLabel><Input id="cycle-report-from" type="date" value={filters.from} onChange={(event) => { setFilters({ ...filters, from: event.target.value }); setPageNumber(0); }} /></Field>
            <Field><FieldLabel htmlFor="cycle-report-to">Hasta</FieldLabel><Input id="cycle-report-to" type="date" value={filters.to} onChange={(event) => { setFilters({ ...filters, to: event.target.value }); setPageNumber(0); }} /></Field>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-sm text-muted-foreground">{selectedPeriods.length} períodos coincidentes · {reportRows.length} solicitudes correspondientes · corte {new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}</p>
            <Button type="button" onClick={() => void exportReport()} disabled={exporting || !hasReportContent}>{exporting ? "Preparando PDF…" : "Exportar reporte PDF"}</Button>
          </div>
        </CardContent>
      </Card>
      {visibleRows.length ? <div className="space-y-3">{visibleRows.map(({ period, request, remittances }) => {
        const unit = request.item?.unit ?? "módulos";
        const approved = request.quota?.approvedQuantity;
        const received = remittances.filter((remittance) => remittance.status === "VIGENTE").reduce((total, remittance) => total + remittance.receivedQuantity, 0);
        return <Card key={`${period.id}-${request.id}`}>
          <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-base">Solicitud {request.requestNumber} · {period.label}</CardTitle><CardDescription>{period.agency} · {period.destination === "FAMILIES" ? "Módulos para familias" : "Insumos del merendero"} · pedido {request.requestedAt.slice(0, 10)}</CardDescription></div><span className="w-fit rounded-full bg-secondary px-3 py-1 text-xs">{request.status}</span></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <p className="text-sm">Solicitado<strong className="block">{formatQuantity(request.requestedQuantity, unit)}</strong></p>
            <p className="text-sm">Autorizado<strong className="block">{approved ? formatQuantity(approved, unit) : "Desconocido"}</strong></p>
            <p className="text-sm">Recibido vigente<strong className="block">{formatQuantity(received, unit)}</strong></p>
            <p className="text-sm">Saldo autorizado<strong className="block">{approved ? formatQuantity(approved - received, unit) : "Desconocido"}</strong></p>
            <div className="sm:col-span-2 xl:col-span-4"><p className="text-sm font-medium">Recepciones vinculadas</p>{remittances.length ? <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{remittances.map((remittance) => <li key={remittance.id}>Remito {remittance.remittanceNumber}: {remittance.status === "VIGENTE" ? "vigente" : "anulado"}, {formatQuantity(remittance.receivedQuantity, unit)} · {remittance.receivedAt.slice(0, 10)}</li>)}</ul> : <p className="mt-1 text-sm text-muted-foreground">Sin recepciones en el rango.</p>}</div>
          </CardContent>
        </Card>;
      })}<div className="flex items-center justify-between"><Button variant="outline" disabled={!pageNumber} onClick={() => setPageNumber(pageNumber - 1)}>Anterior</Button><span className="text-sm text-muted-foreground">Página {pageNumber + 1} de {pageCount}</span><Button variant="outline" disabled={pageNumber + 1 >= pageCount} onClick={() => setPageNumber(pageNumber + 1)}>Siguiente</Button></div></div> : <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</CardContent></Card>}
      {selectedPeriods.some((period) => periodRenditionsInDateRange(period, filters).length) && <div className="space-y-3"><h3 className="font-semibold">Rendiciones y presentaciones</h3>{selectedPeriods.flatMap((period) => periodRenditionsInDateRange(period, filters).map((rendition) => {
        const latestEmission = rendition.emissions[0];
        const reportSummary = latestEmission?.reportSummary;
        return <Card key={rendition.id}><CardContent className="space-y-2 py-4"><p className="font-medium">{period.label} · planilla v{rendition.beneficiarySheet.version} · rendición {rendition.reviewStatus.toLocaleLowerCase("es-AR")}</p>{reportSummary ? <p className="text-sm text-muted-foreground">Instantánea de emisión v{latestEmission.version}: {reportSummary.deliveredModules} módulos en {reportSummary.familyCount} familias · {reportSummary.participantCount} personas detalladas · jornada {reportSummary.event ? `${reportSummary.event.scheduledAt.slice(0, 10)}, ${reportSummary.event.location}` : "sin vínculo a jornada"} · preparación física desconocida</p> : <p className="text-sm text-muted-foreground">El histórico no contiene una instantánea de cantidades validable; preparación y entrega quedan desconocidas.</p>}{rendition.submissions.length ? <ul className="space-y-1 text-sm text-muted-foreground">{rendition.submissions.map((submission) => <li key={submission.id}>Presentación registrada {submission.submittedAt.slice(0, 10)} · destinatario {submission.recipient} · registrado por {submission.recordedBy.name} · emisión {submission.emissionId}</li>)}</ul> : <p className="text-sm text-muted-foreground">Sin presentación registrada.</p>}</CardContent></Card>;
      }))}</div>}
      {selectedPeriods.some((period) => period.reportDetails.authorized && periodEventsInDateRange(period, filters).length) && <div className="space-y-3"><h3 className="font-semibold">Preparación y entregas por jornada</h3>{selectedPeriods.flatMap((period) => periodEventsInDateRange(period, filters).map((event) => {
        const uniqueFamilies = new Set(event.familyDeliveries.map((delivery) => delivery.familyId)).size;
        const preparedModules = event.allocations.reduce((total, allocation) => total + allocation.moduleQuantity, 0);
        const deliveredModules = event.familyDeliveries.reduce((total, delivery) => total + delivery.moduleQuantity, 0);
        const participantCount = event.familyDeliveries.reduce((total, delivery) => total + delivery.participants.length, 0);
        if (period.destination === "FAMILIES") {
          return <Card key={event.id}><CardHeader><CardTitle className="text-base">{period.label} · jornada {event.scheduledAt.slice(0, 10)}</CardTitle><CardDescription>{event.location} · responsables {event.responsibleNames}</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><p className="text-sm">Preparado/asignado<strong className="block">{formatQuantity(preparedModules, "módulos")}</strong></p><p className="text-sm">Entregado<strong className="block">{formatQuantity(deliveredModules, "módulos")}</strong></p><p className="text-sm">Familias únicas<strong className="block">{uniqueFamilies}</strong></p><p className="text-sm">Personas en el detalle<strong className="block">{participantCount}</strong></p></div><ul className="space-y-1 text-sm text-muted-foreground">{event.allocations.map((allocation) => <li key={`${event.id}-${allocation.familyId}-${allocation.remittanceNumber}`}>Preparación: {allocation.familyName} · remito {allocation.remittanceNumber} · {formatQuantity(allocation.moduleQuantity, "módulos")}</li>)}{event.familyDeliveries.map((delivery) => <li key={`${event.id}-${delivery.familyId}`}>Entrega: {delivery.familyName} · {formatQuantity(delivery.moduleQuantity, "módulos")} · {delivery.participants.length} personas registradas como detalle, sin multiplicar módulos</li>)}</ul></CardContent></Card>;
        }
        return <Card key={event.id}><CardHeader><CardTitle className="text-base">{period.label} · jornada {event.scheduledAt.slice(0, 10)}</CardTitle><CardDescription>{event.location} · responsables {event.responsibleNames}</CardDescription></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">La preparación se registra por producto. El sistema no contiene un movimiento de entrega de insumos a familias, por lo que ese total es desconocido.</p><ul className="space-y-1 text-sm text-muted-foreground">{event.supplyAllocations.map((allocation) => <li key={`${event.id}-${allocation.remittanceNumber}-${allocation.productName}`}>Preparación: {allocation.productName} · {allocation.presentation} · remito {allocation.remittanceNumber} · {formatQuantity(allocation.quantity, allocation.unit)}</li>)}</ul></CardContent></Card>;
      }))}</div>}
      {destinationPeriods.some((period) => !period.reportDetails.authorized) && <Card variant="muted"><CardContent className="py-4 text-sm text-muted-foreground">El detalle de jornadas, familias y personas requiere la capacidad vigente de consulta de Registro. Sin esa autorización, las cantidades de preparación y entrega quedan desconocidas.</CardContent></Card>}
    </section>
  );
}
