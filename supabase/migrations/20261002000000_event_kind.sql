-- Tipus d'esdeveniment (decisió 2026-10-02):
--   session      → dia i hora concrets: calendari i llista del dia
--   long_running → exposicions i similars: pestanya/filtre propi, no a la llista del dia
--   course       → cursos amb inscripció a totes les sessions: secció "Cursos" (start_at = propera sessió)

create type event_kind as enum ('session', 'long_running', 'course');

alter table events
  add column kind event_kind not null default 'session',
  add column schedule_text text; -- horari llegible ("Dilluns de 10.30 h a 12 h (fins al 14/12)")

drop index events_start;
create index events_start on events (start_at) where status in ('published', 'maybe_cancelled') and kind = 'session';
create index events_kind_end on events (kind, end_at) where kind <> 'session';
