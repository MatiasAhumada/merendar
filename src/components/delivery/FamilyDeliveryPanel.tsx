"use client";

import { useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { File01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRAND } from "@/constants/brand.constant";
import { DELIVERY_ERROR_MESSAGES, DELIVERY_UI_TEXT } from "@/constants/delivery.constant";
import { HTTP_CONTENT_TYPES, HTTP_RESPONSE_TYPES, NO_STORE_REQUEST_HEADERS } from "@/constants/http.constant";
import { API_ROUTES } from "@/constants/routes.constant";
import { beneficiarySheetDraftSchema, beneficiarySheetResponseSchema, familyDeliveryPayloadSchema } from "@/schemas/record.schema";
import { jsonValueSchema } from "@/schemas/offline.schema";
import { enqueueOfflineOperation, listOfflineOperations, synchronizeOfflineQueue } from "@/services/offline-queue.service";
import { createLocalBeneficiarySheetPdf } from "@/services/local-beneficiary-sheet.service";
import { removeOfflinePreparedDocument, saveOfflinePreparedDocument, type OfflinePreparedDocument } from "@/services/offline-preparation.service";
import { getClientErrorMessage } from "@/utils/handlers/clientHandler";
import clientAxios from "@/utils/clientAxios.util";
import type { OfflineOperation } from "@/types/offline-operation";
import type { RecordsCollection } from "@/types/schema-contracts";

interface FamilyDeliveryPanelProps {
  data: RecordsCollection;
  periodId: string;
  userId: string;
  sessionExpiresAt: string;
  canWrite: boolean;
  isOnline: boolean;
  onRefresh: () => Promise<void>;
  onOfflineDocumentCreated: (document: OfflinePreparedDocument) => void;
}

interface ParticipantChecks {
  familyMemberId: string;
  paperSignatureChecked: boolean;
  physicalDniChecked: boolean;
}

function personName(member: RecordsCollection["families"][number]["members"][number]) {
  return `${member.person.firstName} ${member.person.lastName}`;
}

function downloadPdf(content: Blob, fileName: string) {
  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FamilyDeliveryPanel({ data, periodId, userId, sessionExpiresAt, canWrite, isOnline, onRefresh, onOfflineDocumentCreated }: FamilyDeliveryPanelProps) {
  const events = useMemo(() => data.distributionEvents.filter((event) => event.periodId === periodId && event.allocations.length), [data.distributionEvents, periodId]);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [familyId, setFamilyId] = useState("");
  const [participants, setParticipants] = useState<ParticipantChecks[]>([]);
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isIssuingSheet, setIsIssuingSheet] = useState(false);

  const selectedEvent = events.find((event) => event.id === eventId);
  const selectedFamily = data.families.find((family) => family.id === familyId);
  const confirmedDeliveries = selectedEvent?.familyDeliveries ?? [];
  const pendingDeliveries = operations.flatMap((operation) => {
    const parsedDelivery = familyDeliveryPayloadSchema.safeParse(operation.payload);
    if (!parsedDelivery.success || parsedDelivery.data.eventId !== eventId || operation.status === "synced") {
      return [];
    }

    const family = data.families.find((entry) => entry.id === parsedDelivery.data.familyId);
    if (!family || confirmedDeliveries.some((delivery) => delivery.familyId === family.id)) {
      return [];
    }

    return [{
      id: parsedDelivery.data.id,
      familyId: family.id,
      moduleQuantity: 1,
      familyName: family.name,
      participants: parsedDelivery.data.participants.flatMap((participant) => {
        const member = family.members.find((entry) => entry.id === participant.familyMemberId);
        if (!member) {
          return [];
        }
        return [{
          id: participant.familyMemberId,
          familyMemberId: participant.familyMemberId,
          personId: member.person.id,
          name: personName(member),
          dni: member.person.dni,
          paperSignatureChecked: participant.paperSignatureChecked,
          physicalDniChecked: participant.physicalDniChecked,
        }];
      }),
    }];
  });
  const eventDeliveries = [...confirmedDeliveries, ...pendingDeliveries];
  const allocatedFamilyIds = new Set(selectedEvent?.allocations.map((allocation) => allocation.familyId) ?? []);
  const deliveredFamilyIds = new Set(eventDeliveries.map((delivery) => delivery.familyId));
  const availableFamilies = data.families.filter((family) => allocatedFamilyIds.has(family.id) && !deliveredFamilyIds.has(family.id));
  const familyMembers = selectedFamily?.members ?? [];
  const period = data.periods.find((entry) => entry.id === periodId);

  useEffect(() => {
    let cancelled = false;
    listOfflineOperations(userId).then((storedOperations) => {
      if (!cancelled) {
        setOperations(storedOperations);
      }
    }).catch(() => {
      if (!cancelled) {
        setError(DELIVERY_ERROR_MESSAGES.NO_SE_PUDIERON_LEER_LOS_CAMBIOS_Y_DOCUMENTOS_GUARDADOS_EN_ESTE_DISPOSITIVO);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (eventId && events.some((event) => event.id === eventId)) {
      return;
    }
    setEventId(events[0]?.id ?? "");
  }, [eventId, events]);

  async function refreshOperations() {
    setOperations(await listOfflineOperations(userId));
  }

  function updateParticipant(familyMemberId: string, checked: boolean | "indeterminate") {
    if (checked === "indeterminate") {
      return;
    }
    setParticipants((current) => {
      if (checked) {
        return [...current, { familyMemberId, paperSignatureChecked: false, physicalDniChecked: false }];
      }
      return current.filter((participant) => participant.familyMemberId !== familyMemberId);
    });
  }

  function updateParticipantCheck(familyMemberId: string, key: "paperSignatureChecked" | "physicalDniChecked", checked: boolean | "indeterminate") {
    if (checked === "indeterminate") {
      return;
    }
    setParticipants((current) => current.map((participant) => participant.familyMemberId === familyMemberId ? { ...participant, [key]: checked } : participant));
  }

  async function saveFamilyDelivery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedDelivery = familyDeliveryPayloadSchema.safeParse({ kind: "family-delivery", id: crypto.randomUUID(), eventId, familyId, participants });
    if (!parsedDelivery.success || !selectedEvent || !selectedFamily) {
      setError(DELIVERY_UI_TEXT.FAMILY_DELIVERY_FORM_REQUIRED);
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      await enqueueOfflineOperation(userId, sessionExpiresAt, {
        resource: "records",
        resourceId: parsedDelivery.data.id,
        operation: "create",
        baseVersion: null,
        dependencies: [],
        payload: jsonValueSchema.parse(parsedDelivery.data),
      });
      if (isOnline) {
        await synchronizeOfflineQueue(userId);
      }
      await refreshOperations();
      const matchingOperation = (await listOfflineOperations(userId)).find((operation) => operation.resourceId === parsedDelivery.data.id);
      if (matchingOperation?.status === "synced") {
        setNotice(DELIVERY_UI_TEXT.FAMILY_DELIVERY_SAVED);
        try {
          await onRefresh();
        } catch {
          setNotice(`${DELIVERY_UI_TEXT.FAMILY_DELIVERY_SAVED} ${DELIVERY_UI_TEXT.REGISTRO_GUARDADO_EN_EL_SERVIDOR_NO_SE_PUDO_ACTUALIZAR_LA_LISTA_REINTENTA_}`);
        }
      } else if (!isOnline) {
        setNotice(DELIVERY_UI_TEXT.FAMILY_DELIVERY_PENDING);
      } else {
        setError(matchingOperation?.message ?? DELIVERY_ERROR_MESSAGES.LA_FAMILIA_YA_TIENE_UN_RETIRO_REGISTRADO_EN_ESTE_PERIODO);
      }
      setFamilyId("");
      setParticipants([]);
    } catch (saveError) {
      setError(getClientErrorMessage(saveError, DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_GUARDAR_EL_REGISTRO));
      await refreshOperations();
    } finally {
      setIsSaving(false);
    }
  }

  async function issueEventSheet() {
    if (!selectedEvent || !period || !eventDeliveries.length) {
      setError(DELIVERY_ERROR_MESSAGES.SELECCIONA_EL_PERIODO_Y_AL_MENOS_UN_BENEFICIARIO_PARA_EMITIR_LA_PLANILLA);
      return;
    }
    const beneficiaries = eventDeliveries.flatMap((delivery) => delivery.participants.flatMap((participant) => {
      const family = data.families.find((entry) => entry.id === delivery.familyId);
      const member = family?.members.find((entry) => entry.id === participant.familyMemberId);
      if (!member || !family) {
        return [];
      }
      return [{
        personId: member.person.id,
        familyMemberId: member.id,
        familyDeliveryId: delivery.id,
        name: personName(member),
        dni: member.person.dni ?? "",
        familyName: family.name,
        address: family.address,
        neighborhood: family.neighborhood,
        paperSignatureChecked: participant.paperSignatureChecked,
        physicalDniChecked: participant.physicalDniChecked,
      }];
    }));
    const missingDni = beneficiaries.filter((beneficiary) => !/^\d{7,8}$/.test(beneficiary.dni));
    if (missingDni.length) {
      setError(DELIVERY_UI_TEXT.EVENT_SHEET_MISSING_DNI(missingDni.map((beneficiary) => beneficiary.name)));
      return;
    }

    setIsIssuingSheet(true);
    setError("");
    setNotice("");
    try {
      const selectedPeriodBeneficiaries = beneficiaries.map(({ personId }) => personId);
      if (!isOnline) {
        const draft = beneficiarySheetDraftSchema.parse({
          kind: "beneficiary-sheet",
          id: crypto.randomUUID(),
          periodId,
          distributionEventId: selectedEvent.id,
          event: { scheduledAt: selectedEvent.scheduledAt, location: selectedEvent.location, responsibleNames: selectedEvent.responsibleNames },
          period: { label: period.label, agency: period.agency, startsAt: period.startsAt.slice(0, 10), endsAt: period.endsAt.slice(0, 10) },
          templateVersion: 2,
          beneficiaries,
        });
        const logoResponse = await clientAxios.get<ArrayBuffer>(BRAND.institutionLogoPath, { responseType: HTTP_RESPONSE_TYPES.ARRAY_BUFFER });
        const pdfBytes = await createLocalBeneficiarySheetPdf(draft, new Uint8Array(logoResponse.data));
        const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
        new Uint8Array(pdfBuffer).set(pdfBytes);
        const content = new Blob([pdfBuffer], { type: HTTP_CONTENT_TYPES.PDF });
        const localDocumentId = `local:${draft.id}`;
        const document: OfflinePreparedDocument = { id: localDocumentId, originalName: `planilla-jornada-${selectedEvent.id}-local-${draft.id.slice(0, 8)}.pdf`, contentType: HTTP_CONTENT_TYPES.PDF, byteSize: content.size, content, documentType: "beneficiary-sheet-local" };
        await saveOfflinePreparedDocument(userId, document);
        const dependencies = operations.flatMap((operation) => {
          const pendingDelivery = familyDeliveryPayloadSchema.safeParse(operation.payload);
          if (pendingDelivery.success && pendingDelivery.data.eventId === selectedEvent.id && operation.status !== "synced") {
            return [operation.operationId];
          }
          return [];
        });
        try {
          await enqueueOfflineOperation(userId, sessionExpiresAt, { resource: "records", resourceId: draft.id, operation: "create", baseVersion: null, dependencies, payload: jsonValueSchema.parse(draft) });
        } catch (queueError) {
          await removeOfflinePreparedDocument(userId, localDocumentId);
          throw queueError;
        }
        onOfflineDocumentCreated(document);
        downloadPdf(content, document.originalName);
        await refreshOperations();
        setNotice(DELIVERY_UI_TEXT.EVENT_SHEET_DRAFT_SAVED);
        return;
      }

      const response = await clientAxios.post<unknown>(API_ROUTES.RECORD_SHEETS, { periodId, distributionEventId: selectedEvent.id, personIds: selectedPeriodBeneficiaries });
      const parsedResponse = beneficiarySheetResponseSchema.safeParse(response.data);
      if (!parsedResponse.success) {
        throw new Error(DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_EMITIR_LA_PLANILLA);
      }
      const { sheet } = parsedResponse.data;
      const pdfResponse = await clientAxios.get<Blob>(API_ROUTES.RECORD_SHEET(sheet.id), { responseType: HTTP_RESPONSE_TYPES.BLOB, headers: NO_STORE_REQUEST_HEADERS });
      downloadPdf(pdfResponse.data, `planilla-jornada-${selectedEvent.id}-v${sheet.version}.pdf`);
      setNotice(DELIVERY_UI_TEXT.PLANILLA_EMITIDA(sheet.version, beneficiaries.length));
      await onRefresh();
    } catch (issueError) {
      setError(getClientErrorMessage(issueError, DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_EMITIR_LA_PLANILLA_CON_PUNTO));
    } finally {
      setIsIssuingSheet(false);
    }
  }

  const deliveredModules = eventDeliveries.reduce((total, delivery) => total + delivery.moduleQuantity, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={UserGroupIcon} className="text-primary" />{DELIVERY_UI_TEXT.FAMILY_DELIVERIES_TITLE}</CardTitle>
        <CardDescription>{DELIVERY_UI_TEXT.FAMILY_DELIVERIES_DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {notice ? <Alert variant="info"><AlertDescription>{notice}</AlertDescription></Alert> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="family-delivery-event">{DELIVERY_UI_TEXT.EVENT}</FieldLabel>
            <Select value={eventId} onValueChange={(value) => { setEventId(value); setFamilyId(""); setParticipants([]); }} disabled={!events.length}>
              <SelectTrigger id="family-delivery-event"><SelectValue placeholder="Seleccionar jornada" /></SelectTrigger>
              <SelectContent>{events.map((event) => <SelectItem key={event.id} value={event.id}>{event.scheduledAt} · {event.location}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="flex items-end sm:col-span-2"><Badge variant="outline" className="min-h-10 w-fit">{DELIVERY_UI_TEXT.FAMILY_DELIVERED_COUNT(new Set(eventDeliveries.map((delivery) => delivery.familyId)).size, deliveredModules)}</Badge></div>
        </div>

        {canWrite && selectedEvent ? <form className="flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-4" onSubmit={(event) => void saveFamilyDelivery(event)}>
          <Field>
            <FieldLabel htmlFor="family-delivery-family">{DELIVERY_UI_TEXT.FAMILY}</FieldLabel>
            <Select value={familyId} onValueChange={(value) => { setFamilyId(value); setParticipants([]); }} disabled={!availableFamilies.length || isSaving}>
              <SelectTrigger id="family-delivery-family"><SelectValue placeholder="Elegir una familia con módulo asignado" /></SelectTrigger>
              <SelectContent>{availableFamilies.map((family) => <SelectItem key={family.id} value={family.id}>{family.name} · {family.neighborhood}</SelectItem>)}</SelectContent>
            </Select>
            {!availableFamilies.length ? <FieldDescription>Las familias con retiro registrado o sin módulo asignado no aparecen en esta lista.</FieldDescription> : null}
          </Field>
          {familyMembers.length ? <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">{DELIVERY_UI_TEXT.PARTICIPANTS}</p>
            {familyMembers.map((member) => {
              const participant = participants.find((entry) => entry.familyMemberId === member.id);
              return <div key={member.id} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
                <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><Checkbox checked={Boolean(participant)} onCheckedChange={(checked) => updateParticipant(member.id, checked)} aria-label={`Incluir a ${personName(member)} en el retiro`} />{personName(member)}{member.person.dni ? ` · DNI ${member.person.dni}` : " · Sin DNI"}</label>
                {participant ? <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex min-h-11 items-center gap-3 rounded-md bg-muted/60 p-2 text-sm"><Checkbox checked={participant.physicalDniChecked} onCheckedChange={(checked) => updateParticipantCheck(member.id, "physicalDniChecked", checked)} aria-label={`${DELIVERY_UI_TEXT.PHYSICAL_DNI_CHECKED}: ${personName(member)}`} />{DELIVERY_UI_TEXT.PHYSICAL_DNI_CHECKED}</label>
                  <label className="flex min-h-11 items-center gap-3 rounded-md bg-muted/60 p-2 text-sm"><Checkbox checked={participant.paperSignatureChecked} onCheckedChange={(checked) => updateParticipantCheck(member.id, "paperSignatureChecked", checked)} aria-label={`${DELIVERY_UI_TEXT.PAPER_SIGNATURE_RECORDED}: ${personName(member)}`} /><span>{participant.paperSignatureChecked ? DELIVERY_UI_TEXT.PAPER_SIGNATURE_RECORDED : DELIVERY_UI_TEXT.PAPER_SIGNATURE_PENDING}</span></label>
                </div> : null}
              </div>;
            })}
          </div> : null}
          <Button type="submit" className="w-full sm:w-fit" disabled={isSaving || !familyId || !participants.length}>{isSaving ? DELIVERY_UI_TEXT.FAMILY_DELIVERY_RECORDING : DELIVERY_UI_TEXT.FAMILY_DELIVERY_SUBMIT}</Button>
        </form> : null}

        {selectedEvent ? <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">Retiros de {selectedEvent.scheduledAt}</p><p className="text-xs text-muted-foreground">{selectedEvent.location} · {selectedEvent.responsibleNames}</p></div><Button variant="outline" onClick={() => void issueEventSheet()} disabled={isIssuingSheet || !eventDeliveries.length}><HugeiconsIcon icon={File01Icon} data-icon="inline-start" />{isIssuingSheet ? DELIVERY_UI_TEXT.PREPARANDO_PLANILLA : DELIVERY_UI_TEXT.EVENT_SHEET_SUBMIT}</Button></div>
          {eventDeliveries.length ? <ul className="divide-y divide-border rounded-lg border border-border">{eventDeliveries.map((delivery) => <li key={delivery.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-medium">{delivery.familyName} · {delivery.moduleQuantity} módulo</p><ul className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">{delivery.participants.map((participant) => <li key={participant.id}>{participant.name} · DNI {participant.physicalDniChecked ? "cotejado" : "pendiente"} · {participant.paperSignatureChecked ? DELIVERY_UI_TEXT.PAPER_SIGNATURE_RECORDED : DELIVERY_UI_TEXT.PAPER_SIGNATURE_PENDING}</li>)}</ul></div>{pendingDeliveries.some((pending) => pending.id === delivery.id) ? <Badge variant="outline">{DELIVERY_UI_TEXT.PENDIENTE}</Badge> : null}</li>)}</ul> : <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">Todavía no hay retiros registrados para esta jornada.</p>}
        </div> : <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">No hay jornadas de familias preparadas para este período.</p>}
        {!canWrite ? <p className="text-sm text-muted-foreground">Tu rol puede consultar los retiros, pero no registrarlos.</p> : null}
      </CardContent>
    </Card>
  );
}
