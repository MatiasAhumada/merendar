"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { FamilyDocumentType } from "@prisma/client";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Call02Icon,
  CloudUploadIcon,
  Location01Icon,
  Search01Icon,
  UserAdd01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FAMILY_DOCUMENT_LABELS, FAMILY_DOCUMENT_OPTIONS, FAMILY_MEMBER_RELATIONSHIPS, FAMILY_NEIGHBORHOODS } from "@/constants/families.constant";
import type { FamilyRecord } from "@/interfaces/family.interface";
import type { JsonObject } from "@/types/json-value";
import type { FamilyPersonInput } from "@/types/family";
import { enqueueOfflineOperation, listOfflineOperations, synchronizeOfflineQueue, updateOfflineOperationPayload } from "@/services/offline-queue.service";
import type { OfflineOperation } from "@/types/offline-operation";
import { familyPayloadSchema, type FamilyPayload } from "@/validations/family.validation";
import { z } from "zod";

interface FamilyRegistryProps {
  initialFamilies: FamilyRecord[];
  userId: string;
  sessionExpiresAt: string;
  canWrite: boolean;
}

interface FamilyFormMember extends FamilyPersonInput {
  localId: string;
}

const familyDocumentSchema = z.object({ id: z.string(), documentType: z.enum(FamilyDocumentType) });
const familyPersonSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  dni: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  relationship: z.string(),
  missingDocuments: z.array(familyDocumentSchema),
});
const familyResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  neighborhood: z.string(),
  address: z.string(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  referencePersonId: z.string().nullable(),
  members: z.array(z.object({ id: z.string(), person: familyPersonSchema, missingDocuments: z.array(familyDocumentSchema) })),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const familiesResponseSchema = z.object({ families: z.array(familyResponseSchema) });

function createEmptyMember(): FamilyFormMember {
  return {
    localId: crypto.randomUUID(),
    firstName: "",
    lastName: "",
    relationship: "Hija o hijo",
    missingDocuments: [],
  };
}

function normalizeFamilies(families: z.infer<typeof familyResponseSchema>[]): FamilyRecord[] {
  return families.map((family) => ({
    ...family,
    members: family.members.map((member) => ({ ...member.person, missingDocuments: member.missingDocuments })),
  }));
}

function toFamilyJsonPayload(family: FamilyPayload): JsonObject {
  const payload: JsonObject = {
    name: family.name,
    neighborhood: family.neighborhood,
    address: family.address,
    referenceMemberIndex: family.referenceMemberIndex,
    members: family.members.map((member) => {
      const person: JsonObject = {
        firstName: member.firstName,
        lastName: member.lastName,
        relationship: member.relationship,
        missingDocuments: [...member.missingDocuments],
      };

      if (member.dni) {
        person.dni = member.dni;
      }

      if (member.email) {
        person.email = member.email;
      }

      if (member.phone) {
        person.phone = member.phone;
      }

      return person;
    }),
  };

  if (family.contactPhone) {
    payload.contactPhone = family.contactPhone;
  }

  if (family.contactEmail) {
    payload.contactEmail = family.contactEmail;
  }

  return payload;
}

function familyFromOfflineOperation(operation: OfflineOperation): FamilyRecord | null {
  const parsedFamily = familyPayloadSchema.safeParse(operation.payload);

  if (!parsedFamily.success) {
    return null;
  }

  const members = parsedFamily.data.members.map((member, index) => ({
    id: `${operation.resourceId}-person-${index}`,
    firstName: member.firstName,
    lastName: member.lastName,
    dni: member.dni ?? null,
    email: member.email ?? null,
    phone: member.phone ?? null,
    relationship: member.relationship,
    missingDocuments: member.missingDocuments.map((documentType, documentIndex) => ({
      id: `${operation.resourceId}-document-${index}-${documentIndex}`,
      documentType,
    })),
  }));
  const referenceMember = members[parsedFamily.data.referenceMemberIndex];

  return {
    id: operation.resourceId,
    name: parsedFamily.data.name,
    neighborhood: parsedFamily.data.neighborhood,
    address: parsedFamily.data.address,
    contactPhone: parsedFamily.data.contactPhone ?? null,
    contactEmail: parsedFamily.data.contactEmail ?? null,
    referencePersonId: referenceMember?.id ?? null,
    members,
    createdAt: operation.createdAt,
    updatedAt: operation.createdAt,
  };
}

function offlineStatusLabel(operation: OfflineOperation) {
  if (operation.status === "conflict") {
    return "Conflicto por DNI";
  }

  if (operation.status === "error") {
    return "Pendiente de atención";
  }

  if (operation.status === "syncing") {
    return "Sincronizando";
  }

  return "Pendiente de sincronización";
}

function getMemberCountLabel(count: number) {
  return `${count} ${count === 1 ? "integrante" : "integrantes"}`;
}

function FamilyDetails({ family, onClose }: { family: FamilyRecord; onClose: () => void }) {
  const referencePerson = family.members.find((member) => member.id === family.referencePersonId);

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
        <SheetHeader className="pr-12">
          <SheetTitle className="font-display text-xl font-semibold">{family.name}</SheetTitle>
          <SheetDescription>Ficha familiar · padrón comunitario</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-6 pb-6">
          <div className="space-y-3 rounded-xl bg-muted p-4 text-sm">
            <div><p className="text-xs text-muted-foreground">Domicilio</p><p className="font-medium">Barrio {family.neighborhood} · {family.address}</p></div>
            <div><p className="text-xs text-muted-foreground">Contacto del grupo</p><p className="font-medium">{family.contactPhone || "Sin teléfono"} · {family.contactEmail || "Sin email"}</p></div>
            <div><p className="text-xs text-muted-foreground">Referente</p><p className="font-medium">{referencePerson ? `${referencePerson.firstName} ${referencePerson.lastName}` : "Sin referente"}</p></div>
          </div>
          <section aria-label="Integrantes de la familia" className="space-y-3">
            <h3 className="font-semibold">Integrantes ({family.members.length})</h3>
            {family.members.map((member) => (
              <Card key={member.id} size="sm">
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-muted-foreground">{member.relationship}{member.id === family.referencePersonId ? " · referente" : ""}</p>
                    </div>
                    <Badge variant={member.missingDocuments.length ? "warning" : "success"}>
                      {member.missingDocuments.length ? "Documentación pendiente" : "Documentación completa"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><p className="text-xs text-muted-foreground">DNI</p><p>{member.dni || "Sin informar"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Contacto</p><p>{member.phone || member.email || "Sin informar"}</p></div>
                  </div>
                  {member.missingDocuments.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {member.missingDocuments.map((document) => <Badge key={document.id} variant="warning">{FAMILY_DOCUMENT_LABELS[document.documentType]}</Badge>)}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </section>
        </div>
        <SheetFooter><SheetClose asChild><Button variant="outline">Cerrar ficha</Button></SheetClose></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function FamilyRegistry({ initialFamilies, userId, sessionExpiresAt, canWrite }: FamilyRegistryProps) {
  const [families, setFamilies] = useState(initialFamilies);
  const [offlineOperations, setOfflineOperations] = useState<OfflineOperation[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedFamily, setSelectedFamily] = useState<FamilyRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [members, setMembers] = useState<FamilyFormMember[]>([createEmptyMember()]);
  const [referenceMemberId, setReferenceMemberId] = useState(members[0]?.localId ?? "");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState("");
  const [editingOperation, setEditingOperation] = useState<OfflineOperation | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
  const [formMessage, setFormMessage] = useState("");
  const [queueMessage, setQueueMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const refreshOfflineFamilies = useCallback(async () => {
    try {
      const operations = await listOfflineOperations(userId);
      setOfflineOperations(operations.filter((operation) =>
        operation.resource === "families" && operation.operation === "create" && operation.status !== "synced",
      ));
      setQueueMessage("");
    } catch {
      setQueueMessage("No se pudo leer la cola offline de esta cuenta.");
    }
  }, [userId]);
  const refreshFamilies = useCallback(async () => {
    const response = await fetch("/api/families", { cache: "no-store" });
    const parsedResponse = familiesResponseSchema.safeParse(await response.json());

    if (!response.ok || !parsedResponse.success) {
      throw new Error("No se pudo actualizar el padrón");
    }

    setFamilies(normalizeFamilies(parsedResponse.data.families));
  }, []);
  const familyOperations = useMemo(() => offlineOperations.filter((operation) => operation.resource === "families"), [offlineOperations]);
  const localFamilies = useMemo(() => familyOperations.flatMap((operation) => {
    const family = familyFromOfflineOperation(operation);

    if (!family) {
      return [];
    }

    return [family];
  }), [familyOperations]);
  const allFamilies = useMemo(() => [...families, ...localFamilies], [families, localFamilies]);
  let editingPayload: FamilyPayload | undefined;

  if (editingOperation) {
    const parsedPayload = familyPayloadSchema.safeParse(editingOperation.payload);

    if (parsedPayload.success) {
      editingPayload = parsedPayload.data;
    }
  }
  let submitLabel = "Guardar familia";

  if (editingOperation) {
    submitLabel = "Guardar corrección";
  }

  if (isSaving) {
    submitLabel = "Guardando...";
  }
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const neighborhoods = useMemo(() => [...new Set(allFamilies.map((family) => family.neighborhood))].sort(), [allFamilies]);
  const visibleFamilies = allFamilies.filter((family) => {
    const memberText = family.members.map((member) => `${member.firstName} ${member.lastName} ${member.dni ?? ""}`).join(" ");
    const matchesSearch = `${family.name} ${family.neighborhood} ${family.address} ${memberText}`.toLocaleLowerCase("es").includes(normalizedSearch);
    let matchesNeighborhood = filter === "all";

    if (filter === "alerts") {
      matchesNeighborhood = family.members.some((member) => member.missingDocuments.length);
    }

    if (filter !== "all" && filter !== "alerts") {
      matchesNeighborhood = family.neighborhood === filter;
    }

    return matchesSearch && matchesNeighborhood;
  });
  const alertCount = allFamilies.filter((family) => family.members.some((member) => member.missingDocuments.length)).length;

  useEffect(() => {
    void refreshOfflineFamilies();
    const handleQueueChange = () => {
      void refreshOfflineFamilies();

      if (navigator.onLine) {
        void refreshFamilies().catch(() => undefined);
      }
    };
    window.addEventListener("offline-queue-change", handleQueueChange);

    return () => window.removeEventListener("offline-queue-change", handleQueueChange);
  }, [refreshFamilies, refreshOfflineFamilies]);

  function updateMember(localId: string, updater: (member: FamilyFormMember) => FamilyFormMember) {
    setMembers((currentMembers) => currentMembers.map((member) => {
      if (member.localId === localId) {
        return updater(member);
      }

      return member;
    }));
  }

  function closeForm() {
    setIsFormOpen(false);
    setMembers([createEmptyMember()]);
    setReferenceMemberId("");
    setSelectedNeighborhood("");
    setEditingOperation(null);
    setFormErrors({});
    setFormMessage("");
  }

  function editOfflineFamily(operation: OfflineOperation) {
    const parsedPayload = familyPayloadSchema.safeParse(operation.payload);

    if (!parsedPayload.success) {
      setQueueMessage("No se pudo abrir este borrador para corregirlo.");
      return;
    }

    const nextMembers = parsedPayload.data.members.map((member) => ({ ...member, localId: crypto.randomUUID() }));
    const referenceMember = nextMembers[parsedPayload.data.referenceMemberIndex];
    setEditingOperation(operation);
    setSelectedNeighborhood(parsedPayload.data.neighborhood);
    setMembers(nextMembers);
    setReferenceMemberId(referenceMember?.localId ?? "");
    setFormErrors({});
    setFormMessage("");
    setIsFormOpen(true);
  }

  async function submitFamily(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFormMessage("");
    setFormErrors({});
    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") ?? ""),
      neighborhood: String(formData.get("neighborhood") ?? ""),
      address: String(formData.get("address") ?? ""),
      contactPhone: String(formData.get("contactPhone") ?? "") || undefined,
      contactEmail: String(formData.get("contactEmail") ?? "") || undefined,
      referenceMemberIndex: members.findIndex((member) => member.localId === referenceMemberId),
      members: members.map((member) => ({
        firstName: member.firstName,
        lastName: member.lastName,
        dni: member.dni || undefined,
        email: member.email || undefined,
        phone: member.phone || undefined,
        relationship: member.relationship,
        missingDocuments: member.missingDocuments,
      })),
    };

    const parsedPayload = familyPayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      const errors: Record<string, string[]> = {};
      parsedPayload.error.issues.forEach((issue) => {
        const field = issue.path.join(".");

        if (!errors[field]) {
          errors[field] = [];
        }

        errors[field].push(issue.message);
      });
      setFormErrors(errors);
      setFormMessage("Revisá los campos marcados antes de guardar.");
      setIsSaving(false);
      return;
    }

    try {
      if (editingOperation) {
        await updateOfflineOperationPayload(userId, editingOperation.operationId, toFamilyJsonPayload(parsedPayload.data));
      } else {
        await enqueueOfflineOperation(userId, sessionExpiresAt, {
          resource: "families",
          resourceId: crypto.randomUUID(),
          operation: "create",
          baseVersion: null,
          dependencies: [],
          payload: toFamilyJsonPayload(parsedPayload.data),
        });
      }
      await refreshOfflineFamilies();
      closeForm();

      if (navigator.onLine) {
        try {
          await synchronizeOfflineQueue(userId);
          await refreshOfflineFamilies();
          await refreshFamilies();
        } catch {
          setQueueMessage("El borrador quedó guardado y se sincronizará cuando el servidor esté disponible.");
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        setFormMessage(error.message);
      } else {
        setFormMessage("No se pudo guardar el borrador en este dispositivo.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Padrón de familias</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {families.length} grupos registrados{localFamilies.length ? ` · ${localFamilies.length} pendientes de sincronización` : ""}
          </p>
        </div>
        <Badge variant="success" className="h-8 px-3">
          <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={1.8} data-icon="inline-start" />
          Registro comunitario
        </Badge>
      </section>

      {queueMessage ? (
        <Alert variant="info">
          <AlertTitle>Estado de la captura offline</AlertTitle>
          <AlertDescription>{queueMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar familias" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por persona, DNI, barrio o domicilio..." className="pl-11" />
        </div>
        {canWrite ? <Sheet open={isFormOpen} onOpenChange={(open) => { if (open) setIsFormOpen(true); else closeForm(); }}>
          <SheetTrigger asChild>
            <Button aria-label="Nueva familia" className="w-full sm:w-auto">
              <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={1.8} />
              Nueva familia
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-3xl overflow-y-auto rounded-t-3xl">
            <SheetHeader className="pr-14">
              <SheetTitle className="font-display text-xl font-semibold">{editingOperation ? "Corregir borrador familiar" : "Registrar grupo familiar"}</SheetTitle>
              <SheetDescription>La ficha queda guardada por esta cuenta y se sincroniza al recuperar conexión.</SheetDescription>
            </SheetHeader>
            <form key={editingOperation?.operationId ?? "new-family"} className="px-6 pb-8" onSubmit={submitFamily}>
              <FieldGroup className="gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="family-name">Nombre del grupo familiar *</FieldLabel>
                    <Input id="family-name" name="name" defaultValue={editingPayload?.name ?? ""} placeholder="Ej. Familia López" required aria-invalid={Boolean(formErrors.name?.length)} />
                    {formErrors.name?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="family-neighborhood">Barrio *</FieldLabel>
                    <Select name="neighborhood" value={selectedNeighborhood} onValueChange={setSelectedNeighborhood} required>
                      <SelectTrigger id="family-neighborhood" className="w-full"><SelectValue placeholder="Seleccionar barrio" /></SelectTrigger>
                      <SelectContent><SelectGroup>{FAMILY_NEIGHBORHOODS.map((neighborhood) => <SelectItem key={neighborhood} value={neighborhood}>{neighborhood}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                    {formErrors.neighborhood?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="family-address">Domicilio *</FieldLabel>
                  <Input id="family-address" name="address" defaultValue={editingPayload?.address ?? ""} placeholder="Calle, altura, manzana y lote" required aria-invalid={Boolean(formErrors.address?.length)} />
                  {formErrors.address?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field><FieldLabel htmlFor="family-phone">Teléfono de contacto</FieldLabel><Input id="family-phone" name="contactPhone" type="tel" defaultValue={editingPayload?.contactPhone ?? ""} placeholder="Código de área y número" /></Field>
                  <Field><FieldLabel htmlFor="family-email">Email de contacto</FieldLabel><Input id="family-email" name="contactEmail" type="email" defaultValue={editingPayload?.contactEmail ?? ""} placeholder="nombre@correo.com" aria-invalid={Boolean(formErrors.contactEmail?.length)} />{formErrors.contactEmail?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                  <div><h3 className="font-semibold">Personas integrantes</h3><p className="text-xs text-muted-foreground">Registrá cada persona una sola vez en el padrón.</p></div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setMembers((currentMembers) => [...currentMembers, createEmptyMember()])} disabled={members.length >= 20}>Agregar integrante</Button>
                </div>
                <Field>
                  <FieldLabel htmlFor="family-reference">Persona referente *</FieldLabel>
                  <Select value={referenceMemberId} onValueChange={setReferenceMemberId} required>
                    <SelectTrigger id="family-reference" className="w-full"><SelectValue placeholder="Seleccionar referente" /></SelectTrigger>
                    <SelectContent>{members.map((member, index) => <SelectItem key={member.localId} value={member.localId}>{member.firstName || member.lastName ? `${member.firstName} ${member.lastName}`.trim() : `Integrante ${index + 1}`}</SelectItem>)}</SelectContent>
                  </Select>
                  {formErrors.referenceMemberIndex?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}
                </Field>
                {members.map((member, index) => (
                  <Card key={member.localId} size="sm">
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between gap-3"><h4 className="font-semibold">Integrante {index + 1}</h4>{members.length > 1 ? <Button type="button" variant="ghost" size="sm" onClick={() => { setMembers((currentMembers) => currentMembers.filter((currentMember) => currentMember.localId !== member.localId)); if (referenceMemberId === member.localId) setReferenceMemberId(members.find((currentMember) => currentMember.localId !== member.localId)?.localId ?? ""); }}>Quitar</Button> : null}</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field><FieldLabel htmlFor={`member-first-${member.localId}`}>Nombre *</FieldLabel><Input id={`member-first-${member.localId}`} value={member.firstName} onChange={(event) => updateMember(member.localId, (currentMember) => ({ ...currentMember, firstName: event.target.value }))} required aria-invalid={Boolean(formErrors[`members.${index}.firstName`]?.length)} />{formErrors[`members.${index}.firstName`]?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
                        <Field><FieldLabel htmlFor={`member-last-${member.localId}`}>Apellido *</FieldLabel><Input id={`member-last-${member.localId}`} value={member.lastName} onChange={(event) => updateMember(member.localId, (currentMember) => ({ ...currentMember, lastName: event.target.value }))} required aria-invalid={Boolean(formErrors[`members.${index}.lastName`]?.length)} />{formErrors[`members.${index}.lastName`]?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
                        <Field><FieldLabel htmlFor={`member-dni-${member.localId}`}>DNI</FieldLabel><Input id={`member-dni-${member.localId}`} inputMode="numeric" value={member.dni ?? ""} onChange={(event) => updateMember(member.localId, (currentMember) => ({ ...currentMember, dni: event.target.value.replace(/\D/g, "").slice(0, 8) }))} aria-invalid={Boolean(formErrors[`members.${index}.dni`]?.length)} /><FieldDescription>Ingresá 7 u 8 números. Si no tiene, dejalo vacío.</FieldDescription>{formErrors[`members.${index}.dni`]?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
                        <Field><FieldLabel htmlFor={`member-phone-${member.localId}`}>Teléfono</FieldLabel><Input id={`member-phone-${member.localId}`} type="tel" value={member.phone ?? ""} onChange={(event) => updateMember(member.localId, (currentMember) => ({ ...currentMember, phone: event.target.value }))} /></Field>
                        <Field><FieldLabel htmlFor={`member-email-${member.localId}`}>Email</FieldLabel><Input id={`member-email-${member.localId}`} type="email" value={member.email ?? ""} onChange={(event) => updateMember(member.localId, (currentMember) => ({ ...currentMember, email: event.target.value }))} aria-invalid={Boolean(formErrors[`members.${index}.email`]?.length)} />{formErrors[`members.${index}.email`]?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
                        <Field><FieldLabel htmlFor={`member-relationship-${member.localId}`}>Vínculo *</FieldLabel><Select value={member.relationship} onValueChange={(relationship) => updateMember(member.localId, (currentMember) => ({ ...currentMember, relationship }))}><SelectTrigger id={`member-relationship-${member.localId}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{FAMILY_MEMBER_RELATIONSHIPS.map((relationship) => <SelectItem key={relationship} value={relationship}>{relationship}</SelectItem>)}</SelectContent></Select></Field>
                      </div>
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">Documentación faltante</legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {FAMILY_DOCUMENT_OPTIONS.map((document) => {
                            const isMissing = member.missingDocuments.includes(document.value);
                            return <label key={document.value} className="flex min-h-10 items-center gap-2 text-sm"><Checkbox checked={isMissing} onCheckedChange={(checked) => updateMember(member.localId, (currentMember) => ({ ...currentMember, missingDocuments: checked ? [...currentMember.missingDocuments, document.value] : currentMember.missingDocuments.filter((currentDocument) => currentDocument !== document.value) }))} />{document.label}</label>;
                          })}
                        </div>
                      </fieldset>
                    </CardContent>
                  </Card>
                ))}
              </FieldGroup>
              {formMessage ? <Alert variant="destructive" className="mt-5"><AlertTitle>No se pudo guardar</AlertTitle><AlertDescription>{formMessage}</AlertDescription></Alert> : null}
              <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row"><SheetClose asChild><Button variant="outline" type="button">Cancelar</Button></SheetClose><Button type="submit" disabled={isSaving}>{submitLabel}</Button></div>
            </form>
          </SheetContent>
        </Sheet> : null}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar familias">
        <Button variant={filter === "all" ? "secondary" : "outline"} size="sm" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Todas ({allFamilies.length})</Button>
        {neighborhoods.map((neighborhood) => <Button key={neighborhood} variant={filter === neighborhood ? "secondary" : "outline"} size="sm" aria-pressed={filter === neighborhood} onClick={() => setFilter(neighborhood)}>{neighborhood} ({allFamilies.filter((family) => family.neighborhood === neighborhood).length})</Button>)}
        <Button variant={filter === "alerts" ? "secondary" : "outline"} size="sm" aria-pressed={filter === "alerts"} onClick={() => setFilter("alerts")}>Con alertas ({alertCount})</Button>
      </div>

      {visibleFamilies.length ? (
        <section aria-label="Listado de familias" className="grid gap-3 xl:grid-cols-2">
          {visibleFamilies.map((family) => {
            const missingCount = family.members.reduce((total, member) => total + member.missingDocuments.length, 0);
            const referencePerson = family.members.find((member) => member.id === family.referencePersonId);
            const offlineOperation = familyOperations.find((operation) => operation.resourceId === family.id);
            let offlineVariant: "secondary" | "warning" | "destructive" = "secondary";

            if (offlineOperation?.status === "conflict") {
              offlineVariant = "warning";
            }

            if (offlineOperation?.status === "error") {
              offlineVariant = "destructive";
            }

            let operationToEdit: OfflineOperation | undefined;

            if (offlineOperation && (offlineOperation.status === "conflict" || offlineOperation.status === "error")) {
              operationToEdit = offlineOperation;
            }

            function openOfflineDraftEditor() {
              if (operationToEdit) {
                editOfflineFamily(operationToEdit);
              }
            }

            return (
              <Card key={family.id} size="sm">
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"><HugeiconsIcon icon={UserMultipleIcon} strokeWidth={1.8} className="size-6" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-base font-semibold">{family.name}</h2><Badge variant={missingCount ? "warning" : "success"}>{missingCount ? `${missingCount} faltantes` : "Documentación completa"}</Badge>{offlineOperation ? <Badge variant={offlineVariant}>{offlineStatusLabel(offlineOperation)}</Badge> : null}</div>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><HugeiconsIcon icon={Location01Icon} strokeWidth={1.8} />{family.neighborhood} · {family.address}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-3 text-xs">
                    <div><p className="font-semibold uppercase tracking-wide text-muted-foreground">Integrantes</p><p className="mt-1 font-medium">{getMemberCountLabel(family.members.length)}</p></div>
                    <div><p className="font-semibold uppercase tracking-wide text-muted-foreground">Persona referente</p><p className="mt-1 font-medium">{referencePerson ? `${referencePerson.firstName} ${referencePerson.lastName}` : "Sin informar"}</p></div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {family.contactPhone ? <Button variant="soft" size="sm" asChild><a href={`tel:${family.contactPhone.replace(/[^\d+]/g, "")}`}><HugeiconsIcon icon={Call02Icon} strokeWidth={1.8} data-icon="inline-start" />{family.contactPhone}</a></Button> : <span className="text-xs text-muted-foreground">Sin teléfono de contacto</span>}
                    {operationToEdit ? <Button variant="outline" size="sm" onClick={openOfflineDraftEditor}>Corregir borrador</Button> : null}
                    <Button size="sm" onClick={() => setSelectedFamily(family)}>Ver ficha familiar<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} data-icon="inline-end" /></Button>
                  </div>
                  {offlineOperation?.message ? <p role="status" className="text-sm text-muted-foreground">{offlineOperation.message}</p> : null}
                </CardContent>
              </Card>
            );
          })}
        </section>
      ) : (
        <Card><CardContent className="py-10 text-center"><h2 className="font-semibold">{allFamilies.length ? "No hay resultados" : "Todavía no hay familias registradas"}</h2><p className="mt-1 text-sm text-muted-foreground">{allFamilies.length ? "Probá con otro nombre, DNI, barrio o domicilio." : "Creá la primera ficha para iniciar el padrón comunitario."}</p></CardContent></Card>
      )}

      <Card variant="muted" size="sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-warning/15 text-warning"><HugeiconsIcon icon={CloudUploadIcon} strokeWidth={1.8} /></span><div><p className="font-semibold">{alertCount} fichas con documentación pendiente</p><p className="text-xs text-muted-foreground">Los faltantes se muestran en cada integrante.</p></div></div>
          <Badge variant="secondary">Padrón actualizado</Badge>
        </CardContent>
      </Card>

      {selectedFamily ? <FamilyDetails family={selectedFamily} onClose={() => setSelectedFamily(null)} /> : null}
    </div>
  );
}
