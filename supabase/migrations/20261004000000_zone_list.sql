-- Zones amb coordenades llegibles (la columna center és geography i PostgREST la retorna en binari).
-- La fan servir l'app (Configuració) i el pipeline, que així respecta les zones editades des de l'app.
create or replace function zone_list()
returns table (id uuid, name text, lat double precision, lon double precision, radius_km numeric, active boolean,
               sort_order integer)
language sql stable security invoker as $$
  select id, name, extensions.st_y(center::extensions.geometry), extensions.st_x(center::extensions.geometry),
         radius_km, active, sort_order
    from user_zones
   order by sort_order, created_at
$$;

revoke execute on function zone_list() from public, anon;
grant execute on function zone_list() to authenticated, service_role;
