-- Multiusuari (decisió 2026-11-14): registre obert amb correu.
--   Personal de cada usuari: user_events (⭐ ✅ ✕ i notes → aprenentatge), user_zones, user_prefs
--   (interessos, paraules bloquejades, disponibilitat).
--   Compartit: esdeveniments, fonts, safata "Per revisar" i plans afegits a mà (tothom ho pot gestionar).
-- Les dades personals que ja hi ha passen a l'usuari més antic (l'únic que hi havia amb els registres tancats).
-- El pipeline fa servir la service_role (salta la RLS): zone_list li retorna les zones de tots els usuaris.
-- Després d'aplicar-la: Supabase → Authentication → Sign In / Providers → activar "Allow new users to sign up".

do $$
declare
  v_owner uuid;
  v_email text;
  v_users integer;
begin
  select count(*) into v_users from auth.users;
  select id, email into v_owner, v_email from auth.users order by created_at limit 1;
  -- Instal·lació nova (encara sense usuaris): les files de seed_defaults no són de ningú i s'esborren.
  if v_owner is null then
    raise notice 'Encara no hi ha usuaris: s''esborren les zones i preferències per defecte sense propietari';
  elsif v_users > 1 then
    raise notice 'Hi ha % usuaris: les dades personals actuals passen al més antic (%)', v_users, v_email;
  else
    raise notice 'Dades personals actuals assignades a %', v_email;
  end if;

  -- ─── user_events: clau (user_id, event_id) ───
  alter table user_events add column user_id uuid references auth.users (id) on delete cascade default auth.uid();
  update user_events set user_id = v_owner where user_id is null;
  delete from user_events where user_id is null;
  alter table user_events alter column user_id set not null;
  alter table user_events drop constraint user_events_pkey;
  alter table user_events add primary key (user_id, event_id);

  -- ─── user_zones ───
  alter table user_zones add column user_id uuid references auth.users (id) on delete cascade default auth.uid();
  update user_zones set user_id = v_owner where user_id is null;
  delete from user_zones where user_id is null;
  alter table user_zones alter column user_id set not null;

  -- ─── user_prefs: una fila per usuari (abans, fila única id = 1) ───
  alter table user_prefs add column user_id uuid references auth.users (id) on delete cascade default auth.uid();
  update user_prefs set user_id = v_owner where user_id is null;
  delete from user_prefs where user_id is null;
  alter table user_prefs alter column user_id set not null;
  alter table user_prefs drop column id;          -- se'n van també la clau primària i el check (id = 1)
  alter table user_prefs add primary key (user_id);
end $$;

drop index if exists user_events_state;
create index user_events_user_state on user_events (user_id, state);
create index user_events_event on user_events (event_id);  -- fusions i esborrats d'esdeveniments
create index user_zones_user on user_zones (user_id, sort_order);

-- ─── RLS: cadascú només veu i toca les seves files ──────────────────────────
-- (La resta de taules mantenen owner_all: tot compartit entre usuaris autenticats.)
do $$
declare t text;
begin
  foreach t in array array['user_events', 'user_zones', 'user_prefs'] loop
    execute format('drop policy if exists owner_all on %I', t);
    execute format('create policy own_rows on %I for all to authenticated '
                   'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ─── Usuaris nous: preferències per defecte ─────────────────────────────────
-- Sense zones: l'app li demana el municipi la primera vegada.
create or replace function create_default_prefs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_prefs (user_id, category_weights, availability)
  values (
    new.id,
    '{"cultura": 0.5, "esport_natura": 0.5, "formacio_tech": 0.5, "gastronomia_social": 0.5, "dating": 0.5}',
    '[{"days": [1, 2, 3, 4, 5], "from": "18:00", "to": "23:59", "weight": 1.0},
      {"days": [6, 7],          "from": "00:00", "to": "23:59", "weight": 1.0}]'
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

revoke execute on function create_default_prefs() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_prefs on auth.users;
create trigger on_auth_user_created_prefs after insert on auth.users
  for each row execute function create_default_prefs();

-- Usuaris que ja existien i no tenen preferències (p. ex. un compte de prova).
insert into user_prefs (user_id, category_weights, availability)
select u.id,
       '{"cultura": 0.5, "esport_natura": 0.5, "formacio_tech": 0.5, "gastronomia_social": 0.5, "dating": 0.5}',
       '[{"days": [1, 2, 3, 4, 5], "from": "18:00", "to": "23:59", "weight": 1.0},
         {"days": [6, 7],          "from": "00:00", "to": "23:59", "weight": 1.0}]'
  from auth.users u
 where not exists (select 1 from user_prefs p where p.user_id = u.id);

-- ─── Funcions ───────────────────────────────────────────────────────────────
-- app_events, app_learning, app_duplicates, app_add_event i zone_list són "security invoker": la RLS ja
-- les limita a les dades de qui les crida (i app_add_event marca el pla per a qui l'afegeix, user_id per
-- defecte). zone_list amb la service_role (pipeline) retorna les zones de tothom: el pipeline en fa la unió.

-- Fusionar dos esdeveniments: les marques de TOTS els usuaris passen al que es conserva (si aquell usuari no
-- en tenia ja una). Amb "security invoker" la RLS només deixava moure les de qui fusiona i les dels altres
-- s'esborraven en cascada amb el duplicat.
create or replace function app_merge_events(p_keep uuid, p_dup uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  d events;
begin
  if auth.uid() is null then
    raise exception 'Cal haver iniciat la sessió';
  end if;
  if p_keep = p_dup then
    raise exception 'Són el mateix esdeveniment';
  end if;
  select * into d from events where id = p_dup;
  if not found then
    raise exception 'L''esdeveniment ja no existeix';
  end if;
  if not exists (select 1 from events where id = p_keep) then
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
  update user_events dup set event_id = p_keep
   where dup.event_id = p_dup
     and not exists (select 1 from user_events k where k.event_id = p_keep and k.user_id = dup.user_id);
  delete from events where id = p_dup;  -- en cascada: candidats, canvis, marques que sobraven i enllaços
end;
$$;

revoke execute on function app_merge_events(uuid, uuid) from public, anon;
grant execute on function app_merge_events(uuid, uuid) to authenticated;

-- "Possibles duplicats": 'marked' = algú (qualsevol usuari) l'ha marcat, per no perdre de vista que fusionar-lo
-- afecta plans de la gent. Necessita veure marques d'altres usuaris → security definer, però només retorna
-- un booleà per esdeveniment.
create or replace function event_is_marked(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_events u where u.event_id = p_event)
$$;
revoke execute on function event_is_marked(uuid) from public, anon;
grant execute on function event_is_marked(uuid) to authenticated;

create or replace function app_duplicates()
returns table (id bigint, score real, a jsonb, b jsonb)
language sql stable security invoker as $$
  with ev as (
    select e.id,
           jsonb_build_object(
             'id', e.id, 'title', e.title, 'start_at', e.start_at, 'all_day', e.all_day,
             'city', coalesce(e.city, v.city), 'venue', v.name, 'url', e.url, 'summary', e.summary_ca,
             'marked', event_is_marked(e.id),
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
