"use client";

import { USERS_UI_TEXT, USER_ERROR_MESSAGES } from "@/constants/user.constant";
import { APPLICATION_UI_TEXT } from "@/constants/application-ui.constant";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_ROUTES } from "@/constants/routes.constant";
import { USER_ROLE_OPTIONS, USER_ROLE_LABELS } from "@/constants/user-role.constant";
import { clientErrorHandler } from "@/utils/handlers/clientHandler";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { getManagedUsers } from "@/services/client/user-administration-data.service";
import clientAxios from "@/utils/clientAxios.util";

import type { ManagedUser } from "@/types/schema-contracts";

export function UserAdministration({ userId }: { userId: string }) {
  const isOnline = useNetworkStatus();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getManagedUsers(userId, isOnline, search);
      setUsers(result.data.users);
      setError("");
    } catch (cause) {
      setError(USER_ERROR_MESSAGES.NO_SE_PUDIERON_CARGAR_LAS_CUENTAS);
      clientErrorHandler(cause);
    } finally { setLoading(false); }
  }, [isOnline, search, userId]);

  useEffect(() => {
    void loadUsers();
  }, [isOnline, loadUsers]);

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await clientAxios.post(API_ROUTES.USERS, Object.fromEntries(form.entries()));
      formElement.reset();
      await loadUsers();
    } catch (cause) {
      setFormError(USER_ERROR_MESSAGES.REVISA_LOS_DATOS_E_INTENTA_NUEVAMENTE_VERIFICA_QUE_EL_EMAIL_NO_ESTE_REGIST);
      clientErrorHandler(cause);
    } finally { setSaving(false); }
  }

  async function changeStatus(user: ManagedUser) {
    const next = !user.isActive;

    if (!next) {
      const confirmed = window.confirm(USERS_UI_TEXT.CONFIRM_DEACTIVATION(user.name));

      if (!confirmed) {
        return;
      }
    }

    try {
      await clientAxios.patch(`${API_ROUTES.USERS}/${user.id}`, { isActive: next });
      await loadUsers();
    } catch (cause) { clientErrorHandler(cause); }
  }

  let usersContent: ReactNode;

  if (loading) {
    usersContent = <p role="status">{USERS_UI_TEXT.CARGANDO_USUARIOS}</p>;
  } else if (error) {
    usersContent = <div className="flex items-center gap-3"><p role="alert">{error}</p><Button variant="outline" onClick={() => void loadUsers()}>{APPLICATION_UI_TEXT.REINTENTAR}</Button></div>;
  } else if (users.length === 0) {
    usersContent = <p className="text-sm text-muted-foreground">{USERS_UI_TEXT.NO_HAY_USUARIOS_PARA_MOSTRAR}</p>;
  } else {
    usersContent = <ul className="divide-y">{users.filter((user) => `${user.name} ${user.email ?? ""}`.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))).map((user) => <li key={user.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium">{user.name}</p><p className="break-all text-sm text-muted-foreground">{user.email ?? USERS_UI_TEXT.SIN_EMAIL} {APPLICATION_UI_TEXT.TEXT}{user.role ? USER_ROLE_LABELS[user.role] : USERS_UI_TEXT.SIN_ROL}</p></div><div className="flex items-center gap-3"><Badge variant={user.isActive ? "success" : "secondary"}>{user.isActive ? USERS_UI_TEXT.ACTIVO : USERS_UI_TEXT.INACTIVO}</Badge><Button variant={user.isActive ? "outline" : "secondary"} size="sm" disabled={!isOnline} onClick={() => void changeStatus(user)}>{user.isActive ? USERS_UI_TEXT.DESACTIVAR : USERS_UI_TEXT.ACTIVAR}</Button></div></li>)}</ul>;
  }

  return <div className="flex flex-col gap-5">
    <header><h1 className="font-display text-2xl font-bold">{USERS_UI_TEXT.ADMINISTRACION_DE_USUARIOS}</h1><p className="text-sm text-muted-foreground">{USERS_UI_TEXT.CREA_Y_ADMINISTRA_LAS_CUENTAS_DEL_EQUIPO}</p></header>
    {!isOnline ? <p role="status" className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">{USERS_UI_TEXT.CONSULTA_DE_LA_ULTIMA_PREPARACION_AUTORIZADA_CREAR_CUENTAS_Y_CAMBIAR_EST}</p> : null}
    <Card><CardHeader><CardTitle>{USERS_UI_TEXT.CREAR_CUENTA}</CardTitle></CardHeader><CardContent>
      <fieldset disabled={!isOnline} className="grid gap-3 sm:grid-cols-2 disabled:opacity-60">
        <form className="contents" onSubmit={createUser}>
        <Input name="name" placeholder={USERS_UI_TEXT.NOMBRE_Y_APELLIDO} aria-label={USERS_UI_TEXT.NOMBRE_Y_APELLIDO} required minLength={2} maxLength={120} />
        <Input name="email" type="email" placeholder={APPLICATION_UI_TEXT.EMAIL} aria-label={APPLICATION_UI_TEXT.EMAIL} required />
        <Select name="role" required>
          <SelectTrigger aria-label={USERS_UI_TEXT.ROL}><SelectValue placeholder={USERS_UI_TEXT.SELECCIONA_UN_ROL} /></SelectTrigger>
          <SelectContent>{USER_ROLE_OPTIONS.map((role) => <SelectItem key={role} value={role}>{USER_ROLE_LABELS[role]}</SelectItem>)}</SelectContent>
        </Select>
        <Input name="password" type="password" placeholder={USERS_UI_TEXT.CONTRASENA_INICIAL_10_CARACTERES_MINIMO} aria-label={USERS_UI_TEXT.CONTRASENA_INICIAL} required minLength={10} maxLength={128} />
        {formError ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{formError}</p> : null}
        <Button type="submit" disabled={saving} className="sm:col-span-2">{saving ? USERS_UI_TEXT.CREANDO : USERS_UI_TEXT.CREAR_USUARIO}</Button>
        </form>
      </fieldset>
    </CardContent></Card>
    <Card><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>{USERS_UI_TEXT.EQUIPO}</CardTitle><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={USERS_UI_TEXT.BUSCAR_POR_NOMBRE_O_EMAIL} aria-label={USERS_UI_TEXT.BUSCAR_USUARIOS} className="sm:max-w-xs" /></CardHeader><CardContent>
      {usersContent}
    </CardContent></Card>
  </div>;
}
