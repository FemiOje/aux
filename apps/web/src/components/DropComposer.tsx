import { useState, type FormEvent } from "react";
import type { CreateDrop, Recording } from "@aux/shared";
import { useCreateDrop } from "../api/drops";
import { friendlyError } from "../api/errors";
import { isLive, useSession } from "../stores/session";

const NOTE_MAX = 280;

// What's wrong with the form before we send it, in words the user can act on.
export function checkDrop(link: string, note: string): string | null {
  if (!link) return "Paste a link to the song.";
  if (!URL.canParse(link)) return "That doesn't look like a link. Copy it from YouTube's Share button and paste it here.";
  return checkNote(note);
}

// The note is checked on its own when the user picks a song, because the link has already been sent by then.
export function checkNote(note: string): string | null {
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
  // The songs an unclear link might be. The user taps one to finish posting.
  const [choices, setChoices] = useState<Recording[] | null>(null);

  if (!isLive(session)) return <p className="meta composer-hint">Sign in to post a song.</p>;

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    setProblem(null);
    create.reset();
  };

  const post = (drop: CreateDrop) =>
    create.mutate(drop, {
      onSuccess: (result) => {
        if ("matches" in result) return setChoices(result.matches);
        setLink("");
        setNote("");
        setChoices(null);
      },
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const drop = { link: link.trim(), note: note.trim() };
    const invalid = checkDrop(drop.link, drop.note);
    setProblem(invalid);
    if (invalid) return;
    setChoices(null);
    post(drop);
  };

  const pick = (recording: Recording) => {
    const invalid = checkNote(note.trim());
    setProblem(invalid);
    if (invalid) return;
    post({ recordingId: recording.id, note: note.trim() });
  };

  // A new link is a new question, so the old answers go.
  const editLink = (value: string) => {
    setChoices(null);
    edit(setLink)(value);
  };

  const posted = create.isSuccess && "drop" in create.data;
  const message = problem ?? (create.isError ? friendlyError(create.error) : null);

  return (
    <form className="composer" onSubmit={submit} noValidate>
      <label>
        Song link
        <input
          type="url"
          value={link}
          onChange={(e) => editLink(e.target.value)}
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
      {choices && (
        <div className="composer-choices" role="group" aria-labelledby="composer-choices-title">
          <p id="composer-choices-title">We're not sure which song that is. Tap the right one to post it.</p>
          <ul>
            {choices.map((recording) => (
              <li key={recording.id}>
                <button type="button" onClick={() => pick(recording)} disabled={create.isPending}>
                  {recording.title} <span className="artist">by {recording.artist}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="meta">Not here? Try the official video, or a link from the artist's own channel.</p>
        </div>
      )}
      {message && <p role="alert">{message}</p>}
      {posted && <p role="status">Posted.</p>}
    </form>
  );
}
