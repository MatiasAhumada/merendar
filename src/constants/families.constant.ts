import { FamilyDocumentType } from "@prisma/client";

export const FAMILY_DOCUMENT_LABELS: Record<FamilyDocumentType, string> = {
  DNI: "DNI",
  PARTIDA_NACIMIENTO: "Partida de nacimiento",
  CERTIFICADO_ESCOLAR: "Certificado escolar",
  CERTIFICADO_MEDICO: "Certificado médico",
  OTRO: "Otra documentación",
};

export const FAMILY_DOCUMENT_OPTIONS = Object.entries(FAMILY_DOCUMENT_LABELS).map(([value, label]) => ({
  value: value as FamilyDocumentType,
  label,
}));

export const FAMILY_NEIGHBORHOODS = [
  "Villa Nueva",
  "Los Aromos",
  "San Cayetano",
  "Barrio Parque",
  "Otro / Asentamiento",
] as const;

export const FAMILY_MEMBER_RELATIONSHIPS = [
  "Referente",
  "Pareja",
  "Hija o hijo",
  "Madre o padre",
  "Otro familiar",
  "Otro vínculo",
] as const;
