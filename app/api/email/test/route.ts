import { z } from "zod";
import { ApiError, handleApiError, ok } from "../../../lib/api";
import { createResendClient } from "../../../lib/resend";

const bodySchema = z.object({
  to: z.string().email().optional(),
  from: z.string().email().optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  html: z.string().trim().min(1).optional(),
});

function assertRequestAllowed(request: Request) {
  const secret = process.env.EMAIL_TEST_API_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(
        403,
        "EMAIL_TEST_DISABLED",
        "Set EMAIL_TEST_API_SECRET to enable this endpoint in production"
      );
    }
    return;
  }

  const provided = request.headers.get("x-email-test-secret")?.trim();
  if (!provided || provided !== secret) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or missing x-email-test-secret");
  }
}

export async function POST(request: Request) {
  try {
    assertRequestAllowed(request);

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      throw parsed.error;
    }

    const resend = createResendClient();
    const to = parsed.data.to ?? process.env.EMAIL_TEST_TO;
    const from = parsed.data.from ?? process.env.EMAIL_FROM ?? "onboarding@resend.dev";
    const subject = parsed.data.subject ?? "deau: Resend test email";
    const html = parsed.data.html ?? "<p>deau test mail via Resend.</p>";

    if (!to) {
      throw new ApiError(
        400,
        "EMAIL_TEST_TO_MISSING",
        "Provide `to` in request body or set EMAIL_TEST_TO"
      );
    }

    const result = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    return ok({ sent: true, result }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
