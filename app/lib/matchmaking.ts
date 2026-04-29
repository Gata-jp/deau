import type { Match, PreferenceGender, Station, User, Gender, Availability } from "@prisma/client";

type GeoStation = Pick<Station, "id" | "latitude" | "longitude">;

const EARTH_RADIUS_KM = 6371;

function toRadians(degree: number): number {
  return (degree * Math.PI) / 180;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_KM * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function calculateDistanceKm(stationA: GeoStation, stationB: GeoStation): number | null {
  if (
    stationA.latitude === null ||
    stationA.longitude === null ||
    stationB.latitude === null ||
    stationB.longitude === null
  ) {
    return null;
  }

  return haversineKm(
    Number(stationA.latitude),
    Number(stationA.longitude),
    Number(stationB.latitude),
    Number(stationB.longitude)
  );
}

export function estimateTravelMinutesFromDistance(distanceKm: number | null): number | null {
  if (distanceKm === null) return null;
  return Math.max(5, Math.round(distanceKm * 3 + 10));
}

export function getTravelTimeBucket(travelMinutes: number): number {
  return Math.min(4, Math.max(1, Math.ceil(travelMinutes / 30)));
}

export function isPreferenceMatch(
  genderA: Gender,
  prefA: PreferenceGender,
  genderB: Gender,
  prefB: PreferenceGender
) {
  const aAcceptsB = prefA === "ANY" || prefA === genderB;
  const bAcceptsA = prefB === "ANY" || prefB === genderA;
  return aAcceptsB && bAcceptsA;
}

export function getAgeAtDate(birthDate: Date, at: Date): number {
  let age = at.getFullYear() - birthDate.getFullYear();
  const monthDelta = at.getMonth() - birthDate.getMonth();
  const beforeBirthday =
    monthDelta < 0 || (monthDelta === 0 && at.getDate() < birthDate.getDate());

  if (beforeBirthday) age -= 1;
  return age;
}

export function isAgeDifferenceAllowed(userA: Pick<User, "birthDate">, userB: Pick<User, "birthDate">, at: Date) {
  const ageA = getAgeAtDate(userA.birthDate, at);
  const ageB = getAgeAtDate(userB.birthDate, at);
  return Math.abs(ageA - ageB) <= 5;
}

export function getWaitDays(user: Pick<User, "matchWaitStartedAt" | "lastMatchedAt" | "createdAt">, now: Date) {
  const waitStart = user.matchWaitStartedAt ?? user.lastMatchedAt ?? user.createdAt;
  const diffMs = Math.max(0, now.getTime() - waitStart.getTime());
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

type AvailabilityPair = {
  slotA: Pick<Availability, "id" | "startAt" | "endAt">;
  slotB: Pick<Availability, "id" | "startAt" | "endAt">;
  overlapStart: Date;
  overlapEnd: Date;
  overlapMinutes: number;
};

export function findBestAvailabilityOverlap(
  slotsA: Pick<Availability, "id" | "startAt" | "endAt">[],
  slotsB: Pick<Availability, "id" | "startAt" | "endAt">[]
): AvailabilityPair | null {
  let best: AvailabilityPair | null = null;

  for (const slotA of slotsA) {
    for (const slotB of slotsB) {
      if (slotA.startAt >= slotB.endAt || slotA.endAt <= slotB.startAt) continue;

      const overlapStart = new Date(Math.max(slotA.startAt.getTime(), slotB.startAt.getTime()));
      const overlapEnd = new Date(Math.min(slotA.endAt.getTime(), slotB.endAt.getTime()));
      const overlapMinutes = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 60000);
      if (overlapMinutes <= 0) continue;

      const candidate: AvailabilityPair = {
        slotA,
        slotB,
        overlapStart,
        overlapEnd,
        overlapMinutes,
      };

      if (
        !best ||
        candidate.overlapMinutes > best.overlapMinutes ||
        (candidate.overlapMinutes === best.overlapMinutes &&
          candidate.overlapStart.getTime() < best.overlapStart.getTime())
      ) {
        best = candidate;
      }
    }
  }

  return best;
}

export function findMiddleStation(
  stationA: GeoStation,
  stationB: GeoStation,
  candidates: GeoStation[]
): GeoStation | null {
  if (
    stationA.latitude === null ||
    stationA.longitude === null ||
    stationB.latitude === null ||
    stationB.longitude === null
  ) {
    return null;
  }

  let winner: GeoStation | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.latitude === null || candidate.longitude === null) continue;

    const da = haversineKm(
      Number(stationA.latitude),
      Number(stationA.longitude),
      Number(candidate.latitude),
      Number(candidate.longitude)
    );
    const db = haversineKm(
      Number(stationB.latitude),
      Number(stationB.longitude),
      Number(candidate.latitude),
      Number(candidate.longitude)
    );

    // 中間地点に近いほど |da-db| が小さい
    const balancePenalty = Math.abs(da - db);
    const travelPenalty = da + db;
    const score = balancePenalty * 2 + travelPenalty * 0.15;

    if (score < bestScore) {
      bestScore = score;
      winner = candidate;
    }
  }

  return winner;
}

export function inferMatchStatus(match: Pick<Match, "status" | "userACheckedInAt" | "userBCheckedInAt">) {
  if (match.status === "CANCELLED") return "CANCELLED";
  if (match.userACheckedInAt && match.userBCheckedInAt) return "COMPLETED";
  return match.status;
}
