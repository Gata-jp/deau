import { z } from "zod";

export const createAvailabilitySchema = z
  .object({
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
  })
  .refine((v) => v.startAt < v.endAt, {
    message: "startAt must be earlier than endAt",
    path: ["startAt"],
  });

export const runMatchSchema = z.object({});

export const cancelMatchSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const postMessageSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});

export const updateProfileSchema = z.object({
  nickname: z.string().trim().min(1).max(40),
  birthDate: z.coerce.date(),
  gender: z.enum(["MALE", "FEMALE", "NON_BINARY", "OTHER"]),
  preferenceGender: z.enum(["MALE", "FEMALE", "NON_BINARY", "ANY"]),
  nearestStationId: z.string().cuid().optional(),
  prefecture: z.string().trim().min(1).max(20),
  city: z.string().trim().min(1).max(80),
  areaNote: z.string().trim().max(200).optional(),
});
