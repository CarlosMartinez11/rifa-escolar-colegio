-- Rifa escolar: protección de resultados en Supabase
-- Ejecutar completo en Supabase > SQL Editor. Se puede ejecutar más de una vez.
--
-- Resultado:
--   * Cualquiera (clave pública / rol anon) puede LEER rifa_estado.
--   * Solo usuarios de Supabase Auth registrados en public.rifa_admins pueden
--     crear, modificar o borrar filas de rifa_estado.

-- 1) Tabla del estado (por si aún no existe; no modifica una existente)
create table if not exists public.rifa_estado (
  id         text primary key,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2) Lista de administradores (usuarios de Supabase Auth)
create table if not exists public.rifa_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Desde el navegador nadie puede modificar la lista; cada usuario autenticado
-- solo puede ver su propia fila (la app la consulta al entrar para saber si es admin).
-- La app consulta esta tabla al iniciar sesión para confirmar el permiso.
alter table public.rifa_admins enable row level security;
revoke all on public.rifa_admins from anon, authenticated;
grant select on public.rifa_admins to authenticated;
drop policy if exists "rifa_admins_ver_propia" on public.rifa_admins;
create policy "rifa_admins_ver_propia" on public.rifa_admins
  for select to authenticated
  using (user_id = auth.uid());

-- 3) Función que dice si el usuario actual es administrador
create or replace function public.es_admin_rifa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.rifa_admins where user_id = auth.uid());
$$;
revoke all on function public.es_admin_rifa() from public;
grant execute on function public.es_admin_rifa() to anon, authenticated;

-- 4) Activar RLS en rifa_estado y quitar cualquier política previa
alter table public.rifa_estado enable row level security;
alter table public.rifa_estado force row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'rifa_estado'
  loop
    execute format('drop policy %I on public.rifa_estado', pol.policyname);
  end loop;
end $$;

-- 5) Permisos de tabla: el público solo puede leer
revoke all on public.rifa_estado from anon, authenticated;
grant select on public.rifa_estado to anon, authenticated;
grant insert, update, delete on public.rifa_estado to authenticated;

-- 6) Políticas
create policy "lectura publica"
  on public.rifa_estado for select
  to anon, authenticated
  using (true);

create policy "admin inserta"
  on public.rifa_estado for insert
  to authenticated
  with check (public.es_admin_rifa());

create policy "admin actualiza"
  on public.rifa_estado for update
  to authenticated
  using (public.es_admin_rifa())
  with check (public.es_admin_rifa());

create policy "admin borra"
  on public.rifa_estado for delete
  to authenticated
  using (public.es_admin_rifa());

-- 7) Dar de alta a un administrador (repetir por cada correo).
--    Primero crea el usuario en Authentication > Users > Add user.
-- insert into public.rifa_admins (user_id)
-- select id from auth.users where email = 'correo-del-admin@ejemplo.com'
-- on conflict do nothing;

-- 8) Comprobación rápida (debe mostrar 4 políticas y rls_activo = true)
-- select policyname, cmd, roles from pg_policies where tablename = 'rifa_estado';
-- select relrowsecurity as rls_activo from pg_class where oid = 'public.rifa_estado'::regclass;
