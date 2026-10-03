import { apiErrorSchema } from "@aux/shared";
import { isLive, useSession } from "../stores/session";

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
  // Signed-in requests carry our session token.
  const { session } = useSession.getState();
  const token = isLive(session) ? session.token : null;
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(BASE + path, { ...init, headers });
  const body: unknown = await res.json().catch(() => null);

  // The server no longer accepts this session, so stop using it. A newer one stored meanwhile is left alone.
  if (res.status === 401 && token && useSession.getState().session?.token === token) {
    useSession.getState().clear();
  }

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

// For calls that say everything in the method and path, like saving a drop.
export function apiSend<T>(method: "POST" | "DELETE", path: string, schema: Schema<T>): Promise<T> {
  return request(path, schema, { method });
}

// For calls that answer with no body. The token is passed in because sign-out ends a session the store may already have dropped.
export function apiDelete(path: string, token: string): Promise<void> {
  return request(path, { parse: () => undefined }, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
}
