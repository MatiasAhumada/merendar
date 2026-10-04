export const RECENT_DELIVERIES = [
  { initials: "MR", name: "Mirta Rodríguez", detail: "DNI 28.190.412 · Módulo Seco #2", time: "10:48 hs" },
  { initials: "CA", name: "Carlos Alberto Benítez", detail: "DNI 36.882.109 · Módulo Seco + Pañales", time: "10:46 hs" },
  { initials: "EM", name: "Estela Maris Sosa", detail: "DNI 22.401.993 · Módulo Nutrición", time: "10:42 hs" },
] as const;

export const DEMO_HOLDER = {
  name: "Juan Pérez",
  dni: "33.456.789",
  family: "Familia Pérez",
  members: 4,
  lastDelivery: "12/08/2026 (hace 34 días)",
} as const;
