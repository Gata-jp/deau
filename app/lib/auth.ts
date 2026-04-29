import { ApiError } from "./api";
import { prisma } from "./prisma";

// Temporary auth for Phase 1.
// Replace with session-based auth (NextAuth/Clerk) in Phase 2.
export function getAuthUserId(request: Request): string {
  const id = request.headers.get("x-user-id");
  if (!id) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing x-user-id header");
  }
  return id;
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

export function ensureMatchParticipant(
  match: { userAId: string; userBId: string },
  userId: string
) {
  if (match.userAId !== userId && match.userBId !== userId) {
    throw new ApiError(403, "FORBIDDEN", "User does not belong to this match");
  }
}
