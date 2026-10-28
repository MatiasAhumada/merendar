"use client";

import { DASHBOARD_UI_TEXT, DASHBOARD_ACTIONS } from "@/constants/dashboard.constant";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardSummaryPanel } from "@/components/dashboard/DashboardSummaryPanel";
import { SessionRoute } from "@/components/shared/SessionRoute";
import { useAppSession } from "@/components/shared/AppSessionContext";
import { USER_ROLE_LABELS } from "@/constants/user-role.constant";
import Link from "next/link";

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase();
}

export default function DashboardPage() {
  const session = useAppSession();
  const user = session.user;
  const dashboardActions = DASHBOARD_ACTIONS.filter((action) => session.capabilities.includes(action.capability));

  return (
    <SessionRoute>
      {user ? (
        <div className="flex flex-col gap-5">
          <section className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{DASHBOARD_UI_TEXT.HOLA}{user.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{DASHBOARD_UI_TEXT.RESUMEN_DE_LOS_MODULOS_PERSISTENTES_DE_MERENDAR}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Badge variant="secondary" className="hidden sm:inline-flex">{USER_ROLE_LABELS[user.role]}</Badge>
              <Avatar size="lg" aria-label={user.name}><AvatarFallback>{getInitials(user.name)}</AvatarFallback></Avatar>
            </div>
          </section>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
            <DashboardSummaryPanel userId={user.id} initialSummary={null} />
            <section id="acciones" aria-labelledby="actions-title" className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 id="actions-title" className="font-display text-lg font-semibold">{DASHBOARD_UI_TEXT.ACCESOS_DISPONIBLES}</h2>
                <span className="text-xs text-muted-foreground">{DASHBOARD_UI_TEXT.SEGUN_TU_ROL}</span>
              </div>
              {dashboardActions.length ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {dashboardActions.map((action) => (
                    <Button key={action.label} asChild variant="outline" size="tile" className="w-full">
                      <Link href={action.href}>
                        <HugeiconsIcon icon={action.icon} strokeWidth={1.8} data-icon="inline-start" />
                        <span className="flex flex-col items-start leading-tight">
                          <strong>{action.label}</strong>
                          <span className="text-xs font-normal text-muted-foreground">{action.description}</span>
                        </span>
                      </Link>
                    </Button>
                  ))}
                </div>
              ) : (
                <Alert variant="info">
                  <AlertTitle>{DASHBOARD_UI_TEXT.TU_CUENTA_TODAVIA_NO_TIENE_MODULOS_OPERATIVOS}</AlertTitle>
                  <AlertDescription>{DASHBOARD_UI_TEXT.SI_NECESITAS_CONSULTAR_O_REGISTRAR_UNA_TAREA_DE_LA_ORGANIZACION_PEDILE_A}</AlertDescription>
                </Alert>
              )}
            </section>
          </div>
        </div>
      ) : (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">{DASHBOARD_UI_TEXT.PREPARANDO_EL_INICIO_PARA_ESTA_CUENTA}</CardContent></Card>
      )}
    </SessionRoute>
  );
}
