-- pgTAP. Run: supabase test db   (UNEXECUTED until run against a local/CI Supabase stack)
begin;
select plan(19);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'bob@example.com');


create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ---- Alice enrols a device ----
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$
  insert into devices (name, public_key, consent_at, consent_version)
  values ('Alice phone', encode('alice-key-bytes-0123456789abcdef'::bytea, 'base64'), now(), 'v1')$$,
  'alice can enrol her first device');
select throws_ok($$
  insert into devices (name, public_key, consent_at, consent_version)
  values ('Alice 2nd', encode('another-key-bytes-0123456789ab'::bytea, 'base64'), now(), 'v1')$$,
  'device_limit_free', 'free tier is limited to one active device');
select throws_ok($$
  insert into devices (name, public_key, consent_at, consent_version)
  values ('Old consent', encode('old-key-bytes-0123456789abcdef'::bytea, 'base64'), now() - interval '3 days', 'v1')$$,
  'invalid_consent_timestamp', 'stale consent timestamps are rejected');
select is((select count(*)::int from devices), 1, 'alice sees exactly her device');
select isnt((select key_fingerprint from devices limit 1), null, 'fingerprint computed server-side');

-- column grants: lost_mode / owner_id / revoked_at are not client-writable
select throws_ok($$update devices set lost_mode = true$$, '42501', null, 'client cannot set lost_mode directly');
select throws_ok($$update devices set revoked_at = null$$, '42501', null, 'client cannot touch revoked_at');

-- location insert + dedupe
select lives_ok($$
  insert into device_locations (device_id, client_id, latitude, longitude, accuracy_m, recorded_at, tracking_mode)
  select id, '11111111-1111-1111-1111-111111111111', 12.9, 77.6, 25, now(), 'normal' from devices$$,
  'alice can write a location for her device');
select throws_ok($$
  insert into device_locations (device_id, client_id, latitude, longitude, accuracy_m, recorded_at, tracking_mode)
  select id, '11111111-1111-1111-1111-111111111111', 12.9, 77.6, 25, now(), 'normal' from devices$$,
  '23505', null, 'duplicate client_id is rejected (dedup)');
select throws_ok($$
  insert into device_locations (device_id, client_id, latitude, longitude, accuracy_m, recorded_at, tracking_mode)
  select id, gen_random_uuid(), 91, 0, 5, now(), 'normal' from devices$$,
  '23514', null, 'out-of-range latitude rejected');
select throws_ok($$
  insert into device_locations (device_id, client_id, latitude, longitude, accuracy_m, recorded_at, tracking_mode)
  select id, gen_random_uuid(), 1, 1, 5, now() + interval '1 hour', 'normal' from devices$$,
  'recorded_at_in_future', 'future timestamps rejected');

-- commands: clients can read but never write
select throws_ok($$insert into remote_commands (device_id, owner_id, type, expires_at)
  select id, owner_id, 'TRIGGER_ALARM', now() + interval '1 minute' from devices$$, '42501', null,
  'clients cannot insert commands');
select throws_ok($$insert into subscriptions (owner_id, tier, status) values (auth.uid(), 'premium', 'active')$$,
  '42501', null, 'clients cannot grant themselves premium');
select throws_ok($$insert into geofences (device_id, name, latitude, longitude, radius_m)
  select id, 'Home', 1, 1, 200 from devices$$, 'premium_required', 'geofences are premium-only');

-- ---- Bob cannot see or touch Alice's data ----
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from devices), 0, 'bob cannot see alice devices');
select is((select count(*)::int from device_locations), 0, 'bob cannot see alice locations');
select is((select count(*)::int from audit_logs), 0, 'bob cannot see alice audit log');
select throws_ok($$
  insert into device_locations (device_id, client_id, latitude, longitude, accuracy_m, recorded_at, tracking_mode)
  select '00000000-0000-0000-0000-000000000000'::uuid, gen_random_uuid(), 1, 1, 5, now(), 'normal'$$,
  '42501', null, 'bob cannot write a location to a device he does not own');
select is((select count(*)::int from emergency_contacts), 0, 'bob sees no contacts');

select * from finish();
rollback;
