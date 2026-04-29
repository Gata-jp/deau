import { NextResponse } from "next/server";
import { handleApiError, ok } from "../../../lib/api";
import { prisma } from "../../../lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    if (!q) return ok({ stations: [] });

    const stations = await prisma.station.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { kana: { contains: q, mode: "insensitive" } },
          { lineName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        lineName: true,
        latitude: true,
        longitude: true,
      },
      take: 20,
    });

    return ok({ stations });
  } catch (error) {
    return handleApiError(error);
  }
}
