import { type FamilyRecord } from "@/interfaces/family.interface";

export const FAMILY_FILTERS = [
  { value: "all", label: "Todos", count: 128 },
  { value: "Villa Nueva", label: "Villa Nueva", count: 42 },
  { value: "Los Aromos", label: "Los Aromos", count: 35 },
  { value: "San Cayetano", label: "San Cayetano", count: 51 },
  { value: "alerts", label: "Con alertas", count: 4 },
] as const;

export const FAMILY_RECORDS: FamilyRecord[] = [
  {
    id: "gomez",
    name: "Familia Gómez",
    neighborhood: "Villa Nueva",
    address: "Calle 4 N° 842",
    members: "4 integrantes (2 menores)",
    detailLabel: "Última entrega",
    detail: "15/09/2026",
    phone: "11-4521-8890",
    alert: false,
  },
  {
    id: "perez",
    name: "Familia Pérez",
    neighborhood: "San Cayetano",
    address: "Pasaje Sur 120",
    members: "3 integrantes",
    detailLabel: "Titular del grupo",
    detail: "Juan Pérez",
    phone: "11-6672-1204",
    alert: false,
  },
  {
    id: "fernandez",
    name: "Familia Fernández",
    neighborhood: "Los Aromos",
    address: "Mz 14 Lote 3",
    members: "5 integrantes (3 menores)",
    detailLabel: "Requerimiento",
    detail: "Falta DNI de 2 menores",
    phone: "11-3199-0044",
    alert: true,
  },
];
