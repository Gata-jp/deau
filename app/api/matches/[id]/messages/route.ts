import { NextResponse } from "next/server";
import { ApiError, handleApiError, ok } from "../../../../lib/api";
import { ensureMatchParticipant, ensureProfileCompleted, getAuthUserId } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { isChatWindowOpen } from "../../../../lib/chat-window";
import { expireMatchIfTimedOut } from "../../../../lib/match-timeout";
import { postMessageSchema } from "../../../../lib/validators";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: Context) {
  try {
    const userId = await getAuthUserId(_request);
    await ensureProfileCompleted(userId);
    const { id } = await context.params;
    const match = await prisma.match.findUnique({ where: { id } });
    if (!match) throw new ApiError(404, "NOT_FOUND", "Match not found");
    ensureMatchParticipant(match, userId);

    const messages = await prisma.chatMessage.findMany({
      where: { matchId: match.id },
      orderBy: { sentAt: "asc" },
      take: 200,
    });

    return ok({ messages });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const userId = await getAuthUserId(request);
    await ensureProfileCompleted(userId);
    const { id } = await context.params;
    const { body } = postMessageSchema.parse(await request.json());

    const match = await prisma.match.findUnique({ where: { id } });
    if (!match) throw new ApiError(404, "NOT_FOUND", "Match not found");
    ensureMatchParticipant(match, userId);
    await expireMatchIfTimedOut(prisma, match);
    const current = await prisma.match.findUnique({ where: { id: match.id } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Match not found");
    if (current.status !== "MATCHED" && current.status !== "COMPLETED") {
      throw new ApiError(409, "INVALID_STATUS", "Chat allowed only for matched/completed status");
    }

    if (!isChatWindowOpen(current.meetupAt, new Date())) {
      throw new ApiError(403, "CHAT_WINDOW_CLOSED", "Chat window is closed");
    }

    const message = await prisma.chatMessage.create({
      data: {
        matchId: match.id,
        senderId: userId,
        body,
      },
    });

    return ok({ message }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
