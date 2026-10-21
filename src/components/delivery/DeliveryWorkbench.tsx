"use client";

import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar03Icon, Download04Icon, File01Icon, PackageIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { enqueueOfflineOperation, listOfflineOperations, synchronizeOfflineQueue } from "@/services/offline-queue.service";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import type { JsonValue } from "@/types/json-value";

interface DeliveryPeriod {
  id: string;
  label: string;
  agency: string;
  startsAt: string;
  endsAt: string;
}

interface DistributionRecord {
  id: string;
  personId: string;
  receivedAt: string;
  moduleType: string;
  quantity: number;
  person: { firstName: string; lastName: string; dni: string | null };
  family: { id: string; name: string };
}

interface BeneficiarySheet {
  id: string;
  version: number;
  createdAt: string;
}

interface DeliveryFamily {
  id: string;
  name: string;
  neighborhood: string;
  address: string;
  members: Array<{
    id: string;
    relationship: string;
    person: { id: string; firstName: string; lastName: string; dni: string | null };
  }>;
}

interface WorkbenchData {
  periods: DeliveryPeriod[];
  families: DeliveryFamily[];
  records: DistributionRecord[];
  sheets: BeneficiarySheet[];
}

interface DeliveryWorkbenchProps {
  userId: string;
  sessionExpiresAt: string;
  canWrite: boolean;
}

const emptyData: WorkbenchData = { periods: [], families: [], records: [], sheets: [] };

function localDate() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function personLabel(person: DeliveryFamily["members"][number]["person"]) {
  return `${person.firstName} ${person.lastName}`;
}

export function DeliveryWorkbench({ userId, sessionExpiresAt, canWrite }: DeliveryWorkbenchProps) {
  const isOnline = useNetworkStatus();
  const [data, setData] = useState<WorkbenchData>(emptyData);
  const [periodId, setPeriodId] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [personId, setPersonId] = useState("");
  const [moduleType, setModuleType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [receivedAt, setReceivedAt] = useState(localDate());
  const [physicalDniChecked, setPhysicalDniChecked] = useState(false);
  const [documentsChecked, setDocumentsChecked] = useState(false);
  const [notes, setNotes] = useState("");
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isIssuingSheet, setIsIssuingSheet] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const fetchData = useCallback(async (selectedPeriodId?: string) => {
    const query = selectedPeriodId ? `?periodId=${encodeURIComponent(selectedPeriodId)}` : "";
    const response = await fetch(`/api/records${query}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("No pudimos cargar los períodos y el padrón. Conectate para actualizar los datos.");
    }

    const result = await response.json() as WorkbenchData;
    setData((current) => ({ ...result, records: selectedPeriodId ? result.records : current.records, sheets: selectedPeriodId ? result.sheets : current.sheets }));

    if (!selectedPeriodId && !periodId && result.periods[0]) {
      setPeriodId(result.periods[0].id);
    }
  }, [periodId]);

  useEffect(() => {
    let cancelled = false;

    if (!isOnline) {
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setError("");
    fetchData(periodId || undefined)
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el registro.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchData, isOnline, periodId]);

  const selectedPeriod = data.periods.find((period) => period.id === periodId);
  const selectedFamily = data.families.find((family) => family.id === familyId);
  const familyMembers = selectedFamily?.members ?? [];
  const recordedPeople = new Set(data.records.map((record) => record.personId));

  function toggleBeneficiary(beneficiaryId: string, checked: boolean | "indeterminate") {
    if (checked === "indeterminate") {
      return;
    }

    setSelectedPersonIds((personIds) => checked
      ? [...new Set([...personIds, beneficiaryId])]
      : personIds.filter((id) => id !== beneficiaryId));
  }

  async function saveRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPeriod || !selectedFamily || !personId || !moduleType.trim()) {
      setError("Completá el módulo, el grupo y el beneficiario antes de confirmar.");
      return;
    }

    setIsSaving(true);
    setNotice("");
    setError("");
    const recordId = crypto.randomUUID();
    const payload: JsonValue = {
      kind: "distribution-record",
      id: recordId,
      periodId,
      familyId,
      personId,
      receivedAt,
      moduleType: moduleType.trim(),
      quantity: Number(quantity),
      physicalDniChecked,
      documentsChecked,
      notes: notes.trim(),
    };

    try {
      await enqueueOfflineOperation(userId, sessionExpiresAt, {
        resource: "records",
        resourceId: recordId,
        operation: "create",
        baseVersion: null,
        dependencies: [],
        payload,
      });

      if (isOnline) {
        await synchronizeOfflineQueue(userId);
      }

      const operations = await listOfflineOperations(userId);
      const matchingOperation = operations.find((operation) => operation.resourceId === recordId);

      if (matchingOperation?.status === "synced") {
        setNotice("Registro guardado en el servidor.");
        setFamilyId("");
        setPersonId("");
        setNotes("");
        setPhysicalDniChecked(false);
        setDocumentsChecked(false);
        await fetchData(periodId);
      } else if (matchingOperation?.status === "conflict") {
        setError(matchingOperation.message ?? "Este beneficiario ya tiene un registro en el período seleccionado.");
      } else if (matchingOperation?.status === "error") {
        setNotice(`Pendiente de sincronización: ${matchingOperation.message ?? "el borrador sigue guardado en este dispositivo."}`);
      } else {
        setNotice("Pendiente de sincronización. El borrador quedó guardado en este dispositivo.");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el registro.");
    } finally {
      setIsSaving(false);
    }
  }

  async function issueSheet() {
    if (!periodId || selectedPersonIds.length === 0) {
      setError("Seleccioná el período y al menos un beneficiario para emitir la planilla.");
      return;
    }

    setIsIssuingSheet(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/records/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, personIds: selectedPersonIds }),
      });
      const result = await response.json() as { sheet?: BeneficiarySheet; error?: { message?: string } };

      if (!response.ok || !result.sheet) {
        throw new Error(result.error?.message ?? "No se pudo emitir la planilla.");
      }

      setNotice(`Planilla versión ${result.sheet.version} emitida con ${selectedPersonIds.length} beneficiarios.`);
      setSelectedPersonIds([]);
      await fetchData(periodId);
      window.location.assign(`/api/records/sheets/${encodeURIComponent(result.sheet.id)}`);
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : "No se pudo emitir la planilla.");
    } finally {
      setIsIssuingSheet(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Distribución comunitaria</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">Beneficiarios y planillas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Registrá la entrega del módulo y prepará el listado para imprimir y firmar a mano.</p>
        </div>
        <Badge variant={isOnline ? "success" : "warning"} className="w-fit">{isOnline ? "Conectado" : "Sin conexión"}</Badge>
      </header>

      {error ? <Alert variant="destructive"><AlertTitle>No se completó la operación</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {notice ? <Alert variant="info"><AlertTitle>Estado del registro</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={Calendar03Icon} className="text-primary" /> Módulo o período</CardTitle>
          <CardDescription>Elegí un período activo para consultar beneficiarios, registros y planillas emitidas.</CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="record-period">Período</FieldLabel>
            <Select value={periodId} onValueChange={(value) => { setPeriodId(value); setSelectedPersonIds([]); }}>
              <SelectTrigger id="record-period" aria-label="Seleccionar módulo o período"><SelectValue placeholder="Seleccionar un período" /></SelectTrigger>
              <SelectContent>
                {data.periods.map((period) => <SelectItem key={period.id} value={period.id}>{period.label} · {period.agency}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {selectedPeriod ? <p className="mt-3 text-xs text-muted-foreground">Vigencia: {selectedPeriod.startsAt.slice(0, 10)} al {selectedPeriod.endsAt.slice(0, 10)}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        {canWrite ? <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={PackageIcon} className="text-primary" /> Registrar beneficiario</CardTitle>
            <CardDescription>Los cambios se guardan en el servidor o quedan en la cola local hasta recuperar conexión.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={(event) => void saveRecord(event)}>
              <FieldGroup className="gap-4 sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="record-family">Grupo familiar</FieldLabel>
                  <Select value={familyId} onValueChange={(value) => { setFamilyId(value); setPersonId(""); }}>
                    <SelectTrigger id="record-family"><SelectValue placeholder="Seleccionar grupo" /></SelectTrigger>
                    <SelectContent>{data.families.map((family) => <SelectItem key={family.id} value={family.id}>{family.name} · {family.neighborhood}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="record-person">Beneficiario</FieldLabel>
                  <Select value={personId} onValueChange={setPersonId} disabled={!familyId}>
                    <SelectTrigger id="record-person"><SelectValue placeholder="Seleccionar persona" /></SelectTrigger>
                    <SelectContent>{familyMembers.map((member) => <SelectItem key={member.person.id} value={member.person.id}>{personLabel(member.person)}{member.person.dni ? ` · DNI ${member.person.dni}` : " · Falta DNI"}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="record-type">Tipo de módulo</FieldLabel>
                  <Input id="record-type" value={moduleType} onChange={(event) => setModuleType(event.target.value)} maxLength={100} required placeholder="Ej.: módulo familiar seco" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="record-quantity">Cantidad</FieldLabel>
                  <Input id="record-quantity" type="number" min="1" max="1000" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="record-date">Fecha de entrega</FieldLabel>
                  <Input id="record-date" type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required />
                </Field>
              </FieldGroup>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/60 p-3 text-sm">
                  <Checkbox checked={physicalDniChecked} onCheckedChange={(checked) => { if (checked === "indeterminate") return; setPhysicalDniChecked(checked); }} aria-label="DNI físico cotejado" />
                  <span>DNI físico cotejado</span>
                </label>
                <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/60 p-3 text-sm">
                  <Checkbox checked={documentsChecked} onCheckedChange={(checked) => { if (checked === "indeterminate") return; setDocumentsChecked(checked); }} aria-label="Documentación comprobada" />
                  <span>Documentación comprobada</span>
                </label>
              </div>

              <Field><FieldLabel htmlFor="record-notes">Observaciones</FieldLabel><Textarea id="record-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} /></Field>
              <Button type="submit" className="w-full sm:w-auto" disabled={!periodId || isSaving || isLoading}>
                {isSaving ? "Guardando…" : "Confirmar registro"}
              </Button>
            </form>
          </CardContent>
        </Card> : null}

        {canWrite ? <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={UserGroupIcon} className="text-primary" /> Planilla para firma en papel</CardTitle>
            <CardDescription>Seleccioná personas del padrón. La descarga no depende de confirmar sus entregas ni completar una rendición.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
              {data.families.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No hay grupos cargados en el padrón.</p> : data.families.map((family) => (
                <section key={family.id} className="border-b border-border last:border-b-0">
                  <h3 className="bg-muted/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide">{family.name} · {family.neighborhood}</h3>
                  {family.members.map((member) => {
                    const person = member.person;
                    const checked = selectedPersonIds.includes(person.id);
                    const alreadyRecorded = recordedPeople.has(person.id);

                    return (
                      <label key={person.id} className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                        <Checkbox checked={checked} onCheckedChange={(value) => toggleBeneficiary(person.id, value)} aria-label={`Incluir a ${personLabel(person)} en la planilla`} />
                        <span className="min-w-0 flex-1"><strong className="block truncate">{personLabel(person)}</strong><span className="text-xs text-muted-foreground">DNI {person.dni ?? "pendiente"} · {family.address}</span></span>
                        {alreadyRecorded ? <Badge variant="secondary">Registrado</Badge> : null}
                      </label>
                    );
                  })}
                </section>
              ))}
            </div>
            <Button onClick={() => void issueSheet()} disabled={!isOnline || !periodId || selectedPersonIds.length === 0 || isIssuingSheet}>
              <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />
              {isIssuingSheet ? "Preparando planilla…" : `Descargar PDF${selectedPersonIds.length ? ` · ${selectedPersonIds.length}` : ""}`}
            </Button>
            {!isOnline ? <p className="text-xs text-muted-foreground">Una planilla ya descargada sigue disponible en tu dispositivo. Para emitir otra, conectate al servidor.</p> : null}
          </CardContent>
        </Card> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registros y planillas emitidas</CardTitle>
          <CardDescription>La versión conserva los nombres, DNI y domicilios exactos incluidos al emitir cada PDF.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby="records-heading">
            <h3 id="records-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold"><HugeiconsIcon icon={PackageIcon} className="text-primary" /> Entregas registradas ({data.records.length})</h3>
            {data.records.length ? <ul className="flex flex-col divide-y divide-border">{data.records.map((record) => <li key={record.id} className="flex items-start justify-between gap-3 py-3 text-sm"><span className="min-w-0"><strong className="block truncate">{record.person.firstName} {record.person.lastName}</strong><span className="text-xs text-muted-foreground">{record.family.name} · {record.moduleType} · {record.quantity} unidad(es)</span></span><Badge variant="success">Guardado</Badge></li>)}</ul> : <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">Todavía no hay registros confirmados en este período.</p>}
          </section>
          <section aria-labelledby="sheets-heading">
            <h3 id="sheets-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold"><HugeiconsIcon icon={File01Icon} className="text-primary" /> Versiones de planilla</h3>
            {data.sheets.length ? <ul className="flex flex-col divide-y divide-border">{data.sheets.map((sheet) => <li key={sheet.id} className="flex items-center justify-between gap-3 py-3"><span className="text-sm"><strong>Versión {sheet.version}</strong><span className="block text-xs text-muted-foreground">Emitida {new Date(sheet.createdAt).toLocaleString("es-AR")}</span></span><Button asChild variant="outline" size="sm" disabled={!isOnline}><a href={`/api/records/sheets/${encodeURIComponent(sheet.id)}`}><HugeiconsIcon icon={Download04Icon} data-icon="inline-start" /> Descargar</a></Button></li>)}</ul> : <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">Las planillas que emitas aparecerán acá con su versión.</p>}
          </section>
        </CardContent>
      </Card>

      {isLoading ? <p className="sr-only" role="status">Cargando datos del padrón</p> : null}
    </div>
  );
}
