# WYRIX GUARD backend (Supabase)

```
backend/supabase/
  config.toml
  migrations/20261017000001_init.sql   schema, RLS, column grants, private bucket, realtime
  functions/
    _shared/        auth, reauth, command rules, device-signature verify, FCM, Play, email
    send-command/   owner -> command (ownership, validation, rate limit, expiry, FCM wake-up)
    command-ack/    device -> signed acknowledgment (state machine, replay-safe)
    revoke-device/  delete-account/  verify-purchase/  contact-invite/  contact-verify/  contact-share/  maintenance/
  tests/rls.test.sql                   pgTAP RLS + grant tests
```

## Security model (summary)
- Clients (Android + dashboard) use only the **anon key + the owner's JWT**. RLS and column grants confine every table to its owner.
- `remote_commands`, `subscriptions`, `audit_logs` and contact invites are **service_role-only**, reachable solely via Edge Functions.
- Command flow: owner -> `send-command` (ownership, allow-list, payload validation, rate limit, TTL) -> FCM *data-only* wake-up (ids only, **never authorization**) -> device reads the command via RLS -> device acks through `command-ack` with an **ECDSA signature from its Keystore key** over `commandId|state|timestamp`. Duplicate/late acks fail the state machine.
- Lost Mode activation, device revocation and account deletion require a **recent interactive sign-in** (JWT `amr` timestamp).
- Evidence bucket is private; objects must live under `<auth.uid()>/`. At-rest encryption is Supabase's; **no client-side end-to-end encryption is implemented**.

## Secrets (Supabase > Edge Functions > Secrets; never in git or the apps)
`ALLOWED_ORIGINS` (dashboard origin), `DASHBOARD_URL`, `FCM_SERVICE_ACCOUNT_JSON`,
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `PLAY_PACKAGE_NAME` (com.wyrix.guard), `PLAY_PRODUCT_IDS`,
`RESEND_API_KEY`, `FROM_EMAIL`, `MAINTENANCE_SECRET`.
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

GitHub Actions secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `MAINTENANCE_SECRET`.

## Deploy (Termux, no PC)
Run the "Backend (Supabase)" workflow manually with `deploy = true`; it applies migrations and deploys all functions after tests pass and `production` environment approval.

## Known limits
- Play Real-time Developer Notifications are not implemented; entitlements refresh via `maintenance` (every 15 min for subs expiring within 24 h) and on `verify-purchase`.
- Public contact endpoints rely on 256-bit random tokens; add edge/IP rate limiting before launch.
- Everything here is **unexecuted against a live Supabase project**. Only the shared command/signature logic was run (Node 22 stand-in for Deno).
