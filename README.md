# Private Couple Chat

Private full-stack chat app for two people, built with:
- Next.js (frontend + API routes)
- Supabase (database only, accessed server-side)
- Vercel (deployment)

## Login model
- You unlock chat with one shared secret word (example: `israe`).
- No email login.
- A signed HTTP-only cookie keeps the session.
- Includes typing indicator and message replies.

## 1) Supabase setup
1. Create a Supabase project.
2. Open SQL Editor and run [`supabase/schema.sql`](./supabase/schema.sql).
3. Copy these values from `Settings -> API`:
   - `Project URL`
   - `service_role` key (secret, server-only)

## 2) Environment variables
Set these in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL` = your project URL
- `SUPABASE_SERVICE_ROLE_KEY` = your service role key
- `CHAT_SECRET_WORD` = your shared word (for example `israe`)
- `APP_SESSION_SECRET` = long random string for signing cookies
- `NEXT_PUBLIC_CHAT_TITLE` (optional)

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in any `NEXT_PUBLIC_*` variable.

## 3) Deploy
1. Push this repo to GitHub.
2. Import in Vercel.
3. Add the env vars above.
4. Deploy.

## Notes
- Chat messages are read/written through server routes only.
- RLS stays enabled in Supabase, but no public client access is used.
