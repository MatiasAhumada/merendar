import { createHash, randomBytes, scrypt as scryptCallback, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { UserRole } from "@prisma/client";
import { AUTH } from "@/constants/auth.constant";
import { authRepository } from "@/server/repository/auth.repository";

const scrypt = promisify(scryptCallback);
const DUMMY_SALT = "merendar-auth-dummy-salt";
const DUMMY_PASSWORD_HASH = scryptSync("invalid-password", DUMMY_SALT, 64).toString("hex");

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: UserRole;
}

export type LoginResult =
  | { type: "authenticated"; token: string; expiresAt: Date; user: AuthenticatedUser }
  | { type: "invalid-credentials" }
  | { type: "rate-limited" };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getCandidateKey(identifier: string) {
  return createHash("sha256").update(identifier).digest("hex");
}

async function verifyPassword(password: string, encodedHash: string) {
  const [salt, expectedHash] = encodedHash.split(":");
  const selectedSalt = salt ?? DUMMY_SALT;
  const selectedHash = expectedHash ?? DUMMY_PASSWORD_HASH;
  const calculatedHash = (await scrypt(password, selectedSalt, 64)) as Buffer;
  const expectedBuffer = Buffer.from(selectedHash, "hex");

  return expectedBuffer.length === calculatedHash.length && timingSafeEqual(expectedBuffer, calculatedHash);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const passwordHash = (await scrypt(password, salt, 64)) as Buffer;

  return `${salt}:${passwordHash.toString("hex")}`;
}

export const authService = {
  async login(identifier: string, password: string): Promise<LoginResult> {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const candidateKey = getCandidateKey(normalizedIdentifier);
    const now = new Date();
    const windowStart = new Date(now.getTime() - AUTH.LOGIN_ATTEMPT_WINDOW_MINUTES * 60_000);

    await authRepository.cleanExpiredAttempts(windowStart);
    const recentAttempts = await authRepository.countRecentAttempts(candidateKey, windowStart);

    if (recentAttempts >= AUTH.MAX_LOGIN_ATTEMPTS) {
      return { type: "rate-limited" };
    }

    const user = await authRepository.findUserByIdentifier(normalizedIdentifier);
    const passwordMatches = await verifyPassword(password, user?.passwordHash ?? DUMMY_SALT + ":" + DUMMY_PASSWORD_HASH);

    if (!user || !user.passwordHash || !user.role || !user.isActive || !passwordMatches) {
      await authRepository.recordFailedAttempt(candidateKey);
      return { type: "invalid-credentials" };
    }

    await authRepository.clearAttempts(candidateKey);
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + AUTH.SESSION_DURATION_HOURS * 60 * 60_000);
    await authRepository.createSession(user.id, hashToken(token), expiresAt);

    return {
      type: "authenticated",
      token,
      expiresAt,
      user: { id: user.id, name: user.name, email: user.email, username: user.username, role: user.role },
    };
  },

  async getSession(token: string | undefined) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      return null;
    }

    const session = await authRepository.findActiveSession(hashToken(token), new Date());

    if (!session || !session.user.role) {
      return null;
    }

    return { id: session.id, expiresAt: session.expiresAt, user: { ...session.user, role: session.user.role } };
  },

  async logout(token: string | undefined) {
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      await authRepository.revokeSession(hashToken(token), new Date());
    }
  },
};
