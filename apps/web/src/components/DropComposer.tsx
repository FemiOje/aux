import { useState, type FormEvent } from "react";
import { useCreateDrop } from "../api/drops";
import { friendlyError } from "../api/errors";
import { isLive, useSession } from "../stores/session";

const NOTE_MAX = 280;

// What's wrong with the form before we send it, in words the user can act on.
export function checkDrop(link: string, note: string): string | null {
  if (!link) return "Paste a link to the song.";
  if (!URL.canParse(link)) return "That doesn't look like a link. Copy it from YouTube's Share button and paste it here.";
  if (!note) return "Add a short note about why you're sharing this song.";
  if (note.length > NOTE_MAX) return `Your note is too long. Keep it to ${NOTE_MAX} characters.`;
  return null;
}

export function DropComposer() {
  const session = useSession((s) => s.session);
  const create = useCreateDrop();
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  if (!isLive(session)) return <p className="meta composer-hint">Sign in to post a song.</p>;

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    setProblem(null);
    create.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const drop = { link: link.trim(), note: note.trim() };
    const invalid = checkDrop(drop.link, drop.note);
    setProblem(invalid);
    if (invalid) return;
    create.mutate(drop, {
      onSuccess: () => {
        setLink("");
        setNote("");
      },
    });
  };

  const message = problem ?? (create.isError ? friendlyError(create.error) : null);

  return (
    <form className="composer" onSubmit={submit} noValidate>
      <label>
        Song link
        <input
          type="url"
          value={link}
          onChange={(e) => edit(setLink)(e.target.value)}
          placeholder="Paste a YouTube link"
          autoComplete="off"
        />
      </label>
      <label>
        Your note
        <textarea
          value={note}
          onChange={(e) => edit(setNote)(e.target.value)}
          placeholder="Why this song?"
          maxLength={NOTE_MAX}
          rows={2}
        />
      </label>
      <div className="composer-footer">
        <span className="meta">
          {note.length}/{NOTE_MAX}
        </span>
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? "Posting…" : "Post"}
        </button>
      </div>
      {message && <p role="alert">{message}</p>}
      {create.isSuccess && <p role="status">Posted. It's at the top of the feed.</p>}
    </form>
  );
}
