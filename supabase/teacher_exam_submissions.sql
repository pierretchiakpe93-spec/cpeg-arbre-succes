-- Dépôt privé des épreuves d’examen par les enseignants.
-- Exécuter après setup.sql et homework.sql dans le SQL Editor Supabase.

alter table public.role_permissions
  drop constraint if exists role_permissions_kind_check;
alter table public.role_permissions
  add constraint role_permissions_kind_check
  check (kind in ('eleves','enseignants','classes','notes','paiements','presences','controle','fournitures','epreuves'));

insert into public.role_permissions (school_id, role, kind, can_read, can_write)
select s.id, r.role, 'epreuves', r.role = 'enseignant', r.role = 'enseignant'
from public.schools s
cross join (values ('parent'),('enseignant'),('censeur'),('surveillant'),('fonde'),('comptable'),('secretaire')) as r(role)
on conflict (school_id, role, kind) do nothing;

create table if not exists public.teacher_exam_submissions (
  id uuid primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  class_name text not null,
  subject text not null,
  title text not null,
  exam_date date,
  teacher_name text not null default '',
  file_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  document_type text not null default 'epreuve' check (document_type in ('epreuve','corrigee'))
);

-- Ajout idempotent pour les établissements qui avaient déjà créé la table.
alter table public.teacher_exam_submissions
  add column if not exists document_type text not null default 'epreuve';
alter table public.teacher_exam_submissions
  drop constraint if exists teacher_exam_submissions_document_type_check;
alter table public.teacher_exam_submissions
  add constraint teacher_exam_submissions_document_type_check
  check (document_type in ('epreuve','corrigee'));
create index if not exists teacher_exam_submissions_school_date
  on public.teacher_exam_submissions(school_id, created_at desc);
create index if not exists teacher_exam_submissions_school_class
  on public.teacher_exam_submissions(school_id, class_name);

alter table public.teacher_exam_submissions enable row level security;
grant select, insert, delete on public.teacher_exam_submissions to authenticated;

drop policy if exists teacher_exam_submissions_read on public.teacher_exam_submissions;
create policy teacher_exam_submissions_read on public.teacher_exam_submissions
for select to authenticated using (
  school_id = public.current_school_id()
  and public.current_app_role() <> 'parent'
  and public.role_can('epreuves', false)
  and (public.current_app_role() <> 'enseignant' or created_by = auth.uid())
);

drop policy if exists teacher_exam_submissions_insert on public.teacher_exam_submissions;
create policy teacher_exam_submissions_insert on public.teacher_exam_submissions
for insert to authenticated with check (
  school_id = public.current_school_id()
  and public.current_app_role() = 'enseignant'
  and public.role_can('epreuves', true)
  and created_by = auth.uid()
  and exists (
    select 1 from public.teacher_classes tc
    where tc.school_id = teacher_exam_submissions.school_id
      and tc.user_id = auth.uid()
      and tc.class_name = teacher_exam_submissions.class_name
  )
  and exists (
    select 1 from public.school_records c
    where c.school_id = teacher_exam_submissions.school_id
      and c.kind = 'classes'
      and coalesce(c.data->>'nom','') = teacher_exam_submissions.class_name
  )
);

-- Autorisé à l’enseignant propriétaire pour annuler un dépôt échoué, et à l’admin.
drop policy if exists teacher_exam_submissions_delete on public.teacher_exam_submissions;
create policy teacher_exam_submissions_delete on public.teacher_exam_submissions
for delete to authenticated using (
  school_id = public.current_school_id()
  and public.role_can('epreuves', true)
  and (public.current_app_role() = 'admin'
       or (public.current_app_role() = 'enseignant' and created_by = auth.uid()))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-exams', 'school-exams', false, 20971520,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists school_exam_files_read on storage.objects;
create policy school_exam_files_read on storage.objects
for select to authenticated using (
  bucket_id = 'school-exams'
  and exists (
    select 1 from public.teacher_exam_submissions e
    where e.file_path = storage.objects.name
      and e.school_id = public.current_school_id()
      and public.current_app_role() <> 'parent'
      and public.role_can('epreuves', false)
      and (public.current_app_role() <> 'enseignant' or e.created_by = auth.uid())
  )
);

drop policy if exists school_exam_files_insert on storage.objects;
create policy school_exam_files_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'school-exams'
  and exists (
    select 1 from public.teacher_exam_submissions e
    join public.teacher_classes tc
      on tc.school_id = e.school_id
     and tc.user_id = auth.uid()
     and tc.class_name = e.class_name
    where e.file_path = storage.objects.name
      and e.school_id = public.current_school_id()
      and e.created_by = auth.uid()
      and public.current_app_role() = 'enseignant'
      and public.role_can('epreuves', true)
  )
);

drop policy if exists school_exam_files_delete on storage.objects;
create policy school_exam_files_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'school-exams'
  and exists (
    select 1 from public.teacher_exam_submissions e
    where e.file_path = storage.objects.name
      and e.school_id = public.current_school_id()
      and public.role_can('epreuves', true)
      and (public.current_app_role() = 'admin'
           or (public.current_app_role() = 'enseignant' and e.created_by = auth.uid()))
  )
);
