"use client";

import { useCallback, useEffect, useState } from "react";
import { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_ROUTES } from "@/constants/routes";
import { USER_ROLE_LABELS } from "@/constants/user-role.constant";
import clientAxios from "@/utils/clientAxios.util";
import { clientErrorHandler } from "@/utils/handlers/clientHandler";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { resolveOfflineData } from "@/services/offline-data.service";
import { z } from "zod";

interface ManagedUser { id: string; name: string; email: string | null; role: UserRole | null; isActive: boolean }
const managedUsersSchema = z.object({ users: z.array(z.object({ id: z.string(), name: z.string(), email: z.string().nullable(), role: z.nativeEnum(UserRole).nullable(), isActive: z.boolean() })) });

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
      const result = await resolveOfflineData({
        userId,
        route: "/usuarios",
        isOnline,
        schema: managedUsersSchema,
        loadFromApi: async () => (await clientAxios.get<unknown>(API_ROUTES.USERS, { params: { search } })).data,
        persistToSnapshot: search.trim().length === 0,
      });
      setUsers(result.data.users);
      setError("");
    } catch (cause) {
      setError("No se pudieron cargar las cuentas.");
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
      setFormError("Revisá los datos e intentá nuevamente. Verificá que el email no esté registrado.");
      clientErrorHandler(cause);
    } finally { setSaving(false); }
  }

  async function changeStatus(user: ManagedUser) {
    const next = !user.isActive;
    if (!next && !window.confirm(`¿Desactivar la cuenta de ${user.name}? Sus sesiones serán revocadas.`)) return;
    try {
      await clientAxios.patch(`${API_ROUTES.USERS}/${user.id}`, { isActive: next });
      await loadUsers();
    } catch (cause) { clientErrorHandler(cause); }
  }

  return <div className="flex flex-col gap-5">
    <header><h1 className="font-display text-2xl font-bold">Administración de usuarios</h1><p className="text-sm text-muted-foreground">Creá y administrá las cuentas del equipo.</p></header>
    {!isOnline ? <p role="status" className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">Consulta de la última preparación autorizada. Crear cuentas y cambiar estados requieren conexión.</p> : null}
    <Card><CardHeader><CardTitle>Crear cuenta</CardTitle></CardHeader><CardContent>
      <fieldset disabled={!isOnline} className="grid gap-3 sm:grid-cols-2 disabled:opacity-60">
        <form className="contents" onSubmit={createUser}>
        <Input name="name" placeholder="Nombre y apellido" aria-label="Nombre y apellido" required minLength={2} maxLength={120} />
        <Input name="email" type="email" placeholder="Email" aria-label="Email" required />
        <Select name="role" required>
          <SelectTrigger aria-label="Rol"><SelectValue placeholder="Seleccioná un rol" /></SelectTrigger>
          <SelectContent>{Object.values(UserRole).map((role) => <SelectItem key={role} value={role}>{USER_ROLE_LABELS[role]}</SelectItem>)}</SelectContent>
        </Select>
        <Input name="password" type="password" placeholder="Contraseña inicial (10 caracteres mínimo)" aria-label="Contraseña inicial" required minLength={10} maxLength={128} />
        {formError ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{formError}</p> : null}
        <Button type="submit" disabled={saving} className="sm:col-span-2">{saving ? "Creando…" : "Crear usuario"}</Button>
        </form>
      </fieldset>
    </CardContent></Card>
    <Card><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Equipo</CardTitle><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o email" aria-label="Buscar usuarios" className="sm:max-w-xs" /></CardHeader><CardContent>
      {loading ? <p role="status">Cargando usuarios…</p> : error ? <div className="flex items-center gap-3"><p role="alert">{error}</p><Button variant="outline" onClick={() => void loadUsers()}>Reintentar</Button></div> : users.length === 0 ? <p className="text-sm text-muted-foreground">No hay usuarios para mostrar.</p> : <ul className="divide-y">{users.filter((user) => `${user.name} ${user.email ?? ""}`.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))).map((user) => <li key={user.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium">{user.name}</p><p className="break-all text-sm text-muted-foreground">{user.email ?? "Sin email"} · {user.role ? USER_ROLE_LABELS[user.role] : "Sin rol"}</p></div><div className="flex items-center gap-3"><Badge variant={user.isActive ? "success" : "secondary"}>{user.isActive ? "Activo" : "Inactivo"}</Badge><Button variant={user.isActive ? "outline" : "secondary"} size="sm" disabled={!isOnline} onClick={() => void changeStatus(user)}>{user.isActive ? "Desactivar" : "Activar"}</Button></div></li>)}</ul>}
    </CardContent></Card>
  </div>;
}
