-- Autorisation indépendante pour le module Contrôle
-- À exécuter une seule fois dans Supabase SQL Editor.
begin;

alter table public.school_records drop constraint if exists school_records_kind_check;
alter table public.school_records add constraint school_records_kind_check
  check (kind in ('eleves','enseignants','classes','notes','paiements','presences','controle'));

alter table public.role_permissions drop constraint if exists role_permissions_kind_check;
alter table public.role_permissions add constraint role_permissions_kind_check
  check (kind in ('eleves','enseignants','classes','notes','paiements','presences','controle'));

-- Préserve les anciens suivis de leçons/exercices dans leur nouveau type dédié.
insert into public.school_records (school_id, kind, data, student_id, class_name, created_by)
select p.school_id, 'controle',
       p.data || jsonb_build_object('_migrated_from_presence_id', p.id::text),
       p.student_id, p.class_name, p.created_by
from public.school_records p
where p.kind = 'presences'
  and (p.data ? 'lecons_par_matiere' or p.data ? 'exercices_par_matiere'
       or p.data ? 'lecon_sue' or p.data ? 'exercice_fait')
  and not exists (
    select 1 from public.school_records c
    where c.kind = 'controle'
      and c.data->>'_migrated_from_presence_id' = p.id::text
  );

-- Les données de contrôle sont désormais protégées par leur autorisation propre.
-- Retire uniquement les champs de contrôle des fiches de présence.
update public.school_records
set data = data - 'lecons_par_matiere' - 'exercices_par_matiere' - 'lecon_sue' - 'exercice_fait'
where kind = 'presences'
  and (data ? 'lecons_par_matiere' or data ? 'exercices_par_matiere'
       or data ? 'lecon_sue' or data ? 'exercice_fait');

-- Cases Contrôle décochées par défaut pour tous les rôles de chaque établissement.
insert into public.role_permissions (school_id, role, kind, can_read, can_write)
select s.id, r.role, 'controle', false, false
from public.schools s
cross join (values ('parent'),('enseignant'),('censeur'),('surveillant')) as r(role)
on conflict (school_id, role, kind) do nothing;

commit;
