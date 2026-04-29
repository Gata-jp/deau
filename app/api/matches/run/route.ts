import { prisma } from "../../../lib/prisma";
import { handleApiError, ok } from "../../../lib/api";
import { runDailyMatchBatch } from "../../../lib/match-batch";

export async function POST(request: Request) {
  try {
    const result = await runDailyMatchBatch(prisma, request);
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const result = await runDailyMatchBatch(prisma, request);
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
