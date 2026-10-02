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

export async function apiGet<T>(path: string, schema: { parse(data: unknown): T }): Promise<T> {
  const res = await fetch(BASE + path);
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiRequestError(res.status, "UNKNOWN", `Request failed (${res.status})`);
  }
  return schema.parse(body);
}
