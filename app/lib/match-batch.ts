import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "./api";
import {
  calculateDistanceKm,
  estimateTravelMinutesFromDistance,
  findBestAvailabilityOverlap,
  findMiddleStation,
  getAgeAtDate,
  getTravelTimeBucket,
  getWaitDays,
  isAgeDifferenceAllowed,
  isPreferenceMatch,
} from "./matchmaking";
import { expireTimedOutMatches } from "./match-timeout";

const MAX_TRAVEL_MINUTES = 120;
const REMATCH_COOLDOWN_DAYS = 30;

type CandidateUser = Prisma.UserGetPayload<{
  include: {
    nearestStation: true;
    availabilities: {
      where: {
        isBooked: false;
      };
      select: {
        id: true;
        startAt: true;
        endAt: true;
      };
    };
  };
}>;

type PairCandidate = {
  userA: CandidateUser;
  userB: CandidateUser;
  meetupAt: Date;
  overlapMinutes: number;
  travelMinutes: number;
  travelTimeBucket: number;
  meetupStationId: string;
  userAAvailabilityId: string;
  userBAvailabilityId: string;
  userAAgeAtMatch: number;
  userBAgeAtMatch: number;
  waitDaysA: number;
  waitDaysB: number;
};

function pairKey(userAId: string, userBId: string) {
  return [userAId, userBId].sort().join(":");
}

function assertBatchSecret(request: Request) {
  const expectedSecrets = [process.env.MATCH_BATCH_SECRET, process.env.CRON_SECRET].filter(
    (value): value is string => Boolean(value)
  );
  if (expectedSecrets.length === 0) {
    throw new ApiError(
      500,
      "BATCH_SECRET_NOT_CONFIGURED",
      "MATCH_BATCH_SECRET or CRON_SECRET must be configured"
    );
  }

  const headerSecret = request.headers.get("x-batch-secret");
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const providedSecret = headerSecret ?? bearerToken;

  if (!providedSecret || !expectedSecrets.includes(providedSecret)) {
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Missing or invalid x-batch-secret header / bearer token"
    );
  }
}

async function getRecentPairMap(prisma: PrismaClient, userIds: string[], now: Date) {
  const recentSince = new Date(now.getTime() - REMATCH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const recentMatches = await prisma.match.findMany({
    where: {
      createdAt: { gte: recentSince },
      OR: [
        { userAId: { in: userIds } },
        { userBId: { in: userIds } },
      ],
    },
    select: {
      userAId: true,
      userBId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const recentPairMap = new Map<string, Date>();
  for (const match of recentMatches) {
    const key = pairKey(match.userAId, match.userBId);
    if (!recentPairMap.has(key)) {
      recentPairMap.set(key, match.createdAt);
    }
  }

  return recentPairMap;
}

function buildCandidate(
  userA: CandidateUser,
  userB: CandidateUser,
  now: Date,
  stationCandidates: { id: string; latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null }[],
  recentPairMap: Map<string, Date>
): PairCandidate | null {
  if (!userA.nearestStation || !userB.nearestStation) return null;
  if (userA.lastMatchedUserId === userB.id || userB.lastMatchedUserId === userA.id) return null;
  if (!isPreferenceMatch(userA.gender, userA.preferenceGender, userB.gender, userB.preferenceGender)) {
    return null;
  }
  if (!isAgeDifferenceAllowed(userA, userB, now)) return null;

  const lastMatchedAt = recentPairMap.get(pairKey(userA.id, userB.id));
  if (lastMatchedAt) return null;

  const overlap = findBestAvailabilityOverlap(userA.availabilities, userB.availabilities);
  if (!overlap) return null;

  const distanceKm = calculateDistanceKm(userA.nearestStation, userB.nearestStation);
  const travelMinutes = estimateTravelMinutesFromDistance(distanceKm);
  if (travelMinutes === null || travelMinutes > MAX_TRAVEL_MINUTES) return null;

  const middle = findMiddleStation(userA.nearestStation, userB.nearestStation, stationCandidates);
  const meetupStationId = middle?.id ?? userA.nearestStationId ?? userB.nearestStationId;
  if (!meetupStationId) return null;

  const userAAgeAtMatch = getAgeAtDate(userA.birthDate, now);
  const userBAgeAtMatch = getAgeAtDate(userB.birthDate, now);

  return {
    userA,
    userB,
    meetupAt: overlap.overlapStart,
    overlapMinutes: overlap.overlapMinutes,
    travelMinutes,
    travelTimeBucket: getTravelTimeBucket(travelMinutes),
    meetupStationId,
    userAAvailabilityId: overlap.slotA.id,
    userBAvailabilityId: overlap.slotB.id,
    userAAgeAtMatch,
    userBAgeAtMatch,
    waitDaysA: getWaitDays(userA, now),
    waitDaysB: getWaitDays(userB, now),
  };
}

function sortCandidates(candidates: PairCandidate[]) {
  return candidates.sort((a, b) => {
    if (a.travelTimeBucket !== b.travelTimeBucket) {
      return a.travelTimeBucket - b.travelTimeBucket;
    }

    const aPrimaryWait = Math.max(a.waitDaysA, a.waitDaysB);
    const bPrimaryWait = Math.max(b.waitDaysA, b.waitDaysB);
    if (aPrimaryWait !== bPrimaryWait) {
      return bPrimaryWait - aPrimaryWait;
    }

    const aSecondaryWait = Math.min(a.waitDaysA, a.waitDaysB);
    const bSecondaryWait = Math.min(b.waitDaysA, b.waitDaysB);
    if (aSecondaryWait !== bSecondaryWait) {
      return bSecondaryWait - aSecondaryWait;
    }

    if (a.overlapMinutes !== b.overlapMinutes) {
      return b.overlapMinutes - a.overlapMinutes;
    }

    if (a.travelMinutes !== b.travelMinutes) {
      return a.travelMinutes - b.travelMinutes;
    }

    return a.meetupAt.getTime() - b.meetupAt.getTime();
  });
}

export async function runDailyMatchBatch(prisma: PrismaClient, request: Request) {
  assertBatchSecret(request);

  const now = new Date();
  const expiredCount = await expireTimedOutMatches(prisma, now);
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      matchingEnabled: true,
      nearestStationId: { not: null },
      availabilities: {
        some: {
          isBooked: false,
          endAt: { gt: now },
        },
      },
    },
    include: {
      nearestStation: true,
      availabilities: {
        where: {
          isBooked: false,
          endAt: { gt: now },
        },
        select: {
          id: true,
          startAt: true,
          endAt: true,
        },
        orderBy: { startAt: "asc" },
      },
    },
  });

  if (users.length < 2) {
    return {
      batchAt: now,
      expiredCount,
      matchedCount: 0,
      scannedUsers: users.length,
      skippedCount: users.length,
    };
  }

  const stationCandidates = await prisma.station.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      latitude: true,
      longitude: true,
    },
    take: 1000,
  });

  const recentPairMap = await getRecentPairMap(
    prisma,
    users.map((user) => user.id),
    now
  );

  const candidates: PairCandidate[] = [];
  for (let i = 0; i < users.length; i += 1) {
    for (let j = i + 1; j < users.length; j += 1) {
      const candidate = buildCandidate(users[i], users[j], now, stationCandidates, recentPairMap);
      if (candidate) candidates.push(candidate);
    }
  }

  sortCandidates(candidates);

  const usedUserIds = new Set<string>();
  const createdMatches: string[] = [];

  for (const candidate of candidates) {
    if (usedUserIds.has(candidate.userA.id) || usedUserIds.has(candidate.userB.id)) {
      continue;
    }

    const created = await prisma.$transaction(async (tx) => {
      const lockA = await tx.availability.updateMany({
        where: { id: candidate.userAAvailabilityId, isBooked: false },
        data: { isBooked: true },
      });
      if (lockA.count !== 1) return null;

      const lockB = await tx.availability.updateMany({
        where: { id: candidate.userBAvailabilityId, isBooked: false },
        data: { isBooked: true },
      });
      if (lockB.count !== 1) {
        await tx.availability.update({
          where: { id: candidate.userAAvailabilityId },
          data: { isBooked: false },
        });
        return null;
      }

      try {
        const match = await tx.match.create({
          data: {
            userAId: candidate.userA.id,
            userBId: candidate.userB.id,
            userAAvailabilityId: candidate.userAAvailabilityId,
            userBAvailabilityId: candidate.userBAvailabilityId,
            meetupStationId: candidate.meetupStationId,
            meetupAt: candidate.meetupAt,
            travelMinutes: candidate.travelMinutes,
            travelTimeBucket: candidate.travelTimeBucket,
            matchedByBatchAt: now,
            userAAgeAtMatch: candidate.userAAgeAtMatch,
            userBAgeAtMatch: candidate.userBAgeAtMatch,
            status: "PENDING",
          },
        });

        await tx.user.update({
          where: { id: candidate.userA.id },
          data: {
            lastMatchedAt: now,
            lastMatchedUserId: candidate.userB.id,
            matchWaitStartedAt: now,
          },
        });

        await tx.user.update({
          where: { id: candidate.userB.id },
          data: {
            lastMatchedAt: now,
            lastMatchedUserId: candidate.userA.id,
            matchWaitStartedAt: now,
          },
        });

        return match;
      } catch (error) {
        await tx.availability.update({
          where: { id: candidate.userAAvailabilityId },
          data: { isBooked: false },
        });
        await tx.availability.update({
          where: { id: candidate.userBAvailabilityId },
          data: { isBooked: false },
        });

        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return null;
        }

        throw error;
      }
    });

    if (!created) continue;

    usedUserIds.add(candidate.userA.id);
    usedUserIds.add(candidate.userB.id);
    createdMatches.push(created.id);
  }

  return {
    batchAt: now,
    expiredCount,
    scannedUsers: users.length,
    candidateCount: candidates.length,
    matchedCount: createdMatches.length,
    createdMatchIds: createdMatches,
    skippedCount: users.length - usedUserIds.size,
  };
}
