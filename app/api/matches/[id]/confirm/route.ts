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

export async function POST(_request: Request, context: Context) {
  try {
    const userId = getAuthUserId(_request);
    const { id } = await context.params;
    const target = await prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        userAId: true,
        userBId: true,
        status: true,
        meetupAt: true,
        userACheckedInAt: true,
        userBCheckedInAt: true,
      },
    });
    if (!target) {
      throw new ApiError(404, "NOT_FOUND", "Match not found");
    }
    ensureMatchParticipant(target, userId);
    await expireMatchIfTimedOut(prisma, target);
    const current = await prisma.match.findUnique({
      where: { id: target.id },
      select: { id: true, userAId: true, userBId: true, status: true },
    });
    if (!current) {
      throw new ApiError(404, "NOT_FOUND", "Match not found");
    }

    if (current.status === "MATCHED") {
      throw new ApiError(409, "ALREADY_CONFIRMED", "Match is already confirmed");
    }
    if (current.status === "COMPLETED") {
      throw new ApiError(409, "INVALID_STATUS", "Completed match cannot be confirmed");
    }
    if (current.status === "EXPIRED") {
      throw new ApiError(409, "INVALID_STATUS", "Expired match cannot be confirmed");
    }
    if (current.status === "CANCELLED") {
      throw new ApiError(409, "INVALID_STATUS", "Cancelled match cannot be confirmed");
    }

    const updated = await prisma.match.update({
      where: { id },
      data: { status: "MATCHED" },
    });

    return ok({ match: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
