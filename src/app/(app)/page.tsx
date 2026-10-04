import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  CloudIcon,
  Location01Icon,
} from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  DASHBOARD_ACTIONS,
  DASHBOARD_ACTIVITY,
  DASHBOARD_METRICS,
  DASHBOARD_SNAPSHOT,
  DASHBOARD_STAGES,
} from "@/constants/dashboard.constant";
import { ROUTES } from "@/constants/routes";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Buenas tardes, María <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <HugeiconsIcon icon={Location01Icon} strokeWidth={1.8} />
            Asociación Civil Los Aromos · Sede Central
          </p>
        </div>
        <Avatar size="lg" className="size-12">
          <AvatarImage src="/images/community-coordinator.jpg" alt="Coordinadora comunitaria" />
          <AvatarFallback>SA</AvatarFallback>
        </Avatar>
      </section>

      <Alert variant="info">
        <HugeiconsIcon icon={CloudIcon} strokeWidth={1.8} />
        <AlertTitle>Modo demostración</AlertTitle>
        <AlertDescription>La información de esta vista es de ejemplo.</AlertDescription>
      </Alert>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <div className="flex flex-col gap-5">
          <Card variant="hero" className="relative">
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -right-12 size-60 rounded-full bg-primary-foreground/5" />
            <CardHeader className="relative">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <Badge variant="success">JORNADA 15/09 EN CURSO</Badge>
                  <CardTitle>
                    <h2 className="font-display text-xl font-semibold">Distribución de Módulos</h2>
                  </CardTitle>
                  <CardDescription>{DASHBOARD_SNAPSHOT.site} · Operativo activo</CardDescription>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-3xl font-bold tabular-nums">{DASHBOARD_SNAPSHOT.availableModules}</p>
                  <p className="text-xs font-semibold text-primary-container-foreground">cupos libres</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                  <span>
                    Progreso: {DASHBOARD_SNAPSHOT.deliveredModules} de {DASHBOARD_SNAPSHOT.totalModules} módulos entregados
                  </span>
                  <span>{DASHBOARD_SNAPSHOT.completionPercent}%</span>
                </div>
                <Progress variant="inverse" value={DASHBOARD_SNAPSHOT.completionPercent} aria-label="Progreso de entregas" />
              </div>
              <Button variant="inverse" asChild className="w-full">
                <Link href={ROUTES.DELIVERY}>
                  Continuar Jornada en Vivo
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle><h2 className="font-display text-lg font-semibold">Ciclo Operativo Actual</h2></CardTitle>
                <Badge variant="secondary">{DASHBOARD_SNAPSHOT.period}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-5">
                {DASHBOARD_STAGES.map((stage, stageIndex) => (
                  <li key={stage.title} className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                        {stage.status === "completed" ? <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={2} /> : stageIndex + 1}
                      </span>
                      {stageIndex < DASHBOARD_STAGES.length - 1 ? <span aria-hidden="true" className="h-7 w-px bg-border" /> : null}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2 pt-1">
                      <div className="min-w-0">
                        <p className="font-semibold">{stage.title}</p>
                        <p className="text-xs text-muted-foreground">{stage.description}</p>
                      </div>
                      <Badge variant={stage.status === "current" ? "warning" : "secondary"}>{stage.detail}</Badge>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <section aria-labelledby="metrics-title" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 id="metrics-title" className="font-display text-lg font-semibold">Métricas del Territorio</h2>
              <span className="text-xs text-muted-foreground">Datos de muestra</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {DASHBOARD_METRICS.map((metric) => (
                <Card key={metric.label} size="sm">
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{metric.label}</span>
                      <span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
                        <HugeiconsIcon icon={metric.icon} strokeWidth={1.8} />
                      </span>
                    </div>
                    <p className="font-display text-3xl font-bold tabular-nums">{metric.value}</p>
                    <p className="text-xs text-muted-foreground">{metric.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section aria-labelledby="actions-title" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 id="actions-title" className="font-display text-lg font-semibold">Acciones Rápidas</h2>
              <span className="text-xs text-muted-foreground">Gestión directa</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {DASHBOARD_ACTIONS.map((action) => (
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
          </section>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle><h2 className="font-display text-lg font-semibold">Actividad en Vivo</h2></CardTitle>
                <Button asChild variant="link" size="sm"><Link href={ROUTES.HISTORY}>Ver todo</Link></Button>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-4">
                {DASHBOARD_ACTIVITY.map((activity) => (
                  <li key={activity.name} className="flex items-start gap-3">
                    <Avatar size="lg">
                      {activity.image ? <AvatarImage src={activity.image} alt="" /> : null}
                      <AvatarFallback>{activity.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm"><strong>{activity.name}</strong> {activity.action}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{activity.time} · {activity.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
