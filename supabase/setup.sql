-- CPEG L’Arbre de Succès : schéma Supabase initial
-- À exécuter une seule fois dans le SQL Editor du projet.
-- Ne contient ni utilisateurs réels, ni clé secrète.

create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'CPEG L’Arbre de Succès',
  school_year text not null default '2026 – 2027',
  assets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.schools add column if not exists assets jsonb not null default '{}'::jsonb;

insert into public.schools (id, name)
values ('00000000-0000-4000-8000-000000000001', 'CPEG L’Arbre de Succès')
on conflict (id) do nothing;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  full_name text not null default '',
  role text not null check (role in ('admin','parent','enseignant','censeur','surveillant')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.school_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  kind text not null check (kind in ('eleves','enseignants','classes','notes','paiements','presences')),
  data jsonb not null default '{}'::jsonb,
  student_id uuid references public.school_records(id) on delete set null,
  class_name text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_link_must_be_student check (student_id is null or kind <> 'eleves')
);
create index if not exists school_records_school_kind on public.school_records(school_id, kind);
create index if not exists school_records_student on public.school_records(student_id);
create index if not exists school_records_class on public.school_records(school_id, class_name);

create table if not exists public.role_permissions (
  school_id uuid not null references public.schools(id),
  role text not null check (role in ('parent','enseignant','censeur','surveillant')),
  kind text not null check (kind in ('eleves','enseignants','classes','notes','paiements','presences')),
  can_read boolean not null default false,
  can_write boolean not null default false,
  primary key (school_id, role, kind)
);

create table if not exists public.student_links (
  school_id uuid not null references public.schools(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.school_records(id) on delete cascade,
  primary key (user_id, student_id)
);
create table if not exists public.teacher_classes (
  school_id uuid not null references public.schools(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_name text not null,
  primary key (user_id, class_name)
);

-- Droits initiaux prudents : le parent consulte seulement; le personnel reçoit les droits habituels.
insert into public.role_permissions (school_id, role, kind, can_read, can_write)
select '00000000-0000-4000-8000-000000000001'::uuid, r.role, k.kind,
       case r.role
         when 'parent' then k.kind in ('eleves','notes','paiements','presences')
         when 'enseignant' then k.kind in ('eleves','classes','notes','presences')
         when 'censeur' then k.kind in ('eleves','enseignants','classes','notes','presences')
         when 'surveillant' then k.kind in ('eleves','classes','presences')
         else false
       end,
       (r.role = 'enseignant' and k.kind in ('notes','presences')) or (r.role = 'surveillant' and k.kind = 'presences')
from (values ('parent'),('enseignant'),('censeur'),('surveillant')) as r(role)
cross join (values ('eleves'),('enseignants'),('classes'),('notes'),('paiements'),('presences')) as k(kind)
on conflict (school_id, role, kind) do nothing;

create or replace function public.current_school_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.school_id from public.profiles p where p.user_id = auth.uid() and p.active = true limit 1
$$;
create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.user_id = auth.uid() and p.active = true limit 1
$$;
create or replace function public.role_can(p_kind text, p_write boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.current_app_role() = 'admin' then true else exists (
    select 1 from public.role_permissions rp
    where rp.school_id = public.current_school_id() and rp.role = public.current_app_role()
      and rp.kind = p_kind and (case when p_write then rp.can_write else rp.can_read end)
  ) end
$$;
create or replace function public.record_scope_ok(p_kind text, p_student_id uuid, p_class_name text, p_record_id uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select case public.current_app_role()
    when 'admin' then true
    when 'parent' then case when p_kind = 'eleves' then exists (
      select 1 from public.student_links sl where sl.school_id = public.current_school_id() and sl.user_id = auth.uid() and sl.student_id = p_record_id
    ) else exists (
      select 1 from public.student_links sl where sl.school_id = public.current_school_id() and sl.user_id = auth.uid() and sl.student_id = p_student_id
    ) end
    when 'enseignant' then exists (
      select 1 from public.teacher_classes tc where tc.school_id = public.current_school_id() and tc.user_id = auth.uid() and tc.class_name = p_class_name
    )
    else true
  end
$$;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.school_records enable row level security;
alter table public.role_permissions enable row level security;
alter table public.student_links enable row level security;
alter table public.teacher_classes enable row level security;

-- Écoles : un utilisateur ne voit que son établissement; seul l’admin peut changer les paramètres.
drop policy if exists schools_read_own on public.schools;
create policy schools_read_own on public.schools for select to authenticated using (id = public.current_school_id());
drop policy if exists schools_admin_update on public.schools;
create policy schools_admin_update on public.schools for update to authenticated using (id = public.current_school_id() and public.current_app_role() = 'admin') with check (id = public.current_school_id() and public.current_app_role() = 'admin');

-- Profils : chacun voit son propre profil; l’administrateur gère les profils de son établissement.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (user_id = auth.uid() or (school_id = public.current_school_id() and public.current_app_role() = 'admin'));
drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles for insert to authenticated with check (school_id = public.current_school_id() and public.current_app_role() = 'admin');
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated using (school_id = public.current_school_id() and public.current_app_role() = 'admin') with check (school_id = public.current_school_id() and public.current_app_role() = 'admin');

-- Données scolaires : rôle + autorisation de la rubrique + rattachement enfant/classe.
drop policy if exists records_read_authorized on public.school_records;
create policy records_read_authorized on public.school_records for select to authenticated using (
  school_id = public.current_school_id() and public.role_can(kind, false) and public.record_scope_ok(kind, student_id, class_name, id)
);
drop policy if exists records_insert_authorized on public.school_records;
create policy records_insert_authorized on public.school_records for insert to authenticated with check (
  school_id = public.current_school_id() and created_by = auth.uid() and public.role_can(kind, true)
  and (public.current_app_role() <> 'enseignant' or exists (select 1 from public.teacher_classes tc where tc.school_id = public.school_records.school_id and tc.user_id = auth.uid() and tc.class_name = public.school_records.class_name))
  and (public.current_app_role() <> 'parent')
);
drop policy if exists records_update_authorized on public.school_records;
create policy records_update_authorized on public.school_records for update to authenticated using (
  school_id = public.current_school_id() and public.role_can(kind, true) and public.record_scope_ok(kind, student_id, class_name, id)
) with check (
  school_id = public.current_school_id() and public.role_can(kind, true) and public.record_scope_ok(kind, student_id, class_name, id)
  and (public.current_app_role() <> 'enseignant' or exists (select 1 from public.teacher_classes tc where tc.school_id = public.school_records.school_id and tc.user_id = auth.uid() and tc.class_name = public.school_records.class_name))
);
drop policy if exists records_delete_authorized on public.school_records;
create policy records_delete_authorized on public.school_records for delete to authenticated using (
  school_id = public.current_school_id() and public.current_app_role() = 'admin'
);

-- Droits : l’administrateur voit et modifie la matrice; chaque autre rôle ne lit que sa propre configuration.
drop policy if exists permissions_read on public.role_permissions;
create policy permissions_read on public.role_permissions for select to authenticated using (
  school_id = public.current_school_id() and (public.current_app_role() = 'admin' or role = public.current_app_role())
);
drop policy if exists permissions_admin_write on public.role_permissions;
create policy permissions_admin_write on public.role_permissions for all to authenticated using (
  school_id = public.current_school_id() and public.current_app_role() = 'admin'
) with check (school_id = public.current_school_id() and public.current_app_role() = 'admin');

-- Associations enfants et classes : lecture personnelle, gestion réservée à l’administration.
drop policy if exists student_links_read on public.student_links;
create policy student_links_read on public.student_links for select to authenticated using (school_id = public.current_school_id() and (user_id = auth.uid() or public.current_app_role() = 'admin'));
drop policy if exists student_links_admin_write on public.student_links;
create policy student_links_admin_write on public.student_links for all to authenticated using (school_id = public.current_school_id() and public.current_app_role() = 'admin') with check (school_id = public.current_school_id() and public.current_app_role() = 'admin');
drop policy if exists teacher_classes_read on public.teacher_classes;
create policy teacher_classes_read on public.teacher_classes for select to authenticated using (school_id = public.current_school_id() and (user_id = auth.uid() or public.current_app_role() = 'admin'));
drop policy if exists teacher_classes_admin_write on public.teacher_classes;
create policy teacher_classes_admin_write on public.teacher_classes for all to authenticated using (school_id = public.current_school_id() and public.current_app_role() = 'admin') with check (school_id = public.current_school_id() and public.current_app_role() = 'admin');

grant usage on schema public to authenticated;
grant select, update on public.schools to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.school_records to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;
grant select, insert, update, delete on public.student_links to authenticated;
grant select, insert, update, delete on public.teacher_classes to authenticated;
revoke all on function public.current_school_id() from public, anon;
revoke all on function public.current_app_role() from public, anon;
revoke all on function public.role_can(text, boolean) from public, anon;
revoke all on function public.record_scope_ok(text, uuid, text, uuid) from public, anon;
grant execute on function public.current_school_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.role_can(text, boolean) to authenticated;
grant execute on function public.record_scope_ok(text, uuid, text, uuid) to authenticated;


-- Ressources de l’établissement (logo, signature, en-tête) : bucket privé.
insert into storage.buckets (id, name, public)
values ('school-assets', 'school-assets', false)
on conflict (id) do update set public = false;
drop policy if exists school_assets_read_same_school on storage.objects;
create policy school_assets_read_same_school on storage.objects for select to authenticated
using (bucket_id = 'school-assets' and (storage.foldername(name))[1] = public.current_school_id()::text);
drop policy if exists school_assets_admin_upload on storage.objects;
create policy school_assets_admin_upload on storage.objects for insert to authenticated
with check (bucket_id = 'school-assets' and (storage.foldername(name))[1] = public.current_school_id()::text and public.current_app_role() = 'admin');
drop policy if exists school_assets_admin_update on storage.objects;
create policy school_assets_admin_update on storage.objects for update to authenticated
using (bucket_id = 'school-assets' and (storage.foldername(name))[1] = public.current_school_id()::text and public.current_app_role() = 'admin')
with check (bucket_id = 'school-assets' and (storage.foldername(name))[1] = public.current_school_id()::text and public.current_app_role() = 'admin');
drop policy if exists school_assets_admin_delete on storage.objects;
create policy school_assets_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'school-assets' and (storage.foldername(name))[1] = public.current_school_id()::text and public.current_app_role() = 'admin');

