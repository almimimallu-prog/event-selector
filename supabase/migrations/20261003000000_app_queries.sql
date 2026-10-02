-- Consultes de l'app web (s'executen amb els permisos de l'usuari: RLS aplicada).

-- Esdeveniments d'un tipus dins d'un interval, ja preparats per a la UI i el rànquing:
-- coordenades, local, fonts, estat personal i distància a la zona activa més propera.
-- p_mine = només els marcats amb ⭐ o ✅.
--   session      → comencen dins [p_from, p_to)
--   long_running / course → en curs en algun moment de l'interval
create or replace function app_events(p_from timestamptz, p_to timestamptz, p_kind event_kind default 'session',
                                      p_mine boolean default false)
returns table (
  id uuid, title text, summary_ca text, description text, start_at timestamptz, end_at timestamptz,
  all_day boolean, kind event_kind, schedule_text text, category event_category, tags text[],
  price_min numeric, price_text text, is_free boolean, registration_url text, registration_deadline date,
  url text, image_url text, series_key text, first_seen_at timestamptz, status event_status, city text,
  lat double precision, lon double precision, venue_name text, venue_wheelchair wheelchair_access,
  user_state user_event_state, dismiss_reason dismiss_reason, note text,
  sources jsonb, zone_name text, zone_km double precision, has_unseen_changes boolean
)
language sql stable security invoker as $$
  with zones as (
    select name, center, radius_km from user_zones where active
  )
  select e.id, e.title, e.summary_ca, e.description, e.start_at, e.end_at, e.all_day, e.kind, e.schedule_text,
         e.category, e.tags, e.price_min, e.price_text, e.is_free, e.registration_url, e.registration_deadline,
         e.url, e.image_url, e.series_key, e.first_seen_at, e.status, coalesce(e.city, v.city),
         extensions.st_y(e.geo::extensions.geometry), extensions.st_x(e.geo::extensions.geometry),
         v.name, v.wheelchair,
         ue.state, ue.dismiss_reason, ue.note,
         coalesce((select jsonb_agg(distinct jsonb_build_object('name', s.name, 'url', es.source_url))
                     from event_sources es join sources s on s.id = es.source_id
                    where es.event_id = e.id), '[]'),
         z.name, z.km,
         exists (select 1 from event_changes c where c.event_id = e.id and not c.seen)
    from events e
    left join venues v on v.id = e.venue_id
    left join user_events ue on ue.event_id = e.id
    left join lateral (
      select zones.name, extensions.st_distance(e.geo, zones.center) / 1000 as km, zones.radius_km
        from zones
       where e.geo is not null
       order by extensions.st_distance(e.geo, zones.center) / 1000 / zones.radius_km
       limit 1
    ) z on true
   where e.kind = p_kind
     and e.status in ('published', 'maybe_cancelled')
     and case when p_kind = 'session' then e.start_at >= p_from and e.start_at < p_to
              else e.start_at < p_to and coalesce(e.end_at, 'infinity') >= p_from end
     -- Dins d'alguna zona activa (els que no tenen ubicació es mostren igualment).
     and (e.geo is null or z.km <= z.radius_km)
     -- "Els meus plans": només ⭐ i ✅.
     and (not p_mine or ue.state in ('interested', 'going'))
   order by e.start_at
$$;

-- Sessions del mateix cicle ("Altres sessions").
create or replace function app_series(p_series_key text)
returns table (id uuid, start_at timestamptz, all_day boolean)
language sql stable security invoker as $$
  select id, start_at, all_day from events
   where series_key = p_series_key and status in ('published', 'maybe_cancelled') and start_at >= now()
   order by start_at
   limit 12
$$;

revoke execute on function app_events(timestamptz, timestamptz, event_kind, boolean) from public, anon;
revoke execute on function app_series(text) from public, anon;
grant execute on function app_events(timestamptz, timestamptz, event_kind, boolean) to authenticated;
grant execute on function app_series(text) to authenticated;
