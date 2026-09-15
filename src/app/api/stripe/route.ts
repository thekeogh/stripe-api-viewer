import { NextRequest, NextResponse } from "next/server";
import { buildStripePath, type StripeRequest } from "@/lib/stripe";

export const runtime = "nodejs";

function failure(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return failure("Cross-origin requests are not allowed.", 403);

  let input: StripeRequest;
  let path: string;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new Error("Invalid request.");
    const data = body as Record<string, unknown>;
    const required = [
      "apiKey",
      "account",
      "apiVersion",
      "resource",
      "method",
      "objectId",
      "query",
      "limit",
      "cursor",
    ];
    if (required.some((key) => typeof data[key] !== "string"))
      throw new Error("Invalid request fields.");
    if (data.parameters !== undefined && data.parameters !== "")
      throw new Error(
        "Additional parameters are no longer supported. Use Expand options instead.",
      );
    input = data as StripeRequest;
    input.apiKey = input.apiKey.trim();
    if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(input.apiKey)) {
      throw new Error(
        "Enter a Stripe secret or restricted API key (sk_… or rk_…).",
      );
    }
    if (input.account && !/^acct_[A-Za-z0-9]+$/.test(input.account.trim()))
      throw new Error("Enter a valid connected account ID (acct_…).");
    if (
      input.apiVersion &&
      !/^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/.test(input.apiVersion.trim())
    )
      throw new Error("Use a Stripe API version such as 2025-02-24.acacia.");
    path = buildStripePath(input);
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "Invalid request.",
      400,
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.apiKey}`,
  };
  if (input.account.trim()) headers["Stripe-Account"] = input.account.trim();
  if (input.apiVersion.trim())
    headers["Stripe-Version"] = input.apiVersion.trim();
  const started = performance.now();
  try {
    // The origin and HTTP method are fixed. The shared catalog is the endpoint allowlist.
    const response = await fetch(`https://api.stripe.com${path}`, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();
    return NextResponse.json(
      {
        body,
        status: response.status,
        statusText: response.statusText,
        duration: Math.round(performance.now() - started),
        requestId: response.headers.get("request-id"),
        apiVersion: response.headers.get("stripe-version"),
        path,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const timeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return failure(
      timeout
        ? "Stripe did not respond within 30 seconds. Try again."
        : "Could not reach Stripe. Check your connection and try again.",
      timeout ? 504 : 502,
    );
  }
}
