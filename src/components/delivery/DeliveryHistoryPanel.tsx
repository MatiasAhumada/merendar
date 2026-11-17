"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RECORD_HISTORY_UI_TEXT } from "@/constants/delivery.constant";
import { API_ROUTES } from "@/constants/routes.constant";
import { recordHistoryResponseSchema, type RecordHistoryResponse } from "@/schemas/record-history.schema";
import type { RecordsCollection } from "@/types/schema-contracts";
import clientAxios from "@/utils/clientAxios.util";

interface DeliveryHistoryPanelProps {
  data: RecordsCollection;
  isOnline: boolean;
}

const PAGE_SIZE = 20;

function buildOfflineHistory(data: RecordsCollection) {
  const individualRecords = data.records.flatMap((record) => {
    if (record.familyDeliveryId) return [];
    const period = data.periods.find((entry) => entry.id === record.periodId);
    if (!period) return [];
    return [{
      id: `record-${record.id}`,
      periodId: record.periodId,
      periodLabel: period.label,
      familyId: record.family.id,
      familyName: record.family.name,
      personName: `${record.person.firstName} ${record.person.lastName}`,
      dni: record.person.dni,
      receivedAt: record.receivedAt.slice(0, 10),
      moduleType: record.moduleType,
      quantity: record.quantity,
      source: "individual" as const,
    }];
  });
  const familyDeliveries = data.distributionEvents.flatMap((event) => {
    const period = data.periods.find((entry) => entry.id === event.periodId);
    if (!period) return [];
    return event.familyDeliveries.flatMap((delivery) => delivery.participants.map((participant) => ({
      id: `participant-${participant.id}`,
      periodId: event.periodId,
      periodLabel: period.label,
      familyId: delivery.familyId,
      familyName: delivery.familyName,
      personName: participant.name,
      dni: participant.dni,
      receivedAt: event.scheduledAt,
      moduleType: "Módulo familiar",
      quantity: delivery.moduleQuantity,
      source: "jornada" as const,
    })));
  });
  return [...individualRecords, ...familyDeliveries].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt) || right.id.localeCompare(left.id));
}

export function DeliveryHistoryPanel({ data, isOnline }: DeliveryHistoryPanelProps) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("");
  const [periodId, setPeriodId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<RecordHistoryResponse["records"]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const offlineHistory = useMemo(() => buildOfflineHistory(data), [data]);

  useEffect(() => {
    setPage(1);
  }, [query, family, periodId, from, to, isOnline]);

  useEffect(() => {
    let cancelled = false;
    if (!isOnline) {
      const normalizedQuery = query.trim().toLocaleLowerCase("es-AR");
      const normalizedFamily = family.trim().toLocaleLowerCase("es-AR");
      const filteredRecords = offlineHistory.filter((record) => {
        const textMatches = !normalizedQuery || `${record.personName} ${record.dni ?? ""} ${record.familyName}`.toLocaleLowerCase("es-AR").includes(normalizedQuery);
        const familyMatches = !normalizedFamily || record.familyName.toLocaleLowerCase("es-AR").includes(normalizedFamily);
        const periodMatches = periodId === "all" || record.periodId === periodId;
        const fromMatches = !from || record.receivedAt >= from;
        const toMatches = !to || record.receivedAt <= to;
        return textMatches && familyMatches && periodMatches && fromMatches && toMatches;
      });
      setRecords(filteredRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
      setTotal(filteredRecords.length);
      setLoading(false);
      setError("");
      return () => { cancelled = true; };
    }

    const searchParams = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (query.trim()) searchParams.set("query", query.trim());
    if (family.trim()) searchParams.set("family", family.trim());
    if (periodId !== "all") searchParams.set("periodId", periodId);
    if (from) searchParams.set("from", from);
    if (to) searchParams.set("to", to);
    setLoading(true);
    setError("");
    void clientAxios.get<unknown>(`${API_ROUTES.RECORD_HISTORY}?${searchParams.toString()}`)
      .then((response) => {
        const parsedResponse = recordHistoryResponseSchema.safeParse(response.data);
        if (!parsedResponse.success) throw new Error(RECORD_HISTORY_UI_TEXT.ERROR);
        if (!cancelled) {
          setRecords(parsedResponse.data.records);
          setTotal(parsedResponse.data.total);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          if (loadError instanceof Error) setError(loadError.message);
          else setError(RECORD_HISTORY_UI_TEXT.ERROR);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [data, family, from, isOnline, offlineHistory, page, periodId, query, to]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{RECORD_HISTORY_UI_TEXT.TITLE}</CardTitle>
        <CardDescription>{RECORD_HISTORY_UI_TEXT.DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isOnline ? <p className="text-xs text-muted-foreground">{RECORD_HISTORY_UI_TEXT.ONLINE}</p> : <Alert variant="info"><AlertDescription>{RECORD_HISTORY_UI_TEXT.OFFLINE}</AlertDescription></Alert>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field className="sm:col-span-2 lg:col-span-2">
            <FieldLabel htmlFor="history-query">{RECORD_HISTORY_UI_TEXT.PERSON_FILTER}</FieldLabel>
            <Input id="history-query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} />
            <FieldDescription>{RECORD_HISTORY_UI_TEXT.PERSON_FILTER_HINT}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="history-family">{RECORD_HISTORY_UI_TEXT.FAMILY_FILTER}</FieldLabel>
            <Input id="history-family" value={family} onChange={(event) => setFamily(event.target.value)} maxLength={120} />
          </Field>
          <Field>
            <FieldLabel htmlFor="history-period">{RECORD_HISTORY_UI_TEXT.PERIOD}</FieldLabel>
            <Select value={periodId} onValueChange={setPeriodId}>
              <SelectTrigger id="history-period"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{RECORD_HISTORY_UI_TEXT.ALL_PERIODS}</SelectItem>
                {data.periods.map((period) => <SelectItem key={period.id} value={period.id}>{period.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="history-from">{RECORD_HISTORY_UI_TEXT.FROM}</FieldLabel>
            <Input id="history-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="history-to">{RECORD_HISTORY_UI_TEXT.TO}</FieldLabel>
            <Input id="history-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
        </div>
        {from && to && from > to ? <p className="text-sm text-destructive" role="alert">La fecha desde no puede ser posterior a la fecha hasta.</p> : null}
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {loading ? <p role="status" className="text-sm text-muted-foreground">{RECORD_HISTORY_UI_TEXT.LOADING}</p> : null}
        {!loading && records.length ? <ul className="divide-y divide-border rounded-md border">{records.map((record) => <li key={record.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium">{record.personName} <span className="font-normal text-muted-foreground">· {record.dni ?? "DNI no registrado"}</span></p>
            <p className="text-muted-foreground">{record.familyName} · {record.periodLabel} · {record.receivedAt}</p>
          </div>
          <p className="shrink-0 text-muted-foreground">{record.moduleType} · {record.quantity} unidad(es) · {record.source === "jornada" ? RECORD_HISTORY_UI_TEXT.FAMILY_EVENT : RECORD_HISTORY_UI_TEXT.INDIVIDUAL}</p>
        </li>)}</ul> : null}
        {!loading && !error && !records.length ? <p className="rounded-md bg-muted/60 p-4 text-sm text-muted-foreground">{RECORD_HISTORY_UI_TEXT.EMPTY}</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite" className="text-sm text-muted-foreground">{RECORD_HISTORY_UI_TEXT.PAGE(page, total)}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((currentPage) => currentPage - 1)}>{RECORD_HISTORY_UI_TEXT.PREVIOUS}</Button>
            <Button variant="outline" size="sm" disabled={page >= pageCount || loading} onClick={() => setPage((currentPage) => currentPage + 1)}>{RECORD_HISTORY_UI_TEXT.NEXT}</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
