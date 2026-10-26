-- Ajoute les rôles Fondé, Comptable et Secrétaire.
-- À exécuter une fois dans Supabase > SQL Editor avant de générer leurs invitations.
-- Les nouveaux rôles n'obtiennent aucun droit automatiquement : l'administrateur
-- doit les activer dans Paramètres > Autorisations par rôle.
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','parent','enseignant','censeur','surveillant','fonde','comptable','secretaire'));

alter table public.role_permissions drop constraint if exists role_permissions_role_check;
alter table public.role_permissions add constraint role_permissions_role_check
  check (role in ('parent','enseignant','censeur','surveillant','fonde','comptable','secretaire'));

alter table public.registration_invites drop constraint if exists registration_invites_role_check;
alter table public.registration_invites add constraint registration_invites_role_check
  check (role in ('parent','enseignant','censeur','surveillant','fonde','comptable','secretaire'));

-- La matrice et les dossiers doivent inclure tous les modules de l’application.
alter table public.role_permissions drop constraint if exists role_permissions_kind_check;
alter table public.role_permissions add constraint role_permissions_kind_check
  check (kind in ('eleves','enseignants','classes','notes','paiements','presences','controle','fournitures'));

alter table public.school_records drop constraint if exists school_records_kind_check;
alter table public.school_records add constraint school_records_kind_check
  check (kind in ('eleves','enseignants','classes','notes','paiements','presences','controle','fournitures'));

-- Crée des cases de droits décochées pour chaque établissement existant.
insert into public.role_permissions (school_id, role, kind, can_read, can_write)
select s.id, r.role, k.kind, false, false
from public.schools s
cross join (values ('fonde'),('comptable'),('secretaire')) as r(role)
cross join (values ('eleves'),('enseignants'),('classes'),('notes'),('paiements'),('presences'),('controle'),('fournitures')) as k(kind)
on conflict (school_id, role, kind) do nothing;

create or replace function public.create_school_invitation(p_role text, p_expires_days integer default 7)
returns text
language plpgsql
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_school uuid;
  v_code text;
begin
  select school_id into v_school
  from public.profiles
  where user_id = v_user and role = 'admin' and active is true;

  if v_school is null then
    raise exception 'Accès réservé à un administrateur actif.';
  end if;
  if p_role not in ('parent','enseignant','censeur','surveillant','fonde','comptable','secretaire') then
    raise exception 'Rôle d’invitation invalide.';
  end if;
  if p_expires_days < 1 or p_expires_days > 30 then
    raise exception 'La durée doit être comprise entre 1 et 30 jours.';
  end if;

  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
  insert into public.registration_invites(school_id, role, code_hash, created_by, expires_at)
  values (v_school, p_role, encode(digest(v_code, 'sha256'), 'hex'), v_user, now() + make_interval(days => p_expires_days));
  return v_code;
end;
$$;

revoke all on function public.create_school_invitation(text, integer) from public, anon;
grant execute on function public.create_school_invitation(text, integer) to authenticated;

commit;
