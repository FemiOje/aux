import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { HANDLE_MAX, HANDLE_MIN, meSchema, profileSchema, type Me, type Profile } from "@aux/shared";
import { useSession } from "../stores/session";
import { apiGet, apiPatch } from "./client";

// Where someone's profile page lives in the app.
export const profilePath = (handle: string) => `/users/${encodeURIComponent(handle)}`;

export function useProfile(handle: string) {
  return useQuery({
    queryKey: ["profile", handle],
    queryFn: () => apiGet(`/users/${encodeURIComponent(handle)}`, profileSchema),
    retry: false,
  });
}

// A handle the way we store it. People often type the @ and capitals.
export const tidyHandle = (typed: string) => typed.trim().replace(/^@/, "").toLowerCase();

// What's wrong with a tidied handle before we send it, in words the user can act on.
export function checkHandle(handle: string): string | null {
  if (!handle) return "Type the handle you'd like.";
  if (!/^[a-z0-9_]*$/.test(handle)) return "Handles can only have letters, numbers and underscores (_). No spaces.";
  if (handle.length < HANDLE_MIN) return `That handle is too short. Use at least ${HANDLE_MIN} characters.`;
  if (handle.length > HANDLE_MAX) return `That handle is too long. Keep it to ${HANDLE_MAX} characters.`;
  return null;
}

// Changes the signed-in user's handle, and has the header and every later request use the new one.
export async function updateHandle(handle: string): Promise<Me> {
  const me = await apiPatch("/me", { handle }, meSchema);
  useSession.getState().setUser(me);
  return me;
}

// What a change of handle does to what we hold, split out so it can be tested without React.
// Nothing here waits on the network: the caller moves to the new profile address straight after.
export function afterHandleChange(queryClient: QueryClient, me: Me) {
  // Every drop of theirs we hold still shows the old handle.
  for (const key of ["feed", "saved", "drop"]) void queryClient.invalidateQueries({ queryKey: [key] });
  // The old profile no longer exists, so asking for it again would only put "not found" on the page we are leaving.
  // Marked out of date instead, and asked for again only if someone opens it.
  for (const key of ["profile", "dropsBy"]) {
    void queryClient.invalidateQueries({ queryKey: [key], refetchType: "none" });
  }
  // The new profile is known already, so it shows without a loading step.
  queryClient.setQueryData<Profile>(["profile", me.handle], { handle: me.handle, createdAt: me.createdAt });
}

// onChanged is given here, not to mutate(): the form that starts the change sits on your own profile, and the
// page stops being your own the moment the session has the new handle. A callback given to mutate() is dropped
// when its component goes away, so the move to the new address would never happen.
export const handleMutation = (queryClient: QueryClient, onChanged: (me: Me) => void) => ({
  mutationFn: updateHandle,
  onSuccess: (me: Me) => {
    afterHandleChange(queryClient, me);
    onChanged(me);
  },
});

export function useUpdateHandle(onChanged: (me: Me) => void) {
  return useMutation(handleMutation(useQueryClient(), onChanged));
}
