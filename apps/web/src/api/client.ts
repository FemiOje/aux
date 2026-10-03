import { apiErrorSchema } from "@aux/shared";

// Vite proxies /api to the server in dev and strips the prefix.
const BASE = "/api";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Schema<T> = { parse(data: unknown): T };

async function request<T>(path: string, schema: Schema<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiRequestError(res.status, "UNKNOWN", `Request failed (${res.status})`);
  }
  return schema.parse(body);
}

export function apiGet<T>(path: string, schema: Schema<T>): Promise<T> {
  return request(path, schema);
}

export function apiPost<T>(path: string, body: unknown, schema: Schema<T>): Promise<T> {
  return request(path, schema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
