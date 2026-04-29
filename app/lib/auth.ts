import { ApiError } from "./api";
import { prisma } from "./prisma";
import { createClient } from "@supabase/supabase-js";
import { isProfileComplete } from "./profile";

function getBearerToken(request: Request): string {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
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

export async function getAuthUserId(request: Request): Promise<string> {
  const token = getBearerToken(request);
  const supabase = createSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired access token");
  }

  const user =
    (await prisma.user.findUnique({
      where: { authUserId: data.user.id },
      select: { id: true, isActive: true },
    })) ??
    (await prisma.user.findUnique({
      where: { id: data.user.id },
      select: { id: true, isActive: true },
    }));
  if (!user || !user.isActive) {
    throw new ApiError(403, "FORBIDDEN", "User is not active");
  }

  return user.id;
}

export async function ensureActiveUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });
  if (!user || !user.isActive) {
    throw new ApiError(403, "FORBIDDEN", "User is not active");
  }
  return user;
}

export async function ensureProfileCompleted(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, birthDate: true, nearestStationId: true },
  });
  if (!user || !isProfileComplete(user)) {
    throw new ApiError(403, "PROFILE_SETUP_REQUIRED", "Profile setup is required");
  }
  return user;
}

export function ensureMatchParticipant(
  match: { userAId: string; userBId: string },
  userId: string
) {
  if (match.userAId !== userId && match.userBId !== userId) {
    throw new ApiError(403, "FORBIDDEN", "User does not belong to this match");
  }
}
