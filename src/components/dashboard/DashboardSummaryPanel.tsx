"use client";

import { DASHBOARD_ERROR_MESSAGES, DASHBOARD_UI_TEXT, DASHBOARD_METRICS } from "@/constants/dashboard.constant";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, CloudOffIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { getDashboardSummary } from "@/services/client/dashboard-data.service";
import Link from "next/link";

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
        if (cause instanceof Error) {
          setError(cause.message);
        } else {
          setError(DASHBOARD_ERROR_MESSAGES.NO_SE_PUDIERON_CARGAR_LAS_METRICAS_DEL_INICIO);
        }
      }
    });

    return () => { cancelled = true; };
  }, [isOnline, userId]);

  let authorizedSummary: Extract<DashboardSummaryResult, { authorized: true }>["summary"] | null = null;

  if (summaryResult?.authorized) {
    authorizedSummary = summaryResult.summary;
  }

  let periodHeading = authorizedSummary?.activePeriodLabel ?? DASHBOARD_UI_TEXT.GESTION_COMUNITARIA;
  let periodDescription: string = DASHBOARD_UI_TEXT.CONSULTA_LOS_MODULOS_HABILITADOS_PARA_TU_ROL;
  let sourceBadge = "Datos del servidor";
  let sourceBadgeVariant: "success" | "secondary" | "destructive" = "success";

  if (authorizedSummary?.activePeriodLabel) {
    periodDescription = DASHBOARD_UI_TEXT.PERIODO_OPERATIVO_VIGENTE;
  }

  if (source === "indexeddb") {
    sourceBadge = "Captura local";
    sourceBadgeVariant = "secondary";
  }

  if (error && !(source === "indexeddb" && authorizedSummary)) {
    sourceBadge = DASHBOARD_UI_TEXT.DATOS_NO_DISPONIBLES;
    sourceBadgeVariant = "destructive";
  }

  if (!summaryResult?.authorized && !error) {
    sourceBadge = DASHBOARD_UI_TEXT.PANEL_INFORMATIVO;
    sourceBadgeVariant = "secondary";
  }

  if (source === "indexeddb") {
    if (capturedAt) {
      periodDescription = DASHBOARD_UI_TEXT.CONSULTA_LOCAL_CAPTURADA(formatLastUpdated(capturedAt));
    } else {
      periodDescription = DASHBOARD_UI_TEXT.CONSULTA_LOCAL_PREPARADA_PARA_ESTA_CUENTA;
    }
  }

  if (!authorizedSummary) {
    periodHeading = DASHBOARD_UI_TEXT.GESTION_COMUNITARIA;
  }

  return <div className="flex flex-col gap-5">
    {error && !(source === "indexeddb" && authorizedSummary) ? <Alert variant="destructive"><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} /><AlertTitle>{DASHBOARD_UI_TEXT.NO_PUDIMOS_CARGAR_LOS_DATOS_DEL_INICIO}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {!isOnline && source === "indexeddb" ? <Alert variant="info"><HugeiconsIcon icon={CloudOffIcon} strokeWidth={1.8} /><AlertTitle>{DASHBOARD_UI_TEXT.RESUMEN_GUARDADO_PARA_CONSULTA}</AlertTitle><AlertDescription>{DASHBOARD_UI_TEXT.LAS_CIFRAS_SON_UNA_LECTURA_CONFIRMADA_AL_MOMENTO_DE_LA_CAPTURA_Y_NO_INCL}</AlertDescription></Alert> : null}
    {!isOnline && source !== "indexeddb" && !error ? <Alert variant="info"><HugeiconsIcon icon={CloudOffIcon} strokeWidth={1.8} /><AlertTitle>{DASHBOARD_UI_TEXT.RESUMEN_NO_PREPARADO}</AlertTitle><AlertDescription>{DASHBOARD_UI_TEXT.CONECTATE_PARA_CARGAR_LAS_METRICAS_AUTORIZADAS_DE_ESTA_CUENTA}</AlertDescription></Alert> : null}

    <div className="flex flex-col gap-5">
        <Card variant="hero" className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -right-12 size-60 rounded-full bg-primary-foreground/5" />
          <CardHeader className="relative"><Badge variant={sourceBadgeVariant} className="w-fit">{sourceBadge.toUpperCase()}</Badge><CardTitle><h2 className="font-display text-xl font-semibold">{periodHeading}</h2></CardTitle><CardDescription>{periodDescription}</CardDescription></CardHeader>
          <CardContent className="relative"><Button asChild variant="inverse" className="w-full"><Link href="#acciones">{DASHBOARD_UI_TEXT.VER_ACCIONES_DISPONIBLES}<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} data-icon="inline-end" /></Link></Button></CardContent>
        </Card>

        <section aria-labelledby="metrics-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="metrics-title" className="font-display text-lg font-semibold">{DASHBOARD_UI_TEXT.RESUMEN_DEL_PADRON_Y_CUPOS}</h2>{authorizedSummary?.lastUpdatedAt ? <span className="text-xs text-muted-foreground">{DASHBOARD_UI_TEXT.DATOS_ACTUALIZADOS}{formatLastUpdated(authorizedSummary.lastUpdatedAt)}</span> : null}</div>
          {authorizedSummary ? <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">{DASHBOARD_METRICS.map((metric) => {
            let metricValue = "—";
            let metricDescription: string = DASHBOARD_UI_TEXT.NO_DISPONIBLE;
            if (metric.label === "Familias") {
              metricValue = String(authorizedSummary.familyCount);
              if (authorizedSummary.familyCount) {
                metricDescription = metric.description;
              } else {
                metricDescription = DASHBOARD_UI_TEXT.TODAVIA_NO_HAY_FAMILIAS;
              }
            }
            if (metric.label === "Personas") {
              metricValue = String(authorizedSummary.personCount);
              if (authorizedSummary.personCount) {
                metricDescription = metric.description;
              } else {
                metricDescription = DASHBOARD_UI_TEXT.TODAVIA_NO_HAY_PERSONAS;
              }
            }
            if (metric.label === DASHBOARD_UI_TEXT.CUPOS_APROBADOS) {
              if (!authorizedSummary.activePeriodLabel) {
                metricDescription = DASHBOARD_UI_TEXT.NO_HAY_UN_PERIODO_VIGENTE;
              } else {
                metricValue = String(authorizedSummary.approvedQuotaCount ?? 0);
                if (authorizedSummary.approvedQuotaCount) {
                  metricDescription = metric.description;
                } else {
                  metricDescription = DASHBOARD_UI_TEXT.SIN_CUPOS_APROBADOS_EN_EL_PERIODO;
                }
              }
            }
            return <Card key={metric.label} size="sm"><CardContent className="flex flex-col gap-2"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{metric.label}</span><span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground"><HugeiconsIcon icon={metric.icon} strokeWidth={1.8} /></span></div><p className="font-display text-3xl font-bold tabular-nums">{metricValue}</p><p className="text-xs text-muted-foreground">{metricDescription}</p></CardContent></Card>;
          })}</div> : <Card><CardContent className="py-5 text-sm text-muted-foreground">{error ? DASHBOARD_UI_TEXT.LAS_METRICAS_APARECERAN_AL_RECUPERAR_CONEXION : DASHBOARD_UI_TEXT.ESTE_RESUMEN_NO_MUESTRA_DATOS_DE_OTROS_ROLES}</CardContent></Card>}
          {source === "indexeddb" && capturedAt ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><HugeiconsIcon icon={CloudOffIcon} strokeWidth={1.8} />{DASHBOARD_UI_TEXT.CAPTURA_DEL}{formatLastUpdated(capturedAt)}{DASHBOARD_UI_TEXT.LOS_CAMBIOS_PENDIENTES_SE_MUESTRAN_POR_SEPARADO}</p> : null}
        </section>
    </div>
  </div>;
}
