# Ice Kannon Route

Team Ice Kannon's copy of the Wholesale Payments field site (forked from
agentroute, without the Statements generator), behind the company sign-in:

- **Routes** — a team field-route planner: managers build ZIP- or
  city-based merchant routes for their reps and watch notes roll in live.
- **Appointments** — the Team Ice Kannon appointment calendar (day / week /
  month / schedule, payouts), fed by a Google Apps Script.
- **AppUpload** — photos or PDFs of a handwritten merchant application (+
  voided check and license) become the typed Citizens, Merrick, FD North,
  PB&T, Greenlight or Pathward application (or the Pathward Program Guide), a pre-filled coversheet and any of the other forms
  (purchase order, Clover addendum, bank change, CRF, hemp & CBD, gift card,
  cash advance, Factor4 gift & loyalty set-up, Greenlight CBD application,
  Pathward application, Pathward Program Guide),
  signed on screen; past
  submissions are shared with the team; a menu photo becomes a Clover
  inventory import.

Deploy the full repo to Netlify. The only build step,
`netlify/publish.mjs`, copies the site into `_site` (what Netlify serves)
and leaves out the server's own files: the functions and their data,
installed packages, `package.json`, `netlify.toml` and this README.
`package.json` only lists the functions' dependencies.

## How the site is put together

`index.html` is the page and the whole Routes section. The other sections
live under `apps/<section>/` (`view.html`, a stylesheet, scripts) and load
the first time they're opened, then stay loaded; switching is instant and
each section keeps its place. `#routes`, `#appointments`,
`#appupload` link straight to one, and the app reopens where it was left.
Wide screens switch sections from the header; phones, tablets and the
home-screen app use a floating tab bar at the bottom (clear of the home
indicator, out of the way while typing): the open tab shows its name, the
others their icon. Press and hold a tab for its shortcuts — Routes' days,
agents and PDF; the calendar's views, Today and a new entry;
AppUpload's application, forms, Menu → Clover and
past uploads — and that tab's settings. Swipe along the bar for the next
tab; tap the open tab to go back to its top. In the home-screen app,
swipe down at the top of a page to refresh: with nothing in progress the
app reloads (the newest version, fresh data everywhere); with a form or
editor open it fetches fresh data only, so nothing is lost. The header is the same on every
section and every screen — the logo, the team name and a gear — and a
section with its own toolbar (Appointments) has it just under
the header. Switching sections has no animation. In AppUpload the header
and tab bar turn see-through over its video. The Home Screen app has a solid
status bar in the page's colour: with a see-through one, iOS 26 made the app
a status bar short of the screen, leaving a strip under the tab bar that
nothing can be drawn in (WebKit bug 301108). iOS keeps the status bar the app
was added with, so an iPhone app added before v25 says so once in a while and
shows how to add it again (remove it from the Home Screen, then Share → Add to
Home Screen in Safari); until then its tab bar takes the strip's colour.

The gear (the only one — the calendar's toolbar has none of its own) opens
**Settings**, one screen for the whole site (full screen on a phone): Team & account (team name and join code, join or create a team,
switch teams, new password, sign out), Appearance (Auto / Light / Dark),
Sync (the team's sync state, Sync now, the app version and Check for
update), then each section's own settings — Routes (PDF export, agent
list), Appointments (your own Calendly, demo data) and AppUpload (rep,
submission history). A section's settings load its code only when
opened (a **Show** button), so Settings stays quick — except Appointments,
which is always there because it holds each person's own Calendly (the
**Calendly** chip at the top of Settings jumps straight to it); they're the same
controls the section used to keep in its own settings panel.

Each section's markup ids carry a prefix (`ap-`, `sg-`, `au-`) and its
stylesheet is scoped to its own container, so nothing collides with the
page or another section; the page's own rules skip the sections the same
way. The theme (Settings → Appearance) is one choice for the whole site. Anything a section saves to a file goes to
the share sheet on iPhone/iPad (Save to Files, Print, Mail) and downloads
elsewhere.

Every deploy reaches every device by itself (the build is stamped, see
below); `VER`/`APP_VER` and `MOD_V` are the release's readable labels, kept
the same in `index.html` and `sw.js`. Vendor libraries under
`apps/*/vendor/` are never changed in place — a new version gets a new file
name.

## No sign-in

This copy is one person's site: there's no sign-in screen. It opens straight
onto its own team, **Team Ice Kannon**, which is kept on the device (and
works offline) — routes, notes, agents and calendar entries aren't synced to
the team database, so another phone or browser starts empty. Settings → Team
shows the team name only (no join code, team switching, password or sign-out).
The code that signs in and syncs is still in `index.html` behind `PERSONAL`.

The site's functions (Auto-generate, AppUpload's reader and forms,
Calendly) still check who is
calling: the page calls them as the site's owner, with no sign-in
(`netlify/au/common.mjs`; `OWNER_MODE=0` in the Netlify environment variables
turns that off). That means anyone who has the site's address can
use them — the Google Places and Claude keys bill to you — so keep the
address private (or turn on
Netlify's site password). The per-person hourly limits (30 Auto-generate
searches and 40 AppUpload reads an hour) become the whole site's limits.
AppUpload's past submissions are saved in the browser in this mode.

## Your settings

A person's own choices are kept with their account, so they come back after
signing out and appear on any phone or computer they sign in on: Appearance,
which team opens, which agent (and day) Routes opens on, the auto-generate
"Max reviews" cap, the calendar's hidden agents (My Calendly included) and
default agent for new entries, AppUpload's sales rep and territory
manager. They're kept by the
`me-prefs` function in Netlify Blobs (store `prefs`) under that person's
sign-in only: nobody else can read or change them, and only these named
settings are accepted.

The browser keeps the working copy. The device's record of what the account
last had (`wp.prefmeta`) tells the person's own changes apart from anything
else: a change goes up within seconds (when a phone was offline, once it's
back); signing in, or opening the app, brings in what changed elsewhere, and
a change made from an older copy never overwrites a newer one. Nothing goes
up from a device before it has first brought in the account's settings, and
another tab signing out never counts as clearing them. Signing out sends
what's pending first; if that can't happen (no connection) it says so, and
keeps those changes for the same person's next sign-in here. The team's own
data (routes, agents, calendar entries, the feeds) is on the team's database,
and Calendly's connection on the server. Left per device on purpose: a setup
link's feed override, demo data, the last section open.

## Building routes

On a phone the agents are listed under the day's stops, so the top of Routes
also has whose route is showing (pick another agent there), a pencil that
opens that agent's profile (change their ZIP or city, then build a new
list), and **+ Add agent**; wider screens have the Agents column beside
the route. **+ Add
agent** (anywhere) opens a blank New agent form — name, cell, email, ZIP or
city — and nothing is added or shared until **Done** (a name is needed);
Cancel adds no one. The route showing stays put; the notice offers the new
agent's (a new team's unnamed placeholder simply gives way to them).

Each agent profile (tap a roster card, or the pencil on a phone) holds their territory ZIP, city,
contact info, and route tools:

- **Auto-generate list** searches the agent's ZIP **or**
  city — only one is needed. Whichever field was typed in last is selected
  under "Search by" (tap a chip to switch), and a blank or invalid pick
  falls back to the other. It uses Google Places to find small businesses at or under the review cap (default
  150 reviews), interleaves categories, best-effort pulls a public contact
  email / owner name from each business's website, and builds the agent's
  **full 6-day route with up to 25 merchants per day**, checkpoints every
  5 stops. Requires `GOOGLE_PLACES_API_KEY` in Netlify environment
  variables (Places API (New), billing enabled). The function only runs
  for a signed-in company account with a confirmed mailbox, and each
  person can run up to 30 new searches an hour (150 a day; repeating a
  search from the last 10 minutes is free), since every search bills
  Places requests; a daily quota cap on the key in Google Cloud is still a
  good idea.
- **New list** (the button at the end of the day's heading row, above the
  first call): when an agent has worked through their route, six new days
  of businesses they haven't had, after asking once (it replaces the days
  and their notes — download the PDF first if it's needed). The search
  remembers the places each agent has been given (Netlify Blobs store
  `prospect-given`, per team + agent, the last 3,000) and leaves those out,
  along with every stop on their route now (so a route from before this
  memory gets new businesses too; matched by name + address or phone).
  When an area runs low the list is shorter and split evenly; when it runs
  out it says so and the route stays — raise the review cap or try a nearby
  ZIP.
- Manual paste-import: one business per line into any day, fields split by
  `|` or tabs ("owner: Name", a second phone, and an email are
  auto-detected); checkpoints are placed every 5 stops.

## Working a route

Merchant cards are minimal: name, tap-to-call phone, tap-to-open Maps
address, tappable owner contact when known, and a **notes line** — a note
marks the stop worked, stamps the time, moves the next-stop outline on, and
feeds the day/week tallies, the copyable day report, and
the PDF export (all six days, blank note lines when unworked).

The **PDF** button beside the day's heading ("Day 1" …) exports that PDF
in one tap, from any day; it and **New list** at the end of the row are the
same white pill with a blue icon. On an iPhone the PDF opens in the share
sheet (Save to Files, Print, Mail); elsewhere it downloads.

Also included: iOS PWA install (offline shell, safe-area layout). The app
icon is the logo — the bars with "WPI", and "Ice Kannon" under it
(`icons/ice-kannon-v2-*.png` and `ice-kannon-32.png`, and
`/apple-touch-icon.png`). The iPhone's Home Screen icon is written into
index.html itself as a data URL: the site is behind Netlify team login, and
iOS fetches a linked icon outside that login, so a linked one came out as a
plain letter. Change the picture there too if the icon changes. An iPhone
keeps the icon it saved when the app was added, so a new icon needs the app
removed and added again.

The app opens with the newest version whenever the network answers within a
few seconds, and from the device's saved copy when it doesn't (offline, a
weak signal). Every deploy is a new version: `netlify/publish.mjs` stamps a
fingerprint of the site's files into `sw.js` and `index.html`. An app left
open looks for a new version about once a minute (and on coming back to the
foreground or online) and switches to it by itself — at once if nothing has
been started, otherwise at the first safe moment (after a minute left
alone, or on coming back from the background), never while something is
half-done: typing, a sheet or the calendar editor open, an AppUpload
application or menu in progress, a PDF being made, an Undo still on offer.
It opens back where it was. Every section is saved for offline use too.

## Appointments

The calendar shows the entries added here by hand and, for anyone who
connects it, their own Calendly. (There's no Google Apps Script feed,
merchant-volume feed or team setup link in this copy.) It opens on the
month; tap a day to open that day (Day, Week and Schedule are a tap away, and
a link can name a view — the home-screen Today shortcut opens today's day).

The **+** button (bottom right of the calendar, or tap an empty slot in the
day / week view, or press C) adds an appointment, meeting or event by hand
— title, who it's for (an agent or the whole team), date, all-day or start
and end times, location, phone, notes — with no feed or script involved.
Entries are saved with the team's data in Supabase (the `events` key of
`wp_team_state`), so they show on every teammate's calendar within
seconds, work offline and merge back like route edits; tap one to edit or
delete it (with Undo). A team can have up to 1,000 upcoming entries; past
ones don't count, and once 3,000 are stored the ones dated furthest back
make room. A database trigger (`wp_team_state_keep_keys`)
keeps these entries and the team's settings when a device still running
an older version saves.

**Your Calendly.** Anyone can put their own Calendly events (interviews,
calls) on their calendar: in Calendly, Integrations → API & Webhooks → Get
a token now (or Generate new token) → Copy token, then paste it in
**Settings → Appointments → Your Calendly** and tap Connect (the gear, then
the **Calendly** chip; or press and hold the Appointments tab → Connect
your Calendly). The site's
`ap-calendly` function checks the token with Calendly and keeps it in the
site's Netlify Blobs (store `calendly`), under that person's sign-in only:
it is never sent back to any browser, and only `https://api.calendly.com`
is ever called with it (no redirects followed). The events — who booked,
their email, phone, time zone and answers, the join link, canceled ones
struck through — show on that person's calendar only, as a **My Calendly**
row above the agents (hide it like any agent) and an "On my Calendly"
count under Today at a glance; they never reach the team's data and never
count as the team's appointments. The calendar asks for the months around
the date on screen and fetches more as you move; invitee details are
remembered on the server (refreshed when the event changes, or after 12
hours) so a sync stays quick, and whatever Calendly didn't answer in time
follows a moment later. The last copy stays on the device for offline
viewing and is cleared at sign-out. A token Calendly no longer accepts
shows a banner with a way back to Settings; **Disconnect** deletes the
token and everything remembered from the site (delete the token in
Calendly to retire it there too).

## Notes

There are no frames anywhere in the site: every section is this site's own
code and markup, running in the one page.

Signing out clears what the sections keep on the device (the calendar's
feed override and cached appointments),
and so does a different person signing in on the same device.

## AppUpload

The AppUpload app (myappupload.com — the appupload repo's main branch) as a
section: the same page, video backdrop, review form and documents, running
in this site against its own functions. Everything needs a signed-in company
account (the stand-alone app's API has no sign-in at all). One part is drawn
differently: Past uploads & downloads, on the same see-through glass as the
cards above it, is a list of rows with the business, its form, rep and
time, and round Download and Remove buttons — working exactly as the
original's.

- **Reading** — photos and PDFs (up to 15 files, 15 MB each) go up one at a
  time to `au-job`, a PDF in 4 MB pieces (a request can't be larger);
  `au-extract-background` reads them with Claude using AppUpload's own code
  and SDK (a background function, so a large packet has up to 15 minutes);
  the page collects the result. Needs `ANTHROPIC_API_KEY` in the Netlify
  environment variables (`ANTHROPIC_MODEL` optionally picks the model,
  default `claude-sonnet-4-6`; `TRANSCRIBE_MOCK=1` returns sample data for a
  demo). Files and results sit in a private Netlify Blobs store only while a
  job runs — files are deleted as soon as they've been read, results as soon
  as they're collected, and `au-cleanup` (every 15 minutes) sweeps anything
  left behind, so nothing outlives the hour. Each person can start up to 40
  reads an hour (200 a day).
- **Documents** — `au-packet` fills all 16 forms (Citizens, Merrick, FD
  North, PB&T and Pathward applications, the coversheet, purchase order, Clover
  addendum, bank account change, CRF, hemp & CBD disclosure, CBD amendment,
  gift card setup, cash advance, the Factor4 Merchant Set-Up form and the
  Greenlight Payments CBD packet) with
  AppUpload's own form maps and page images, bundled in `netlify/au/` and
  never served as files. The Factor4 form and the Greenlight packet (this
  site's own additions: in
  both form pickers and the download list) place each value by the
  template's measured blanks — centered between its label and the row's
  rule — with owner, banking and equipment details filled in from the rest
  of the application. The Greenlight packet (11 pages: the CBD checklist
  and letter, the two acknowledgements, the document checklist, the
  cannabinoid addendum and the merchant application) has its own
  review sections for what only it asks (fulfillment, marketing, a third
  principal, merchant type, pricing rows, the document checklist); the
  signature goes on every signature line Owner 1 signs. Greenlight is also
  an application type (the "Application form" choice, and detected when its
  application is uploaded): the "Application" download is then the
  Greenlight packet, printed once even when both are ticked, and its
  coversheet asks for Greenlight's platform. The document reader fills in
  what only Greenlight asks, and a third owner becomes its principal 3; an
  answer two forms ask for (the MCC on the gift card form, bankruptcy on the
  cash advance form) is entered once. The Pathward application (Wholesale
  Payments' two-page "Merchant Application and Agreement" for Pathward, N.A.)
  is an application type the same way and can also be ticked on its own; its
  blanks and boxes were measured from the page, it shows only the fields it
  prints plus its own review sections (merchant # and MCC, marketing opt
  in/out, seasonal months, the site inspection, fleet / PIN debit plan /
  service plan, the three equipment rows, the third-party provider, control
  prong and principals 3-4 — principal 3 is the Greenlight form's), and a
  fourth owner read from the documents becomes its principal 4. The Pathward
  Program Guide is an application type and a box of its own the same way: its
  download is just page 2 of the 44-page Merchant Services guide (N_PW_R_2902),
  the Confirmation Page, with the business legal name and Owner 1's signature,
  title, date and printed name filled in, so choosing it shows just those
  fields. A Greenlight,
  Pathward or Factor4 field that
  fills in by itself shows that value greyed while it's empty —
  `au-packet` with `{ defaults: true }` works it out with the same code that
  prints the PDFs. The page asks
  for one document per request and puts a multi-document packet together
  itself with the same PDF library, so every request stays inside Netlify's
  time and size limits. The Clover spreadsheet comes from `au-menu-xlsx`.
- **Submission history** — the same shared table AppUpload uses
  (`public.app_submissions` in this Supabase project), read and written as
  the signed-in person through `au-history`; row-level security lets only
  confirmed company accounts in (no service key on the site). Saved
  submissions show up in both places.
- **Equipment** — `au-equipment` (the pricing matrix models for the purchase order).
- **Backdrop** — the rotating clips live in `videos/` (`backdrop.mp4` and
  `backdrop.png` at the root), cached for a week. They play only while they
  can be seen: AppUpload is open, the sign-in screen isn't over it and Reduce
  Motion is off. Otherwise both players are unloaded and any clip download is
  cancelled; when it can be seen again it picks up the same clip where it
  was. Clips that couldn't be reached (opened offline, a dead zone) are
  looked for again when the connection is back.
- **Sign-out** — the section's documents, photos, review, merchant list and
  history leave the screen and memory when a session ends, and come back
  when the person signs in again. The chosen sales rep and manager are put
  aside on sign-out and restored for the same person only.
