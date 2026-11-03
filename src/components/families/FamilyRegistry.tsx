"use client";

import { COMMON_UI_TEXT } from "@/constants/common-ui.constant";
import { NO_STORE_REQUEST_HEADERS } from "@/constants/http.constant";
import { FAMILY_ERROR_MESSAGES, FAMILY_UI_TEXT, FAMILY_DOCUMENT_LABELS, FAMILY_DOCUMENT_OPTIONS, FAMILY_MEMBER_RELATIONSHIPS, FAMILY_NEIGHBORHOODS } from "@/constants/family.constant";
import { APPLICATION_UI_TEXT } from "@/constants/application-ui.constant";
import { API_ROUTES } from "@/constants/routes.constant";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { enqueueOfflineOperation, listOfflineOperations, synchronizeOfflineQueue, updateOfflineOperationPayload } from "@/services/offline-queue.service";
import { familyCollectionSchema, familyDeactivationTargetSchema, familyMemberChangeSchema, familyMemberInputSchema, familyPayloadSchema, newFamilyMemberChangeSchema, newFamilyMemberInputSchema, newFamilyPayloadSchema } from "@/schemas/family.schema";
import type { FamilyPayload } from "@/types/schema-contracts";
import type { z } from "zod";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { getFamilyCollection } from "@/services/client/family-data.service";
import {
  ArrowRight01Icon,
  Call02Icon,
  CloudUploadIcon,
  Location01Icon,
  Search01Icon,
  UserAdd01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import type { FamilyPersonRecord, FamilyRecord } from "@/interfaces/family.interface";
import type { JsonObject } from "@/types/json-value";
import type { FamilyMemberChangeInput, FamilyPersonInput } from "@/types/family";

import type { OfflineOperation } from "@/types/offline-operation";

import clientAxios from "@/utils/clientAxios.util";

interface FamilyRegistryProps {
  initialFamilies: FamilyRecord[];
  userId: string;
  sessionExpiresAt: string;
  canWrite: boolean;
}

interface FamilyFormMember extends FamilyPersonInput {
  localId: string;
}

function createEmptyMember(): FamilyFormMember {
  const personId = crypto.randomUUID();

  return {
    localId: personId,
    personId,
    membershipId: crypto.randomUUID(),
    firstName: "",
    lastName: "",
    relationship: "Hija o hijo",
    missingDocuments: [],
  };
}

function toFamilyJsonPayload(family: FamilyPayload): JsonObject {
  const payload: JsonObject = {
    name: family.name,
    neighborhood: family.neighborhood,
    address: family.address,
    referenceMemberIndex: family.referenceMemberIndex,
    members: family.members.map((member) => {
      const person: JsonObject = {
        personId: member.personId ?? crypto.randomUUID(),
        membershipId: member.membershipId ?? crypto.randomUUID(),
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

function toFamilyMemberChangeJson(change: FamilyMemberChangeInput): JsonObject {
  const member: JsonObject = {
    firstName: change.member.firstName,
    lastName: change.member.lastName,
    relationship: change.member.relationship,
    missingDocuments: [...change.member.missingDocuments],
  };

  if (change.member.dni) {
    member.dni = change.member.dni;
  }

  if (change.member.email) {
    member.email = change.member.email;
  }

  if (change.member.phone) {
    member.phone = change.member.phone;
  }

  const payload: JsonObject = {
    action: change.action,
    memberId: change.memberId,
    member,
    referencePersonId: change.referencePersonId,
  };

  if (change.action === "add-member") {
    if (!change.personId) {
      throw new Error(FAMILY_ERROR_MESSAGES.LA_OPERACION_PARA_AGREGAR_UN_INTEGRANTE_REQUIERE_UN_PERSONID);
    }

    payload.personId = change.personId;
  }

  return payload;
}

function familyFromOfflineOperation(operation: OfflineOperation): FamilyRecord | null {
  const parsedFamily = familyPayloadSchema.safeParse(operation.payload);

  if (!parsedFamily.success) {
    return null;
  }

  const members = parsedFamily.data.members.map((member, index) => ({
    id: member.personId ?? `${operation.resourceId}-person-${index}`,
    membershipId: member.membershipId ?? `${operation.resourceId}-membership-${index}`,
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
    version: 1,
  };
}

function applyPendingMemberChanges(family: FamilyRecord, operations: OfflineOperation[]) {
  return operations.reduce((currentFamily, operation) => {
    if (operation.resourceId !== family.id || operation.operation !== "update" || operation.status === "synced") {
      return currentFamily;
    }

    const parsedChange = familyMemberChangeSchema.safeParse(operation.payload);

    if (!parsedChange.success) {
      return currentFamily;
    }

    const memberChange = parsedChange.data;
    let personRecordId = "";

    if (memberChange.action === "add-member") {
      personRecordId = memberChange.personId;
    } else {
      personRecordId = currentFamily.members.find((member) => member.membershipId === memberChange.memberId)?.id ?? "";
    }

    const nextMember: FamilyPersonRecord = {
      id: personRecordId,
      membershipId: memberChange.memberId,
      firstName: memberChange.member.firstName,
      lastName: memberChange.member.lastName,
      dni: memberChange.member.dni ?? null,
      email: memberChange.member.email ?? null,
      phone: memberChange.member.phone ?? null,
      relationship: memberChange.member.relationship,
      missingDocuments: memberChange.member.missingDocuments.map((documentType, index) => ({ id: `${memberChange.memberId}-document-${index}`, documentType })),
    };
    let members = currentFamily.members;

    if (memberChange.action === "add-member" && !members.some((member) =>
      member.membershipId === memberChange.memberId || member.id === memberChange.personId,
    )) {
      members = [...members, nextMember];
    }

    if (memberChange.action === "update-member") {
      members = members.map((member) => {
        if (member.membershipId === memberChange.memberId) {
          return nextMember;
        }

        return member;
      });
    }

    let nextVersion = currentFamily.version + 1;
    if (operation.baseVersion && operation.baseVersion + 1 > nextVersion) {
      nextVersion = operation.baseVersion + 1;
    }

    return { ...currentFamily, members, referencePersonId: memberChange.referencePersonId, version: nextVersion };
  }, family);
}

function offlineStatusLabel(operation: OfflineOperation) {
  if (operation.status === "conflict") {
    return FAMILY_UI_TEXT.CONFLICTO_POR_DNI;
  }

  if (operation.status === "error") {
    return FAMILY_UI_TEXT.PENDIENTE_DE_ATENCION;
  }

  if (operation.status === "syncing") {
    return FAMILY_UI_TEXT.SINCRONIZANDO;
  }

  return FAMILY_UI_TEXT.PENDIENTE_DE_SINCRONIZACION;
}

function getMemberCountLabel(count: number) {
  return FAMILY_UI_TEXT.MEMBER_COUNT(count);
}

type FamilyMemberValues = z.infer<typeof familyMemberInputSchema>;

function FamilyMemberForm({ family, member, onClose, onSave }: {
  family: FamilyRecord;
  member?: FamilyPersonRecord;
  onClose: () => void;
  onSave: (values: FamilyMemberValues, referencePersonId: string, memberId: string, personId: string) => Promise<string | null>;
}) {
  const [personId] = useState(() => member?.id ?? crypto.randomUUID());
  const [membershipId] = useState(() => member?.membershipId ?? crypto.randomUUID());
  const [firstName, setFirstName] = useState(member?.firstName ?? "");
  const [lastName, setLastName] = useState(member?.lastName ?? "");
  const [dni, setDni] = useState(member?.dni ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [relationship, setRelationship] = useState(member?.relationship ?? "Hija o hijo");
  const [missingDocuments, setMissingDocuments] = useState(member?.missingDocuments.map((document) => document.documentType) ?? []);
  const [referencePersonId, setReferencePersonId] = useState(family.referencePersonId ?? personId);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formMessage, setFormMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submitMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormMessage("");
    const memberInput = {
      firstName,
      lastName,
      dni: dni || undefined,
      email: email || undefined,
      phone: phone || undefined,
      relationship,
      missingDocuments,
    };
    let parsedMember = familyMemberInputSchema.safeParse(memberInput);

    if (!member) {
      parsedMember = newFamilyMemberInputSchema.safeParse(memberInput);
    }

    if (!parsedMember.success) {
      const errors: Record<string, string[]> = {};
      parsedMember.error.issues.forEach((issue) => {
        const field = issue.path.join(".");
        if (!errors[field]) {
          errors[field] = [];
        }
        errors[field].push(issue.message);
      });
      setFieldErrors(errors);
      setFormMessage(FAMILY_UI_TEXT.REVISA_LOS_CAMPOS_MARCADOS_ANTES_DE_GUARDAR);
      return;
    }

    setIsSaving(true);
    const result = await onSave(parsedMember.data, referencePersonId, membershipId, personId);
    setIsSaving(false);

    if (result) {
      setFormMessage(result);
      return;
    }

    onClose();
  }

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-3xl overflow-y-auto rounded-t-3xl">
        <SheetHeader className="pr-14">
          <SheetTitle className="font-display text-xl font-semibold">{member ? FAMILY_UI_TEXT.ACTUALIZAR_INTEGRANTE : FAMILY_UI_TEXT.AGREGAR_INTEGRANTE}</SheetTitle>
          <SheetDescription>{FAMILY_UI_TEXT.LOS_CAMBIOS_SE_GUARDAN_EN_ESTA_FICHA_Y_SE_SINCRONIZAN_AL_RECUPERAR_CONEX}</SheetDescription>
        </SheetHeader>
        <form className="px-6 pb-8" onSubmit={submitMember}>
          <FieldGroup className="gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="family-member-first-name">{FAMILY_UI_TEXT.NOMBRE}</FieldLabel><Input id="family-member-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required aria-invalid={Boolean(fieldErrors.firstName?.length)} />{fieldErrors.firstName?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
              <Field><FieldLabel htmlFor="family-member-last-name">{FAMILY_UI_TEXT.APELLIDO}</FieldLabel><Input id="family-member-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required aria-invalid={Boolean(fieldErrors.lastName?.length)} />{fieldErrors.lastName?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
              <Field><FieldLabel htmlFor="family-member-dni">{FAMILY_DOCUMENT_LABELS.DNI}{member ? "" : " *"}</FieldLabel><Input id="family-member-dni" inputMode="numeric" value={dni} onChange={(event) => setDni(event.target.value.replace(/\D/g, "").slice(0, 8))} aria-invalid={Boolean(fieldErrors.dni?.length)} aria-required={!member} /><FieldDescription>{member ? FAMILY_UI_TEXT.LOS_REGISTROS_EXISTENTES_SIN_DNI_PUEDEN_SEGUIR_CONSULTANDOSE_COMPLETALO_CU : FAMILY_UI_TEXT.INGRESA_LOS_7_U_8_NUMEROS_DEL_DNI}</FieldDescription>{fieldErrors.dni?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
              <Field><FieldLabel htmlFor="family-member-phone">{FAMILY_UI_TEXT.TELEFONO}</FieldLabel><Input id="family-member-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
              <Field><FieldLabel htmlFor="family-member-email">{APPLICATION_UI_TEXT.EMAIL}</FieldLabel><Input id="family-member-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(fieldErrors.email?.length)} />{fieldErrors.email?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
              <Field><FieldLabel htmlFor="family-member-relationship">{FAMILY_UI_TEXT.VINCULO}</FieldLabel><Select value={relationship} onValueChange={setRelationship}><SelectTrigger id="family-member-relationship" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{FAMILY_MEMBER_RELATIONSHIPS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></Field>
            </div>
            <Field>
              <FieldLabel htmlFor="family-member-reference">{FAMILY_UI_TEXT.PERSONA_REFERENTE}</FieldLabel>
              <Select value={referencePersonId} onValueChange={setReferencePersonId}>
                <SelectTrigger id="family-member-reference" className="w-full"><SelectValue placeholder={FAMILY_UI_TEXT.SELECCIONAR_REFERENTE} /></SelectTrigger>
                <SelectContent>
                  {family.members.map((familyMember) => <SelectItem key={familyMember.id} value={familyMember.id}>{familyMember.firstName} {familyMember.lastName}</SelectItem>)}
                  {!member ? <SelectItem value={personId}>{firstName || lastName ? `${firstName} ${lastName}`.trim() : FAMILY_UI_TEXT.NUEVO_INTEGRANTE}</SelectItem> : null}
                </SelectContent>
              </Select>
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{FAMILY_UI_TEXT.DOCUMENTACION_FALTANTE}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {FAMILY_DOCUMENT_OPTIONS.map((document) => {
                  const isMissing = missingDocuments.includes(document.value);
                  return <label key={document.value} className="flex min-h-10 items-center gap-2 text-sm"><Checkbox checked={isMissing} onCheckedChange={(checked) => { if (checked) { setMissingDocuments([...missingDocuments, document.value]); return; } setMissingDocuments(missingDocuments.filter((currentDocument) => currentDocument !== document.value)); }} />{document.label}</label>;
                })}
              </div>
            </fieldset>
          </FieldGroup>
          {formMessage ? <Alert variant="destructive" className="mt-5"><AlertTitle>{FAMILY_UI_TEXT.NO_SE_PUDO_GUARDAR}</AlertTitle><AlertDescription>{formMessage}</AlertDescription></Alert> : null}
          <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button variant="outline" type="button" onClick={onClose}>{APPLICATION_UI_TEXT.CANCELAR}</Button><Button type="submit" disabled={isSaving}>{isSaving ? COMMON_UI_TEXT.GUARDANDO : FAMILY_UI_TEXT.GUARDAR_INTEGRANTE}</Button></div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function FamilyDetails({ family, canWrite, pendingMemberIds, onClose, onAddMember, onEditMember, onDeactivateFamily, onDeactivateMember }: {
  family: FamilyRecord;
  canWrite: boolean;
  pendingMemberIds: string[];
  onClose: () => void;
  onAddMember: () => void;
  onEditMember: (member: FamilyPersonRecord) => void;
  onDeactivateFamily: (family: FamilyRecord) => Promise<string | null>;
  onDeactivateMember: (family: FamilyRecord, member: FamilyPersonRecord) => Promise<string | null>;
}) {
  const referencePerson = family.members.find((member) => member.id === family.referencePersonId);
  const [deactivationTarget, setDeactivationTarget] = useState<"family" | FamilyPersonRecord | null>(null);
  const [deactivationError, setDeactivationError] = useState("");
  const [isDeactivating, setIsDeactivating] = useState(false);

  async function confirmDeactivation() {
    if (!deactivationTarget) {
      return;
    }

    setIsDeactivating(true);
    setDeactivationError("");
    let message: string | null;

    if (deactivationTarget === "family") {
      message = await onDeactivateFamily(family);
    } else {
      message = await onDeactivateMember(family, deactivationTarget);
    }

    if (message) {
      setDeactivationError(message);
      setIsDeactivating(false);
      return;
    }

    setDeactivationTarget(null);
    setIsDeactivating(false);
  }

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
        <SheetHeader className="pr-12">
          <SheetTitle className="font-display text-xl font-semibold">{family.name}</SheetTitle>
          <SheetDescription>{FAMILY_UI_TEXT.FICHA_FAMILIAR_PADRON_COMUNITARIO}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-6 pb-6">
          <div className="space-y-3 rounded-xl bg-muted p-4 text-sm">
            <div><p className="text-xs text-muted-foreground">{FAMILY_UI_TEXT.DOMICILIO}</p><p className="font-medium">{FAMILY_UI_TEXT.BARRIO}{family.neighborhood} {APPLICATION_UI_TEXT.TEXT}{family.address}</p></div>
            <div><p className="text-xs text-muted-foreground">{FAMILY_UI_TEXT.CONTACTO_DEL_GRUPO}</p><p className="font-medium">{family.contactPhone || FAMILY_UI_TEXT.SIN_TELEFONO} {APPLICATION_UI_TEXT.TEXT}{family.contactEmail || FAMILY_UI_TEXT.SIN_EMAIL}</p></div>
            <div><p className="text-xs text-muted-foreground">{FAMILY_UI_TEXT.REFERENTE}</p><p className="font-medium">{referencePerson ? `${referencePerson.firstName} ${referencePerson.lastName}` : FAMILY_UI_TEXT.SIN_REFERENTE}</p></div>
          </div>
          <section aria-label={FAMILY_UI_TEXT.INTEGRANTES_DE_LA_FAMILIA} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{FAMILY_UI_TEXT.INTEGRANTES}{family.members.length}{APPLICATION_UI_TEXT.TEXT_2}</h3>{canWrite ? <Button size="sm" onClick={onAddMember}><HugeiconsIcon icon={UserAdd01Icon} strokeWidth={1.8} data-icon="inline-start" />{FAMILY_UI_TEXT.AGREGAR_INTEGRANTE}</Button> : null}</div>
            {family.members.map((member) => (
              <Card key={member.membershipId} size="sm">
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-muted-foreground">{member.relationship}{member.id === family.referencePersonId ? " · referente" : ""}</p>
                    </div>
                    <Badge variant={member.missingDocuments.length ? "warning" : "success"}>
                      {member.missingDocuments.length ? FAMILY_UI_TEXT.DOCUMENTACION_PENDIENTE : FAMILY_UI_TEXT.DOCUMENTACION_COMPLETA}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><p className="text-xs text-muted-foreground">{FAMILY_DOCUMENT_LABELS.DNI}</p><p>{member.dni || FAMILY_UI_TEXT.SIN_INFORMAR}</p></div>
                    <div><p className="text-xs text-muted-foreground">{FAMILY_UI_TEXT.CONTACTO}</p><p>{member.phone || member.email || FAMILY_UI_TEXT.SIN_INFORMAR}</p></div>
                  </div>
                  {member.missingDocuments.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {member.missingDocuments.map((document) => <Badge key={document.id} variant="warning">{FAMILY_DOCUMENT_LABELS[document.documentType]}</Badge>)}
                    </div>
                  ) : null}
                  {pendingMemberIds.includes(member.id) ? <Badge variant="warning">{FAMILY_UI_TEXT.PENDIENTE_DE_SINCRONIZACION}</Badge> : null}
                  {canWrite ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onEditMember(member)}>{FAMILY_UI_TEXT.EDITAR_DATOS}</Button><Button size="sm" variant="destructive" disabled={pendingMemberIds.includes(member.id)} onClick={() => setDeactivationTarget(member)}>{pendingMemberIds.includes(member.id) ? FAMILY_UI_TEXT.BAJA_PENDIENTE : FAMILY_UI_TEXT.DAR_DE_BAJA}</Button></div> : null}
                </CardContent>
              </Card>
            ))}
          </section>
        </div>
        <SheetFooter className="flex-wrap justify-between gap-2"><SheetClose asChild><Button variant="outline">{FAMILY_UI_TEXT.CERRAR_FICHA}</Button></SheetClose>{canWrite ? <Button variant="destructive" disabled={pendingMemberIds.includes("family")} onClick={() => setDeactivationTarget("family")}>{pendingMemberIds.includes("family") ? FAMILY_UI_TEXT.BAJA_PENDIENTE : FAMILY_UI_TEXT.DAR_DE_BAJA_FAMILIA}</Button> : null}</SheetFooter>
      </SheetContent>
      <Dialog open={Boolean(deactivationTarget)} onOpenChange={(open) => { if (!open && !isDeactivating) { setDeactivationTarget(null); setDeactivationError(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deactivationTarget === "family" ? FAMILY_UI_TEXT.DAR_DE_BAJA_LA_FAMILIA : FAMILY_UI_TEXT.DAR_DE_BAJA_A_ESTA_PERSONA}</DialogTitle>
            <DialogDescription>{FAMILY_UI_TEXT.LA_BAJA_CONSERVA_LA_FICHA_Y_LOS_DATOS_DE_LAS_PERSONAS_SI_HAY_ENTREGAS_O}</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-muted p-3 text-sm font-medium">{deactivationTarget === "family" ? family.name : `${deactivationTarget?.firstName ?? ""} ${deactivationTarget?.lastName ?? ""}`}</div>
          {deactivationError ? <p role="alert" className="text-sm text-destructive">{deactivationError}</p> : null}
          <DialogFooter>
            <Button variant="outline" disabled={isDeactivating} onClick={() => setDeactivationTarget(null)}>{APPLICATION_UI_TEXT.VOLVER}</Button>
            <Button variant="destructive" disabled={isDeactivating} onClick={() => void confirmDeactivation()}>{isDeactivating ? FAMILY_UI_TEXT.GUARDANDO_BAJA : FAMILY_UI_TEXT.CONFIRMAR_BAJA}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

export function FamilyRegistry({ initialFamilies, userId, sessionExpiresAt, canWrite }: FamilyRegistryProps) {
  const isOnline = useNetworkStatus();
  const [families, setFamilies] = useState(initialFamilies);
  const [offlineOperations, setOfflineOperations] = useState<OfflineOperation[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedFamily, setSelectedFamily] = useState<FamilyRecord | null>(null);
  const [memberEditor, setMemberEditor] = useState<{ member?: FamilyPersonRecord; operation?: OfflineOperation } | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [members, setMembers] = useState<FamilyFormMember[]>([createEmptyMember()]);
  const [referenceMemberId, setReferenceMemberId] = useState(members[0]?.localId ?? "");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState("");
  const [editingOperation, setEditingOperation] = useState<OfflineOperation | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
  const [formMessage, setFormMessage] = useState("");
  const [queueMessage, setQueueMessage] = useState("");
  const [needsFamilyRefresh, setNeedsFamilyRefresh] = useState(false);
  const [isRefreshingFamilies, setIsRefreshingFamilies] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const refreshOfflineFamilies = useCallback(async () => {
    try {
      const operations = await listOfflineOperations(userId);
      const familyOperations = operations.filter((operation) => operation.resource === "families" && operation.status !== "synced");
      setOfflineOperations(familyOperations);
      setQueueMessage("");
      return familyOperations;
    } catch {
      setQueueMessage(FAMILY_UI_TEXT.NO_SE_PUDO_LEER_LA_COLA_OFFLINE_DE_ESTA_CUENTA);
      return [];
    }
  }, [userId]);
  const refreshFamilies = useCallback(async () => {
    const result = await getFamilyCollection(userId, isOnline);
    setFamilies(result.data.families);
  }, [isOnline, userId]);
  const localFamilies = useMemo(() => offlineOperations.filter((operation) => operation.operation === "create").flatMap((operation) => {
    const family = familyFromOfflineOperation(operation);

    if (!family) {
      return [];
    }

    return [family];
  }), [offlineOperations]);
  const allFamilies = useMemo(() => [
    ...families.map((family) => applyPendingMemberChanges(family, offlineOperations)),
    ...localFamilies.map((family) => applyPendingMemberChanges(family, offlineOperations)),
  ], [families, localFamilies, offlineOperations]);
  const familyOperations = offlineOperations;
  let selectedFamilyView: FamilyRecord | null = null;

  if (selectedFamily) {
    selectedFamilyView = allFamilies.find((family) => family.id === selectedFamily.id) ?? selectedFamily;
  }
  let editingPayload: FamilyPayload | undefined;

  if (editingOperation) {
    const parsedPayload = familyPayloadSchema.safeParse(editingOperation.payload);

    if (parsedPayload.success) {
      editingPayload = parsedPayload.data;
    }
  }
  let submitLabel: string = FAMILY_UI_TEXT.GUARDAR_FAMILIA;

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
    void refreshFamilies().catch(() => undefined);
    const handleQueueChange = () => {
      void refreshOfflineFamilies();

      if (navigator.onLine) {
        void refreshFamilies().catch(() => undefined);
      }
    };
    const handleReconnect = () => {
      void synchronizeOfflineQueue(userId).then(() => refreshOfflineFamilies()).then(() => refreshFamilies()).catch(() => undefined);
    };
    const handleDisconnect = () => {
      void refreshFamilies().catch(() => undefined);
    };
    window.addEventListener("offline-queue-change", handleQueueChange);
    window.addEventListener("online", handleReconnect);
    window.addEventListener("offline", handleDisconnect);
    window.addEventListener("merendar-network-unreachable", handleDisconnect);

    return () => {
      window.removeEventListener("offline-queue-change", handleQueueChange);
      window.removeEventListener("online", handleReconnect);
      window.removeEventListener("offline", handleDisconnect);
      window.removeEventListener("merendar-network-unreachable", handleDisconnect);
    };
  }, [refreshFamilies, refreshOfflineFamilies, userId]);

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
      setQueueMessage(FAMILY_UI_TEXT.NO_SE_PUDO_ABRIR_ESTE_BORRADOR_PARA_CORREGIRLO);
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
      members: members.map((member) => {
        let dni: string | undefined = "";

        if (editingOperation) {
          dni = undefined;
        }

        if (member.dni) {
          dni = member.dni;
        }

        return {
          personId: member.personId,
          membershipId: member.membershipId,
          firstName: member.firstName,
          lastName: member.lastName,
          dni,
          email: member.email || undefined,
          phone: member.phone || undefined,
          relationship: member.relationship,
          missingDocuments: member.missingDocuments,
        };
      }),
    };

    let parsedPayload = familyPayloadSchema.safeParse(payload);

    if (!editingOperation) {
      parsedPayload = newFamilyPayloadSchema.safeParse(payload);
    }

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
      setFormMessage(FAMILY_UI_TEXT.REVISA_LOS_CAMPOS_MARCADOS_ANTES_DE_GUARDAR);
      setIsSaving(false);
      return;
    }

    try {
      let submittedOperationId = editingOperation?.operationId;

      if (editingOperation) {
        await updateOfflineOperationPayload(userId, editingOperation.operationId, toFamilyJsonPayload(parsedPayload.data));
      } else {
        const queuedOperation = await enqueueOfflineOperation(userId, sessionExpiresAt, {
          resource: "families",
          resourceId: crypto.randomUUID(),
          operation: "create",
          baseVersion: null,
          dependencies: [],
          payload: toFamilyJsonPayload(parsedPayload.data),
        });
        submittedOperationId = queuedOperation.operationId;
      }
      await refreshOfflineFamilies();
      closeForm();

      if (navigator.onLine) {
        try {
          await synchronizeOfflineQueue(userId);
        } catch {
          await refreshOfflineFamilies();
          setQueueMessage(FAMILY_UI_TEXT.EL_BORRADOR_QUEDO_GUARDADO_EN_ESTE_DISPOSITIVO_Y_SIGUE_PENDIENTE_DE_CONFIR);
          return;
        }

        const pendingFamilyOperations = await refreshOfflineFamilies();
        const submittedOperation = pendingFamilyOperations.find((operation) => operation.operationId === submittedOperationId);

        if (submittedOperation) {
          setQueueMessage(FAMILY_UI_TEXT.EL_BORRADOR_QUEDO_GUARDADO_EN_ESTE_DISPOSITIVO_Y_SIGUE_PENDIENTE_DE_CONFIR_2);
          return;
        }

        try {
          await refreshFamilies();
        } catch {
          setNeedsFamilyRefresh(true);
          setQueueMessage(FAMILY_UI_TEXT.LA_FAMILIA_YA_ESTA_CONFIRMADA_EN_EL_SERVIDOR_PERO_NO_PUDIMOS_ACTUALIZAR_EL);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        setFormMessage(error.message);
      } else {
        setFormMessage(FAMILY_UI_TEXT.NO_SE_PUDO_GUARDAR_EL_BORRADOR_EN_ESTE_DISPOSITIVO);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function retryFamilyRefresh() {
    setIsRefreshingFamilies(true);

    try {
      await refreshFamilies();
      setNeedsFamilyRefresh(false);
      setQueueMessage("");
    } catch {
      setQueueMessage(FAMILY_UI_TEXT.LA_FAMILIA_ESTA_CONFIRMADA_EN_EL_SERVIDOR_PERO_EL_PADRON_SIGUE_SIN_ACTUALI);
    } finally {
      setIsRefreshingFamilies(false);
    }
  }

  async function deactivateFamily(family: FamilyRecord, target: { kind: "family" } | { kind: "member"; memberId: string }) {
    const unresolvedOperations = offlineOperations.filter((operation) =>
      operation.resourceId === family.id && operation.status !== "synced",
    );
    const blockedOperation = unresolvedOperations.find((operation) => operation.status === "error" || operation.status === "conflict");

    if (blockedOperation) {
      return FAMILY_UI_TEXT.PRIMERO_RESOLVE_EL_CAMBIO_FAMILIAR_PENDIENTE_ANTES_DE_SOLICITAR_UNA_BAJA;
    }

    if (unresolvedOperations.some((operation) => operation.operation === "delete")) {
      return FAMILY_UI_TEXT.YA_HAY_UNA_BAJA_PENDIENTE_PARA_ESTA_FAMILIA;
    }

    setQueueMessage("");

    try {
      const queuedOperation = await enqueueOfflineOperation(userId, sessionExpiresAt, {
        resource: "families",
        resourceId: family.id,
        operation: "delete",
        baseVersion: family.version,
        dependencies: unresolvedOperations.map((operation) => operation.operationId),
        payload: target,
      });
      await refreshOfflineFamilies();
      setQueueMessage(FAMILY_UI_TEXT.LA_BAJA_QUEDO_GUARDADA_Y_SE_CONFIRMARA_CUANDO_EL_SERVIDOR_VALIDE_QUE_NO_HA);

      if (!navigator.onLine) {
        return null;
      }

      await synchronizeOfflineQueue(userId);
      const remainingOperations = await refreshOfflineFamilies();
      const submittedOperation = remainingOperations.find((operation) => operation.operationId === queuedOperation.operationId);

      if (submittedOperation) {
        setQueueMessage(submittedOperation.message ?? FAMILY_UI_TEXT.LA_BAJA_PERMANECE_GUARDADA_EN_ESTE_DISPOSITIVO_Y_ESPERA_CONFIRMACION_DEL_S);
        return null;
      }

      try {
        const response = await clientAxios.get<unknown>(API_ROUTES.FAMILIES, { headers: NO_STORE_REQUEST_HEADERS });
        const parsedFamilies = familyCollectionSchema.safeParse(response.data);

        if (!parsedFamilies.success) {
          setNeedsFamilyRefresh(true);
          setQueueMessage(FAMILY_UI_TEXT.LA_BAJA_QUEDO_CONFIRMADA_NO_PUDIMOS_ACTUALIZAR_EL_PADRON_REINTENTA_LA_ACTU);
          return null;
        }

        setFamilies(parsedFamilies.data.families);
        const updatedFamily = parsedFamilies.data.families.find((currentFamily) => currentFamily.id === family.id);

        if (target.kind === "family" || !updatedFamily) {
          setSelectedFamily(null);
        } else {
          setSelectedFamily(updatedFamily);
        }
        setQueueMessage("");
      } catch {
        setNeedsFamilyRefresh(true);
        setQueueMessage(FAMILY_UI_TEXT.LA_BAJA_QUEDO_CONFIRMADA_NO_PUDIMOS_ACTUALIZAR_EL_PADRON_REINTENTA_LA_ACTU);
      }
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      }

      return FAMILY_UI_TEXT.NO_SE_PUDO_GUARDAR_LA_SOLICITUD_DE_BAJA;
    }

    return null;
  }

  async function saveFamilyMember(values: FamilyMemberValues, referencePersonId: string, memberId: string, personId: string) {
    if (!selectedFamilyView) {
      return FAMILY_UI_TEXT.NO_ENCONTRAMOS_LA_FAMILIA_QUE_QUERES_ACTUALIZAR;
    }

    const editingMember = memberEditor?.member;
    const duplicateDni = values.dni && selectedFamilyView.members.some((familyMember) =>
      familyMember.id !== editingMember?.id && familyMember.dni === values.dni,
    );

    if (duplicateDni) {
      return FAMILY_UI_TEXT.ESE_DNI_YA_ESTA_REGISTRADO_EN_ESTA_FAMILIA;
    }

    let change: FamilyMemberChangeInput;

    if (editingMember) {
      change = { action: "update-member", memberId: editingMember.membershipId, member: values, referencePersonId };
    } else {
      change = { action: "add-member", memberId, personId, member: values, referencePersonId };
    }

    const parsedChange = newFamilyMemberChangeSchema.safeParse(change);

    if (!parsedChange.success) {
      return FAMILY_UI_TEXT.REVISA_LOS_DATOS_DEL_INTEGRANTE_ANTES_DE_GUARDAR;
    }

    const previousOperations = offlineOperations
      .filter((operation) => operation.resourceId === selectedFamilyView.id)
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    const previousOperation = previousOperations[previousOperations.length - 1];
    const dependencies: string[] = [];

    if (previousOperation) {
      dependencies.push(previousOperation.operationId);
    }

    try {
      const queuedOperation = await enqueueOfflineOperation(userId, sessionExpiresAt, {
        resource: "families",
        resourceId: selectedFamilyView.id,
        operation: "update",
        baseVersion: selectedFamilyView.version,
        dependencies,
        payload: toFamilyMemberChangeJson(parsedChange.data),
      });

      const currentOperations = await refreshOfflineFamilies();
      let operationsWithChange = [...currentOperations];

      if (!currentOperations.some((operation) => operation.operationId === queuedOperation.operationId)) {
        operationsWithChange = [...currentOperations, queuedOperation];
      }

      setOfflineOperations(operationsWithChange);
      setSelectedFamily((currentFamily) => {
        if (currentFamily && currentFamily.id === selectedFamilyView.id) {
          return applyPendingMemberChanges(currentFamily, operationsWithChange);
        }

        return currentFamily;
      });

      if (navigator.onLine) {
        await synchronizeOfflineQueue(userId);
        const remainingOperations = await refreshOfflineFamilies();
        const thisOperation = remainingOperations.find((operation) => operation.resourceId === selectedFamilyView.id && operation.operation === "update");

        if (thisOperation?.status === "conflict") {
          return thisOperation.message ?? FAMILY_UI_TEXT.LA_FICHA_CAMBIO_EN_OTRO_DISPOSITIVO_ACTUALIZA_Y_VOLVE_A_INTENTAR;
        }

        if (thisOperation?.status === "error") {
          return thisOperation.message ?? FAMILY_UI_TEXT.EL_CAMBIO_QUEDO_GUARDADO_EN_ESTE_DISPOSITIVO_Y_ESPERA_SINCRONIZACION;
        }

        const response = await clientAxios.get<unknown>(API_ROUTES.FAMILIES, { headers: NO_STORE_REQUEST_HEADERS });
        const parsedFamilies = familyCollectionSchema.safeParse(response.data);

        if (!parsedFamilies.success) {
          return FAMILY_UI_TEXT.EL_CAMBIO_QUEDO_GUARDADO_NO_PUDIMOS_ACTUALIZAR_LA_LISTA_VOLVE_A_INTENTAR_S;
        }

        setFamilies(parsedFamilies.data.families);
        const updatedFamily = parsedFamilies.data.families.find((family) => family.id === selectedFamilyView.id);

        if (updatedFamily) {
          setSelectedFamily(updatedFamily);
        }
      }

      return null;
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      }

      return FAMILY_UI_TEXT.NO_SE_PUDO_GUARDAR_EL_INTEGRANTE;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{FAMILY_UI_TEXT.PADRON_DE_FAMILIAS}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {families.length} {FAMILY_UI_TEXT.GRUPOS_REGISTRADOS}{localFamilies.length ? FAMILY_UI_TEXT.PENDING_SYNCHRONIZATION_COUNT(localFamilies.length) : ""}
          </p>
        </div>
        <Badge variant="success" className="h-8 px-3">
          <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={1.8} data-icon="inline-start" />
          {FAMILY_UI_TEXT.REGISTRO_COMUNITARIO}</Badge>
      </section>

      {queueMessage ? (
        <Alert variant="info">
          <AlertTitle>{needsFamilyRefresh ? FAMILY_UI_TEXT.ACTUALIZACION_PENDIENTE : FAMILY_UI_TEXT.ESTADO_DE_LA_CAPTURA_OFFLINE}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{queueMessage}</span>
            {needsFamilyRefresh ? <Button type="button" variant="outline" size="sm" onClick={() => void retryFamilyRefresh()} disabled={isRefreshingFamilies}>
              {isRefreshingFamilies ? FAMILY_UI_TEXT.ACTUALIZANDO_PADRON : FAMILY_UI_TEXT.REINTENTAR_ACTUALIZACION}
            </Button> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={FAMILY_UI_TEXT.BUSCAR_FAMILIAS} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={FAMILY_UI_TEXT.BUSCAR_POR_PERSONA_DNI_BARRIO_O_DOMICILIO} className="pl-11" />
        </div>
        {canWrite ? <Sheet open={isFormOpen} onOpenChange={(open) => { if (open) setIsFormOpen(true); else closeForm(); }}>
          <SheetTrigger asChild>
            <Button aria-label={FAMILY_UI_TEXT.NUEVA_FAMILIA} className="w-full sm:w-auto">
              <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={1.8} />
              {FAMILY_UI_TEXT.NUEVA_FAMILIA}</Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-3xl overflow-y-auto rounded-t-3xl">
            <SheetHeader className="pr-14">
              <SheetTitle className="font-display text-xl font-semibold">{editingOperation ? FAMILY_UI_TEXT.CORREGIR_BORRADOR_FAMILIAR : FAMILY_UI_TEXT.REGISTRAR_GRUPO_FAMILIAR}</SheetTitle>
              <SheetDescription>{FAMILY_UI_TEXT.LA_FICHA_QUEDA_GUARDADA_POR_ESTA_CUENTA_Y_SE_SINCRONIZA_AL_RECUPERAR_CON}</SheetDescription>
            </SheetHeader>
            <form key={editingOperation?.operationId ?? "new-family"} className="px-6 pb-8" onSubmit={submitFamily}>
              <FieldGroup className="gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="family-name">{FAMILY_UI_TEXT.NOMBRE_DEL_GRUPO_FAMILIAR}</FieldLabel>
                    <Input id="family-name" name="name" defaultValue={editingPayload?.name ?? ""} placeholder={FAMILY_UI_TEXT.EJ_FAMILIA_LOPEZ} required aria-invalid={Boolean(formErrors.name?.length)} />
                    {formErrors.name?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="family-neighborhood">{FAMILY_UI_TEXT.BARRIO_2}</FieldLabel>
                    <Select name="neighborhood" value={selectedNeighborhood} onValueChange={setSelectedNeighborhood} required>
                      <SelectTrigger id="family-neighborhood" className="w-full"><SelectValue placeholder={FAMILY_UI_TEXT.SELECCIONAR_BARRIO} /></SelectTrigger>
                      <SelectContent><SelectGroup>{FAMILY_NEIGHBORHOODS.map((neighborhood) => <SelectItem key={neighborhood} value={neighborhood}>{neighborhood}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                    {formErrors.neighborhood?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="family-address">{FAMILY_UI_TEXT.DOMICILIO_2}</FieldLabel>
                  <Input id="family-address" name="address" defaultValue={editingPayload?.address ?? ""} placeholder={FAMILY_UI_TEXT.CALLE_ALTURA_MANZANA_Y_LOTE} required aria-invalid={Boolean(formErrors.address?.length)} />
                  {formErrors.address?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}
                </Field>
                <div className="space-y-2"><p className="text-sm font-medium">{FAMILY_UI_TEXT.CONTACTO_DEL_GRUPO_2}</p><p className="text-sm text-muted-foreground">{FAMILY_UI_TEXT.COMPLETA_AL_MENOS_UN_TELEFONO_ARGENTINO_O_UN_EMAIL_VALIDO}</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field><FieldLabel htmlFor="family-phone">{FAMILY_UI_TEXT.TELEFONO_ARGENTINO_DE_CONTACTO}</FieldLabel><Input id="family-phone" name="contactPhone" type="tel" defaultValue={editingPayload?.contactPhone ?? ""} placeholder={FAMILY_UI_TEXT.TEXT_381_555_0142_O_54_9_381_555_0142} aria-invalid={Boolean(formErrors.contactPhone?.length)} /><FieldDescription>{FAMILY_UI_TEXT.USA_CARACTERISTICA_Y_ABONADO_10_DIGITOS_PODES_AGREGAR_54_Y_SEPARADORES}</FieldDescription>{formErrors.contactPhone?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
                  <Field><FieldLabel htmlFor="family-email">{FAMILY_UI_TEXT.EMAIL_DE_CONTACTO}</FieldLabel><Input id="family-email" name="contactEmail" type="email" defaultValue={editingPayload?.contactEmail ?? ""} placeholder={FAMILY_UI_TEXT.NOMBRE_CORREO_COM} aria-invalid={Boolean(formErrors.contactEmail?.length)} />{formErrors.contactEmail?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                  <div><h3 className="font-semibold">{FAMILY_UI_TEXT.PERSONAS_INTEGRANTES}</h3><p className="text-xs text-muted-foreground">{FAMILY_UI_TEXT.REGISTRA_CADA_PERSONA_UNA_SOLA_VEZ_EN_EL_PADRON}</p></div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setMembers((currentMembers) => [...currentMembers, createEmptyMember()])} disabled={members.length >= 20}>{FAMILY_UI_TEXT.AGREGAR_INTEGRANTE}</Button>
                </div>
                <Field>
                  <FieldLabel htmlFor="family-reference">{FAMILY_UI_TEXT.PERSONA_REFERENTE}</FieldLabel>
                  <Select value={referenceMemberId} onValueChange={setReferenceMemberId} required>
                    <SelectTrigger id="family-reference" className="w-full"><SelectValue placeholder={FAMILY_UI_TEXT.SELECCIONAR_REFERENTE} /></SelectTrigger>
                    <SelectContent>{members.map((member, index) => <SelectItem key={member.localId} value={member.localId}>{member.firstName || member.lastName ? `${member.firstName} ${member.lastName}`.trim() : FAMILY_UI_TEXT.MEMBER_FALLBACK(index + 1)}</SelectItem>)}</SelectContent>
                  </Select>
                  {formErrors.referenceMemberIndex?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}
                </Field>
                {members.map((member, index) => (
                  <Card key={member.localId} size="sm">
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between gap-3"><h4 className="font-semibold">{FAMILY_UI_TEXT.INTEGRANTE}{index + 1}</h4>{members.length > 1 ? <Button type="button" variant="ghost" size="sm" onClick={() => { setMembers((currentMembers) => currentMembers.filter((currentMember) => currentMember.localId !== member.localId)); if (referenceMemberId === member.localId) setReferenceMemberId(members.find((currentMember) => currentMember.localId !== member.localId)?.localId ?? ""); }}>{FAMILY_UI_TEXT.QUITAR}</Button> : null}</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field><FieldLabel htmlFor={`member-first-${member.localId}`}>{FAMILY_UI_TEXT.NOMBRE}</FieldLabel><Input id={`member-first-${member.localId}`} value={member.firstName} onChange={(event) => updateMember(member.localId, (currentMember) => ({ ...currentMember, firstName: event.target.value }))} required aria-invalid={Boolean(formErrors[`members.${index}.firstName`]?.length)} />{formErrors[`members.${index}.firstName`]?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
                        <Field><FieldLabel htmlFor={`member-last-${member.localId}`}>{FAMILY_UI_TEXT.APELLIDO}</FieldLabel><Input id={`member-last-${member.localId}`} value={member.lastName} onChange={(event) => updateMember(member.localId, (currentMember) => ({ ...currentMember, lastName: event.target.value }))} required aria-invalid={Boolean(formErrors[`members.${index}.lastName`]?.length)} />{formErrors[`members.${index}.lastName`]?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
                        <Field><FieldLabel htmlFor={`member-dni-${member.localId}`}>{FAMILY_DOCUMENT_LABELS.DNI}{editingOperation ? "" : " *"}</FieldLabel><Input id={`member-dni-${member.localId}`} inputMode="numeric" value={member.dni ?? ""} onChange={(event) => updateMember(member.localId, (currentMember) => ({ ...currentMember, dni: event.target.value.replace(/\D/g, "").slice(0, 8) }))} aria-invalid={Boolean(formErrors[`members.${index}.dni`]?.length)} aria-required={!editingOperation} /><FieldDescription>{editingOperation ? FAMILY_UI_TEXT.ESTE_BORRADOR_ANTERIOR_PUEDE_CONSERVAR_INTEGRANTES_SIN_DNI : FAMILY_UI_TEXT.INGRESA_LOS_7_U_8_NUMEROS_DEL_DNI}</FieldDescription>{formErrors[`members.${index}.dni`]?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
                        <Field><FieldLabel htmlFor={`member-phone-${member.localId}`}>{FAMILY_UI_TEXT.TELEFONO}</FieldLabel><Input id={`member-phone-${member.localId}`} type="tel" value={member.phone ?? ""} onChange={(event) => updateMember(member.localId, (currentMember) => ({ ...currentMember, phone: event.target.value }))} /></Field>
                        <Field><FieldLabel htmlFor={`member-email-${member.localId}`}>{APPLICATION_UI_TEXT.EMAIL}</FieldLabel><Input id={`member-email-${member.localId}`} type="email" value={member.email ?? ""} onChange={(event) => updateMember(member.localId, (currentMember) => ({ ...currentMember, email: event.target.value }))} aria-invalid={Boolean(formErrors[`members.${index}.email`]?.length)} />{formErrors[`members.${index}.email`]?.map((message) => <FieldDescription key={message} className="text-destructive">{message}</FieldDescription>)}</Field>
                        <Field><FieldLabel htmlFor={`member-relationship-${member.localId}`}>{FAMILY_UI_TEXT.VINCULO}</FieldLabel><Select value={member.relationship} onValueChange={(relationship) => updateMember(member.localId, (currentMember) => ({ ...currentMember, relationship }))}><SelectTrigger id={`member-relationship-${member.localId}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{FAMILY_MEMBER_RELATIONSHIPS.map((relationship) => <SelectItem key={relationship} value={relationship}>{relationship}</SelectItem>)}</SelectContent></Select></Field>
                      </div>
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">{FAMILY_UI_TEXT.DOCUMENTACION_FALTANTE}</legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {FAMILY_DOCUMENT_OPTIONS.map((document) => {
                            const isMissing = member.missingDocuments.includes(document.value);
                            return <label key={document.value} className="flex min-h-10 items-center gap-2 text-sm"><Checkbox checked={isMissing} onCheckedChange={(checked) => updateMember(member.localId, (currentMember) => { let missingDocuments = currentMember.missingDocuments.filter((currentDocument) => currentDocument !== document.value); if (checked) { missingDocuments = [...currentMember.missingDocuments, document.value]; } return { ...currentMember, missingDocuments }; })} />{document.label}</label>;
                          })}
                        </div>
                      </fieldset>
                    </CardContent>
                  </Card>
                ))}
              </FieldGroup>
              {formMessage ? <Alert variant="destructive" className="mt-5"><AlertTitle>{FAMILY_UI_TEXT.NO_SE_PUDO_GUARDAR}</AlertTitle><AlertDescription>{formMessage}</AlertDescription></Alert> : null}
              <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row"><SheetClose asChild><Button variant="outline" type="button">{APPLICATION_UI_TEXT.CANCELAR}</Button></SheetClose><Button type="submit" disabled={isSaving}>{submitLabel}</Button></div>
            </form>
          </SheetContent>
        </Sheet> : null}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={FAMILY_UI_TEXT.FILTRAR_FAMILIAS}>
        <Button variant={filter === "all" ? "secondary" : "outline"} size="sm" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{FAMILY_UI_TEXT.TODAS}{allFamilies.length}{APPLICATION_UI_TEXT.TEXT_2}</Button>
        {neighborhoods.map((neighborhood) => <Button key={neighborhood} variant={filter === neighborhood ? "secondary" : "outline"} size="sm" aria-pressed={filter === neighborhood} onClick={() => setFilter(neighborhood)}>{neighborhood} {FAMILY_UI_TEXT.TEXT}{allFamilies.filter((family) => family.neighborhood === neighborhood).length}{APPLICATION_UI_TEXT.TEXT_2}</Button>)}
        <Button variant={filter === "alerts" ? "secondary" : "outline"} size="sm" aria-pressed={filter === "alerts"} onClick={() => setFilter("alerts")}>{FAMILY_UI_TEXT.CON_ALERTAS}{alertCount}{APPLICATION_UI_TEXT.TEXT_2}</Button>
      </div>

      {visibleFamilies.length ? (
        <section aria-label={FAMILY_UI_TEXT.LISTADO_DE_FAMILIAS} className="grid gap-3 xl:grid-cols-2">
          {visibleFamilies.map((family) => {
            const missingCount = family.members.reduce((total, member) => total + member.missingDocuments.length, 0);
            const referencePerson = family.members.find((member) => member.id === family.referencePersonId);
            const familyOperationsForCard = familyOperations.filter((operation) => operation.resourceId === family.id);
            const offlineOperation = familyOperationsForCard[familyOperationsForCard.length - 1];
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
                      <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-base font-semibold">{family.name}</h2><Badge variant={missingCount ? "warning" : "success"}>{missingCount ? FAMILY_UI_TEXT.MISSING_DOCUMENT_COUNT(missingCount) : FAMILY_UI_TEXT.DOCUMENTACION_COMPLETA}</Badge>{offlineOperation ? <Badge variant={offlineVariant}>{offlineStatusLabel(offlineOperation)}</Badge> : null}</div>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><HugeiconsIcon icon={Location01Icon} strokeWidth={1.8} />{family.neighborhood} {APPLICATION_UI_TEXT.TEXT}{family.address}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-3 text-xs">
                    <div><p className="font-semibold uppercase tracking-wide text-muted-foreground">{FAMILY_UI_TEXT.INTEGRANTES_2}</p><p className="mt-1 font-medium">{getMemberCountLabel(family.members.length)}</p></div>
                    <div><p className="font-semibold uppercase tracking-wide text-muted-foreground">{FAMILY_UI_TEXT.PERSONA_REFERENTE_2}</p><p className="mt-1 font-medium">{referencePerson ? `${referencePerson.firstName} ${referencePerson.lastName}` : FAMILY_UI_TEXT.SIN_INFORMAR}</p></div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {family.contactPhone ? <Button variant="soft" size="sm" asChild><a href={`tel:${family.contactPhone.replace(/[^\d+]/g, "")}`}><HugeiconsIcon icon={Call02Icon} strokeWidth={1.8} data-icon="inline-start" />{family.contactPhone}</a></Button> : <span className="text-xs text-muted-foreground">{FAMILY_UI_TEXT.SIN_TELEFONO_DE_CONTACTO}</span>}
                    {operationToEdit ? <Button variant="outline" size="sm" onClick={openOfflineDraftEditor}>{FAMILY_UI_TEXT.CORREGIR_BORRADOR}</Button> : null}
                    <Button size="sm" onClick={() => setSelectedFamily(family)}>{FAMILY_UI_TEXT.VER_FICHA_FAMILIAR}<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} data-icon="inline-end" /></Button>
                  </div>
                  {offlineOperation?.message ? <p role="status" className="text-sm text-muted-foreground">{offlineOperation.message}</p> : null}
                </CardContent>
              </Card>
            );
          })}
        </section>
      ) : (
        <Card><CardContent className="py-10 text-center"><h2 className="font-semibold">{allFamilies.length ? FAMILY_UI_TEXT.NO_HAY_RESULTADOS : FAMILY_UI_TEXT.TODAVIA_NO_HAY_FAMILIAS_REGISTRADAS}</h2><p className="mt-1 text-sm text-muted-foreground">{allFamilies.length ? FAMILY_UI_TEXT.PROBA_CON_OTRO_NOMBRE_DNI_BARRIO_O_DOMICILIO : FAMILY_UI_TEXT.CREA_LA_PRIMERA_FICHA_PARA_INICIAR_EL_PADRON_COMUNITARIO}</p></CardContent></Card>
      )}

      <Card variant="muted" size="sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-warning/15 text-warning"><HugeiconsIcon icon={CloudUploadIcon} strokeWidth={1.8} /></span><div><p className="font-semibold">{alertCount} {FAMILY_UI_TEXT.FICHAS_CON_DOCUMENTACION_PENDIENTE}</p><p className="text-xs text-muted-foreground">{FAMILY_UI_TEXT.LOS_FALTANTES_SE_MUESTRAN_EN_CADA_INTEGRANTE}</p></div></div>
          <Badge variant="secondary">{FAMILY_UI_TEXT.PADRON_ACTUALIZADO}</Badge>
        </CardContent>
      </Card>

      {selectedFamilyView ? <FamilyDetails
        family={selectedFamilyView}
        canWrite={canWrite}
        onClose={() => setSelectedFamily(null)}
        onAddMember={() => setMemberEditor({})}
        onEditMember={(member) => setMemberEditor({ member })}
        onDeactivateFamily={(family) => deactivateFamily(family, { kind: "family" })}
        onDeactivateMember={(family, member) => deactivateFamily(family, { kind: "member", memberId: member.membershipId })}
        pendingMemberIds={offlineOperations.flatMap((operation) => {
          if (operation.resourceId !== selectedFamilyView.id) {
            return [];
          }

          if (operation.operation === "delete") {
            const parsedTarget = familyDeactivationTargetSchema.safeParse(operation.payload);

            if (!parsedTarget.success) {
              return [];
            }

            const target = parsedTarget.data;

            if (target.kind === "family") {
              return ["family"];
            }

            const member = selectedFamilyView.members.find((familyMember) => familyMember.membershipId === target.memberId);
            return member ? [member.id] : [];
          }

          if (operation.operation !== "update") {
            return [];
          }

          const parsedChange = familyMemberChangeSchema.safeParse(operation.payload);
          if (!parsedChange.success) {
            return [];
          }

          if (parsedChange.data.action === "add-member") {
            return [parsedChange.data.personId];
          }

          const member = selectedFamilyView.members.find((familyMember) => familyMember.membershipId === parsedChange.data.memberId);
          return member ? [member.id] : [];
        })}
      /> : null}
      {selectedFamilyView && memberEditor ? <FamilyMemberForm
        key={memberEditor.member?.membershipId ?? selectedFamilyView.id}
        family={selectedFamilyView}
        member={memberEditor.member}
        onClose={() => setMemberEditor(null)}
        onSave={saveFamilyMember}
      /> : null}
    </div>
  );
}
