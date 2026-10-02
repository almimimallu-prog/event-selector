"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AppEvent, DismissReason, UserState } from "@/lib/types";

type Mark = { state: UserState | null; reason: DismissReason | null; note: string | null };

/** Marques ⭐ / ✅ / ✕ amb actualització optimista. `demo` = sense Supabase (vista prèvia de desenvolupament). */
export function useMarks(events: AppEvent[], demo = false) {
  const [overrides, setOverrides] = useState<Record<string, Mark>>({});
  const [error, setError] = useState<string | null>(null);

  const withMarks = events.map((e) => {
    const o = overrides[e.id];
    return o ? { ...e, user_state: o.state, dismiss_reason: o.reason, note: o.note } : e;
  });

  const save = useCallback(
    async (event: AppEvent, mark: Mark) => {
      const previous = overrides[event.id];
      setOverrides((m) => ({ ...m, [event.id]: mark }));
      if (demo) return;
      const supabase = createClient();
      const { error } = mark.state
        ? await supabase.from("user_events").upsert({
            event_id: event.id, state: mark.state, dismiss_reason: mark.reason, note: mark.note,
          })
        : await supabase.from("user_events").delete().eq("event_id", event.id);
      if (error) {
        setOverrides((m) => {
          const next = { ...m };
          if (previous) next[event.id] = previous;
          else delete next[event.id];
          return next;
        });
        setError("No s'ha pogut desar. Torna-ho a provar.");
      } else {
        setError(null);
      }
    },
    [demo, overrides],
  );

  /** Mateix estat dues vegades = treure la marca. */
  const toggle = useCallback(
    (event: AppEvent, state: "interested" | "going") =>
      save(event, { state: event.user_state === state ? null : state, reason: null, note: event.note }),
    [save],
  );

  const dismiss = useCallback(
    (event: AppEvent, reason: DismissReason | null) => save(event, { state: "dismissed", reason, note: event.note }),
    [save],
  );

  const setNote = useCallback(
    (event: AppEvent, note: string) =>
      event.user_state && save(event, { state: event.user_state, reason: event.dismiss_reason, note: note || null }),
    [save],
  );

  return { events: withMarks, toggle, dismiss, setNote, error };
}
