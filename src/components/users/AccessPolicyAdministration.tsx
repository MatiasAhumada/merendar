"use client";

import { USERS_UI_TEXT, USER_ERROR_MESSAGES } from "@/constants/user.constant";
import { APPLICATION_UI_TEXT } from "@/constants/application-ui.constant";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccessCapability, UserRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACCESS_CAPABILITY_OPTIONS, ACCESS_CAPABILITY_FEATURES, ACCESS_CAPABILITY_LABELS } from "@/constants/access-policy.constant";
import { API_ROUTES } from "@/constants/routes.constant";
import { USER_ROLES, USER_ROLE_OPTIONS, USER_ROLE_LABELS } from "@/constants/user-role.constant";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { clientErrorHandler } from "@/utils/handlers/clientHandler";
import { getAccessPolicySnapshot } from "@/services/client/access-policy-data.service";
import clientAxios from "@/utils/clientAxios.util";

import type { PolicySnapshot } from "@/validations/access-policy-snapshot.validation";

interface PolicyRecord {
  role: UserRole;
  capability: AccessCapability;
  enabled: boolean;
}

interface RolePolicy {
  role: UserRole;
  capabilities: AccessCapability[];
}

function buildRolePolicies(records: PolicyRecord[]) {
  return USER_ROLE_OPTIONS.map((role) => ({
    role,
    capabilities: records.filter((record) => record.role === role && record.enabled).map((record) => record.capability),
  }));
}

function formatChangeDate(createdAt: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Tucuman" }).format(new Date(createdAt));
}

export function AccessPolicyAdministration({ userId }: { userId: string }) {
  const isOnline = useNetworkStatus();
  const [snapshot, setSnapshot] = useState<PolicySnapshot | null>(null);
  const [draft, setDraft] = useState<RolePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getAccessPolicySnapshot(userId, isOnline);
      setSnapshot(response.data);
      setDraft(buildRolePolicies(response.data.policies));
      setError("");
    } catch (cause) {
      setError(USER_ERROR_MESSAGES.NO_SE_PUDO_CARGAR_LA_MATRIZ_DE_PERMISOS);
      clientErrorHandler(cause);
    } finally {
      setLoading(false);
    }
  }, [isOnline, userId]);

  useEffect(() => {
    void loadPolicy();
  }, [isOnline, loadPolicy]);

  const changedRoles = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const initial = buildRolePolicies(snapshot.policies);
    return draft.filter((rolePolicy) => {
      const initialRolePolicy = initial.find((candidate) => candidate.role === rolePolicy.role);
      return AccessCapabilityList.some((capability) => initialRolePolicy?.capabilities.includes(capability) !== rolePolicy.capabilities.includes(capability));
    });
  }, [draft, snapshot]);

  function updateCapability(role: UserRole, capability: AccessCapability, enabled: boolean) {
    setDraft((current) => current.map((rolePolicy) => {
      if (rolePolicy.role !== role) {
        return rolePolicy;
      }

      let capabilities = rolePolicy.capabilities.filter((currentCapability) => currentCapability !== capability);
      if (enabled) {
        capabilities = [...new Set([...rolePolicy.capabilities, capability])];
      }
      return { ...rolePolicy, capabilities };
    }));
  }

  async function savePolicy() {
    setSaving(true);
    try {
      await clientAxios.put(API_ROUTES.ACCESS_POLICY, { roles: draft });
      setIsReviewOpen(false);
      await loadPolicy();
    } catch (cause) {
      clientErrorHandler(cause);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p role="status">{USERS_UI_TEXT.CARGANDO_MATRIZ_DE_PERMISOS}</p>;
  }

  if (error || !snapshot) {
    return <div className="flex flex-col items-start gap-3"><p role="alert">{error || USERS_UI_TEXT.NO_SE_PUDO_CONSULTAR_LA_MATRIZ}</p><Button variant="outline" onClick={() => void loadPolicy()}>{APPLICATION_UI_TEXT.REINTENTAR}</Button></div>;
  }

  return <div className="flex flex-col gap-5">
    {!isOnline ? <p role="status" className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">{USERS_UI_TEXT.MATRIZ_DE_LA_ULTIMA_PREPARACION_AUTORIZADA_LOS_CAMBIOS_REQUIEREN_CONEXIO}</p> : null}
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{USERS_UI_TEXT.PERMISOS_POR_ROL}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{USERS_UI_TEXT.CONFIGURA_SOLO_LAS_ACCIONES_EXISTENTES_EN_MERENDAR_LOS_CAMBIOS_APLICAN_A}</p></div>
      <Button onClick={() => setIsReviewOpen(true)} disabled={!isOnline || !changedRoles.length || saving}>{USERS_UI_TEXT.REVISAR_Y_GUARDAR}{changedRoles.length}{APPLICATION_UI_TEXT.TEXT_2}</Button>
    </header>

    <section aria-label={USERS_UI_TEXT.CAPACIDADES_POR_ROL} className="grid gap-4 xl:grid-cols-2">
      {draft.map((rolePolicy) => {
        const roleUsers = snapshot.usersByRole.find((entry) => entry.role === rolePolicy.role)?.users ?? [];
        return <Card key={rolePolicy.role}>
          <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div><CardTitle>{USER_ROLE_LABELS[rolePolicy.role]}</CardTitle><CardDescription>{roleUsers.length} {USERS_UI_TEXT.CUENTA_S}{roleUsers.filter((user) => user.isActive).length} {USERS_UI_TEXT.ACTIVA_S}</CardDescription></div>
            {rolePolicy.role === USER_ROLES.PRESIDENTE ? <Badge variant="secondary">{USERS_UI_TEXT.ADMINISTRACION_RESERVADA}</Badge> : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {AccessCapabilityList.map((capability) => {
              const inputId = `${rolePolicy.role}-${capability}`;
              const checked = rolePolicy.capabilities.includes(capability);
              return <div key={capability} className="flex items-start gap-3 border-t pt-3 first:border-t-0 first:pt-0">
                <Checkbox id={inputId} checked={checked} disabled={!isOnline} onCheckedChange={(nextValue) => updateCapability(rolePolicy.role, capability, Boolean(nextValue))} />
                <label htmlFor={inputId} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 text-sm">
                  <span className="font-medium">{ACCESS_CAPABILITY_LABELS[capability]}</span>
                  <span className="text-xs text-muted-foreground">{ACCESS_CAPABILITY_FEATURES[capability]} {APPLICATION_UI_TEXT.TEXT}<code>{capability}</code></span>
                </label>
                <Badge variant={checked ? "success" : "secondary"}>{checked ? USERS_UI_TEXT.HABILITADO : USERS_UI_TEXT.DENEGADO}</Badge>
              </div>;
            })}
          </CardContent>
        </Card>;
      })}
    </section>

    <Card>
      <CardHeader><CardTitle>{USERS_UI_TEXT.ADMINISTRACION_PROTEGIDA}</CardTitle><CardDescription>{USERS_UI_TEXT.ESTAS_ACCIONES_NO_FORMAN_PARTE_DE_LA_MATRIZ_EDITABLE_Y_SIEMPRE_REQUIEREN}</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap gap-2"><Badge variant="outline">{USERS_UI_TEXT.ADMINISTRAR_USUARIOS}</Badge><Badge variant="outline">{USERS_UI_TEXT.ADMINISTRAR_PERMISOS}</Badge><p className="w-full text-sm text-muted-foreground">{USERS_UI_TEXT.CADA_SOLICITUD_PROTEGIDA_CONSULTA_EL_ROL_Y_LA_POLITICA_VIGENTES_EN_LA_BA}</p></CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>{USERS_UI_TEXT.ACTIVIDAD_RECIENTE}</CardTitle><CardDescription>{USERS_UI_TEXT.ULTIMOS_CAMBIOS_DE_PERMISOS_CON_ACTOR_FECHA_Y_VALORES_ANTERIORES_Y_NUEVO}</CardDescription></CardHeader>
      <CardContent>{snapshot.history.length ? <ul className="divide-y">{snapshot.history.map((change, index) => <li key={`${change.createdAt}-${change.role}-${change.capabilityKey}-${index}`} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center"><span><strong>{USER_ROLE_LABELS[change.role]}</strong> {APPLICATION_UI_TEXT.TEXT}{change.capabilityKey}{USERS_UI_TEXT.TEXT}{change.previousValue ? USERS_UI_TEXT.HABILITADO.toLocaleLowerCase("es-AR") : USERS_UI_TEXT.DENEGADO.toLocaleLowerCase("es-AR")} {USERS_UI_TEXT.TEXT_2}{change.newValue ? USERS_UI_TEXT.HABILITADO.toLocaleLowerCase("es-AR") : USERS_UI_TEXT.DENEGADO.toLocaleLowerCase("es-AR")}</span><span className="text-xs text-muted-foreground">{change.actorName} {APPLICATION_UI_TEXT.TEXT}{formatChangeDate(change.createdAt)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">{USERS_UI_TEXT.TODAVIA_NO_HAY_CAMBIOS_REGISTRADOS}</p>}</CardContent>
    </Card>

    <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{USERS_UI_TEXT.CONFIRMAR_CAMBIOS_DE_ACCESO}</DialogTitle><DialogDescription>{USERS_UI_TEXT.SE_ACTUALIZARAN_LAS_CAPACIDADES_SELECCIONADAS_Y_EL_CAMBIO_QUEDARA_REGIST}</DialogDescription></DialogHeader>
        <div className="max-h-72 space-y-4 overflow-y-auto">
          {changedRoles.map((rolePolicy) => {
            const roleUsers = snapshot.usersByRole.find((entry) => entry.role === rolePolicy.role)?.users ?? [];
            const initialRolePolicy = buildRolePolicies(snapshot.policies).find((entry) => entry.role === rolePolicy.role);
            const changedCapabilities = AccessCapabilityList.filter((capability) => initialRolePolicy?.capabilities.includes(capability) !== rolePolicy.capabilities.includes(capability));
            return <section key={rolePolicy.role} className="space-y-2 rounded-lg border p-3">
              <h3 className="font-semibold">{USER_ROLE_LABELS[rolePolicy.role]} {APPLICATION_UI_TEXT.TEXT}{roleUsers.length} {USERS_UI_TEXT.CUENTA_S_AFECTADA_S}</h3>
              <ul className="list-inside list-disc text-sm text-muted-foreground">{changedCapabilities.map((capability) => <li key={capability}>{rolePolicy.capabilities.includes(capability) ? USERS_UI_TEXT.HABILITAR : USERS_UI_TEXT.REVOCAR}{USERS_UI_TEXT.TEXT}{ACCESS_CAPABILITY_LABELS[capability]}</li>)}</ul>
              {roleUsers.length ? <p className="text-sm">{roleUsers.map((user) => `${user.name}${user.email ? ` (${user.email})` : ""}${user.isActive ? "" : USERS_UI_TEXT.INACTIVA}`).join("; ")}</p> : <p className="text-sm text-muted-foreground">{USERS_UI_TEXT.NO_HAY_CUENTAS_CON_ESTE_ROL}</p>}
            </section>;
          })}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setIsReviewOpen(false)} disabled={saving}>{APPLICATION_UI_TEXT.CANCELAR}</Button><Button onClick={() => void savePolicy()} disabled={saving}>{saving ? USERS_UI_TEXT.GUARDANDO : USERS_UI_TEXT.CONFIRMAR_CAMBIOS}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

const AccessCapabilityList: AccessCapability[] = [...ACCESS_CAPABILITY_OPTIONS];
