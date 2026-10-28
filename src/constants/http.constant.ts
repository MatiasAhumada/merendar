export const HTTP_HEADERS = {
  CACHE_CONTROL: "Cache-Control",
  CONTENT_TYPE: "Content-Type",
  CONTENT_DISPOSITION: "Content-Disposition",
  X_CONTENT_TYPE_OPTIONS: "X-Content-Type-Options",
} as const;

export const HTTP_CACHE_CONTROL = {
  PRIVATE_NO_STORE: "private, no-store, max-age=0",
  NO_STORE: "no-store",
  NO_CACHE: "no-cache",
  PUBLIC_REVALIDATE: "public, max-age=0, must-revalidate",
  PRIVATE: "private",
} as const;

export const HTTP_CONTENT_TYPES = {
  HTML: "text/html",
  PDF: "application/pdf",
} as const;

export const HTTP_REQUEST = {
  GET: "GET",
  NAVIGATE: "navigate",
  SAME_ORIGIN: "same-origin",
  MANUAL_REDIRECT: "manual",
} as const;

export const HTTP_RESPONSE_TYPES = {
  TEXT: "text",
  BLOB: "blob",
} as const;

export const PRIVATE_RESPONSE_HEADERS = {
  [HTTP_HEADERS.CACHE_CONTROL]: HTTP_CACHE_CONTROL.PRIVATE_NO_STORE,
} as const;

export const PRIVATE_DOCUMENT_RESPONSE_HEADERS = {
  ...PRIVATE_RESPONSE_HEADERS,
  [HTTP_HEADERS.X_CONTENT_TYPE_OPTIONS]: "nosniff",
} as const;

export const NO_STORE_REQUEST_HEADERS = {
  [HTTP_HEADERS.CACHE_CONTROL]: HTTP_CACHE_CONTROL.NO_STORE,
} as const;

export const NO_CACHE_REQUEST_HEADERS = {
  [HTTP_HEADERS.CACHE_CONTROL]: HTTP_CACHE_CONTROL.NO_CACHE,
} as const;
