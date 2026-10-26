-- Supprime un utilisateur non-administrateur du seul établissement de l'appelant.
-- Les fiches scolaires sont gardées ; leur auteur est anonymisé avant suppression.
-- Les liens parent-enfant et enseignant-classe sont supprimés par leurs FK ON DELETE CASCADE.
create or replace function public.delete_school_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_school_id uuid;
  v_target_school_id uuid;
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.';
  end if;

  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Seul un administrateur peut supprimer un compte.';
  end if;

  v_school_id := public.current_school_id();
  if v_school_id is null then
    raise exception 'Établissement introuvable.';
  end if;

  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Vous ne pouvez pas supprimer votre propre compte.';
  end if;

  select p.school_id, p.role
    into v_target_school_id, v_target_role
    from public.profiles p
   where p.user_id = p_user_id
   for update;

  if not found or v_target_school_id <> v_school_id then
    raise exception 'Ce compte n’appartient pas à votre établissement.';
  end if;

  if v_target_role = 'admin' then
    raise exception 'Un compte administrateur ne peut pas être supprimé ici.';
  end if;

  update public.school_records
     set created_by = null
   where school_id = v_school_id
     and created_by = p_user_id;

  delete from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'Compte utilisateur introuvable.';
  end if;
end;
$function$;

revoke all on function public.delete_school_user(uuid) from public, anon;
grant execute on function public.delete_school_user(uuid) to authenticated;
