import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prepareWrite, type WriteInput } from "@/lib/stripe-writes";

export const runtime = "nodejs";
const signingKey = randomBytes(32);
const consumed = new Map<string, number>();
const inFlight = new Set<string>();
const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status, headers });
const digest = (input: WriteInput) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");
const sign = (value: string) =>
  createHmac("sha256", signingKey).update(value).digest("base64url");

function approvalFor(input: WriteInput) {
  const value = Buffer.from(
    JSON.stringify({
      hash: digest(input),
      expires: Date.now() + 5 * 60_000,
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  return `${value}.${sign(value)}`;
}
function checkApproval(token: unknown, input: WriteInput) {
  if (typeof token !== "string" || token.length > 2048)
    throw new Error("Review and confirm this write before sending it.");
  const [value, signature, extra] = token.split(".");
  const expected = Buffer.from(sign(value || ""));
  const supplied = Buffer.from(signature || "");
  if (
    extra ||
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    throw new Error("Approval is invalid. Review the request again.");
  const approval = JSON.parse(Buffer.from(value, "base64url").toString());
  if (
    approval.hash !== digest(input) ||
    approval.expires <= Date.now() ||
    consumed.has(approval.nonce)
  )
    throw new Error(
      "Approval expired, was already used, or the request changed. Review it again.",
    );
  return approval as { nonce: string; expires: number };
}

export async function POST(request: NextRequest) {
  // Writes are only accepted from this app's own browser origin.
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return fail("Same-origin browser requests are required for writes.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return fail("Use application/json.", 415);
  let input: WriteInput;
  let prepared: ReturnType<typeof prepareWrite>;
  let approval: { nonce: string; expires: number } | undefined;
  let operation: string;
  try {
    const raw = await request.text();
    if (raw.length > 250_000)
      throw new Error("The write request is too large (maximum 250 KB).");
    const data = JSON.parse(raw);
    if (
      !data ||
      typeof data !== "object" ||
      !["prepare", "execute"].includes(data.phase)
    )
      throw new Error("Invalid write request.");
    const fields = [
      "apiKey",
      "account",
      "apiVersion",
      "resource",
      "action",
      "objectId",
      "body",
      "idempotencyKey",
    ] as const;
    if (fields.some((field) => typeof data[field] !== "string"))
      throw new Error("Invalid write fields.");
    input = Object.fromEntries(
      fields.map((key) => [key, data[key]]),
    ) as WriteInput;
    prepared = prepareWrite(input);
    if (data.phase === "prepare")
      return NextResponse.json(
        {
          approvalToken: approvalFor(input),
          path: prepared.path,
          method: prepared.method,
          mode: prepared.mode,
          body: prepared.body,
        },
        { headers },
      );
    if (prepared.needsConfirmation) {
      if (
        data.confirmed !== true ||
        data.acknowledgement !== prepared.requiredText
      )
        throw new Error("Explicit confirmation is required for this action.");
      approval = checkApproval(data.approvalToken, input);
    }
    operation = createHash("sha256")
      .update(`${input.apiKey}:${input.account}:${input.idempotencyKey}`)
      .digest("hex");
    if (inFlight.has(operation))
      return fail(
        "This operation is already in progress. Wait for its result.",
        409,
      );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Invalid write request.",
    );
  }

  for (const [nonce, expires] of consumed)
    if (expires < Date.now()) consumed.delete(nonce);
  if (approval) consumed.set(approval.nonce, approval.expires);
  inFlight.add(operation);
  const stripeHeaders: Record<string, string> = {
    Authorization: `Bearer ${input.apiKey.trim()}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (input.account.trim())
    stripeHeaders["Stripe-Account"] = input.account.trim();
  if (input.apiVersion.trim())
    stripeHeaders["Stripe-Version"] = input.apiVersion.trim();
  if (prepared.method === "POST")
    stripeHeaders["Idempotency-Key"] = input.idempotencyKey;
  // Subscription cancellation uses DELETE with optional parameters in the query.
  const path =
    prepared.method === "DELETE" && prepared.encoded.size
      ? `${prepared.path}?${prepared.encoded}`
      : prepared.path;
  const started = performance.now();
  try {
    const response = await fetch(`https://api.stripe.com${path}`, {
      method: prepared.method,
      headers: stripeHeaders,
      body:
        prepared.method === "POST" ? prepared.encoded.toString() : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    return NextResponse.json(
      {
        body: await response.text(),
        status: response.status,
        statusText: response.statusText,
        duration: Math.round(performance.now() - started),
        requestId: response.headers.get("request-id"),
        apiVersion: response.headers.get("stripe-version"),
        path,
        method: prepared.method,
      },
      { headers },
    );
  } catch {
    return fail(
      "No response was received. Stripe may have applied this write. Check the object before continuing. POST retries with the same operation key are deduplicated; no automatic retry was made.",
      502,
    );
  } finally {
    inFlight.delete(operation);
  }
}
