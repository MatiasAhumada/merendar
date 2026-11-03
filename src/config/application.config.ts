export const APPLICATION_CONFIG = {
  DATE_FORMAT_LOCALE: "es-AR",
  NODE_ENV: process.env.NODE_ENV,
  PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
} as const;
