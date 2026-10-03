-- Aprenentatge a partir de les marques de l'usuari (⭐ / ✅ / ✕ + motiu), calculat sempre des de l'historial:
-- si es desmarca un esdeveniment, l'aprenentatge es desfà sol. L'app ho combina amb els interessos manuals.
--   categories / tags: {nom: {pos, neg}}   pos = ⭐ o ✅, neg = ✕ "no m'interessa el tema"
--   far_km:        a partir d'aquesta distància (a la zona principal) els plans et semblen lluny
--   expensive_eur: a partir d'aquest preu et semblen cars
--   bad_slots:     {"dia-franja": n} franges (1-7 ISO; mati / tarda / nit) descartades per "mal horari"
create or replace function app_learning()
returns jsonb
language sql stable security invoker as $$
  with marks as (
    select ue.state, ue.dismiss_reason, e.category, e.tags, e.price_min, e.start_at, e.all_day, e.kind,
           -- distància a la zona principal (la primera activa): "massa lluny" és lluny de casa
           (select extensions.st_distance(e.geo, z.center) / 1000
              from user_zones z where z.active and e.geo is not null
             order by z.sort_order, z.created_at limit 1) as km,
           e.start_at at time zone 'Europe/Madrid' as local_start
      from user_events ue
      join events e on e.id = ue.event_id
  )
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_object_agg(category, jsonb_build_object('pos', pos, 'neg', neg))
        from (select category,
                     count(*) filter (where state in ('interested', 'going')) as pos,
                     count(*) filter (where state = 'dismissed' and dismiss_reason = 'topic') as neg
                from marks group by category) c
       where pos + neg > 0), '{}'::jsonb),
    'tags', coalesce((
      select jsonb_object_agg(tag, jsonb_build_object('pos', pos, 'neg', neg))
        from (select lower(tag) as tag,
                     count(*) filter (where state in ('interested', 'going')) as pos,
                     count(*) filter (where state = 'dismissed' and dismiss_reason = 'topic') as neg
                from marks, unnest(tags) as tag group by lower(tag)) t
       where pos + neg > 0), '{}'::jsonb),
    'far_km', (select percentile_cont(0.25) within group (order by km)
                 from marks where dismiss_reason = 'too_far' and km is not null having count(*) >= 2),
    'expensive_eur', (select percentile_cont(0.25) within group (order by price_min)
                        from marks where dismiss_reason = 'too_expensive' and price_min > 0 having count(*) >= 2),
    'bad_slots', coalesce((
      select jsonb_object_agg(slot, n)
        from (select extract(isodow from local_start)::int || '-' ||
                     case when extract(hour from local_start) < 14 then 'mati'
                          when extract(hour from local_start) < 20 then 'tarda' else 'nit' end as slot,
                     count(*) as n
                from marks
               where dismiss_reason = 'bad_time' and not all_day and kind = 'session'
               group by 1) s), '{}'::jsonb)
  )
$$;

revoke execute on function app_learning() from public, anon;
grant execute on function app_learning() to authenticated;
