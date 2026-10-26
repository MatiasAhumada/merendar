import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ACTIONS } from "@/constants/dashboard.constant";
import { DashboardSummaryPanel } from "@/components/dashboard/DashboardSummaryPanel";
import { USER_ROLE_LABELS } from "@/constants/user-role.constant";
import { requireSession } from "@/server/services/auth-session";
import { dashboardService } from "@/server/services/dashboard.service";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";
import type { DashboardSummaryResult } from "@/types/dashboard";

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export default async function DashboardPage() {
  const session = await requireSession();
  let summaryResult: DashboardSummaryResult | null = null;

  try {
    summaryResult = await dashboardService.getSummary(session.user.role);
  } catch {}

  const permittedDashboardActions = await Promise.all(DASHBOARD_ACTIONS.map(async (action) => ({
    action,
    allowed: await hasEffectiveCapability(session.user.role, action.capability),
  })));
  const dashboardActions = permittedDashboardActions.filter((result) => result.allowed).map((result) => result.action);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Hola, {session.user.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Resumen de los módulos persistentes de Merendar
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {USER_ROLE_LABELS[session.user.role]}
          </Badge>
          <Avatar size="lg" aria-label={session.user.name}>
            <AvatarFallback>{getInitials(session.user.name)}</AvatarFallback>
          </Avatar>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <DashboardSummaryPanel userId={session.user.id} initialSummary={summaryResult} />

        <section id="acciones" aria-labelledby="actions-title" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="actions-title" className="font-display text-lg font-semibold">
              Accesos disponibles
            </h2>
            <span className="text-xs text-muted-foreground">Según tu rol</span>
          </div>
          {dashboardActions.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {dashboardActions.map((action) => (
                <Button
                  key={action.label}
                  asChild
                  variant="outline"
                  size="tile"
                  className="w-full"
                >
                  <Link href={action.href}>
                    <HugeiconsIcon icon={action.icon} strokeWidth={1.8} data-icon="inline-start" />
                    <span className="flex flex-col items-start leading-tight">
                      <strong>{action.label}</strong>
                      <span className="text-xs font-normal text-muted-foreground">
                        {action.description}
                      </span>
                    </span>
                  </Link>
                </Button>
              ))}
            </div>
          )}
          {!dashboardActions.length && (
            <Alert variant="info">
              <AlertTitle>Tu cuenta todavía no tiene módulos operativos</AlertTitle>
              <AlertDescription>
                Si necesitás consultar o registrar una tarea de la organización, pedile a Presidencia que revise las capacidades habilitadas para tu rol.
              </AlertDescription>
            </Alert>
          )}
        </section>
      </div>
    </div>
  );
}
