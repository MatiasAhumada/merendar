import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  CloudIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DASHBOARD_ACTIONS,
  DASHBOARD_METRICS,
} from "@/constants/dashboard.constant";
import { USER_ROLE_LABELS } from "@/constants/user-role.constant";
import { requireSession } from "@/server/services/auth-session";
import { dashboardService } from "@/server/services/dashboard.service";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";
import type { DashboardSummary, DashboardSummaryResult } from "@/types/dashboard";

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function formatLastUpdated(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Argentina/Tucuman",
  }).format(new Date(value));
}

export default async function DashboardPage() {
  const session = await requireSession();
  let summaryResult: DashboardSummaryResult | null = null;
  let summaryFailed = false;

  try {
    summaryResult = await dashboardService.getSummary(session.user.role);
  } catch {
    summaryFailed = true;
  }

  const permittedDashboardActions = await Promise.all(DASHBOARD_ACTIONS.map(async (action) => ({
    action,
    allowed: await hasEffectiveCapability(session.user.role, action.capability),
  })));
  const dashboardActions = permittedDashboardActions.filter((result) => result.allowed).map((result) => result.action);
  let authorizedSummary: DashboardSummary | null = null;
  if (summaryResult?.authorized) {
    authorizedSummary = summaryResult.summary;
  }

  let periodHeading = "Gestión comunitaria";
  let periodDescription = "Consultá los módulos habilitados para tu rol.";
  let sourceBadge = "Panel informativo";
  let sourceBadgeVariant: "success" | "secondary" | "destructive" = "secondary";

  if (authorizedSummary) {
    sourceBadge = "Datos del servidor";
    sourceBadgeVariant = "success";
  }

  if (summaryFailed) {
    sourceBadge = "Servidor no disponible";
    sourceBadgeVariant = "destructive";
  }

  if (authorizedSummary?.activePeriodLabel) {
    periodHeading = authorizedSummary.activePeriodLabel;
    periodDescription = "Período operativo vigente";
  }

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

      {summaryFailed && (
        <Alert variant="destructive">
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
          <AlertTitle>No pudimos cargar los datos del inicio</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>El servidor no respondió. Podés volver a intentar sin perder información.</span>
            <Button asChild size="sm" variant="outline">
              <Link href="/">
                Reintentar
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} data-icon="inline-end" />
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!summaryFailed && summaryResult && !summaryResult.authorized && (
        <Alert variant="info">
          <HugeiconsIcon icon={CloudIcon} strokeWidth={1.8} />
          <AlertTitle>Resumen operativo no habilitado para este rol</AlertTitle>
          <AlertDescription>
            Las métricas del padrón y de cupos están disponibles para Presidencia y Secretaría.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <div className="flex flex-col gap-5">
          <Card variant="hero" className="relative overflow-hidden">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-20 -right-12 size-60 rounded-full bg-primary-foreground/5"
            />
            <CardHeader className="relative">
              <Badge variant={sourceBadgeVariant} className="w-fit">
                {sourceBadge.toUpperCase()}
              </Badge>
              <CardTitle>
                <h2 className="font-display text-xl font-semibold">
                  {periodHeading}
                </h2>
              </CardTitle>
              <CardDescription>
                {periodDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <Button asChild variant="inverse" className="w-full">
                <Link href="#acciones">
                  Ver acciones disponibles
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <section aria-labelledby="metrics-title" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="metrics-title" className="font-display text-lg font-semibold">
                Resumen del padrón y cupos
              </h2>
              {authorizedSummary?.lastUpdatedAt && (
                <span className="text-xs text-muted-foreground">
                  Datos actualizados: {formatLastUpdated(authorizedSummary.lastUpdatedAt)}
                </span>
              )}
            </div>
            {authorizedSummary && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
                {DASHBOARD_METRICS.map((metric) => {
                  let metricValue = "—";
                  let metricDescription = "No disponible";

                  if (metric.label === "Familias") {
                    metricValue = String(authorizedSummary.familyCount);
                    if (authorizedSummary.familyCount) {
                      metricDescription = metric.description;
                    } else {
                      metricDescription = "Todavía no hay familias";
                    }
                  }

                  if (metric.label === "Personas") {
                    metricValue = String(authorizedSummary.personCount);
                    if (authorizedSummary.personCount) {
                      metricDescription = metric.description;
                    } else {
                      metricDescription = "Todavía no hay personas";
                    }
                  }

                  if (metric.label === "Cupos aprobados") {
                    if (!authorizedSummary.activePeriodLabel) {
                      metricDescription = "No hay un período vigente";
                    } else {
                      metricValue = String(authorizedSummary.approvedQuotaCount);
                      if (authorizedSummary.approvedQuotaCount) {
                        metricDescription = metric.description;
                      } else {
                        metricDescription = "Sin cupos aprobados en el período";
                      }
                    }
                  }

                  return (
                    <Card key={metric.label} size="sm">
                      <CardContent className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">{metric.label}</span>
                          <span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
                            <HugeiconsIcon icon={metric.icon} strokeWidth={1.8} />
                          </span>
                        </div>
                        <p className="font-display text-3xl font-bold tabular-nums">{metricValue}</p>
                        <p className="text-xs text-muted-foreground">{metricDescription}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
            {!authorizedSummary && (
              <Card>
                <CardContent className="py-5 text-sm text-muted-foreground">
                  {summaryFailed && (
                    <span>Las métricas aparecerán cuando se recupere la conexión con el servidor.</span>
                  )}
                  {!summaryFailed && (
                    <span>Este resumen no muestra datos de otros roles.</span>
                  )}
                </CardContent>
              </Card>
            )}
          </section>
        </div>

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
