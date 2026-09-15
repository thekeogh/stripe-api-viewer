import { normalizeExpansions } from "./expansions";

export type Method = "list" | "retrieve" | "search";

type Resource = {
  id: string;
  label: string;
  singular: string;
  prefix: string;
  group: string;
  search?: boolean;
  singleton?: boolean;
};

export const resources: Resource[] = [
  {
    id: "customers",
    label: "Customers",
    singular: "Customer",
    prefix: "cus_",
    group: "Billing",
    search: true,
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    singular: "Subscription",
    prefix: "sub_",
    group: "Billing",
    search: true,
  },
  {
    id: "products",
    label: "Products",
    singular: "Product",
    prefix: "prod_",
    group: "Catalog",
    search: true,
  },
  {
    id: "prices",
    label: "Prices",
    singular: "Price",
    prefix: "price_",
    group: "Catalog",
    search: true,
  },
  {
    id: "coupons",
    label: "Coupons",
    singular: "Coupon",
    prefix: "",
    group: "Catalog",
  },
  {
    id: "promotion_codes",
    label: "Promotion codes",
    singular: "Promotion code",
    prefix: "promo_",
    group: "Catalog",
  },
  {
    id: "invoices",
    label: "Invoices",
    singular: "Invoice",
    prefix: "in_",
    group: "Billing",
    search: true,
  },
  {
    id: "payment_intents",
    label: "Payment intents",
    singular: "Payment intent",
    prefix: "pi_",
    group: "Payments",
    search: true,
  },
  {
    id: "charges",
    label: "Charges",
    singular: "Charge",
    prefix: "ch_",
    group: "Payments",
    search: true,
  },
  {
    id: "refunds",
    label: "Refunds",
    singular: "Refund",
    prefix: "re_",
    group: "Payments",
  },
  {
    id: "disputes",
    label: "Disputes",
    singular: "Dispute",
    prefix: "dp_",
    group: "Payments",
  },
  {
    id: "checkout/sessions",
    label: "Checkout sessions",
    singular: "Checkout session",
    prefix: "cs_",
    group: "Payments",
  },
  {
    id: "balance",
    label: "Balance",
    singular: "Balance",
    prefix: "",
    group: "Account",
    singleton: true,
  },
  {
    id: "balance_transactions",
    label: "Balance transactions",
    singular: "Balance transaction",
    prefix: "txn_",
    group: "Account",
  },
  {
    id: "payouts",
    label: "Payouts",
    singular: "Payout",
    prefix: "po_",
    group: "Account",
  },
  {
    id: "events",
    label: "Events",
    singular: "Event",
    prefix: "evt_",
    group: "Account",
  },
];

export const methodLabels: Record<Method, string> = {
  list: "List all",
  retrieve: "Retrieve",
  search: "Search",
};

export function methodsFor(resource: Resource): Method[] {
  if (resource.singleton) return ["retrieve"];
  return resource.search
    ? ["list", "retrieve", "search"]
    : ["list", "retrieve"];
}

export type RequestFields = {
  resource: string;
  method: Method | "";
  objectId: string;
  query: string;
  limit: string;
  cursor: string;
  expand: string[];
};

export type StripeRequest = RequestFields & {
  apiKey: string;
  account: string;
  apiVersion: string;
};

export type StripeResponse = {
  body: string;
  status: number;
  statusText: string;
  duration: number;
  requestId: string | null;
  apiVersion: string | null;
  path: string;
};

export function buildStripePath(fields: RequestFields): string {
  const resource = resources.find((item) => item.id === fields.resource);
  if (!resource) throw new Error("Choose a resource.");
  if (!fields.method || !methodsFor(resource).includes(fields.method)) {
    throw new Error("Choose a method for this resource.");
  }

  let path = `/v1/${resource.id}`;
  const params = new URLSearchParams();
  if (fields.method === "retrieve" && !resource.singleton) {
    const id = fields.objectId.trim();
    if (!id) throw new Error(`Enter the ${resource.singular} ID.`);
    if (id === "." || id === ".." || /[\s/?#\\]/.test(id)) {
      throw new Error(
        "The ID must not contain whitespace or URL path characters.",
      );
    }
    path += `/${encodeURIComponent(id)}`;
  }
  if (fields.method === "search") {
    if (!fields.query.trim()) throw new Error("Enter a Stripe search query.");
    path += "/search";
    params.set("query", fields.query.trim());
  }
  if (fields.method !== "retrieve") {
    const limit = Number(fields.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Results per page must be a whole number from 1 to 100.");
    }
    params.set("limit", String(limit));
    if (fields.cursor.trim()) {
      params.set(
        fields.method === "search" ? "page" : "starting_after",
        fields.cursor.trim(),
      );
    }
  }

  for (const path of normalizeExpansions(fields.expand))
    params.append("expand[]", path);
  return params.size ? `${path}?${params.toString()}` : path;
}
