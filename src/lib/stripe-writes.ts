import { resources } from "./stripe";

export type WriteAction = "create" | "update" | "delete" | "cancel";
export type ConnectionSettings = {
  apiKey: string;
  account: string;
  apiVersion: string;
};
export type WriteInput = ConnectionSettings & {
  resource: string;
  action: WriteAction;
  objectId: string;
  body: string;
  idempotencyKey: string;
};

export function writeFingerprintSource(
  input: Omit<WriteInput, "idempotencyKey">,
): string {
  const value = {
    ...input,
    apiKey: input.apiKey.trim(),
    account: input.account.trim(),
    apiVersion: input.apiVersion.trim(),
    objectId: input.action === "create" ? "" : input.objectId.trim(),
    body: JSON.parse(input.body),
  };
  // Formatting and property order do not make a new Stripe operation.
  return JSON.stringify(value, (_key, child: unknown) =>
    child && typeof child === "object" && !Array.isArray(child)
      ? Object.fromEntries(
          Object.entries(child).sort(([a], [b]) => a.localeCompare(b)),
        )
      : child,
  );
}

const actions: Record<string, WriteAction[]> = {
  customers: ["create", "update", "delete"],
  subscriptions: ["create", "update", "cancel"],
  products: ["create", "update", "delete"],
  prices: ["create", "update"],
  coupons: ["create", "update", "delete"],
  promotion_codes: ["create", "update"],
  invoices: ["create", "update", "delete"],
  payment_intents: ["create", "update", "cancel"],
  charges: ["create", "update"],
  refunds: ["create", "update", "cancel"],
  disputes: ["update"],
  "checkout/sessions": ["create", "update"],
  payouts: ["create", "update", "cancel"],
};
export const writeResources = resources.filter((r) =>
  Object.hasOwn(actions, r.id),
);
export function writeActions(resource: string): WriteAction[] {
  return Object.hasOwn(actions, resource) ? actions[resource] : [];
}
export const writeLabels: Record<WriteAction, string> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
  cancel: "Cancel",
};
export function isDestructive(action: WriteAction) {
  return action === "delete" || action === "cancel";
}

export function keyMode(apiKey: string): "test" | "live" {
  const match = /^(?:sk|rk)_(test|live)_[A-Za-z0-9]+$/.exec(apiKey.trim());
  if (!match)
    throw new Error(
      "Enter a valid Stripe secret or restricted key before writing.",
    );
  return match[1] as "test" | "live";
}

export function writeEndpoint(
  resource: string,
  action: WriteAction,
  objectId: string,
) {
  const item = writeResources.find((r) => r.id === resource);
  if (!item || !writeActions(resource).includes(action))
    throw new Error("Choose a supported resource and write action.");
  let path = `/v1/${resource}`;
  if (action !== "create") {
    const id = objectId.trim();
    if (!id) throw new Error(`Enter the ${item.singular} ID.`);
    if (id === "." || id === ".." || /[\s/?#\\]/.test(id))
      throw new Error(
        "The ID must not contain whitespace or URL path characters.",
      );
    path += `/${encodeURIComponent(id)}`;
  }
  const method =
    action === "delete" || (action === "cancel" && resource === "subscriptions")
      ? "DELETE"
      : "POST";
  if (action === "cancel" && method === "POST") path += "/cancel";
  return { path, method } as { path: string; method: "POST" | "DELETE" };
}

// Stripe v1 expects form encoding. Indexed brackets preserve nested objects and arrays.
export function encodeWriteBody(body: unknown): URLSearchParams {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("The request body must be a JSON object.");
  const encoded = new URLSearchParams();
  function visit(value: unknown, name: string, depth: number) {
    if (depth > 12) throw new Error("The request body is nested too deeply.");
    if (value === null)
      throw new Error(
        `Use an empty string to clear ${name}; Stripe v1 does not accept JSON null.`,
      );
    if (Array.isArray(value)) {
      if (!value.length) encoded.append(name, "");
      value.forEach((item, i) => visit(item, `${name}[${i}]`, depth + 1));
    } else if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (!entries.length && name) encoded.append(name, "");
      for (const [key, child] of entries) {
        if (
          !key ||
          /[\[\]\x00-\x1f]/.test(key) ||
          ["__proto__", "constructor", "prototype"].includes(key)
        )
          throw new Error(`Unsupported JSON property: ${key}`);
        visit(child, name ? `${name}[${key}]` : key, depth + 1);
      }
    } else if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      encoded.append(name, String(value));
    } else throw new Error(`Unsupported value for ${name}.`);
  }
  visit(body, "", 0);
  return encoded;
}

export function prepareWrite(input: WriteInput) {
  const mode = keyMode(input.apiKey);
  if (input.account.trim() && !/^acct_[A-Za-z0-9]+$/.test(input.account.trim()))
    throw new Error("Enter a valid connected account ID (acct_…).");
  if (
    input.apiVersion.trim() &&
    !/^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/.test(input.apiVersion.trim())
  )
    throw new Error("Enter a valid Stripe API version.");
  if (!/^[A-Za-z0-9_-]{16,255}$/.test(input.idempotencyKey))
    throw new Error("A valid operation key is required.");
  const endpoint = writeEndpoint(input.resource, input.action, input.objectId);
  let body: unknown;
  try {
    body = JSON.parse(input.body);
  } catch {
    throw new Error("Fix the request body: it must be valid JSON.");
  }
  const encoded = encodeWriteBody(body);
  if (Object.hasOwn(body as object, "api_key")) {
    throw new Error("API keys belong in Connection, not in the request body.");
  }
  if (input.action === "delete" && encoded.size)
    throw new Error("Delete requests use an empty JSON object: {}.");
  const destructive = isDestructive(input.action);
  const requiredText =
    mode === "live" ? (destructive ? input.objectId.trim() : "LIVE") : "";
  return {
    ...endpoint,
    mode,
    destructive,
    requiredText,
    needsConfirmation: mode === "live" || destructive,
    body: JSON.stringify(body, null, 2),
    encoded,
  };
}

export function exampleBody(resource: string, action: WriteAction): string {
  if (isDestructive(action)) return "{}";
  if (action === "update")
    return JSON.stringify(
      { metadata: { note: "Updated with Stripe API Viewer" } },
      null,
      2,
    );
  const examples: Record<string, unknown> = {
    products: { name: "Arc Enterprise Unlimited" },
    customers: { name: "Example customer" },
    subscriptions: { customer: "cus_…", items: [{ price: "price_…" }] },
    prices: { product: "prod_…", currency: "gbp", unit_amount: 1000 },
    coupons: { percent_off: 10, duration: "once" },
    promotion_codes: { promotion: { type: "coupon", coupon: "coupon_id" } },
    invoices: { customer: "cus_…", auto_advance: false },
    payment_intents: { amount: 1000, currency: "gbp" },
    charges: { amount: 1000, currency: "gbp", source: "tok_visa" },
    refunds: { charge: "ch_…" },
    "checkout/sessions": {
      mode: "payment",
      line_items: [{ price: "price_…", quantity: 1 }],
      success_url: "https://example.com/success",
      cancel_url: "https://example.com/cancel",
    },
    payouts: { amount: 1000, currency: "gbp" },
  };
  return JSON.stringify(examples[resource] ?? {}, null, 2);
}
