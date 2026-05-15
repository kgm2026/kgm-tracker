-- Multi-user access control for KGM Homes.
-- Seed the owner as admin, let active users read, and reserve writes for admins.

create table if not exists public.app_user_roles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'viewer' check (role in ('admin', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_user_roles (email, role, is_active)
values ('shehryar25@gmail.com', 'admin', true)
on conflict (email) do update
set role = 'admin',
    is_active = true,
    updated_at = now();

create or replace function public.set_app_user_roles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.email = lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists app_user_roles_updated_at on public.app_user_roles;
create trigger app_user_roles_updated_at
before insert or update on public.app_user_roles
for each row execute function public.set_app_user_roles_updated_at();

create or replace function public.current_user_is_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_user_roles
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and is_active = true
  );
$$;

create or replace function public.current_user_is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_user_roles
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role = 'admin'
      and is_active = true
  );
$$;

alter table public.app_user_roles enable row level security;

drop policy if exists "App users can read own access" on public.app_user_roles;
drop policy if exists "App admins can read access" on public.app_user_roles;
drop policy if exists "App admins can insert access" on public.app_user_roles;
drop policy if exists "App admins can update access" on public.app_user_roles;
drop policy if exists "App admins can delete access" on public.app_user_roles;

create policy "App users can read own access"
  on public.app_user_roles
  for select
  to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "App admins can read access"
  on public.app_user_roles
  for select
  to authenticated
  using (public.current_user_is_app_admin());

create policy "App admins can insert access"
  on public.app_user_roles
  for insert
  to authenticated
  with check (public.current_user_is_app_admin());

create policy "App admins can update access"
  on public.app_user_roles
  for update
  to authenticated
  using (public.current_user_is_app_admin())
  with check (public.current_user_is_app_admin());

create policy "App admins can delete access"
  on public.app_user_roles
  for delete
  to authenticated
  using (public.current_user_is_app_admin());

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'projects',
    'material_purchases',
    'contractors',
    'payment_log',
    'project_budgets',
    'progress_entries',
    'contractor_schedules',
    'boq_items'
  ]
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public'
        and table_name = tbl
    ) then
      execute format('alter table public.%I enable row level security', tbl);

      execute format('drop policy if exists %I on public.%I', 'Enable all access for authenticated users', tbl);
      execute format('drop policy if exists %I on public.%I', 'Authenticated full access on ' || tbl, tbl);
      execute format('drop policy if exists %I on public.%I', 'Enable all on contractor_schedules', tbl);
      execute format('drop policy if exists %I on public.%I', 'Active app users can read ' || tbl, tbl);
      execute format('drop policy if exists %I on public.%I', 'App admins can insert ' || tbl, tbl);
      execute format('drop policy if exists %I on public.%I', 'App admins can update ' || tbl, tbl);
      execute format('drop policy if exists %I on public.%I', 'App admins can delete ' || tbl, tbl);

      execute format(
        'create policy %I on public.%I for select to authenticated using (public.current_user_is_app_user())',
        'Active app users can read ' || tbl,
        tbl
      );
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.current_user_is_app_admin())',
        'App admins can insert ' || tbl,
        tbl
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using (public.current_user_is_app_admin()) with check (public.current_user_is_app_admin())',
        'App admins can update ' || tbl,
        tbl
      );
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.current_user_is_app_admin())',
        'App admins can delete ' || tbl,
        tbl
      );
    end if;
  end loop;
end $$;

do $$
declare
  bucket_name text;
begin
  foreach bucket_name in array array['invoices', 'contractor-docs', 'site-photos', 'drawings']
  loop
    execute format('drop policy if exists %I on storage.objects', 'Authenticated read ' || bucket_name);
    execute format('drop policy if exists %I on storage.objects', 'Authenticated insert ' || bucket_name);
    execute format('drop policy if exists %I on storage.objects', 'Authenticated update ' || bucket_name);
    execute format('drop policy if exists %I on storage.objects', 'Authenticated delete ' || bucket_name);
    execute format('drop policy if exists %I on storage.objects', 'App users can read ' || bucket_name);
    execute format('drop policy if exists %I on storage.objects', 'App admins can insert ' || bucket_name);
    execute format('drop policy if exists %I on storage.objects', 'App admins can update ' || bucket_name);
    execute format('drop policy if exists %I on storage.objects', 'App admins can delete ' || bucket_name);

    execute format(
      'create policy %I on storage.objects for select to authenticated using (bucket_id = %L and public.current_user_is_app_user())',
      'App users can read ' || bucket_name,
      bucket_name
    );
    execute format(
      'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and public.current_user_is_app_admin())',
      'App admins can insert ' || bucket_name,
      bucket_name
    );
    execute format(
      'create policy %I on storage.objects for update to authenticated using (bucket_id = %L and public.current_user_is_app_admin()) with check (bucket_id = %L and public.current_user_is_app_admin())',
      'App admins can update ' || bucket_name,
      bucket_name,
      bucket_name
    );
    execute format(
      'create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and public.current_user_is_app_admin())',
      'App admins can delete ' || bucket_name,
      bucket_name
    );
  end loop;
end $$;
