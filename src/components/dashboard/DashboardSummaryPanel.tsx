"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, CloudOffIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DASHBOARD_METRICS } from "@/constants/dashboard.constant";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { getDashboardSummary } from "@/services/client/dashboard-data.service";
import type { OfflineDataSource } from "@/services/client/offline-snapshot.service";
import type { DashboardSummaryResult } from "@/types/dashboard";

function formatLastUpdated(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Argentina/Tucuman",
  }).format(new Date(value));
}

export function DashboardSummaryPanel({ userId, initialSummary }: { userId: string; initialSummary: DashboardSummaryResult | null }) {
  const isOnline = useNetworkStatus();
  const [summaryResult, setSummaryResult] = useState<DashboardSummaryResult | null>(initialSummary);
  const [source, setSource] = useState<OfflineDataSource>("api");
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getDashboardSummary(userId, isOnline).then((result) => {
      if (!cancelled) {
        setSummaryResult(result.data);
        setSource(result.source);
        setCapturedAt(result.capturedAt);
        setError("");
      }
    }).catch((cause: unknown) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : "No se pudieron cargar las métricas del inicio.");
      }
    });

    return () => { cancelled = true; };
  }, [isOnline, userId]);

  const authorizedSummary = summaryResult?.authorized ? summaryResult.summary : null;
  let periodHeading = authorizedSummary?.activePeriodLabel ?? "Gestión comunitaria";
  let periodDescription = authorizedSummary?.activePeriodLabel ? "Período operativo vigente" : "Consultá los módulos habilitados para tu rol.";
  let sourceBadge = source === "indexeddb" ? "Captura local" : "Datos del servidor";
  let sourceBadgeVariant: "success" | "secondary" | "destructive" = source === "indexeddb" ? "secondary" : "success";

  if (error && !(source === "indexeddb" && authorizedSummary)) {
    sourceBadge = "Datos no disponibles";
    sourceBadgeVariant = "destructive";
  }

  if (!summaryResult?.authorized && !error) {
    sourceBadge = "Panel informativo";
    sourceBadgeVariant = "secondary";
  }

  if (source === "indexeddb") {
    periodDescription = capturedAt
      ? `Consulta local capturada el ${formatLastUpdated(capturedAt)}. Puede estar desactualizada.`
      : "Consulta local preparada para esta cuenta.";
  }

  if (!authorizedSummary) {
    periodHeading = "Gestión comunitaria";
  }

  return <div className="flex flex-col gap-5">
    {error && !(source === "indexeddb" && authorizedSummary) ? <Alert variant="destructive"><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} /><AlertTitle>No pudimos cargar los datos del inicio</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {!isOnline && source === "indexeddb" ? <Alert variant="info"><HugeiconsIcon icon={CloudOffIcon} strokeWidth={1.8} /><AlertTitle>Resumen guardado para consulta</AlertTitle><AlertDescription>Las cifras son una lectura confirmada al momento de la captura y no incluyen cambios pendientes.</AlertDescription></Alert> : null}
    {!isOnline && source !== "indexeddb" && !error ? <Alert variant="info"><HugeiconsIcon icon={CloudOffIcon} strokeWidth={1.8} /><AlertTitle>Resumen no preparado</AlertTitle><AlertDescription>Conectate para cargar las métricas autorizadas de esta cuenta.</AlertDescription></Alert> : null}

    <div className="flex flex-col gap-5">
        <Card variant="hero" className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -right-12 size-60 rounded-full bg-primary-foreground/5" />
          <CardHeader className="relative"><Badge variant={sourceBadgeVariant} className="w-fit">{sourceBadge.toUpperCase()}</Badge><CardTitle><h2 className="font-display text-xl font-semibold">{periodHeading}</h2></CardTitle><CardDescription>{periodDescription}</CardDescription></CardHeader>
          <CardContent className="relative"><Button asChild variant="inverse" className="w-full"><Link href="#acciones">Ver acciones disponibles<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} data-icon="inline-end" /></Link></Button></CardContent>
        </Card>

        <section aria-labelledby="metrics-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="metrics-title" className="font-display text-lg font-semibold">Resumen del padrón y cupos</h2>{authorizedSummary?.lastUpdatedAt ? <span className="text-xs text-muted-foreground">Datos actualizados: {formatLastUpdated(authorizedSummary.lastUpdatedAt)}</span> : null}</div>
          {authorizedSummary ? <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">{DASHBOARD_METRICS.map((metric) => {
            let metricValue = "—";
            let metricDescription = "No disponible";
            if (metric.label === "Familias") {
              metricValue = String(authorizedSummary.familyCount);
              metricDescription = authorizedSummary.familyCount ? metric.description : "Todavía no hay familias";
            }
            if (metric.label === "Personas") {
              metricValue = String(authorizedSummary.personCount);
              metricDescription = authorizedSummary.personCount ? metric.description : "Todavía no hay personas";
            }
            if (metric.label === "Cupos aprobados") {
              if (!authorizedSummary.activePeriodLabel) {
                metricDescription = "No hay un período vigente";
              } else {
                metricValue = String(authorizedSummary.approvedQuotaCount ?? 0);
                metricDescription = authorizedSummary.approvedQuotaCount ? metric.description : "Sin cupos aprobados en el período";
              }
            }
            return <Card key={metric.label} size="sm"><CardContent className="flex flex-col gap-2"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{metric.label}</span><span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground"><HugeiconsIcon icon={metric.icon} strokeWidth={1.8} /></span></div><p className="font-display text-3xl font-bold tabular-nums">{metricValue}</p><p className="text-xs text-muted-foreground">{metricDescription}</p></CardContent></Card>;
          })}</div> : <Card><CardContent className="py-5 text-sm text-muted-foreground">{error ? "Las métricas aparecerán al recuperar conexión." : "Este resumen no muestra datos de otros roles."}</CardContent></Card>}
          {source === "indexeddb" && capturedAt ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><HugeiconsIcon icon={CloudOffIcon} strokeWidth={1.8} />Captura del {formatLastUpdated(capturedAt)}. Los cambios pendientes se muestran por separado.</p> : null}
        </section>
    </div>
  </div>;
}
