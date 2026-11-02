"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download04Icon, PackageIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DELIVERY_ERROR_MESSAGES, DELIVERY_REPORT_TEXT } from "@/constants/delivery.constant";
import { distributionPreparationPayloadSchema } from "@/schemas/record.schema";
import type { DistributionPreparationPayload, RecordsCollection } from "@/types/schema-contracts";
import { enqueueOfflineOperation, listOfflineOperations, synchronizeOfflineQueue } from "@/services/offline-queue.service";
import { createDistributionPreparationPdf } from "@/services/local-distribution-preparation-pdf.service";
import { jsonValueSchema } from "@/schemas/offline.schema";
import type { OfflineOperation } from "@/types/offline-operation";

interface DistributionPreparationPanelProps {
  data: RecordsCollection;
  periodId: string;
  userId: string;
  sessionExpiresAt: string;
  canWrite: boolean;
  isOnline: boolean;
  onRefresh: () => Promise<void>;
}

interface AllocationRow {
  familyId: string;
  remittanceId: string;
  moduleQuantity: string;
  notes: string;
}

interface SupplyAllocationRow {
  receiptItemId: string;
  quantity: string;
  notes: string;
}

function createEmptyAllocationRow(): AllocationRow {
  return { familyId: "", remittanceId: "", moduleQuantity: "1", notes: "" };
}

function createEmptySupplyAllocationRow(): SupplyAllocationRow {
  return { receiptItemId: "", quantity: "1", notes: "" };
}

function formatSupplyAllocationCount(count: number) {
  if (count === 1) {
    return "1 producto";
  }
  return `${count} productos`;
}

function todayLocalDate() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

function downloadPdf(pdfBytes: Uint8Array, fileName: string) {
  const buffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(buffer).set(pdfBytes);
  const report = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(report);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DistributionPreparationPanel({ data, periodId, userId, sessionExpiresAt, canWrite, isOnline, onRefresh }: DistributionPreparationPanelProps) {
  const [scheduledAt, setScheduledAt] = useState(todayLocalDate());
  const [location, setLocation] = useState("");
  const [responsibleNames, setResponsibleNames] = useState("");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<AllocationRow[]>([createEmptyAllocationRow()]);
  const [supplyAllocations, setSupplyAllocations] = useState<SupplyAllocationRow[]>([createEmptySupplyAllocationRow()]);
  const [isSaving, setIsSaving] = useState(false);
  const [offlineOperations, setOfflineOperations] = useState<OfflineOperation[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const receipts = data.moduleReceipts.filter((receipt) => receipt.periodId === periodId && receipt.remainingQuantity > 0 && Number.isInteger(receipt.remainingQuantity));
  const supplyReceipts = data.supplyReceipts.filter((receipt) => receipt.periodId === periodId && receipt.remainingQuantity > 0);
  const selectedPeriod = data.periods.find((period) => period.id === periodId);
  const isMerendero = selectedPeriod?.destination === "MERENDERO";
  const families = data.families;
  const totalAssigned = allocations.reduce((total, allocation) => total + Number(allocation.moduleQuantity || 0), 0);
  const pendingPreparations = offlineOperations.flatMap((operation) => {
    if (operation.resource !== "records" || operation.status === "synced") {
      return [];
    }
    const payload = distributionPreparationPayloadSchema.safeParse(operation.payload);
    if (!payload.success || payload.data.periodId !== periodId) {
      return [];
    }
    return [{ operation, payload: payload.data }];
  });

  useEffect(() => {
    let cancelled = false;
    const refreshOperations = () => {
      void listOfflineOperations(userId).then((operations) => {
        if (!cancelled) {
          setOfflineOperations(operations);
        }
      });
    };
    refreshOperations();
    window.addEventListener("offline-queue-change", refreshOperations);
    return () => {
      cancelled = true;
      window.removeEventListener("offline-queue-change", refreshOperations);
    };
  }, [userId]);

  async function createPreparation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    let preparationAllocations = allocations.map((allocation) => ({ familyId: allocation.familyId, remittanceId: allocation.remittanceId, moduleQuantity: Number(allocation.moduleQuantity), notes: allocation.notes }));
    let preparationSupplyAllocations: Array<{ receiptItemId: string; quantity: number; notes: string }> = [];
    if (isMerendero) {
      preparationAllocations = [];
      preparationSupplyAllocations = supplyAllocations.map((allocation) => ({ receiptItemId: allocation.receiptItemId, quantity: Number(allocation.quantity), notes: allocation.notes }));
    }
    const parsed = distributionPreparationPayloadSchema.safeParse({
      kind: "distribution-preparation",
      id: crypto.randomUUID(),
      periodId,
      scheduledAt,
      location,
      responsibleNames,
      notes,
      allocations: preparationAllocations,
      supplyAllocations: preparationSupplyAllocations,
    });
    if (!parsed.success || !selectedPeriod) {
      setError(parsed.error?.issues[0]?.message ?? DELIVERY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESE_MODULO_O_PERIODO);
      return;
    }

    const payload: DistributionPreparationPayload = parsed.data;
    setIsSaving(true);
    try {
      const draftPdf = await createDistributionPreparationPdf({ ...payload, periodLabel: selectedPeriod.label, agency: selectedPeriod.agency }, data);
      await enqueueOfflineOperation(userId, sessionExpiresAt, { resource: "records", resourceId: payload.id, operation: "create", baseVersion: null, dependencies: [], payload: jsonValueSchema.parse(payload) });
      if (isOnline) {
        await synchronizeOfflineQueue(userId);
      }
      const queue = await listOfflineOperations(userId);
      const result = queue.find((operation) => operation.resourceId === payload.id);
      setOfflineOperations(queue);
      downloadPdf(draftPdf, `preparacion-${payload.scheduledAt}-${payload.id.slice(0, 8)}.pdf`);
      if (result?.status === "synced") {
        setNotice("La jornada se guardó y la planilla quedó descargada.");
        setLocation("");
        setResponsibleNames("");
        setNotes("");
        setAllocations([createEmptyAllocationRow()]);
        setSupplyAllocations([createEmptySupplyAllocationRow()]);
        await onRefresh();
      } else {
        setNotice("La preparación quedó guardada en este dispositivo, pendiente de validación del servidor. El PDF descargado es un borrador local.");
        setError(result?.message ?? "");
      }
    } catch (saveError) {
      if (saveError instanceof Error) {
        setError(saveError.message);
      } else {
        setError(DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_GUARDAR_LA_PREPARACION);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadPreparationReport(reportPayload: DistributionPreparationPayload) {
    const period = data.periods.find((entry) => entry.id === reportPayload.periodId);
    if (!period) {
      setError(DELIVERY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESE_MODULO_O_PERIODO);
      return;
    }
    try {
      const pdf = await createDistributionPreparationPdf({ ...reportPayload, periodLabel: period.label, agency: period.agency }, data);
      downloadPdf(pdf, `preparacion-${reportPayload.scheduledAt}-${reportPayload.id.slice(0, 8)}.pdf`);
    } catch {
      setError(DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_DESCARGAR_EL_PDF);
    }
  }

  async function downloadEventReport(event: RecordsCollection["distributionEvents"][number]) {
    await downloadPreparationReport({
      kind: "distribution-preparation",
      id: event.id,
      periodId: event.periodId,
      scheduledAt: event.scheduledAt,
      location: event.location,
      responsibleNames: event.responsibleNames,
      notes: event.notes ?? "",
      allocations: event.allocations.map((allocation) => ({ familyId: allocation.familyId, remittanceId: allocation.remittanceId, moduleQuantity: allocation.moduleQuantity, notes: allocation.notes ?? "" })),
      supplyAllocations: event.supplyAllocations.map((allocation) => ({ receiptItemId: allocation.receiptItemId, quantity: allocation.quantity, notes: allocation.notes ?? "" })),
    });
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="distribution-preparation-title">
      <Card>
        <CardHeader><CardTitle>Preparaciones pendientes</CardTitle><CardDescription>Los borradores se conservan al recargar y se validan con el servidor al recuperar conexión.</CardDescription></CardHeader>
        <CardContent>
          {pendingPreparations.length ? <ul className="divide-y divide-border">{pendingPreparations.map(({ operation, payload }) => <li key={operation.operationId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{payload.scheduledAt} · {payload.location}</p><p className="text-sm text-muted-foreground">{payload.allocations.length} asignaciones · {payload.allocations.reduce((total, allocation) => total + allocation.moduleQuantity, 0)} módulos</p><p className="text-xs text-muted-foreground">{operation.message ?? "Pendiente de confirmación del servidor"}</p></div><Button variant="outline" size="sm" onClick={() => void downloadPreparationReport(payload)}><HugeiconsIcon icon={Download04Icon} data-icon="inline-start" /> Descargar borrador</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">No hay preparaciones pendientes en este dispositivo.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle id="distribution-preparation-title" className="flex items-center gap-2"><HugeiconsIcon icon={PackageIcon} className="text-primary" /> Preparar jornada de entrega</CardTitle>
          <CardDescription>{isMerendero ? "Organizá productos recibidos, cantidades, fecha, lugar y responsables. La preparación no registra entregas ni consume mercadería." : "Organizá módulos recibidos, familias, fecha, lugar y responsables. La preparación no registra entregas ni consume mercadería."}</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <Alert variant="destructive" className="mb-4"><AlertTitle>No se pudo guardar la preparación</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          {notice ? <Alert variant="info" className="mb-4"><AlertTitle>Estado de la preparación</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
          {!periodId ? <p className="text-sm text-muted-foreground">Seleccioná un período para ver sus recepciones disponibles.</p> : null}
          {periodId && !isMerendero && !receipts.length ? <p className="text-sm text-muted-foreground">No hay módulos recibidos disponibles para este período.</p> : null}
          {periodId && isMerendero && !supplyReceipts.length ? <p className="text-sm text-muted-foreground">No hay productos recibidos disponibles para este período.</p> : null}
          <form onSubmit={(event) => void createPreparation(event)} className="flex flex-col gap-5">
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="distribution-date">Fecha de la jornada</FieldLabel><Input id="distribution-date" type="date" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required disabled={!canWrite || isSaving} /></Field>
              <Field><FieldLabel htmlFor="distribution-location">Lugar</FieldLabel><Input id="distribution-location" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={180} required disabled={!canWrite || isSaving} /></Field>
              <Field className="sm:col-span-2"><FieldLabel htmlFor="distribution-responsible">Responsables</FieldLabel><Input id="distribution-responsible" value={responsibleNames} onChange={(event) => setResponsibleNames(event.target.value)} maxLength={300} required disabled={!canWrite || isSaving} /></Field>
              <Field className="sm:col-span-2"><FieldLabel htmlFor="distribution-notes">Observaciones</FieldLabel><Textarea id="distribution-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} disabled={!canWrite || isSaving} /></Field>
            </FieldGroup>
            {!isMerendero ? <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-sm font-semibold">Asignaciones por familia</h3><p className="text-xs text-muted-foreground">Cada fila vincula una familia con el remito que respalda sus módulos.</p></div><Badge variant="outline">{totalAssigned} módulos previstos</Badge></div>
              {allocations.map((allocation, index) => {
                const selectedReceipt = receipts.find((receipt) => receipt.id === allocation.remittanceId);
                const requestedForReceipt = allocations.filter((entry) => entry.remittanceId === allocation.remittanceId).reduce((total, entry) => total + Number(entry.moduleQuantity || 0), 0);
                let availableForReceipt = 0;
                if (selectedReceipt) {
                  availableForReceipt = selectedReceipt.remainingQuantity - (requestedForReceipt - Number(allocation.moduleQuantity || 0));
                }
                return <div key={index} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1.3fr_1.3fr_0.7fr_1fr] sm:items-end">
                  <Field><FieldLabel htmlFor={`allocation-family-${index}`}>Familia</FieldLabel><Select value={allocation.familyId} onValueChange={(familyId) => setAllocations((current) => current.map((entry, row) => row === index ? { ...entry, familyId } : entry))} disabled={!canWrite || isSaving}><SelectTrigger id={`allocation-family-${index}`}><SelectValue placeholder="Seleccionar familia" /></SelectTrigger><SelectContent>{families.map((family) => <SelectItem key={family.id} value={family.id}>{family.name}</SelectItem>)}</SelectContent></Select></Field>
                  <Field><FieldLabel htmlFor={`allocation-source-${index}`}>Remito de origen</FieldLabel><Select value={allocation.remittanceId} onValueChange={(remittanceId) => setAllocations((current) => current.map((entry, row) => row === index ? { ...entry, remittanceId } : entry))} disabled={!canWrite || isSaving}><SelectTrigger id={`allocation-source-${index}`}><SelectValue placeholder="Seleccionar remito" /></SelectTrigger><SelectContent>{receipts.map((receipt) => <SelectItem key={receipt.id} value={receipt.id}>Pedido {receipt.requestNumber} · {receipt.remittanceNumber} · disponibles {receipt.remainingQuantity}</SelectItem>)}</SelectContent></Select></Field>
                  <Field><FieldLabel htmlFor={`allocation-quantity-${index}`}>Módulos</FieldLabel><Input id={`allocation-quantity-${index}`} type="number" min="1" step="1" max={Math.max(availableForReceipt, 1)} value={allocation.moduleQuantity} onChange={(event) => setAllocations((current) => current.map((entry, row) => row === index ? { ...entry, moduleQuantity: event.target.value } : entry))} required disabled={!canWrite || isSaving} /></Field>
                  <Field><FieldLabel htmlFor={`allocation-notes-${index}`}>Observación</FieldLabel><Input id={`allocation-notes-${index}`} maxLength={500} value={allocation.notes} onChange={(event) => setAllocations((current) => current.map((entry, row) => row === index ? { ...entry, notes: event.target.value } : entry))} disabled={!canWrite || isSaving} /></Field>
                </div>;
              })}
              <Button type="button" variant="outline" className="w-fit" onClick={() => setAllocations((current) => [...current, createEmptyAllocationRow()])} disabled={!canWrite || isSaving}><HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" /> Agregar familia</Button>
            </div> : <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-sm font-semibold">Insumos para el merendero</h3><p className="text-xs text-muted-foreground">Las cantidades conservan la unidad del producto en su recepción. No se convierten en módulos ni se descuentan al preparar.</p></div><Badge variant="outline">{formatSupplyAllocationCount(supplyAllocations.length)}</Badge></div>
              {supplyAllocations.map((allocation, index) => {
                const receipt = supplyReceipts.find((entry) => entry.id === allocation.receiptItemId);
                const alreadySelected = supplyAllocations.filter((entry) => entry.receiptItemId === allocation.receiptItemId).reduce((total, entry) => total + Number(entry.quantity || 0), 0);
                let available: number | undefined;
                if (receipt) {
                  available = receipt.remainingQuantity - (alreadySelected - Number(allocation.quantity || 0));
                }
                return <div key={index} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1.7fr_0.8fr_1fr] sm:items-end">
                  <Field><FieldLabel htmlFor={`supply-source-${index}`}>Producto y remito</FieldLabel><Select value={allocation.receiptItemId} onValueChange={(receiptItemId) => setSupplyAllocations((current) => current.map((entry, row) => row === index ? { ...entry, receiptItemId } : entry))} disabled={!canWrite || isSaving}><SelectTrigger id={`supply-source-${index}`}><SelectValue placeholder="Seleccionar recepción" /></SelectTrigger><SelectContent>{supplyReceipts.map((item) => <SelectItem key={item.id} value={item.id}>{item.productName} {item.presentation} - {item.remittanceNumber} - disponibles {item.remainingQuantity} {item.unit}</SelectItem>)}</SelectContent></Select></Field>
                  <Field><FieldLabel htmlFor={`supply-quantity-${index}`}>Cantidad {receipt?.unit ?? ""}</FieldLabel><Input id={`supply-quantity-${index}`} type="number" min="0.001" step="0.001" max={available} value={allocation.quantity} onChange={(event) => setSupplyAllocations((current) => current.map((entry, row) => row === index ? { ...entry, quantity: event.target.value } : entry))} required disabled={!canWrite || isSaving} /></Field>
                  <Field><FieldLabel htmlFor={`supply-notes-${index}`}>Observación</FieldLabel><Input id={`supply-notes-${index}`} maxLength={500} value={allocation.notes} onChange={(event) => setSupplyAllocations((current) => current.map((entry, row) => row === index ? { ...entry, notes: event.target.value } : entry))} disabled={!canWrite || isSaving} /></Field>
                </div>;
              })}
              <Button type="button" variant="outline" className="w-fit" onClick={() => setSupplyAllocations((current) => [...current, createEmptySupplyAllocationRow()])} disabled={!canWrite || isSaving}><HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" /> Agregar producto</Button>
            </div>}
            {!canWrite ? <p className="text-sm text-muted-foreground">Tu rol puede consultar las jornadas, pero no preparar nuevas.</p> : null}
            <Button type="submit" className="w-full sm:w-fit" disabled={!canWrite || isSaving || (isMerendero && !supplyReceipts.length) || (!isMerendero && !receipts.length)}>{isSaving ? "Guardando preparación…" : "Guardar y descargar planilla"}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Jornadas preparadas</CardTitle><CardDescription>Los reportes se pueden volver a descargar sin crear movimientos nuevos.</CardDescription></CardHeader>
        <CardContent>
          {data.distributionEvents.filter((event) => event.periodId === periodId).length ? <ul className="divide-y divide-border">{data.distributionEvents.filter((event) => event.periodId === periodId).map((event) => <li key={event.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{event.scheduledAt} · {event.location}</p><p className="text-sm text-muted-foreground">{event.allocations.length ? `${event.allocations.length} familias · ${event.allocations.reduce((total, allocation) => total + allocation.moduleQuantity, 0)} módulos` : `${event.supplyAllocations.length} insumos · cantidades por unidad de producto`} · {event.responsibleNames}</p><p className="text-xs text-muted-foreground">{[...event.allocations.map((allocation) => `${allocation.familyName} (${allocation.remittanceNumber})`), ...event.supplyAllocations.map((allocation) => `${allocation.productName} ${allocation.presentation}: ${allocation.quantity} ${allocation.unit} (${allocation.remittanceNumber})`)].join(" · ")}</p></div><Button variant="outline" size="sm" onClick={() => void downloadEventReport(event)}><HugeiconsIcon icon={Download04Icon} data-icon="inline-start" /> {DELIVERY_REPORT_TEXT.DOWNLOAD}</Button></li>)}</ul> : <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">No hay jornadas guardadas para este período todavía.</p>}
        </CardContent>
      </Card>
    </section>
  );
}
