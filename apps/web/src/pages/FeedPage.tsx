import { useFeed } from "../api/drops";
import { AUTH_ENABLED } from "../auth/AuthProvider";
import { DropComposer } from "../components/DropComposer";
import { DropList } from "../components/DropList";

export function FeedPage() {
  return (
    <>
      {AUTH_ENABLED && <DropComposer />}
      <DropList query={useFeed()} empty="No drops yet." />
    </>
  );
}
