-- Paraules bloquejades en dues zones:
--   · comunes (shared_settings.blocked_tags): s'apliquen a tots els usuaris; qualsevol usuari les pot editar.
--   · particulars (user_prefs.blocked_tags, ja existent): només de cada usuari.
-- Un pla no surt si conté alguna paraula de les dues llistes. Les paraules actuals continuen sent particulars:
-- des de Configuració es poden passar a la zona comuna.
-- Aplica-la després de 20261115000000_multi_user.sql. Es pot tornar a executar.

create table if not exists shared_settings (
  id           smallint primary key default 1 check (id = 1),
  blocked_tags text[] not null default '{}'
);

alter table shared_settings enable row level security;
drop policy if exists owner_all on shared_settings;
create policy owner_all on shared_settings for all to authenticated using (true) with check (true);

insert into shared_settings (id) values (1) on conflict (id) do nothing;
