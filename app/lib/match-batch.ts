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
const TOKYO_PRIORITY_MAX_MINUTES = 90;

const ADJACENT_PREFECTURES: Record<string, string[]> = {
  "北海道": [],
  "青森県": ["秋田県", "岩手県"],
  "岩手県": ["青森県", "秋田県", "宮城県"],
  "宮城県": ["岩手県", "秋田県", "山形県", "福島県"],
  "秋田県": ["青森県", "岩手県", "宮城県", "山形県"],
  "山形県": ["秋田県", "宮城県", "福島県", "新潟県"],
  "福島県": ["宮城県", "山形県", "新潟県", "群馬県", "栃木県", "茨城県"],
  "茨城県": ["福島県", "栃木県", "埼玉県", "千葉県"],
  "栃木県": ["福島県", "群馬県", "埼玉県", "茨城県"],
  "群馬県": ["福島県", "新潟県", "長野県", "埼玉県", "栃木県"],
  "埼玉県": ["茨城県", "栃木県", "群馬県", "長野県", "山梨県", "東京都", "千葉県"],
  "千葉県": ["茨城県", "埼玉県", "東京都"],
  "東京都": ["埼玉県", "千葉県", "神奈川県", "山梨県"],
  "神奈川県": ["東京都", "山梨県", "静岡県"],
  "新潟県": ["山形県", "福島県", "群馬県", "長野県", "富山県"],
  "富山県": ["新潟県", "長野県", "岐阜県", "石川県"],
  "石川県": ["富山県", "岐阜県", "福井県"],
  "福井県": ["石川県", "岐阜県", "滋賀県", "京都府"],
  "山梨県": ["埼玉県", "東京都", "神奈川県", "静岡県", "長野県"],
  "長野県": ["新潟県", "群馬県", "埼玉県", "山梨県", "静岡県", "愛知県", "岐阜県", "富山県"],
  "岐阜県": ["富山県", "石川県", "福井県", "滋賀県", "三重県", "愛知県", "長野県"],
  "静岡県": ["神奈川県", "山梨県", "長野県", "愛知県"],
  "愛知県": ["静岡県", "長野県", "岐阜県", "三重県"],
  "三重県": ["岐阜県", "愛知県", "滋賀県", "京都府", "奈良県", "和歌山県"],
  "滋賀県": ["福井県", "岐阜県", "三重県", "京都府"],
  "京都府": ["福井県", "滋賀県", "三重県", "奈良県", "大阪府", "兵庫県"],
  "大阪府": ["京都府", "兵庫県", "奈良県", "和歌山県"],
  "兵庫県": ["京都府", "大阪府", "岡山県", "鳥取県"],
  "奈良県": ["三重県", "京都府", "大阪府", "和歌山県"],
  "和歌山県": ["三重県", "大阪府", "奈良県"],
  "鳥取県": ["兵庫県", "岡山県", "島根県"],
  "島根県": ["鳥取県", "岡山県", "広島県", "山口県"],
  "岡山県": ["兵庫県", "鳥取県", "島根県", "広島県"],
  "広島県": ["島根県", "岡山県", "山口県"],
  "山口県": ["島根県", "広島県", "福岡県"],
  "徳島県": ["香川県", "愛媛県", "高知県", "兵庫県"],
  "香川県": ["徳島県", "愛媛県", "岡山県"],
  "愛媛県": ["香川県", "徳島県", "高知県", "大分県"],
  "高知県": ["徳島県", "愛媛県"],
  "福岡県": ["山口県", "佐賀県", "熊本県", "大分県"],
  "佐賀県": ["福岡県", "長崎県"],
  "長崎県": ["佐賀県"],
  "熊本県": ["福岡県", "大分県", "宮崎県", "鹿児島県"],
  "大分県": ["福岡県", "熊本県", "宮崎県", "愛媛県"],
  "宮崎県": ["熊本県", "大分県", "鹿児島県"],
  "鹿児島県": ["熊本県", "宮崎県"],
  "沖縄県": [],
};

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
  regionPriority: number;
  tokyoPriorityBucket: number;
};

function getTokyoPriorityBucket(minutesA: number | null, minutesB: number | null): number {
  if (minutesA === null || minutesB === null) return 3;
  const worst = Math.max(minutesA, minutesB);
  if (worst <= 30) return 0;
  if (worst <= 60) return 1;
  if (worst <= TOKYO_PRIORITY_MAX_MINUTES) return 2;
  return 3;
}

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
  recentPairMap: Map<string, Date>,
  tokyoStation: { id: string; latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null } | null
): PairCandidate | null {
  if (userA.lastMatchedUserId === userB.id || userB.lastMatchedUserId === userA.id) return null;
  if (!isPreferenceMatch(userA.gender, userA.preferenceGender, userB.gender, userB.preferenceGender)) {
    return null;
  }
  if (!isAgeDifferenceAllowed(userA, userB, now)) return null;

  const lastMatchedAt = recentPairMap.get(pairKey(userA.id, userB.id));
  if (lastMatchedAt) return null;

  const overlap = findBestAvailabilityOverlap(userA.availabilities, userB.availabilities);
  if (!overlap) return null;

  const samePrefecture = Boolean(userA.prefecture && userA.prefecture === userB.prefecture);
  const adjacentPrefecture = Boolean(
    userA.prefecture &&
      userB.prefecture &&
      ADJACENT_PREFECTURES[userA.prefecture]?.includes(userB.prefecture)
  );
  if (!samePrefecture && !adjacentPrefecture) return null;

  const regionPriority = samePrefecture ? 0 : 1;

  let travelMinutes: number | null = null;
  let travelTimeBucket: number | null = null;
  let meetupStationId: string | null = tokyoStation?.id ?? null;

  if (userA.nearestStation && userB.nearestStation) {
    const distanceKm = calculateDistanceKm(userA.nearestStation, userB.nearestStation);
    travelMinutes = estimateTravelMinutesFromDistance(distanceKm);
    if (travelMinutes !== null && travelMinutes > MAX_TRAVEL_MINUTES) return null;
    if (travelMinutes !== null) {
      travelTimeBucket = getTravelTimeBucket(travelMinutes);
    }
    const middle = findMiddleStation(userA.nearestStation, userB.nearestStation, stationCandidates);
    meetupStationId = middle?.id ?? userA.nearestStationId ?? userB.nearestStationId ?? meetupStationId;
  }

  if (!meetupStationId) return null;

  let tokyoPriorityBucket = 3;
  if (tokyoStation && userA.nearestStation && userB.nearestStation) {
    const travelAToTokyo = estimateTravelMinutesFromDistance(
      calculateDistanceKm(userA.nearestStation, tokyoStation)
    );
    const travelBToTokyo = estimateTravelMinutesFromDistance(
      calculateDistanceKm(userB.nearestStation, tokyoStation)
    );
    tokyoPriorityBucket = getTokyoPriorityBucket(travelAToTokyo, travelBToTokyo);
  }

  const userAAgeAtMatch = getAgeAtDate(userA.birthDate, now);
  const userBAgeAtMatch = getAgeAtDate(userB.birthDate, now);

  return {
    userA,
    userB,
    meetupAt: overlap.overlapStart,
    overlapMinutes: overlap.overlapMinutes,
    travelMinutes: travelMinutes ?? 999,
    travelTimeBucket: travelTimeBucket ?? 99,
    meetupStationId,
    userAAvailabilityId: overlap.slotA.id,
    userBAvailabilityId: overlap.slotB.id,
    userAAgeAtMatch,
    userBAgeAtMatch,
    waitDaysA: getWaitDays(userA, now),
    waitDaysB: getWaitDays(userB, now),
    regionPriority,
    tokyoPriorityBucket,
  };
}

function sortCandidates(candidates: PairCandidate[]) {
  return candidates.sort((a, b) => {
    if (a.regionPriority !== b.regionPriority) {
      return a.regionPriority - b.regionPriority;
    }

    if (a.tokyoPriorityBucket !== b.tokyoPriorityBucket) {
      return a.tokyoPriorityBucket - b.tokyoPriorityBucket;
    }

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
      prefecture: { not: null },
      city: { not: null },
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

  const tokyoStation = await prisma.station.findFirst({
    where: { name: "東京" },
    select: { id: true, latitude: true, longitude: true },
  });

  const recentPairMap = await getRecentPairMap(
    prisma,
    users.map((user) => user.id),
    now
  );

  const candidates: PairCandidate[] = [];
  for (let i = 0; i < users.length; i += 1) {
    for (let j = i + 1; j < users.length; j += 1) {
      const candidate = buildCandidate(
        users[i],
        users[j],
        now,
        stationCandidates,
        recentPairMap,
        tokyoStation
      );
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
