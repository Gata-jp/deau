import { ApiError, handleApiError, ok } from "../../../lib/api";
import { getAuthUserId } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { isProfileComplete } from "../../../lib/profile";
import { updateProfileSchema } from "../../../lib/validators";

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId(request);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        authUserId: true,
        email: true,
        nickname: true,
        birthDate: true,
        gender: true,
        preferenceGender: true,
        nearestStationId: true,
        prefecture: true,
        city: true,
        areaNote: true,
        matchingEnabled: true,
        lastLoginAt: true,
      },
    });
    if (!user) {
      throw new ApiError(404, "NOT_FOUND", "User not found");
    }
    return ok({
      user,
      needsProfileSetup: !isProfileComplete(user),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await getAuthUserId(request);
    const body = updateProfileSchema.parse(await request.json());

    if (body.nearestStationId) {
      const station = await prisma.station.findUnique({
        where: { id: body.nearestStationId },
        select: { id: true },
      });
      if (!station) {
        throw new ApiError(400, "INVALID_STATION", "Station not found");
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        nickname: body.nickname,
        birthDate: body.birthDate,
        gender: body.gender,
        preferenceGender: body.preferenceGender,
        nearestStationId: body.nearestStationId ?? null,
        prefecture: body.prefecture,
        city: body.city,
        areaNote: body.areaNote ?? null,
        matchingEnabled: true,
      },
      select: {
        id: true,
        nickname: true,
        birthDate: true,
        gender: true,
        preferenceGender: true,
        nearestStationId: true,
        prefecture: true,
        city: true,
        areaNote: true,
        matchingEnabled: true,
      },
    });

    return ok({
      user,
      needsProfileSetup: !isProfileComplete(user),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
