-- Event Selector — esquema inicial
-- App d'un sol usuari: les taules personals (user_*) no porten user_id.
-- Accés: el pipeline fa servir la service_role (salta RLS); l'app web, l'usuari autenticat.
-- IMPORTANT: a Supabase → Authentication → desactivar "Allow new users to sign up".

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ─── Tipus ──────────────────────────────────────────────────────────────────

create type source_type as enum ('api', 'ics', 'rss', 'web', 'instagram', 'telegram', 'email', 'manual');
create type source_status as enum ('active', 'paused', 'proposed', 'rejected');
create type run_status as enum ('running', 'ok', 'not_modified', 'error');
create type raw_item_status as enum ('pending', 'done', 'skipped', 'review', 'error');
create type event_category as enum ('cultura', 'esport_natura', 'formacio_tech', 'gastronomia_social');
-- review: safata "Per revisar" (no surt al feed); maybe_cancelled: ha desaparegut d'una font completa
create type event_status as enum ('published', 'review', 'maybe_cancelled', 'cancelled', 'rejected');
create type wheelchair_access as enum ('yes', 'limited', 'no', 'unknown');
create type user_event_state as enum ('interested', 'going', 'dismissed');
create type dismiss_reason as enum ('topic', 'too_far', 'bad_time', 'too_expensive', 'bad_data');
create type duplicate_status as enum ('pending', 'merged', 'distinct');

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ─── Locals ─────────────────────────────────────────────────────────────────

create table venues (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  aliases       text[] not null default '{}',
  address       text,
  city          text,
  geo           extensions.geography(point, 4326),
  osm_id        text,
  wheelchair    wheelchair_access not null default 'unknown',
  has_parking   boolean,
  transit_nearby boolean,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index venues_name_trgm on venues using gin (name extensions.gin_trgm_ops);
create index venues_geo on venues using gist (geo);
create trigger venues_updated_at before update on venues for each row execute function set_updated_at();

-- ─── Fonts ──────────────────────────────────────────────────────────────────

create table sources (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  type                 source_type not null,
  url                  text,               -- web, feed, API
  handle               text,               -- @perfil d'Instagram, canal de Telegram, etiqueta de Gmail
  config               jsonb not null default '{}',
  status               source_status not null default 'active',
  needs_js             boolean not null default false,
  schedule_hours       integer not null default 24 check (schedule_hours > 0),
  next_run_at          timestamptz not null default now(),
  default_venue_id     uuid references venues (id) on delete set null,
  default_category     event_category,
  default_city         text,
  is_complete_listing  boolean not null default false, -- si desapareix un esdeveniment → maybe_cancelled
  discovered_via       text,               -- 'seed' | 'trail' | 'search' | 'forward' | 'manual'
  discovery_note       text,               -- previsualització per a "Fonts proposades"
  consecutive_failures integer not null default 0,
  last_run_at          timestamptz,
  last_success_at      timestamptz,
  last_error           text,
  etag                 text,
  last_modified        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (url is not null or handle is not null or type = 'manual')
);
create unique index sources_url_unique on sources (url) where url is not null;
create unique index sources_handle_unique on sources (type, handle) where handle is not null;
create index sources_due on sources (next_run_at) where status = 'active';
create trigger sources_updated_at before update on sources for each row execute function set_updated_at();

create table scrape_runs (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references sources (id) on delete cascade,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         run_status not null default 'running',
  items_found    integer not null default 0,
  items_new      integer not null default 0,
  events_created integer not null default 0,
  events_updated integer not null default 0,
  llm_calls      integer not null default 0,
  error          text,
  snapshot_path  text                  -- còpia de la pàgina si ha fallat (botó "Re-processar")
);
create index scrape_runs_source on scrape_runs (source_id, started_at desc);

-- ─── Contingut brut ─────────────────────────────────────────────────────────

create table raw_items (
  id                uuid primary key default gen_random_uuid(),
  source_id         uuid references sources (id) on delete cascade, -- null = reenviat (bot / Share)
  external_id       text,               -- id del post, UID de l'ICS, URL de la fitxa...
  url               text,
  content_hash      text not null,
  payload           jsonb not null default '{}',
  media_urls        text[] not null default '{}',
  fetched_at        timestamptz not null default now(),
  processed_at      timestamptz,
  status            raw_item_status not null default 'pending',
  extractor_version text,
  error             text
);
create unique index raw_items_source_external on raw_items (source_id, external_id) where external_id is not null;
create index raw_items_pending on raw_items (fetched_at) where status = 'pending';
create index raw_items_hash on raw_items (content_hash);

-- ─── Esdeveniments ──────────────────────────────────────────────────────────

create table events (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  description           text,
  summary_ca            text,
  start_at              timestamptz not null,
  end_at                timestamptz,
  all_day               boolean not null default false,
  venue_id              uuid references venues (id) on delete set null,
  city                  text,
  geo                   extensions.geography(point, 4326), -- còpia del local per a consultes ràpides
  price_min             numeric(8, 2) check (price_min >= 0),
  price_text            text,
  is_free               boolean,
  registration_url      text,
  registration_deadline date,
  category              event_category not null,
  tags                  text[] not null default '{}',
  accessibility_notes   text,
  image_url             text,
  url                   text,
  series_key            text,           -- sessions d'un mateix cicle ("Altres sessions")
  fingerprint           text not null,  -- títol normalitzat + dia + local (deduplicació ràpida)
  status                event_status not null default 'published',
  confidence            real,
  review_reasons        text[] not null default '{}',
  extractor_version     text,
  locked_fields         text[] not null default '{}', -- camps corregits a mà: el pipeline no els toca
  first_seen_at         timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);
create index events_start on events (start_at) where status in ('published', 'maybe_cancelled');
create index events_geo on events using gist (geo);
create index events_title_trgm on events using gin (title extensions.gin_trgm_ops);
create index events_fingerprint on events (fingerprint);
create index events_series on events (series_key) where series_key is not null;
create index events_review on events (first_seen_at) where status = 'review';
create trigger events_updated_at before update on events for each row execute function set_updated_at();

-- Un esdeveniment pot arribar per N fonts.
create table event_sources (
  event_id    uuid not null references events (id) on delete cascade,
  raw_item_id uuid not null references raw_items (id) on delete cascade,
  source_id   uuid references sources (id) on delete set null,
  source_url  text,
  first_seen_at timestamptz not null default now(),
  primary key (event_id, raw_item_id)
);
create index event_sources_source on event_sources (source_id);

-- Historial de canvis (distintiu ⚠ als plans "Hi vaig").
create table event_changes (
  id         bigint generated always as identity primary key,
  event_id   uuid not null references events (id) on delete cascade,
  field      text not null,
  old_value  text,
  new_value  text,
  changed_at timestamptz not null default now(),
  seen       boolean not null default false
);
create index event_changes_unseen on event_changes (event_id) where not seen;

-- Parelles amb puntuació 0.6–0.8: "Possibles duplicats".
create table duplicate_candidates (
  id         bigint generated always as identity primary key,
  event_a    uuid not null references events (id) on delete cascade,
  event_b    uuid not null references events (id) on delete cascade,
  score      real not null,
  status     duplicate_status not null default 'pending',
  created_at timestamptz not null default now(),
  check (event_a < event_b),
  unique (event_a, event_b)
);

-- ─── Dades personals (un sol usuari) ────────────────────────────────────────

create table user_events (
  event_id       uuid primary key references events (id) on delete cascade,
  state          user_event_state not null,
  dismiss_reason dismiss_reason,
  note           text,
  updated_at     timestamptz not null default now(),
  check (dismiss_reason is null or state = 'dismissed')
);
create index user_events_state on user_events (state);
create trigger user_events_updated_at before update on user_events for each row execute function set_updated_at();

create table user_zones (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  center     extensions.geography(point, 4326) not null,
  radius_km  numeric(5, 1) not null check (radius_km > 0),
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Fila única (id = 1). Els pesos s'aprenen de ⭐ / ✅ / ✕ + motiu.
create table user_prefs (
  id                smallint primary key default 1 check (id = 1),
  category_weights  jsonb not null default '{}',
  tag_weights       jsonb not null default '{}',
  -- Franges: [{"days": [1..7] ISO, "from": "HH:MM", "to": "HH:MM", "weight": 0..1}]; fora de franja → default_weight
  availability      jsonb not null default '[]',
  default_availability_weight real not null default 0.2,
  price_sensitivity real not null default 0.5,
  blocked_tags      text[] not null default '{}',
  updated_at        timestamptz not null default now()
);
create trigger user_prefs_updated_at before update on user_prefs for each row execute function set_updated_at();

-- ─── Control de quota LLM ───────────────────────────────────────────────────

create table llm_usage (
  day           date not null default current_date,
  provider      text not null,          -- 'gemini' | 'groq'
  calls         integer not null default 0,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (day, provider)
);

-- ─── Seguretat (RLS) ────────────────────────────────────────────────────────
-- L'usuari autenticat (l'únic, amb registres desactivats) té accés complet.
-- El rol anon no té cap política → no veu res.

do $$
declare t text;
begin
  foreach t in array array[
    'venues', 'sources', 'scrape_runs', 'raw_items', 'events', 'event_sources', 'event_changes',
    'duplicate_candidates', 'user_events', 'user_zones', 'user_prefs', 'llm_usage'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy owner_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
