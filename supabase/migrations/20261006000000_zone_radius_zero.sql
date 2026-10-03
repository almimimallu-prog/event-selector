-- Selecció geogràfica simplificada: municipis amb un radi de 0 a 200 km (0 = només el municipi).
alter table user_zones drop constraint if exists user_zones_radius_km_check;
alter table user_zones add constraint user_zones_radius_km_check check (radius_km >= 0 and radius_km <= 200);

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
       order by extensions.st_distance(e.geo, zones.center) / 1000 / greatest(zones.radius_km, 1)
       limit 1
    ) z on true
   where e.kind = p_kind
     and e.status in ('published', 'maybe_cancelled')
     and case when p_kind = 'session' then e.start_at >= p_from and e.start_at < p_to
              else e.start_at < p_to and coalesce(e.end_at, 'infinity') >= p_from end
     -- Dins d'alguna zona activa (els que no tenen ubicació es mostren igualment). Radi 0 = només el municipi:
     -- coincideix pel nom o per ser a menys d'1 km del centre (esdeveniments situats pel municipi).
     and (e.geo is null
          or exists (select 1 from zones zz
                      where extensions.st_dwithin(e.geo, zz.center, greatest(zz.radius_km, 0) * 1000)
                         or (zz.radius_km = 0 and (lower(coalesce(e.city, v.city)) = lower(zz.name)
                                                    or extensions.st_dwithin(e.geo, zz.center, 1000)))))
     -- "Els meus plans": només ⭐ i ✅.
     and (not p_mine or ue.state in ('interested', 'going'))
   order by e.start_at
$$;
