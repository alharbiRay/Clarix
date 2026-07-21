import { Resend } from "resend";

/** Server-only Resend client. Throws only when an email is actually sent/verified. */
export function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }
  return new Resend(process.env.RESEND_API_KEY);
}

export function getFromAddress() {
  return process.env.RESEND_FROM_EMAIL || "Clarix <noreply@clarix.app>";
}

export function getInboundDomain() {
  if (!process.env.RESEND_INBOUND_DOMAIN) {
    throw new Error("RESEND_INBOUND_DOMAIN is not set");
  }
  return process.env.RESEND_INBOUND_DOMAIN;
}

/** The reply-to address suppliers hit when they reply to their invitation email with a PDF. */
export function inboundAddressForToken(token: string) {
  return `quotes+${token}@${getInboundDomain()}`;
}
