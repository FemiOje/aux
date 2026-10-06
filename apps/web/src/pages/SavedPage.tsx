import { useSaved } from "../api/drops";
import { DropList } from "../components/DropList";
import { isLive, useSession } from "../stores/session";

export function SavedPage() {
  const signedIn = useSession((s) => isLive(s.session));
  const saved = useSaved();

  return (
    <>
      <h1>Saved</h1>
      {signedIn ? (
        <DropList query={saved} empty="You haven't saved any drops yet. Tap Save on a drop to keep it here." />
      ) : (
        <p>Sign in to see the drops you've saved.</p>
      )}
    </>
  );
}
