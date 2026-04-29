import { NextResponse } from "next/server";
import { ApiError, handleApiError, ok } from "../../../../lib/api";
import { ensureMatchParticipant, getAuthUserId } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { expireMatchIfTimedOut } from "../../../../lib/match-timeout";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: Context) {
  try {
    const userId = getAuthUserId(request);
    const { id } = await context.params;
    const match = await prisma.match.findUnique({ where: { id } });
    if (!match) throw new ApiError(404, "NOT_FOUND", "Match not found");
    ensureMatchParticipant(match, userId);
    await expireMatchIfTimedOut(prisma, match);
    const current = await prisma.match.findUnique({ where: { id: match.id } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Match not found");

    if (current.status === "CANCELLED") {
      throw new ApiError(409, "INVALID_STATUS", "Cancelled match cannot check in");
    }
    if (current.status === "EXPIRED") {
      throw new ApiError(409, "INVALID_STATUS", "Expired match cannot check in");
    }
    if (current.status === "PENDING") {
      throw new ApiError(409, "INVALID_STATUS", "Pending match must be confirmed first");
    }

    const data =
      current.userAId === userId
        ? current.userACheckedInAt
          ? null
          : { userACheckedInAt: new Date() }
        : current.userBId === userId
          ? current.userBCheckedInAt
            ? null
            : { userBCheckedInAt: new Date() }
          : null;

    if (!data) {
      if (current.userAId === userId || current.userBId === userId) {
        throw new ApiError(409, "ALREADY_CHECKED_IN", "User already checked in");
      }
      throw new ApiError(403, "FORBIDDEN", "User does not belong to this match");
    }

    const updated = await prisma.match.update({
      where: { id: match.id },
      data,
    });

    if (updated.userACheckedInAt && updated.userBCheckedInAt && updated.status !== "COMPLETED") {
      const completed = await prisma.match.update({
        where: { id: updated.id },
        data: { status: "COMPLETED" },
      });
      return ok({ match: completed });
    }

    return ok({ match: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
