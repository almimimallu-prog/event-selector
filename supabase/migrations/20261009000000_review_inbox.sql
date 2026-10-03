-- Safata "Per revisar": possibles duplicats i esdeveniments que el pipeline no ha publicat directament.

-- Possibles duplicats pendents d'esdeveniments que encara no han passat, amb les dades per comparar-los.
create or replace function app_duplicates()
returns table (id bigint, score real, a jsonb, b jsonb)
language sql stable security invoker as $$
  with ev as (
    select e.id,
           jsonb_build_object(
             'id', e.id, 'title', e.title, 'start_at', e.start_at, 'all_day', e.all_day,
             'city', coalesce(e.city, v.city), 'venue', v.name, 'url', e.url, 'summary', e.summary_ca,
             'marked', exists (select 1 from user_events u where u.event_id = e.id),
             'sources', coalesce((select jsonb_agg(distinct s.name) from event_sources es
                                   join sources s on s.id = es.source_id where es.event_id = e.id), '[]')
           ) as data
      from events e
      left join venues v on v.id = e.venue_id
     where e.status in ('published', 'maybe_cancelled', 'review')
       and coalesce(e.end_at, e.start_at) >= date_trunc('day', now())
  )
  select d.id, d.score, a.data, b.data
    from duplicate_candidates d
    join ev a on a.id = d.event_a
    join ev b on b.id = d.event_b
   where d.status = 'pending'
   order by (a.data->>'start_at'), d.score desc
$$;

-- Fusiona p_dup dins p_keep: fonts, marca personal (si p_keep no en té) i dades que hi faltin.
create or replace function app_merge_events(p_keep uuid, p_dup uuid)
returns void
language plpgsql security invoker as $$
declare
  d events;
begin
  if p_keep = p_dup then
    raise exception 'Són el mateix esdeveniment';
  end if;
  select * into d from events where id = p_dup;
  if not found then
    raise exception 'L''esdeveniment ja no existeix';
  end if;
  update events set
    image_url = coalesce(image_url, d.image_url),
    url = coalesce(url, d.url),
    registration_url = coalesce(registration_url, d.registration_url),
    summary_ca = coalesce(summary_ca, d.summary_ca),
    description = coalesce(description, d.description),
    price_min = coalesce(price_min, d.price_min),
    price_text = coalesce(price_text, d.price_text),
    venue_id = coalesce(venue_id, d.venue_id),
    geo = coalesce(geo, d.geo),
    city = coalesce(city, d.city),
    tags = (select coalesce(array_agg(distinct t), '{}') from unnest(tags || d.tags) t)
   where id = p_keep;
  update event_sources set event_id = p_keep
   where event_id = p_dup
     and raw_item_id not in (select raw_item_id from event_sources where event_id = p_keep);
  if not exists (select 1 from user_events where event_id = p_keep) then
    update user_events set event_id = p_keep where event_id = p_dup;
  end if;
  delete from events where id = p_dup;  -- en cascada: candidats, canvis i la resta d'enllaços
end;
$$;

-- "Són diferents": no es tornarà a proposar.
create or replace function app_resolve_duplicate(p_id bigint, p_status duplicate_status)
returns void
language sql security invoker as $$
  update duplicate_candidates set status = p_status where id = p_id
$$;

revoke execute on function app_duplicates() from public, anon;
revoke execute on function app_merge_events(uuid, uuid) from public, anon;
revoke execute on function app_resolve_duplicate(bigint, duplicate_status) from public, anon;
grant execute on function app_duplicates() to authenticated;
grant execute on function app_merge_events(uuid, uuid) to authenticated;
grant execute on function app_resolve_duplicate(bigint, duplicate_status) to authenticated;

-- Els que només anaven a revisió per "sense lloc" però tenen municipi (de la font): es publiquen.
update events set status = 'published', review_reasons = '{}'
 where status = 'review' and review_reasons = '{sense lloc}' and city is not null;

-- ─── Plans afegits a mà ("Afegir un pla") ───────────────────────────────────
-- Crea l'esdeveniment amb la font "Afegits a mà" i el marca (⭐ o ✅). p: title, start_at, end_at, all_day,
-- category, city, lat, lon, venue_name, url, price_text, note, state.
create or replace function app_add_event(p jsonb)
returns uuid
language plpgsql security invoker as $$
declare
  s_id uuid;
  r_id uuid;
  e_id uuid;
  v_start timestamptz := (p->>'start_at')::timestamptz;
begin
  select id into s_id from sources where type = 'manual' and name = 'Afegits a mà' limit 1;
  if s_id is null then
    insert into sources (name, type, status, discovered_via) values ('Afegits a mà', 'manual', 'paused', 'manual')
    returning id into s_id;  -- pausada: el pipeline no l'ha de llegir
  end if;
  insert into raw_items (source_id, external_id, url, content_hash, payload, status, processed_at)
  values (s_id, 'manual:' || gen_random_uuid(), nullif(p->>'url', ''), md5(p::text), p, 'done', now())
  returning id into r_id;
  insert into events (title, start_at, end_at, all_day, kind, category, city, geo, venue_id, url, price_text,
                      fingerprint, status, confidence)
  values (btrim(p->>'title'), v_start, nullif(p->>'end_at', '')::timestamptz, coalesce((p->>'all_day')::boolean, false),
          'session', (p->>'category')::event_category, nullif(p->>'city', ''),
          make_point((p->>'lat')::float8, (p->>'lon')::float8),
          get_or_create_venue(nullif(p->>'venue_name', ''), null, nullif(p->>'city', ''),
                              (p->>'lat')::float8, (p->>'lon')::float8),
          nullif(p->>'url', ''), nullif(p->>'price_text', ''),
          event_fingerprint(p->>'title', v_start, 'session'), 'published', 1)
  returning id into e_id;
  insert into event_sources (event_id, raw_item_id, source_id, source_url) values (e_id, r_id, s_id, nullif(p->>'url', ''));
  insert into user_events (event_id, state, note)
  values (e_id, coalesce(nullif(p->>'state', ''), 'interested')::user_event_state, nullif(p->>'note', ''));
  return e_id;
end;
$$;

revoke execute on function app_add_event(jsonb) from public, anon;
grant execute on function app_add_event(jsonb) to authenticated;

-- La funció de locals la feia servir només el pipeline; ara també "Afegir un pla".
grant execute on function get_or_create_venue(text, text, text, double precision, double precision) to authenticated;
