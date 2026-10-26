-- Inscription sécurisée par code à usage unique
-- À exécuter une seule fois dans Supabase > SQL Editor.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.registration_invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  role text not null check (role in ('parent','enseignant','censeur','surveillant','fonde','comptable','secretaire')),
  code_hash text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);

alter table public.registration_invites enable row level security;
revoke all on public.registration_invites from anon, authenticated;

create or replace function public.validate_school_invitation(p_code text)
returns boolean
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
    from public.registration_invites i
    where i.code_hash = encode(digest(upper(trim(coalesce(p_code,''))), 'sha256'), 'hex')
      and i.redeemed_at is null
      and i.expires_at > now()
  );
$$;

revoke all on function public.validate_school_invitation(text) from public;
grant execute on function public.validate_school_invitation(text) to anon, authenticated;

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

create or replace function public.attach_invited_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data->>'invitation_code','')));
  v_invite public.registration_invites%rowtype;
  v_name text := trim(coalesce(new.raw_user_meta_data->>'full_name',''));
begin
  -- Les comptes créés auparavant par l’administrateur gardent leur procédure actuelle.
  if v_code = '' then
    return new;
  end if;

  select * into v_invite
  from public.registration_invites
  where code_hash = encode(digest(v_code, 'sha256'), 'hex')
    and redeemed_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Code d’invitation invalide, expiré ou déjà utilisé.';
  end if;
  if v_name = '' then
    raise exception 'Le nom complet est obligatoire.';
  end if;

  insert into public.profiles(user_id, school_id, full_name, role, active)
  values (new.id, v_invite.school_id, v_name, v_invite.role, true);

  update public.registration_invites set redeemed_at = now() where id = v_invite.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_attach_invite on auth.users;
create trigger on_auth_user_created_attach_invite
after insert on auth.users
for each row execute function public.attach_invited_user_profile();
