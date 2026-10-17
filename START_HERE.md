# WYRIX GUARD - two repositories

- `wyrix-guard-android/`   Android app + Android CI
- `wyrix-guard-dashboard/` React control center + GitHub Pages workflow + `backend/` (Supabase migrations, Edge Functions, tests)

## From Termux (no PC, no Android Studio)
```sh
termux-setup-storage
pkg update && pkg install -y git unzip gh
gh auth login
cd ~ && unzip /sdcard/Download/wyrix-guard-android-full.zip && unzip /sdcard/Download/wyrix-guard-dashboard-full.zip

for r in wyrix-guard-android wyrix-guard-dashboard; do
  cd ~/$r && git init -b main && git add -A && git commit -m "Initial import"
  gh repo create "$r" --private --source=. --push
done
```
Then add secrets (`gh secret set NAME --repo <you>/<repo>`):
- android: SUPABASE_URL, SUPABASE_ANON_KEY, GOOGLE_SERVICES_JSON_B64, WYRIX_KEYSTORE_B64, WYRIX_KEYSTORE_PASSWORD, WYRIX_KEY_ALIAS, WYRIX_KEY_PASSWORD
- dashboard: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_REF, MAINTENANCE_SECRET
- dashboard Pages: `gh api -X POST repos/<you>/wyrix-guard-dashboard/pages -f build_type=workflow`

Everyday loop:
```sh
cd ~/wyrix-guard-android && nano app/src/main/java/com/wyrix/guard/...   # edit
git add -A && git commit -m "msg" && git push && gh run watch
gh run download -n wyrix-guard-debug-apk -D ~/storage/downloads
```
Read `wyrix-guard-android/docs/INTEGRATION_CHECKLIST.md` first: nothing here has been compiled or run yet.
