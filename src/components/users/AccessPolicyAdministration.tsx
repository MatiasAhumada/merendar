"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AccessCapability, UserRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACCESS_CAPABILITY_FEATURES, ACCESS_CAPABILITY_LABELS } from "@/constants/access-policy.constant";
import { API_ROUTES } from "@/constants/routes";
import { USER_ROLE_LABELS } from "@/constants/user-role.constant";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import clientAxios from "@/utils/clientAxios.util";
import { clientErrorHandler } from "@/utils/handlers/clientHandler";
import { getAccessPolicySnapshot } from "@/services/client/access-policy-data.service";
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
  return Object.values(UserRole).map((role) => ({
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
      setError("No se pudo cargar la matriz de permisos.");
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
    return <p role="status">Cargando matriz de permisos…</p>;
  }

  if (error || !snapshot) {
    return <div className="flex flex-col items-start gap-3"><p role="alert">{error || "No se pudo consultar la matriz."}</p><Button variant="outline" onClick={() => void loadPolicy()}>Reintentar</Button></div>;
  }

  return <div className="flex flex-col gap-5">
    {!isOnline ? <p role="status" className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">Matriz de la última preparación autorizada. Los cambios requieren conexión y validación del servidor.</p> : null}
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Permisos por rol</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Configurá solo las acciones existentes en Merendar. Los cambios aplican a todas las cuentas del rol en su próxima solicitud al servidor.</p></div>
      <Button onClick={() => setIsReviewOpen(true)} disabled={!isOnline || !changedRoles.length || saving}>Revisar y guardar ({changedRoles.length})</Button>
    </header>

    <section aria-label="Capacidades por rol" className="grid gap-4 xl:grid-cols-2">
      {draft.map((rolePolicy) => {
        const roleUsers = snapshot.usersByRole.find((entry) => entry.role === rolePolicy.role)?.users ?? [];
        return <Card key={rolePolicy.role}>
          <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div><CardTitle>{USER_ROLE_LABELS[rolePolicy.role]}</CardTitle><CardDescription>{roleUsers.length} cuenta(s) · {roleUsers.filter((user) => user.isActive).length} activa(s)</CardDescription></div>
            {rolePolicy.role === UserRole.PRESIDENTE ? <Badge variant="secondary">Administración reservada</Badge> : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {AccessCapabilityList.map((capability) => {
              const inputId = `${rolePolicy.role}-${capability}`;
              const checked = rolePolicy.capabilities.includes(capability);
              return <div key={capability} className="flex items-start gap-3 border-t pt-3 first:border-t-0 first:pt-0">
                <Checkbox id={inputId} checked={checked} disabled={!isOnline} onCheckedChange={(nextValue) => updateCapability(rolePolicy.role, capability, Boolean(nextValue))} />
                <label htmlFor={inputId} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 text-sm">
                  <span className="font-medium">{ACCESS_CAPABILITY_LABELS[capability]}</span>
                  <span className="text-xs text-muted-foreground">{ACCESS_CAPABILITY_FEATURES[capability]} · <code>{capability}</code></span>
                </label>
                <Badge variant={checked ? "success" : "secondary"}>{checked ? "Habilitado" : "Denegado"}</Badge>
              </div>;
            })}
          </CardContent>
        </Card>;
      })}
    </section>

    <Card>
      <CardHeader><CardTitle>Administración protegida</CardTitle><CardDescription>Estas acciones no forman parte de la matriz editable y siempre requieren una cuenta activa de Presidencia.</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap gap-2"><Badge variant="outline">Administrar usuarios</Badge><Badge variant="outline">Administrar permisos</Badge><p className="w-full text-sm text-muted-foreground">Cada solicitud protegida consulta el rol y la política vigentes en la base de datos. La navegación no concede acceso.</p></CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Actividad reciente</CardTitle><CardDescription>Últimos cambios de permisos con actor, fecha y valores anteriores y nuevos.</CardDescription></CardHeader>
      <CardContent>{snapshot.history.length ? <ul className="divide-y">{snapshot.history.map((change, index) => <li key={`${change.createdAt}-${change.role}-${change.capabilityKey}-${index}`} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center"><span><strong>{USER_ROLE_LABELS[change.role]}</strong> · {change.capabilityKey}: {change.previousValue ? "habilitado" : "denegado"} → {change.newValue ? "habilitado" : "denegado"}</span><span className="text-xs text-muted-foreground">{change.actorName} · {formatChangeDate(change.createdAt)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Todavía no hay cambios registrados.</p>}</CardContent>
    </Card>

    <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Confirmar cambios de acceso</DialogTitle><DialogDescription>Se actualizarán las capacidades seleccionadas y el cambio quedará registrado en el historial.</DialogDescription></DialogHeader>
        <div className="max-h-72 space-y-4 overflow-y-auto">
          {changedRoles.map((rolePolicy) => {
            const roleUsers = snapshot.usersByRole.find((entry) => entry.role === rolePolicy.role)?.users ?? [];
            const initialRolePolicy = buildRolePolicies(snapshot.policies).find((entry) => entry.role === rolePolicy.role);
            const changedCapabilities = AccessCapabilityList.filter((capability) => initialRolePolicy?.capabilities.includes(capability) !== rolePolicy.capabilities.includes(capability));
            return <section key={rolePolicy.role} className="space-y-2 rounded-lg border p-3">
              <h3 className="font-semibold">{USER_ROLE_LABELS[rolePolicy.role]} · {roleUsers.length} cuenta(s) afectada(s)</h3>
              <ul className="list-inside list-disc text-sm text-muted-foreground">{changedCapabilities.map((capability) => <li key={capability}>{rolePolicy.capabilities.includes(capability) ? "Habilitar" : "Revocar"}: {ACCESS_CAPABILITY_LABELS[capability]}</li>)}</ul>
              {roleUsers.length ? <p className="text-sm">{roleUsers.map((user) => `${user.name}${user.email ? ` (${user.email})` : ""}${user.isActive ? "" : " · inactiva"}`).join("; ")}</p> : <p className="text-sm text-muted-foreground">No hay cuentas con este rol.</p>}
            </section>;
          })}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setIsReviewOpen(false)} disabled={saving}>Cancelar</Button><Button onClick={() => void savePolicy()} disabled={saving}>{saving ? "Guardando…" : "Confirmar cambios"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

const AccessCapabilityList: AccessCapability[] = Object.values(AccessCapability);
