import { NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { handleApiError, ok, ApiError } from "../../lib/api";
import { createAvailabilitySchema } from "../../lib/validators";
import { ensureActiveUser, ensureProfileCompleted, getAuthUserId } from "../../lib/auth";

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId(request);
    await ensureActiveUser(userId);
    await ensureProfileCompleted(userId);
    const body = createAvailabilitySchema.parse(await request.json());

    const start = body.startAt;
    const end = body.endAt;

    const overlap = await prisma.availability.findFirst({
      where: {
        userId,
        startAt: { lt: end },
        endAt: { gt: start },
      },
    });
    if (overlap) {
      throw new ApiError(409, "CONFLICT", "Availability overlaps existing slot");
    }

    const availability = await prisma.availability.create({
      data: {
        userId,
        startAt: start,
        endAt: end,
      },
    });

    return ok({ availability }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
