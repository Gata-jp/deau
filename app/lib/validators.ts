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
