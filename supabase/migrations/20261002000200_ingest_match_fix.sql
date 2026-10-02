-- Correcció 2026-10-02: la fusió automàtica exigeix títol + hora + lloc (abans n'hi havia prou amb títol i dia).
-- Títol igual però hora o lloc diferents → "possibles duplicats" (puntuació 0.6–0.8), no fusió.

create or replace function ingest_events(p_source_id uuid, p_items jsonb) returns jsonb
language plpgsql as $$
declare
  it jsonb;
  r_id uuid;
  r_hash text;
  e_id uuid;
  e_old events%rowtype;
  v_id uuid;
  v_geo extensions.geography;
  v_start timestamptz;
  v_end timestamptz;
  v_kind event_kind;
  v_fp text;
  v_title text;
  best_id uuid;
  best_score real;
  n_unchanged int := 0; n_created int := 0; n_merged int := 0; n_updated int := 0; n_dupes int := 0;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    best_id := null;
    best_score := 0;
    -- 1. Contingut brut: si no ha canviat, no hi ha res a fer.
    select id, content_hash into r_id, r_hash from raw_items
     where source_id = p_source_id and external_id = it->>'external_id';
    if r_id is not null and r_hash = it->>'content_hash' then
      n_unchanged := n_unchanged + 1;
      continue;
    end if;
    if r_id is null then
      insert into raw_items (source_id, external_id, url, content_hash, payload, status, processed_at, extractor_version)
      values (p_source_id, it->>'external_id', it->>'url', it->>'content_hash', coalesce(it->'payload', '{}'),
              'done', now(), it->>'extractor_version')
      returning id into r_id;
    else
      update raw_items set content_hash = it->>'content_hash', payload = coalesce(it->'payload', '{}'),
             url = it->>'url', fetched_at = now(), processed_at = now(), status = 'done',
             extractor_version = it->>'extractor_version'
       where id = r_id;
    end if;

    v_title := btrim(it->>'title');
    v_start := (it->>'start')::timestamptz;
    v_end := nullif(it->>'end', '')::timestamptz;
    v_kind := coalesce(it->>'kind', 'session')::event_kind;
    v_fp := event_fingerprint(v_title, v_start, v_kind);
    v_id := get_or_create_venue(it->>'venue_name', it->>'address', it->>'city',
                                (it->>'lat')::float8, (it->>'lon')::float8);
    v_geo := coalesce(make_point((it->>'lat')::float8, (it->>'lon')::float8),
                      (select geo from venues where id = v_id));

    -- 2. Ja enllaçat a un esdeveniment? Actualitzar-lo (respectant els camps corregits a mà).
    select event_id into e_id from event_sources where raw_item_id = r_id limit 1;
    if e_id is not null then
      select * into e_old from events where id = e_id;
      if e_old.start_at is distinct from v_start and not 'start_at' = any(e_old.locked_fields) then
        insert into event_changes (event_id, field, old_value, new_value)
        values (e_id, 'start_at', e_old.start_at::text, v_start::text);
      end if;
      if e_old.venue_id is distinct from v_id and v_id is not null and not 'venue_id' = any(e_old.locked_fields) then
        insert into event_changes (event_id, field, old_value, new_value)
        values (e_id, 'venue_id', e_old.venue_id::text, v_id::text);
      end if;
      if e_old.price_text is distinct from it->>'price_text' and not 'price_text' = any(e_old.locked_fields) then
        insert into event_changes (event_id, field, old_value, new_value)
        values (e_id, 'price_text', e_old.price_text, it->>'price_text');
      end if;
      update events set
        title          = case when 'title' = any(locked_fields) then title else v_title end,
        start_at       = case when 'start_at' = any(locked_fields) then start_at else v_start end,
        end_at         = case when 'end_at' = any(locked_fields) then end_at else v_end end,
        all_day        = coalesce((it->>'all_day')::boolean, all_day),
        kind           = v_kind,
        schedule_text  = it->>'schedule_text',
        venue_id       = case when 'venue_id' = any(locked_fields) then venue_id else coalesce(v_id, venue_id) end,
        city           = coalesce(it->>'city', city),
        geo            = coalesce(v_geo, geo),
        price_min      = case when 'price_min' = any(locked_fields) then price_min else (it->>'price_min')::numeric end,
        price_text     = case when 'price_text' = any(locked_fields) then price_text else it->>'price_text' end,
        is_free        = case when 'is_free' = any(locked_fields) then is_free else (it->>'is_free')::boolean end,
        registration_url = coalesce(it->>'registration_url', registration_url),
        url            = coalesce(it->>'url', url),
        image_url      = coalesce(it->>'image_url', image_url),
        description    = coalesce(it->>'description', description),
        summary_ca     = coalesce(it->>'summary_ca', summary_ca),
        fingerprint    = v_fp,
        extractor_version = it->>'extractor_version'
       where id = e_id;
      n_updated := n_updated + 1;
      continue;
    end if;

    -- 3. Esdeveniment nou per a aquesta font: és un duplicat d'un altre que ja tenim?
    -- (El fingerprint sol no basta: "Taller 'Pilates'" el mateix dia a tres centres cívics són tres activitats.)
    e_id := null;
    if true then
      select c.id, c.score into best_id, best_score from (
        -- Puntuació = 0.6·títol + 0.2·hora + 0.2·lloc. Si totes dues fonts donen hora i difereixen > 30 min,
        -- o donen ubicació a > 300 m, com a molt 0.7: "possible duplicat", mai fusió automàtica.
        select e.id,
               least(
                 0.6 * extensions.similarity(normalize_title(e.title), normalize_title(v_title))
                 + 0.2 * case when e.all_day or coalesce((it->>'all_day')::boolean, false) then 0.7 else 1 end
                 + 0.2 * case when e.geo is null or v_geo is null then 0.6 else 1 end,
                 case when not e.all_day and not coalesce((it->>'all_day')::boolean, false)
                           and abs(extract(epoch from e.start_at - v_start)) > 1800 then 0.7
                      when e.geo is not null and v_geo is not null
                           and not extensions.st_dwithin(e.geo, v_geo, 300) then 0.7
                      else 1 end
               )::real as score
          from events e
         where e.kind = v_kind
           and (e.start_at at time zone 'Europe/Madrid')::date = (v_start at time zone 'Europe/Madrid')::date
           and (e.geo is null or v_geo is null or extensions.st_dwithin(e.geo, v_geo, 2000))
           and extensions.similarity(normalize_title(e.title), normalize_title(v_title)) > 0.3
      ) c order by c.score desc limit 1;
      if best_score >= 0.8 then
        e_id := best_id;
      end if;
    end if;

    if e_id is not null then
      -- Fusió: completa els buits amb el que aporta la font nova.
      update events set
        image_url = coalesce(image_url, it->>'image_url'),
        price_min = coalesce(price_min, (it->>'price_min')::numeric),
        price_text = coalesce(price_text, it->>'price_text'),
        is_free = coalesce(is_free, (it->>'is_free')::boolean),
        registration_url = coalesce(registration_url, it->>'registration_url'),
        summary_ca = coalesce(summary_ca, it->>'summary_ca'),
        venue_id = coalesce(venue_id, v_id),
        geo = coalesce(geo, v_geo),
        start_at = case when all_day and not coalesce((it->>'all_day')::boolean, true)
                        and not 'start_at' = any(locked_fields) then v_start else start_at end,
        all_day = all_day and coalesce((it->>'all_day')::boolean, true)
       where id = e_id;
      n_merged := n_merged + 1;
    else
      insert into events (title, description, summary_ca, start_at, end_at, all_day, kind, schedule_text,
                          venue_id, city, geo, price_min, price_text, is_free, registration_url,
                          category, tags, image_url, url, series_key, fingerprint, status, confidence,
                          review_reasons, extractor_version)
      values (v_title, it->>'description', it->>'summary_ca', v_start, v_end,
              coalesce((it->>'all_day')::boolean, false), v_kind, it->>'schedule_text',
              v_id, it->>'city', v_geo, (it->>'price_min')::numeric, it->>'price_text',
              (it->>'is_free')::boolean, it->>'registration_url', (it->>'category')::event_category,
              coalesce(array(select jsonb_array_elements_text(it->'tags')), '{}'),
              it->>'image_url', it->>'url', it->>'series_key', v_fp,
              coalesce(it->>'status', 'published')::event_status, (it->>'confidence')::real,
              coalesce(array(select jsonb_array_elements_text(it->'review_reasons')), '{}'),
              it->>'extractor_version')
      returning id into e_id;
      n_created := n_created + 1;
      if best_score >= 0.6 and best_id is not null then
        insert into duplicate_candidates (event_a, event_b, score)
        values (least(e_id, best_id), greatest(e_id, best_id), best_score)
        on conflict do nothing;
        n_dupes := n_dupes + 1;
      end if;
    end if;

    insert into event_sources (event_id, raw_item_id, source_id, source_url)
    values (e_id, r_id, p_source_id, it->>'url')
    on conflict do nothing;
  end loop;

  return jsonb_build_object('unchanged', n_unchanged, 'created', n_created, 'merged', n_merged,
                            'updated', n_updated, 'possible_duplicates', n_dupes);
end $$;
