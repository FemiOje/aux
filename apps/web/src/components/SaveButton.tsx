import type { Drop } from "@aux/shared";
import { useToggleSave } from "../api/drops";
import { friendlyError } from "../api/errors";
import { isLive, useSession } from "../stores/session";

export function SaveButton({ drop }: { drop: Drop }) {
  const session = useSession((s) => s.session);
  const toggle = useToggleSave();

  // Saving needs an account.
  if (!isLive(session)) return null;

  return (
    <>
      <button className="save" onClick={() => toggle.mutate(drop)} disabled={toggle.isPending} aria-pressed={drop.saved}>
        {drop.saved ? "Saved" : "Save"}
      </button>
      {toggle.isError && <p role="alert">{friendlyError(toggle.error)}</p>}
    </>
  );
}
