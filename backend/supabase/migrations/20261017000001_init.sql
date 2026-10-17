-- WYRIX GUARD core schema. Every table has RLS enabled; clients only get explicit column grants.
-- Sensitive writes (commands, subscriptions, audit, contacts invite) are service_role-only (Edge Functions).
create extension if not exists pgcrypto;

create type public.command_type as enum (
  'REQUEST_LOCATION','ACTIVATE_LOST_MODE','DEACTIVATE_LOST_MODE','TRIGGER_ALARM',
  'STOP_ALARM','SYNC_DEVICE_STATUS','REQUEST_BATTERY_STATUS');
create type public.command_state as enum ('requested','delivered','executed','failed','expired');
create type public.tracking_mode as enum ('normal','battery_saving','recovery');
create type public.plan_tier as enum ('free','premium');

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  history_retention_days int not null default 7 check (history_retention_days between 1 and 365),
  created_at timestamptz not null default now()
);
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, split_part(new.email, '@', 1))
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- subscriptions (service_role writes only) ----------
create table public.subscriptions (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  tier public.plan_tier not null default 'free',
  status text not null default 'inactive' check (status in ('active','grace','inactive')),
  product_id text,
  purchase_token text unique,
  expires_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.current_tier(uid uuid) returns public.plan_tier
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select 'premium'::public.plan_tier from public.subscriptions s
      where s.owner_id = uid and s.tier = 'premium' and s.status in ('active','grace') and s.expires_at > now()),
    'free'::public.plan_tier)
$$;
revoke all on function public.current_tier(uuid) from public, anon, authenticated;

-- ---------- audit_logs (written by triggers / service_role only) ----------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  device_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_owner_created on public.audit_logs (owner_id, created_at desc);

-- ---------- devices ----------
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  model text,
  android_version text,
  public_key text not null,                 -- base64 X.509 SPKI, EC P-256, generated in Android Keystore
  key_fingerprint text not null unique,     -- sha256(public_key) hex, computed server-side: the device's cryptographic ID
  fcm_token text,
  consent_at timestamptz not null,
  consent_version text not null,
  tracking_mode public.tracking_mode not null default 'normal',
  lost_mode boolean not null default false,
  lost_message text,
  lost_contact text,
  imei_owner_entered text check (imei_owner_entered ~ '^[0-9]{15}$'),  -- owner claim only; never used for auth
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index devices_owner on public.devices (owner_id) where revoked_at is null;

create or replace function public.devices_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.key_fingerprint := encode(extensions.digest(decode(new.public_key, 'base64'), 'sha256'), 'hex');
  if new.consent_at > now() + interval '5 minutes' or new.consent_at < now() - interval '1 day' then
    raise exception 'invalid_consent_timestamp';
  end if;
  if public.current_tier(new.owner_id) = 'free'
     and (select count(*) from public.devices d where d.owner_id = new.owner_id and d.revoked_at is null) >= 1 then
    raise exception 'device_limit_free';
  end if;
  return new;
end $$;
create trigger devices_before_insert before insert on public.devices
  for each row execute function public.devices_before_insert();

create or replace function public.devices_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (owner_id, device_id, action, detail)
  values (new.owner_id, new.id, 'DEVICE_ENROLLED',
          jsonb_build_object('fingerprint', new.key_fingerprint, 'consent_version', new.consent_version));
  return new;
end $$;
create trigger devices_after_insert after insert on public.devices
  for each row execute function public.devices_after_insert();

-- ---------- device_locations ----------
create table public.device_locations (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m real not null check (accuracy_m >= 0 and accuracy_m <= 100000),
  recorded_at timestamptz not null,
  battery_pct smallint check (battery_pct between 0 and 100),
  charging boolean,
  connection_type text check (connection_type in ('wifi','cellular','ethernet','none','unknown')),
  tracking_mode public.tracking_mode not null,
  created_at timestamptz not null default now(),
  unique (device_id, client_id)
);
create index device_locations_device_time on public.device_locations (device_id, recorded_at desc);
create index device_locations_owner_time on public.device_locations (owner_id, recorded_at desc);

create or replace function public.locations_before_insert() returns trigger
language plpgsql as $$
begin
  if new.recorded_at > now() + interval '5 minutes' then
    raise exception 'recorded_at_in_future';
  end if;
  return new;
end $$;
create trigger locations_before_insert before insert on public.device_locations
  for each row execute function public.locations_before_insert();

create view public.device_latest_location with (security_invoker = true) as
  select distinct on (device_id) device_id, owner_id, latitude, longitude, accuracy_m, recorded_at,
         battery_pct, charging, connection_type, tracking_mode
  from public.device_locations
  order by device_id, recorded_at desc;

-- ---------- device_status ----------
create table public.device_status (
  device_id uuid primary key references public.devices(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  battery_pct smallint check (battery_pct between 0 and 100),
  charging boolean,
  connection_type text check (connection_type in ('wifi','cellular','ethernet','none','unknown')),
  android_version text,
  tracking_active boolean not null default false,
  capabilities jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------- security_events ----------
create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null,
  type text not null check (type in (
    'FAILED_UNLOCK','SIM_CHANGED','SIM_REMOVED','SIM_INSERTED','GEOFENCE_ENTER','GEOFENCE_EXIT',
    'LOST_MODE_ON','LOST_MODE_OFF','ALARM_TRIGGERED','TRACKING_STOPPED','LOW_BATTERY','ADMIN_DISABLED')),
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (device_id, client_id)
);
create index security_events_owner_time on public.security_events (owner_id, occurred_at desc);

-- ---------- intruder_evidence ----------
create table public.intruder_evidence (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.security_events(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path text not null unique,   -- '<owner_id>/<device_id>/<uuid>.jpg'
  captured_at timestamptz not null,
  retain_until timestamptz,
  created_at timestamptz not null default now(),
  check (storage_path like owner_id::text || '/%')
);
create or replace function public.evidence_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.retain_until is null then
    new.retain_until := now() + case when public.current_tier(new.owner_id) = 'premium'
                                     then interval '30 days' else interval '7 days' end;
  end if;
  return new;
end $$;
create trigger evidence_before_insert before insert on public.intruder_evidence
  for each row execute function public.evidence_before_insert();

-- ---------- remote_commands (service_role writes only) ----------
create table public.remote_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  type public.command_type not null,
  payload jsonb not null default '{}'::jsonb,
  state public.command_state not null default 'requested',
  nonce uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  delivered_at timestamptz,
  executed_at timestamptz,
  result jsonb,
  failure_reason text,
  check (expires_at > created_at)
);
create index remote_commands_device_state on public.remote_commands (device_id, state, created_at desc);

-- ---------- geofences (premium) ----------
create table public.geofences (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m real not null check (radius_m between 100 and 50000),
  notify_enter boolean not null default true,
  notify_exit boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index geofences_device on public.geofences (device_id);
create or replace function public.geofences_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.current_tier(new.owner_id) <> 'premium' then raise exception 'premium_required'; end if;
  if (select count(*) from public.geofences g where g.device_id = new.device_id) >= 90 then
    raise exception 'geofence_limit';  -- Android allows 100 per app; keep headroom
  end if;
  return new;
end $$;
create trigger geofences_before_insert before insert on public.geofences
  for each row execute function public.geofences_before_insert();

-- ---------- emergency_contacts (invite via Edge Function only) ----------
create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status text not null default 'pending' check (status in ('pending','verified')),
  token_hash text not null unique,
  share_enabled boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, email)
);

-- ---------- recovery_reports ----------
create table public.recovery_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  snapshot jsonb not null,  -- {owner_claims:{...}, verified_records:{...}}
  created_at timestamptz not null default now()
);

-- ---------- retention helpers (service_role only) ----------
create or replace function public.expire_stale_commands() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.remote_commands set state = 'expired'
   where state in ('requested','delivered') and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.purge_expired_locations() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.device_locations l
   using public.profiles p
   where l.owner_id = p.id
     and l.recorded_at < now() - make_interval(days =>
           case when public.current_tier(p.id) = 'premium' then p.history_retention_days
                else least(p.history_retention_days, 7) end)
     and l.id not in (select distinct on (device_id) id from public.device_locations
                      order by device_id, recorded_at desc);  -- always keep each device's last-known fix
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.expire_stale_commands(), public.purge_expired_locations() from public, anon, authenticated;
grant execute on function public.expire_stale_commands(), public.purge_expired_locations() to service_role;

-- ================= RLS =================
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.devices enable row level security;
alter table public.device_locations enable row level security;
alter table public.device_status enable row level security;
alter table public.security_events enable row level security;
alter table public.intruder_evidence enable row level security;
alter table public.remote_commands enable row level security;
alter table public.geofences enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.recovery_reports enable row level security;

-- helper expression used in policies: device belongs to caller and is not revoked
create or replace function public.owns_active_device(did uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.devices d
                 where d.id = did and d.owner_id = auth.uid() and d.revoked_at is null)
$$;
revoke all on function public.owns_active_device(uuid) from public, anon;
grant execute on function public.owns_active_device(uuid) to authenticated;

create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy subs_select on public.subscriptions for select to authenticated using (owner_id = (select auth.uid()));
create policy audit_select on public.audit_logs for select to authenticated using (owner_id = (select auth.uid()));

create policy devices_select on public.devices for select to authenticated using (owner_id = (select auth.uid()));
create policy devices_insert on public.devices for insert to authenticated with check (owner_id = (select auth.uid()));
create policy devices_update on public.devices for update to authenticated
  using (owner_id = (select auth.uid()) and revoked_at is null) with check (owner_id = (select auth.uid()));
create policy devices_delete on public.devices for delete to authenticated using (owner_id = (select auth.uid()));

create policy loc_select on public.device_locations for select to authenticated using (owner_id = (select auth.uid()));
create policy loc_insert on public.device_locations for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.owns_active_device(device_id));
create policy loc_delete on public.device_locations for delete to authenticated using (owner_id = (select auth.uid()));

create policy status_select on public.device_status for select to authenticated using (owner_id = (select auth.uid()));
create policy status_insert on public.device_status for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.owns_active_device(device_id));
create policy status_update on public.device_status for update to authenticated
  using (owner_id = (select auth.uid()) and public.owns_active_device(device_id))
  with check (owner_id = (select auth.uid()));

create policy events_select on public.security_events for select to authenticated using (owner_id = (select auth.uid()));
create policy events_insert on public.security_events for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.owns_active_device(device_id));
create policy events_delete on public.security_events for delete to authenticated using (owner_id = (select auth.uid()));

create policy evidence_select on public.intruder_evidence for select to authenticated using (owner_id = (select auth.uid()));
create policy evidence_insert on public.intruder_evidence for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.owns_active_device(device_id));
create policy evidence_delete on public.intruder_evidence for delete to authenticated using (owner_id = (select auth.uid()));

create policy commands_select on public.remote_commands for select to authenticated using (owner_id = (select auth.uid()));

create policy geofences_select on public.geofences for select to authenticated using (owner_id = (select auth.uid()));
create policy geofences_insert on public.geofences for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.owns_active_device(device_id));
create policy geofences_update on public.geofences for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy geofences_delete on public.geofences for delete to authenticated using (owner_id = (select auth.uid()));

create policy contacts_select on public.emergency_contacts for select to authenticated using (owner_id = (select auth.uid()));
create policy contacts_update on public.emergency_contacts for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy contacts_delete on public.emergency_contacts for delete to authenticated using (owner_id = (select auth.uid()));

create policy reports_select on public.recovery_reports for select to authenticated using (owner_id = (select auth.uid()));
create policy reports_insert on public.recovery_reports for insert to authenticated with check (owner_id = (select auth.uid()));
create policy reports_delete on public.recovery_reports for delete to authenticated using (owner_id = (select auth.uid()));

-- ================= Column-level grants (least privilege) =================
revoke all on public.profiles, public.subscriptions, public.audit_logs, public.devices, public.device_locations,
  public.device_status, public.security_events, public.intruder_evidence, public.remote_commands,
  public.geofences, public.emergency_contacts, public.recovery_reports, public.device_latest_location
  from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, history_retention_days) on public.profiles to authenticated;
grant select (owner_id, tier, status, product_id, expires_at, verified_at, updated_at) on public.subscriptions to authenticated;
grant select on public.audit_logs to authenticated;

grant select on public.devices to authenticated;
grant insert (name, model, android_version, public_key, fcm_token, consent_at, consent_version, tracking_mode, imei_owner_entered)
  on public.devices to authenticated;
grant update (name, model, android_version, fcm_token, tracking_mode, imei_owner_entered, last_seen_at)
  on public.devices to authenticated;
grant delete on public.devices to authenticated;

grant select, delete on public.device_locations to authenticated;
grant insert (device_id, client_id, latitude, longitude, accuracy_m, recorded_at, battery_pct, charging, connection_type, tracking_mode)
  on public.device_locations to authenticated;
grant select on public.device_latest_location to authenticated;

grant select on public.device_status to authenticated;
grant insert (device_id, battery_pct, charging, connection_type, android_version, tracking_active, capabilities, last_sync_at)
  on public.device_status to authenticated;
grant update (battery_pct, charging, connection_type, android_version, tracking_active, capabilities, last_sync_at, updated_at)
  on public.device_status to authenticated;

grant select, delete on public.security_events to authenticated;
grant insert (device_id, client_id, type, details, occurred_at) on public.security_events to authenticated;

grant select, delete on public.intruder_evidence to authenticated;
grant insert (event_id, device_id, storage_path, captured_at) on public.intruder_evidence to authenticated;

grant select on public.remote_commands to authenticated;     -- no insert/update/delete: Edge Functions only

grant select, delete on public.geofences to authenticated;
grant insert (device_id, name, latitude, longitude, radius_m, notify_enter, notify_exit, active) on public.geofences to authenticated;
grant update (name, latitude, longitude, radius_m, notify_enter, notify_exit, active) on public.geofences to authenticated;

grant select (id, owner_id, name, email, status, share_enabled, verified_at, created_at) on public.emergency_contacts to authenticated;
grant update (share_enabled) on public.emergency_contacts to authenticated;
grant delete on public.emergency_contacts to authenticated;

grant select, delete on public.recovery_reports to authenticated;
grant insert (device_id, snapshot) on public.recovery_reports to authenticated;

-- ================= Private evidence bucket =================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

create policy evidence_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy evidence_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy evidence_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ================= Realtime =================
alter publication supabase_realtime add table
  public.device_locations, public.device_status, public.remote_commands, public.security_events;
