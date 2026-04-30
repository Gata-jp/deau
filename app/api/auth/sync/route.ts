import { createClient } from "@supabase/supabase-js";
import { ApiError, handleApiError, ok } from "../../../lib/api";
import { prisma } from "../../../lib/prisma";
import { PROFILE_PLACEHOLDER_BIRTHDATE, isProfileComplete } from "../../../lib/profile";

const PROFILE_PLACEHOLDER_BIRTHDATE_DATE = new Date("1970-01-01T00:00:00.000Z");

function getBearerToken(request: Request): string {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing Authorization: Bearer token");
  }
  return token;
}

function createSupabaseAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new ApiError(500, "SUPABASE_ENV_NOT_CONFIGURED", "Supabase env vars are not configured");
  }
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normalizeNickname(email?: string | null, authId?: string) {
  const fromEmail = email?.split("@")[0]?.trim();
  if (fromEmail) return fromEmail.slice(0, 40);
  return `user-${(authId ?? "new").slice(0, 8)}`;
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    const supabase = createSupabaseAuthClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired access token");
    }

    const authUser = data.user;
    const synced = await prisma.user.upsert({
      where: { authUserId: authUser.id },
      create: {
        authUserId: authUser.id,
        email: authUser.email ?? null,
        nickname: normalizeNickname(authUser.email, authUser.id),
        birthDate: PROFILE_PLACEHOLDER_BIRTHDATE_DATE,
        gender: "OTHER",
        preferenceGender: "ANY",
        matchingEnabled: false,
        matchWaitStartedAt: new Date(),
        lastLoginAt: new Date(),
      },
      update: {
        email: authUser.email ?? null,
        lastLoginAt: new Date(),
      },
      select: {
        id: true,
        authUserId: true,
        email: true,
        nearestStationId: true,
        prefecture: true,
        city: true,
        birthDate: true,
        lastLoginAt: true,
      },
    });

    return ok({
      user: synced,
      needsProfileSetup:
        !isProfileComplete(synced) ||
        synced.birthDate.toISOString().slice(0, 10) === PROFILE_PLACEHOLDER_BIRTHDATE,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
