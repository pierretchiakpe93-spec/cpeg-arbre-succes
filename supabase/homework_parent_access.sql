-- Accès parent aux devoirs des seules classes de ses enfants associés.
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
    or (
      public.current_app_role() = 'parent'
      and public.is_college_class(homework_assignments.school_id, homework_assignments.class_name)
      and exists (
        select 1
        from public.student_links sl
        join public.school_records student
          on student.id = sl.student_id
         and student.school_id = sl.school_id
         and student.kind = 'eleves'
        where sl.school_id = homework_assignments.school_id
          and sl.user_id = auth.uid()
          and student.class_name = homework_assignments.class_name
      )
    )
  )
);

-- Les fichiers du bucket restent privés : la politique Storage repose sur
-- la visibilité RLS de la ligne de devoir ci-dessus.
drop policy if exists homework_files_read_authorized on storage.objects;
create policy homework_files_read_authorized on storage.objects
for select to authenticated
using (
  bucket_id = 'school-homework'
  and exists (
    select 1 from public.homework_assignments h
    where h.file_path = name
  )
);
