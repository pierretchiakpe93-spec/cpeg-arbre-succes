-- Connexion unique par compte : une seconde connexion est refusée jusqu’au logout.
-- À exécuter une fois dans Supabase > SQL Editor.

create table if not exists public.active_device_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id uuid not null,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.active_device_sessions enable row level security;
revoke all on table public.active_device_sessions from anon, authenticated;

create or replace function public.claim_device_session(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_device_id uuid;
begin
  if v_user_id is null or p_device_id is null then
    return false;
  end if;

  insert into public.active_device_sessions(user_id, device_id)
  values (v_user_id, p_device_id)
  on conflict (user_id) do nothing;

  select s.device_id into v_device_id
  from public.active_device_sessions s
  where s.user_id = v_user_id
  for update;

  if v_device_id = p_device_id then
    update public.active_device_sessions
    set updated_at = now()
    where user_id = v_user_id;
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.release_device_session(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_device_id is null then
    return false;
  end if;

  delete from public.active_device_sessions
  where user_id = auth.uid() and device_id = p_device_id;
  return found;
end;
$$;

-- Déblocage de secours réservé à l’administrateur actif de l’établissement.
create or replace function public.admin_release_device_session(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles admin_profile
    join public.profiles target_profile
      on target_profile.school_id = admin_profile.school_id
    where admin_profile.user_id = auth.uid()
      and admin_profile.role = 'admin'
      and admin_profile.active = true
      and target_profile.user_id = p_user_id
      and target_profile.active = true
  ) then
    raise exception 'Accès réservé à l’administrateur de l’établissement';
  end if;

  delete from public.active_device_sessions where user_id = p_user_id;
  return found;
end;
$$;

revoke all on function public.claim_device_session(uuid) from public, anon;
revoke all on function public.release_device_session(uuid) from public, anon;
revoke all on function public.admin_release_device_session(uuid) from public, anon;
grant execute on function public.claim_device_session(uuid) to authenticated;
grant execute on function public.release_device_session(uuid) to authenticated;
grant execute on function public.admin_release_device_session(uuid) to authenticated;
