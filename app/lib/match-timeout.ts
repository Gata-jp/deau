import type { Match, PrismaClient } from "@prisma/client";

const MATCH_TIMEOUT_MS = 60 * 60 * 1000;

function isTimedOut(match: Pick<Match, "meetupAt">, now: Date) {
  return now.getTime() > match.meetupAt.getTime() + MATCH_TIMEOUT_MS;
}

export function shouldExpireMatch(
  match: Pick<Match, "status" | "meetupAt" | "userACheckedInAt" | "userBCheckedInAt">,
  now = new Date()
) {
  if (match.status !== "MATCHED") return false;
  if (match.userACheckedInAt && match.userBCheckedInAt) return false;
  return isTimedOut(match, now);
}

export async function expireMatchIfTimedOut(
  prisma: PrismaClient,
  match: Pick<Match, "id" | "status" | "meetupAt" | "userACheckedInAt" | "userBCheckedInAt">
) {
  if (!shouldExpireMatch(match)) return null;
  return prisma.match.update({
    where: { id: match.id },
    data: { status: "EXPIRED" },
  });
}

export async function expireTimedOutMatches(prisma: PrismaClient, now = new Date()) {
  const threshold = new Date(now.getTime() - MATCH_TIMEOUT_MS);
  const result = await prisma.match.updateMany({
    where: {
      status: "MATCHED",
      meetupAt: { lt: threshold },
      OR: [{ userACheckedInAt: null }, { userBCheckedInAt: null }],
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}
