import { useState, type FormEvent } from "react";
import { HANDLE_MAX, type Me } from "@aux/shared";
import { friendlyError } from "../api/errors";
import { checkHandle, tidyHandle, useUpdateHandle } from "../api/users";

type Props = {
  current: string;
  onChanged(me: Me): void;
};

// Lets you pick a new handle. Shown on your own profile only.
export function HandleForm({ current, onChanged }: Props) {
  const update = useUpdateHandle(onChanged);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(current);
  const [problem, setProblem] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="handle-edit" onClick={() => setOpen(true)}>
        Change handle
      </button>
    );
  }

  const close = () => {
    setOpen(false);
    setTyped(current);
    setProblem(null);
    update.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const handle = tidyHandle(typed);
    if (handle === current) return close();
    const invalid = checkHandle(handle);
    setProblem(invalid);
    if (invalid) return;
    update.mutate(handle);
  };

  const message = problem ?? (update.isError ? friendlyError(update.error) : null);

  return (
    <form className="handle-form" onSubmit={submit} noValidate>
      <label>
        New handle
        <input
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setProblem(null);
            update.reset();
          }}
          maxLength={HANDLE_MAX + 1}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
        />
      </label>
      <p className="meta">
        Letters, numbers and underscores. Links to your old profile will stop working, and someone else can take your
        old handle.
      </p>
      <div className="handle-form-footer">
        <button type="button" onClick={close} disabled={update.isPending}>
          Cancel
        </button>
        <button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save"}
        </button>
      </div>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
