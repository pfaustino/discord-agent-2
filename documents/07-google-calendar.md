# Google Calendar setup

Helena/Leo can read your Google Calendar and (for the bot owner only) create, update, and delete events. This guide walks through Google Cloud setup and connecting from the dashboard.

## 1. Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or pick an existing one).
3. **APIs & Services → Library** → search **Google Calendar API** → **Enable**.

## 2. OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. Choose **External** (unless you use Google Workspace and want Internal).
3. Fill in app name, support email, and developer contact.
4. **Scopes → Add or remove scopes** → add:
   - `https://www.googleapis.com/auth/calendar`
5. **Test users** (while app is in *Testing*): add your Google account email. Only test users can sign in until you publish the app.

## 3. OAuth client credentials

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized redirect URIs** — add exactly:
   ```
   https://web-production-304e9.up.railway.app/api/calendar/callback
   ```
   Replace with your dashboard URL if different. Must match `PUBLIC_URL` on Railway.
4. Copy the **Client ID** and **Client secret**.

## 4. Railway environment variables

In your Railway service (`web`), add:

| Variable | Value |
|----------|--------|
| `GOOGLE_CLIENT_ID` | From step 3 |
| `GOOGLE_CLIENT_SECRET` | From step 3 |
| `PUBLIC_URL` | `https://web-production-304e9.up.railway.app` (no trailing slash) |

Redeploy after saving.

## 5. Connect in the dashboard

1. Open the dashboard and sign in as the **bot owner** (password or Discord — your account must match `OWNER_ID` in Railway).
2. **Settings → Calendar**.
3. Click **Connect Google Calendar**.
4. Sign in with Google and approve calendar access.
5. Check **Let the bot use Google Calendar** and **Save**.

## 6. Test with Helena

**Owner (you):**

- “What’s on my calendar this week?”
- “Add a meeting tomorrow at 3pm called Team sync.”

**Other server members:**

- Can only ask about events if **Who can ask about events** is set to *Everyone*.
- Cannot add, change, or delete events — Helena will say only you can.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Badge says “Google OAuth not configured” | Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, redeploy |
| `redirect_uri_mismatch` | Redirect URI in Google must exactly match `{PUBLIC_URL}/api/calendar/callback` |
| “Access blocked” / app not verified | Add your Google account under OAuth consent screen → **Test users** |
| Connect button missing | Sign in as bot owner (`OWNER_ID`), not just a dashboard admin |
| No refresh token | Disconnect at [myaccount.google.com/permissions](https://myaccount.google.com/permissions), revoke the app, connect again |

## Security notes

- Refresh tokens are stored in your SQLite database (`google_calendar_connections` table) on the Railway volume.
- Only **one Google account per Discord server** is connected (yours).
- Write access is always limited to the bot owner, regardless of dashboard role.
