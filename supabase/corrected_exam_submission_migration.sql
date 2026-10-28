-- Migration additive pour le dépôt séparé des épreuves corrigées.
-- À exécuter une fois dans Supabase > SQL Editor.
alter table public.teacher_exam_submissions
  add column if not exists document_type text not null default 'epreuve';
alter table public.teacher_exam_submissions
  drop constraint if exists teacher_exam_submissions_document_type_check;
alter table public.teacher_exam_submissions
  add constraint teacher_exam_submissions_document_type_check
  check (document_type in ('epreuve','corrigee'));
