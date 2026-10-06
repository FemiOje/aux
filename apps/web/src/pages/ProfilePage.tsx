import { Link, useNavigate, useParams } from "react-router";
import type { Profile } from "@aux/shared";
import { useDropsBy } from "../api/drops";
import { friendlyError } from "../api/errors";
import { profilePath, useProfile } from "../api/users";
import { DropList } from "../components/DropList";
import { HandleForm } from "../components/HandleForm";
import { isLive, useSession } from "../stores/session";

// "October 2026", in the reader's own language.
const joined = (createdAt: string) =>
  new Date(createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });

function ProfileDrops({ profile, own }: { profile: Profile; own: boolean }) {
  const drops = useDropsBy(profile.handle);
  const empty = own
    ? "You haven't posted any drops yet. Post a song from the feed and it will show up here."
    : `@${profile.handle} hasn't posted any drops yet.`;
  return <DropList query={drops} empty={empty} />;
}

export function ProfilePage() {
  const { handle = "" } = useParams();
  const navigate = useNavigate();
  const { data: profile, error, status } = useProfile(handle);
  const own = useSession((s) => isLive(s.session) && s.session.user.handle === profile?.handle);

  if (status === "pending") return <p>Loading…</p>;
  if (status === "error") {
    return (
      <>
        <p role="alert">{friendlyError(error)}</p>
        <Link to="/">Back to the feed</Link>
      </>
    );
  }

  return (
    <>
      <div className="profile">
        <h1>@{profile.handle}</h1>
        <p className="meta">Joined {joined(profile.createdAt)}</p>
        {own && (
          // The profile lives at the handle, so a new handle means a new address.
          <HandleForm
            key={profile.handle}
            current={profile.handle}
            onChanged={(me) => navigate(profilePath(me.handle), { replace: true })}
          />
        )}
      </div>
      <ProfileDrops profile={profile} own={own} />
    </>
  );
}
