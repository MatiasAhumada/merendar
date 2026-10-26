"use client";

import { createContext, useContext } from "react";
import type { AuthenticatedUser } from "@/server/services/auth.service";

export interface AppSessionContextValue {
  ready: boolean;
  user: AuthenticatedUser | null;
  sessionExpiresAt: string | null;
  capabilities: string[];
}

export const AppSessionContext = createContext<AppSessionContextValue>({
  ready: false,
  user: null,
  sessionExpiresAt: null,
  capabilities: [],
});

export function useAppSession() {
  return useContext(AppSessionContext);
}
