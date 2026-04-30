import { Resend } from "resend";
import { ApiError } from "./api";

export function createResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new ApiError(500, "RESEND_API_KEY_MISSING", "RESEND_API_KEY is not configured");
  }
  return new Resend(apiKey);
}
