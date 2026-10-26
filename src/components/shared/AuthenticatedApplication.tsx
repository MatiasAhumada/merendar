"use client";

import { useEffect, useState } from "react";
import { UserRole } from "@prisma/client";
import axios from "axios";
import { z } from "zod";
import { AppSessionContext, type AppSessionContextValue } from "@/components/shared/AppSessionContext";
import { AppShell } from "@/components/shared/AppShell";
import { USER_ROLE_LABELS } from "@/constants/user-role.constant";
import { readActiveOfflineAccount, readOfflinePreparation, setActiveOfflineAccount } from "@/services/offline-preparation.service";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import clientAxios from "@/utils/clientAxios.util";
import type { AuthenticatedUser } from "@/server/services/auth.service";

const sessionResponseSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.string().nullable(),
    username: z.string().nullable(),
    role: z.nativeEnum(UserRole),
  }),
  expiresAt: z.iso.datetime(),
  capabilities: z.array(z.string()),
});

function isTransportFailure(error: unknown) {
  return axios.isAxiosError(error) && !error.response;
}

async function readLocalAppSession(): Promise<AppSessionContextValue> {
  const userId = await readActiveOfflineAccount();
  if (!userId) {
    return { ready: true, user: null, sessionExpiresAt: null, capabilities: [] };
  }

  const preparation = await readOfflinePreparation(userId);
  if (!preparation) {
    return { ready: true, user: null, sessionExpiresAt: null, capabilities: [] };
  }

  const roleEntry = Object.entries(USER_ROLE_LABELS).find(([, label]) => label === preparation.roleLabel);
  const role = z.nativeEnum(UserRole).safeParse(roleEntry?.[0]);
  if (!role.success) {
    return { ready: true, user: null, sessionExpiresAt: null, capabilities: [] };
  }

  const user: AuthenticatedUser = {
    id: preparation.userId,
    name: preparation.userName,
    email: null,
    username: null,
    role: role.data,
  };

  return {
    ready: true,
    user,
    sessionExpiresAt: preparation.sessionExpiresAt,
    capabilities: preparation.capabilities,
  };
}

export function AuthenticatedApplication({ children }: Readonly<{ children: React.ReactNode }>) {
  const isOnline = useNetworkStatus();
  const [session, setSession] = useState<AppSessionContextValue>({
    ready: false,
    user: null,
    sessionExpiresAt: null,
    capabilities: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      if (!isOnline) {
        try {
          const localSession = await readLocalAppSession();
          if (!cancelled) {
            setSession(localSession);
          }
        } catch {
          if (!cancelled) {
            setSession({ ready: true, user: null, sessionExpiresAt: null, capabilities: [] });
          }
        }
        return;
      }

      try {
        const response = await clientAxios.get<unknown>("/api/session", { headers: { "Cache-Control": "no-store" } });
        const parsedResponse = sessionResponseSchema.safeParse(response.data);
        if (!parsedResponse.success) {
          throw new Error("La sesión devolvió un perfil que esta versión de Merendar no reconoce.");
        }

        await setActiveOfflineAccount(parsedResponse.data.user.id);
        if (!cancelled) {
          setSession({
            ready: true,
            user: parsedResponse.data.user,
            sessionExpiresAt: parsedResponse.data.expiresAt,
            capabilities: parsedResponse.data.capabilities,
          });
        }
      } catch (error) {
        if (isTransportFailure(error)) {
          try {
            const localSession = await readLocalAppSession();
            if (!cancelled) {
              setSession(localSession);
            }
          } catch {
            if (!cancelled) {
              setSession({ ready: true, user: null, sessionExpiresAt: null, capabilities: [] });
            }
          }
          return;
        }

        if (!cancelled) {
          setSession({ ready: true, user: null, sessionExpiresAt: null, capabilities: [] });
        }
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  if (!session.ready) {
    return <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center p-6" role="status">Comprobando la sesión y los datos preparados…</main>;
  }

  if (!session.user || !session.sessionExpiresAt) {
    return (
      <AppSessionContext.Provider value={session}>
        <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </AppSessionContext.Provider>
    );
  }

  return (
    <AppSessionContext.Provider value={session}>
      <AppShell
        user={session.user}
        sessionExpiresAt={session.sessionExpiresAt}
        capabilities={session.capabilities}
      >
        {children}
      </AppShell>
    </AppSessionContext.Provider>
  );
}
