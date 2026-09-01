# Notion Google Calendar Widget

A weekly calendar widget that embeds into a Notion page. It authenticates through a serverless proxy using a Google service account, so your calendar stays private and no credentials are ever exposed to the browser.

```
Browser (widget)  →  /api/events (Vercel Function)  →  Google Calendar API
    public          service account key lives here      private calendars
```

- Auto-refreshes every 60 seconds
- Current-time indicator line
- Automatic light/dark mode based on system preference
- Week navigation (previous / this week / next)
- Multiple calendars at once, each in its own color

---

## 1. Google Cloud setup

1. Create a new project in the [Google Cloud Console](https://console.cloud.google.com)
2. Go to **APIs & Services → Library**, search for `Google Calendar API`, and click **Enable**
3. Go to **APIs & Services → Credentials → Create Credentials → Service account**
   - Name it anything (e.g. `notion-calendar-reader`)
   - **Skip the role assignment** — calendar access is granted by sharing in the next step
4. Open the service account → **Keys → Add Key → Create new key → JSON** → download the file
5. Copy the `client_email` value from the JSON (`...@....iam.gserviceaccount.com`)

## 2. Share your calendars

For **each** calendar you want to display:

1. In Google Calendar, open the calendar's **Settings and sharing**
2. Under **Share with specific people or groups**, add the service account email
3. Set the permission to **See all event details** (read-only)
4. Scroll to **Integrate calendar** and copy the **Calendar ID**

> Principle of least privilege: never grant write access. The widget only reads.

## 3. Deploy

```bash
# Push this folder to a GitHub repository, then
npm install
npx vercel        # first deploy
npx vercel --prod # production deploy
```

In your Vercel project, go to **Settings → Environment Variables** and add:

| Name | Value |
|---|---|
| `GOOGLE_CALENDAR_ID` | One or more calendar IDs, comma-separated |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | The **entire contents** of the JSON key file |

### Multiple calendars

Separate calendar IDs with commas. Use `Label=ID` to override the display name; omit the label to use the calendar's own name from Google.

```
Classes=abc123@group.calendar.google.com, Personal=you@gmail.com, Club=xyz789@group.calendar.google.com
```

Up to 8 calendars are supported. Colors are assigned in the order listed. If one calendar fails to load, the others still render.

**Leave Root Directory empty (`./`) in your Vercel project settings.** Setting it to `public` will exclude the `api/` folder and every API request will return 404.

Environment variables only take effect after a **redeploy** — adding them alone is not enough.

⚠️ Never commit the downloaded JSON key file. Add it to `.gitignore`.

## 4. Embed in Notion

1. Copy your deployment URL (`https://<project>.vercel.app`) — the root URL, not `/api/events`
2. In Notion, type `/embed` and paste the URL, then click **Embed link**
3. Drag the bottom handle to resize (around 600px height works well)

`vercel.json` restricts `frame-ancestors` to Notion domains, so the widget cannot be iframed from any other site.

---

## Customization

| Setting | Location |
|---|---|
| Refresh interval | `REFRESH_MS` in `public/index.html` |
| Default hour range (07:00–22:00) | `let from = 7, to = 22` inside `render()` |
| Row height per hour | `ROW` constant and the CSS `--row` variable (change both) |
| First day of week | The `shift` calculation in `startOfWeek()` |
| Calendar colors | `--cal-0` through `--cal-7` in `:root` and the dark-mode block |

## Security notes

- The proxy returns only `id`, `title`, `start`, `end`, and a calendar index. Descriptions, attendees, locations, and meeting links never reach the browser.
- The server caps queries at 40 days, preventing anyone from scraping the full calendar history by manipulating the URL.
- Responses are cached for 60 seconds to conserve Calendar API quota.
- Anyone who can see your Notion page can read the event titles. Use a dedicated calendar if the page is shared.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `/api/events` returns 404 | Root Directory is set to `public`, or `api/events.js` was never pushed |
| "Server configuration" error | Environment variables missing, or added without redeploying |
| "Failed to load calendar" | The service account was not shared on the calendar |
| One calendar is silently empty | That specific calendar was not shared with the service account |

Check **Logs** in the Vercel dashboard for the actual Google API response code.
