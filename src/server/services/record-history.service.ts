import type { RecordHistoryQuery } from "@/schemas/record-history.schema";
import { findRecordHistory } from "@/server/repository/record.repository";

export function getRecordHistory(filters: RecordHistoryQuery) {
  return findRecordHistory(filters);
}
