import { ApiRequestError } from "./client";

// What we tell the user for each error code the server sends. Server messages are written for developers.
const BY_CODE: Record<string, string> = {
  UNSUPPORTED_LINK: "We can only take YouTube links for now. Paste the song's YouTube link.",
  TRACK_NOT_FOUND: "We couldn't find a song at that link. Check it and try again.",
  RECORDING_UNCLEAR:
    "We couldn't tell which song that is. Try the official video, or a link from the artist's own channel.",
  RESOLVER_UNAVAILABLE: "We couldn't reach YouTube just now. Try again in a moment.",
  INVALID_BODY: "Something you entered doesn't look right. Check it and try again.",
  DROP_NOT_FOUND: "This drop doesn't exist, or it has been removed.",
  UNAUTHENTICATED: "Your session ran out. Try again in a moment, or sign in again.",
  INVALID_TOKEN: "We couldn't sign you in. Try again.",
  AUTH_UNAVAILABLE: "Sign-in isn't working right now. Try again in a moment.",
  EMAIL_REQUIRED: "You need an email address on your account to sign in.",
  EMAIL_TAKEN: "That email already belongs to another account.",
};

const OFFLINE = "We couldn't connect. Check your internet and try again.";
const UNKNOWN = "Something went wrong on our side. Try again in a moment.";

export function friendlyError(error: unknown): string {
  if (error instanceof ApiRequestError) return BY_CODE[error.code] ?? UNKNOWN;
  // fetch rejects with a TypeError when the request never reached the server.
  if (error instanceof TypeError) return OFFLINE;
  return UNKNOWN;
}
