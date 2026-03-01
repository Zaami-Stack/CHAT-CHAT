# Private Couple Chat

Private full-stack chat app for two people, built with:
- Next.js (frontend + app shell)
- Supabase (database, auth, realtime)
- Vercel (deployment)

## Features
- Passwordless email login (Supabase magic link)
- Realtime messages
- Row-level security (only your two accounts can read/write)
- Romantic animated UI (floating hearts + soft gradients)

## 1) Supabase setup
1. Create a Supabase project.
2. In Supabase, open SQL Editor and run [`supabase/schema.sql`](./supabase/schema.sql).
3. Edit the two emails in the insert at the bottom of that SQL and run again, or update rows manually.
4. In Supabase Auth settings:
   - Keep Email auth enabled.
   - Add your site URL and redirect URL (for local dev and Vercel URL).

## 2) Local environment
1. Copy `.env.example` to `.env.local`.
2. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Optional UI config:
   - `NEXT_PUBLIC_ALLOWED_EMAILS`
   - `NEXT_PUBLIC_CHAT_TITLE`
   - `NEXT_PUBLIC_PARTNER_NAME`

## 3) Run locally
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

## 4) Deploy to Vercel
1. Push this repo to GitHub.
2. Import the project into Vercel.
3. Add the same environment variables from `.env.local` in Vercel Project Settings.
4. Deploy.
5. In Supabase Auth settings, add your Vercel production URL as allowed redirect/site URL.

## Notes
- The app enforces access in two layers:
  - Frontend check using `NEXT_PUBLIC_ALLOWED_EMAILS`.
  - Database security via Supabase RLS (`couple_profiles` + policies).
- For strict privacy, always keep RLS enabled and profiles limited to your two emails.
