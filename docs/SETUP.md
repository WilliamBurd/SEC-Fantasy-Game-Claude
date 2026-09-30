# Setup and deployment

One-time setup for hosting, sign-in and email, in the order to do it. Menu
names in the Vercel, Supabase and Google dashboards change now and then; if a
name doesn't match exactly, look for the closest one.

Values used below:

- Supabase project URL: `https://<ref>.supabase.co` (Supabase dashboard ->
  Project Settings -> API)
- Your app's address: `https://sec-fantasy-game.vercel.app` (shown as
  `https://<app>.vercel.app` below; you get it in step 2)

## 1. Make `main` the default branch (GitHub, 2 minutes)

A `main` branch holds the finished work; each phase is built on its own
branch and merged in. Vercel deploys `main` to production.

1. **Create `main`:** open the repository on GitHub -> the branch dropdown
   (top left of the file list) -> **View all branches** -> **New branch**.
   Name: `main`. Source: `claude/sec-fantasy-game-requirements-bwpwpz`.
   **Create new branch**.
2. **Make it the default:** **Settings** -> **General** -> under **Default
   branch**, click the switch icon (two arrows), choose `main`, then
   **Update** and confirm.

## 2. Host the app on Vercel (15 minutes)

The Hobby (free) plan is enough while the game is free to play. The
scheduled jobs in `vercel.json` start running once this is live.

1. **Make a strong `CRON_SECRET`.** Any long random string works. On a Mac
   or Linux terminal: `openssl rand -hex 32`. Or use a password manager's
   generator (40+ characters, letters and numbers). Keep it somewhere safe.
2. Go to <https://vercel.com>, sign up with **Continue with GitHub**.
3. **Add New...** -> **Project**. If the repository isn't listed, click
   **Adjust GitHub App Permissions** and give Vercel access to it.
   Click **Import** next to the repository.
4. Framework preset: **Next.js** (detected automatically). Leave the build
   settings as they are.
5. Open **Environment Variables** and add these five (same values as your
   `.env.local`, except the new `CRON_SECRET`):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` (no `/rest/v1/`) |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_...` |
   | `CFBD_API_KEY` | your CFBD key |
   | `CRON_SECRET` | the string from step 1 |

6. Click **Deploy**. When it finishes, note the address it gives you
   (`https://<app>.vercel.app`). That's your production URL.
7. **Check the production branch:** Project -> **Settings** -> **Git** (or
   **Environments** -> **Production**) -> Production branch = `main`.
8. **Check the scheduled jobs:** Project -> **Settings** -> **Cron Jobs**
   should list four jobs: `reconcile-week`, `roster-check`,
   `generate-salaries` and `injury-report`.
9. **Test a job** from a terminal (replace both placeholders):

   ```sh
   curl -H "Authorization: Bearer <CRON_SECRET>" https://<app>.vercel.app/api/jobs/injury-report
   ```

   You should get JSON back: either the injury counts or, on a Monday or
   Tuesday, `"status": "skipped"`. A 401 means the secret doesn't match.

If you change an environment variable later, redeploy (Deployments -> the
latest one -> **Redeploy**) so the app picks it up.

### When the jobs run (UTC; US Eastern is 4 hours behind until November)

| Job | Schedule |
| --- | --- |
| `reconcile-week` | Monday 12:00 |
| `roster-check` | Tuesday 10:00 |
| `generate-salaries` | Tuesday 12:00 |
| `injury-report` | Daily 13:00 (it only acts Wednesday to Friday and on game days) |

On the Hobby plan each job runs once at some point within its hour. Live
scoring every 10 minutes (`score-games`) needs Vercel Pro or Supabase
pg_cron, and is set up in Phase 7; until then Monday's `reconcile-week`
brings in the week's final stats.

## 3. Supabase sign-in addresses (3 minutes)

Tells Supabase where it may send users back to after they sign in.

1. Supabase dashboard -> **Authentication** -> **URL Configuration**.
2. **Site URL**: `https://<app>.vercel.app`
3. **Redirect URLs** -> **Add URL**, add each of these:
   - `http://localhost:3000/**`
   - `https://<app>.vercel.app/**`
4. Save.

## 4. Google sign-in (20 minutes)

### In Google Cloud

1. Go to <https://console.cloud.google.com> and sign in.
2. Project picker (top left) -> **New Project** -> name it
   `SEC Gridiron 100` -> **Create**, then select it.
3. Menu -> **Google Auth Platform** (called **APIs & Services -> OAuth
   consent screen** in older layouts) -> **Get started**:
   - **App name**: SEC Gridiron 100
   - **User support email**: your email
   - **Audience**: **External**
   - **Contact information**: your email
   - Agree to the policy -> **Create**
4. **Clients** -> **Create client**:
   - **Application type**: Web application
   - **Name**: SEC Gridiron 100 web
   - **Authorized JavaScript origins**: `https://<app>.vercel.app` and
     `http://localhost:3000`
   - **Authorized redirect URIs**: `https://<ref>.supabase.co/auth/v1/callback`
   - **Create**. Copy the **Client ID** and **Client secret** (the secret is
     shown once; download the JSON if offered).
5. **Audience** -> **Publish app** -> confirm. While the app is in
   "Testing", only accounts you list as test users can sign in. The app asks
   only for name and email, so Google doesn't need to review it. (Leave the
   logo empty: adding one does trigger a review.)

### In Supabase

1. **Authentication** -> **Sign In / Providers** -> **Google**.
2. Turn it on, paste the **Client ID** and **Client Secret**, **Save**.
3. The page shows a **Callback URL**; it should match the redirect URI you
   gave Google in step 4.

## 5. Email for sign-ups (20 minutes; needs a domain you own)

Supabase's built-in email is for testing: it sends only a few emails an hour.
Before real users sign up with email and password, send through your own
provider. You need a domain to send from (for example from Namecheap, Cloudflare or
Porkbun, about $10 a year).

1. Sign up at <https://resend.com> (free for 3,000 emails a month).
2. **Domains** -> **Add Domain** -> enter your domain, then add the DNS
   records it shows at your domain registrar. Wait until Resend shows
   **Verified**.
3. **API Keys** -> **Create API Key** (sending access) -> copy it.
4. Supabase -> **Authentication** -> **Emails** -> **SMTP Settings** ->
   enable **Custom SMTP**:
   - **Sender email**: `noreply@<your domain>`
   - **Sender name**: SEC Gridiron 100
   - **Host**: `smtp.resend.com`
   - **Port**: `465`
   - **Username**: `resend`
   - **Password**: the API key
   - **Save**
5. **Authentication** -> **Rate Limits**: raise **emails sent per hour**
   (for example to 100).

This can wait until just before launch; sign-in works without it for
testing.

### Optional: email links that work on any device

By default, a confirmation or password-reset link only works in the browser
that asked for it (Supabase's secure default for this setup). To make links
work when someone signs up on a laptop and opens the email on their phone,
change two templates in Supabase -> **Authentication** -> **Emails** ->
**Templates**. In each, replace `{{ .ConfirmationURL }}` in the link with:

- **Confirm signup**:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
- **Reset password**:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`

The app handles both kinds of link.

## 6. Make yourself an admin (after Phase 3; 1 minute)

Sign in to the app once and pick a username, then in the Supabase dashboard
-> **SQL Editor** run (with your username):

```sql
UPDATE public.profiles SET is_admin = TRUE WHERE username = 'your_username';
```

It should report 1 row updated. The admin screen (Phase 6) checks this flag.
