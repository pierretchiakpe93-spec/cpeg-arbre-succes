-- Devoirs collège : fichiers privés réservés aux enseignants autorisés et à l’administration.
create or replace function public.is_college_class(p_school_id uuid, p_class_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_records c
    where c.school_id = p_school_id
      and c.kind = 'classes'
      and coalesce(c.data->>'nom','') = p_class_name
      and regexp_replace(translate(lower(coalesce(c.data->>'niveau','')), 'éèêë', 'eeee'), '[^a-z0-9]', '', 'g')
          in ('6e','6eme','sixieme','5e','5eme','cinquieme','4e','4eme','quatrieme','3e','3eme','troisieme')
  );
$$;
grant execute on function public.is_college_class(uuid,text) to authenticated;

create table if not exists public.homework_assignments (
  id uuid primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  class_name text not null,
  subject text not null,
  title text not null,
  description text not null default '',
  due_date date,
  file_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.homework_assignments enable row level security;
grant select, insert, update, delete on public.homework_assignments to authenticated;

drop policy if exists homework_read_authorized on public.homework_assignments;
create policy homework_read_authorized on public.homework_assignments
for select to authenticated
using (
  school_id = public.current_school_id()
  and (
    public.current_app_role() = 'admin'
    or (
      public.current_app_role() = 'enseignant'
      and exists (
        select 1 from public.teacher_classes tc
        where tc.school_id = homework_assignments.school_id
          and tc.user_id = auth.uid()
          and tc.class_name = homework_assignments.class_name
      )
      and public.is_college_class(homework_assignments.school_id, homework_assignments.class_name)
    )
  )
);

drop policy if exists homework_insert_authorized on public.homework_assignments;
create policy homework_insert_authorized on public.homework_assignments
for insert to authenticated
with check (
  school_id = public.current_school_id()
  and created_by = auth.uid()
  and (
    public.current_app_role() = 'admin'
    or (
      public.current_app_role() = 'enseignant'
      and exists (
        select 1 from public.teacher_classes tc
        where tc.school_id = homework_assignments.school_id
          and tc.user_id = auth.uid()
          and tc.class_name = homework_assignments.class_name
      )
      and public.is_college_class(homework_assignments.school_id, homework_assignments.class_name)
    )
  )
);

drop policy if exists homework_update_authorized on public.homework_assignments;
create policy homework_update_authorized on public.homework_assignments
for update to authenticated
using (
  school_id = public.current_school_id()
  and (public.current_app_role() = 'admin' or (created_by = auth.uid() and public.current_app_role() = 'enseignant'))
)
with check (
  school_id = public.current_school_id()
  and (
    public.current_app_role() = 'admin'
    or (
      created_by = auth.uid()
      and public.current_app_role() = 'enseignant'
      and exists (
        select 1 from public.teacher_classes tc
        where tc.school_id = homework_assignments.school_id
          and tc.user_id = auth.uid()
          and tc.class_name = homework_assignments.class_name
      )
      and public.is_college_class(homework_assignments.school_id, homework_assignments.class_name)
    )
  )
);

drop policy if exists homework_delete_authorized on public.homework_assignments;
create policy homework_delete_authorized on public.homework_assignments
for delete to authenticated
using (
  school_id = public.current_school_id()
  and (public.current_app_role() = 'admin' or (created_by = auth.uid() and public.current_app_role() = 'enseignant'))
);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('school-homework','school-homework',false,15728640,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public=false,file_size_limit=15728640,allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp'];

drop policy if exists homework_files_read_authorized on storage.objects;
create policy homework_files_read_authorized on storage.objects
for select to authenticated
using (
  bucket_id = 'school-homework'
  and exists (select 1 from public.homework_assignments h where h.file_path = name)
);

drop policy if exists homework_files_insert_authorized on storage.objects;
create policy homework_files_insert_authorized on storage.objects
for insert to authenticated
with check (
  bucket_id = 'school-homework'
  and exists (
    select 1 from public.homework_assignments h
    where h.file_path = name
      and h.school_id = public.current_school_id()
      and h.created_by = auth.uid()
  )
);

drop policy if exists homework_files_update_authorized on storage.objects;
create policy homework_files_update_authorized on storage.objects
for update to authenticated
using (
  bucket_id = 'school-homework'
  and exists (select 1 from public.homework_assignments h where h.file_path = name and (public.current_app_role() = 'admin' or h.created_by = auth.uid()))
)
with check (
  bucket_id = 'school-homework'
  and exists (select 1 from public.homework_assignments h where h.file_path = name and (public.current_app_role() = 'admin' or h.created_by = auth.uid()))
);

drop policy if exists homework_files_delete_authorized on storage.objects;
create policy homework_files_delete_authorized on storage.objects
for delete to authenticated
using (
  bucket_id = 'school-homework'
  and exists (select 1 from public.homework_assignments h where h.file_path = name and (public.current_app_role() = 'admin' or h.created_by = auth.uid()))
);
