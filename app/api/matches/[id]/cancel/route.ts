import { NextResponse } from "next/server";
import { ApiError, handleApiError, ok } from "../../../../lib/api";
import { ensureMatchParticipant, ensureProfileCompleted, getAuthUserId } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { cancelMatchSchema } from "../../../../lib/validators";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: Context) {
  try {
    const userId = await getAuthUserId(request);
    await ensureProfileCompleted(userId);
    const { id } = await context.params;
    const { reason } = cancelMatchSchema.parse(await request.json());

    const match = await prisma.match.findUnique({ where: { id } });
    if (!match) throw new ApiError(404, "NOT_FOUND", "Match not found");
    ensureMatchParticipant(match, userId);
    if (match.status === "CANCELLED") return ok({ match, penalized: false });

    let cancellationBy: "USER_A" | "USER_B" | "SYSTEM";
    let cancelledUserId: string;
    if (match.userAId === userId) {
      cancellationBy = "USER_A";
      cancelledUserId = match.userAId;
    } else if (match.userBId === userId) {
      cancellationBy = "USER_B";
      cancelledUserId = match.userBId;
    } else {
      throw new ApiError(403, "FORBIDDEN", "User does not belong to this match");
    }

    const now = new Date();
    const within24h = match.meetupAt.getTime() - now.getTime() <= 24 * 60 * 60 * 1000;

    const updated = await prisma.$transaction(async (tx) => {
      const cancelled = await tx.match.update({
        where: { id: match.id },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancellationBy,
          cancelReason: typeof reason === "string" ? reason.slice(0, 300) : null,
        },
      });

      await tx.availability.updateMany({
        where: { id: { in: [match.userAAvailabilityId ?? "", match.userBAvailabilityId ?? ""] } },
        data: { isBooked: false },
      });

      if (within24h) {
        await tx.user.update({
          where: { id: cancelledUserId },
          data: { penaltyPoints: { increment: 1 } },
        });
      }

      return cancelled;
    });

    return ok({ match: updated, penalized: within24h });
  } catch (error) {
    return handleApiError(error);
  }
}
