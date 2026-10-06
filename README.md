# adrianchen8662.github.io

Adrian Chen's personal website, built with [Astro](https://astro.build), using React for the interactive parts, and hosted on GitHub Pages.

## Working on the site

Needs Node 22.12 or newer.

```sh
npm install
npm run dev       # local site at http://localhost:4321, reloads on save
npm run build     # type-check, then build into dist/
npm run preview   # serve the built site from dist/
```

## Where things are

| Path | What it holds |
| --- | --- |
| `_posts/<blog>/` | Blog posts, one folder per blog in the Blogs menu |
| `_data/timeline.yml` | Jobs, schooling and projects for the home page timeline |
| `src/blogs.ts` | The blogs: menu name, page heading and intro |
| `src/site.ts` | Navigation and profile links |
| `src/pages/` | One file per page; `[blog]/` builds each blog and its posts |
| `src/components/` | Navigation, footer, typewriter heading, timeline, Now Playing and Most Played cards |
| `worker/` | The Cloudflare Worker behind those cards (see [The Worker](#the-worker)) |
| `src/styles/global.css` | The palette and site styles |
| `public/` | Files served as they are: images, favicon, `robots.txt` |

## Writing a post

Add `_posts/<blog>/YYYY-MM-DD-Title-Of-Post.md`:

```md
---
title: Title Of Post
date: 2026-10-04
categories:
  - Server
---

The first paragraph is the excerpt in the blog's post list.
```

It's published at `/<blog address>/title-of-post/`, where the blog's address is its `slug` in `src/blogs.ts`.

Posts are all rights reserved by default. Add `license: cc0` to a post's front matter to dedicate it to the public domain; the post then carries a CC0 notice.

## Images in posts

- **Compressed:** put the image next to the post, for example `_posts/<blog>/images/<post>/diagram.png`, and link it relatively: `![Diagram](./images/<post>/diagram.png)`. The build turns it into WebP in several sizes, and browsers download only the size they need. Use this for screenshots and diagrams.
- **Full size:** put the file in `public/`, for example `public/photos/trip/beach.jpg`, and link it from the site root: `![Beach](/photos/trip/beach.jpg)`. It's published exactly as it is. Use this for photos you want shown at full quality.

## Adding a blog

1. Create `_posts/<id>/` for its posts. Until it has one, keep an empty `.gitkeep` file in it, since git doesn't store empty folders.
2. Add the blog to `src/blogs.ts`: its folder (`id`), its address (`slug`, the blog's full name, like `njit-cs-632-advanced-database-system-design`), its menu `name`, page `title` and `description`. It shows up in the Blogs menu and the footer.

If a blog's address changes, move the old one into `formerSlugs`; the old address and its posts' old addresses then forward to the new ones.

## Updating the timeline

Add an entry to `_data/timeline.yml`; order doesn't matter. The home page sorts entries from the present back into the past and groups jobs at the same organization into one card.

```yaml
- kind: work            # work, education or project
  title: Software Engineer
  organization: ASRC Federal
  start: 2025-09        # YYYY-MM or YYYY; leave out end while it's ongoing
  description:
    - One line per bullet
  skills:
    - C++
```

`type`, `location`, `workplace`, `end`, `link` (`label` and `href`) and `image` (`src` and `alt`) are optional; the comments at the top of the file list them. For a certification, use `kind: certification`, `start` for when it was issued and `expires` for when it runs out.

## Updating the resume

The Resume page embeds `public/Adrian-Chen-Resume.pdf`; phones, which can't show a PDF inline, get a preview image that links to it. To update it:

1. Replace `public/Adrian-Chen-Resume.pdf` with the new PDF.
2. Regenerate the preview: `pdftoppm -r 150 -png -singlefile public/Adrian-Chen-Resume.pdf src/assets/resume-preview` (`pdftoppm` is in the poppler package: `brew install poppler`, or `apt install poppler-utils`).
3. Change the `updated` date at the top of `src/pages/resume.astro`.

## The Worker

The About page's cards don't talk to Spotify or ListenBrainz themselves. They ask a small Cloudflare Worker in `worker/`, which keeps the Spotify credentials private and my listening history in a database:

| Route | What it answers |
| --- | --- |
| `GET /now-playing` | What Spotify says I'm playing right now (checked live, shared for 10 seconds between visitors). When nothing is playing, or Spotify can't be reached, my latest ListenBrainz listen. |
| `GET /most-played` | The Most Played counts for 7 days, 30 days and this year. |
| `GET /history` | My listens, newest first (`?limit=50&before=<seconds>`), for pages and apps to come. |
| `GET /status` | When the last ListenBrainz sync worked, and what went wrong if it didn't. |
| `POST /admin/sync` | Runs a sync by hand. Needs the `ADMIN_TOKEN` secret, and doesn't exist without it. |

Every 15 minutes a cron trigger copies new listens from ListenBrainz into a D1 database (the first runs fill in this year, a few hundred at a time) and recounts Most Played. If ListenBrainz is down, nothing is lost: the Worker keeps serving what it has, and `/status` says what failed. Browsers other than my own site's can't read the API (`ALLOWED_ORIGINS` in `worker/wrangler.toml`).

### Setting it up

You need a free Cloudflare account and Node 22 on your computer. The Worker is its own project with its own `package.json`, so every command below runs from inside the `worker/` folder, not the repository root:

```sh
cd worker
npm install
```

1. **Log in:** `npx wrangler login` opens a browser tab to authorize your Cloudflare account. `npx wrangler whoami` shows the account ID. Over SSH the login can't reach your browser; either forward its port (`ssh -L 8976:localhost:8976 -L 8888:127.0.0.1:8888 you@host`, then `npx wrangler login --browser=false`) or skip it and export a `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` instead. The `8888` forward is for step 4.
2. **Create the database:** `npx wrangler d1 create site-api`, then paste the `database_id` it prints into `worker/wrangler.toml`. It isn't a secret.
3. **Create the tables:** `npm run migrate`.
4. **Spotify:** in the [Spotify dashboard](https://developer.spotify.com/dashboard), open the app for this site and add `http://127.0.0.1:8888/callback` as a redirect URI. Then get a refresh token:

   ```sh
   SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... npm run auth
   ```

   Open the address it prints, approve access (it only asks to see what's playing), and it prints the refresh token.
5. **Deploy:** `npm run deploy` creates the Worker (secrets can only be added to a Worker that exists) and prints its address, like `https://site-api.<you>.workers.dev`. If it asks you to register a `workers.dev` subdomain, accept. Until the secrets are added, Now Playing just shows your latest ListenBrainz listen.
6. **Give the Worker its secrets:** run each of these and paste the value when asked. They're stored in Cloudflare, never in this repository or the site, and take effect at once (no second deploy):

   ```sh
   npx wrangler secret put SPOTIFY_CLIENT_ID
   npx wrangler secret put SPOTIFY_CLIENT_SECRET
   npx wrangler secret put SPOTIFY_REFRESH_TOKEN
   npx wrangler secret put ADMIN_TOKEN     # optional: any long random string
   ```

7. **Fill in the history:** `curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" <address>/admin/sync`. Repeat it until `added` is 0 (the cron does the same every 15 minutes, so you can also just wait), then check `<address>/most-played`. ListenBrainz can be very slow or return errors; a run that hits one keeps the listens it had already fetched and reports the problem in `error`, so just run it again. Until the history catches up to today, Now Playing's "Last Played" fallback (not the live Spotify track) shows an older listen.
8. **Point the site at it:** in the repository's Settings → Secrets and variables → Actions → **Variables**, add `PUBLIC_API_URL` with the Worker's address. For `npm run dev`, put `PUBLIC_API_URL=<address>` in a `.env` file instead.
9. **Deploy from GitHub from now on:** `.github/workflows/worker.yml` checks the Worker on every change and deploys it from `main`. Add two repository **secrets** (the same page, **Secrets**): `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`, made at Cloudflare → My Profile → API Tokens from the **Edit Cloudflare Workers** template (check that it includes *Account → D1 → Edit*, and add it if not: the deploy applies the database migrations).

Do steps 1 to 8 before merging this to `main`: until `PUBLIC_API_URL` is set, the cards say they can't load.

### Working on it

- `npm test` runs the Worker's tests (real SQL on SQLite, fake ListenBrainz and Spotify); `npm run typecheck` checks the types.
- `npm run dev` runs it locally with a local database (`npm run migrate:local` first, and a `.dev.vars` file with the secrets above). `curl -X POST localhost:8787/admin/sync -H "Authorization: Bearer ..."` syncs it.
- The free plan allows 100,000 requests a day, 10 ms of processor time per request and 50 outside requests per run, which is why each sync reads a few pages (`SYNC_PAGE_SIZE`, `SYNC_MAX_PAGES`) for at most `SYNC_BUDGET_MS` (90 seconds), and the Most Played counts are stored rather than worked out per visitor. If a sync ever fails with a CPU limit error in the Worker's logs, lower the first two numbers.
- A custom domain would let the Worker use Cloudflare's edge cache; on `workers.dev` it keeps answers in memory instead.

## Deploying

The site is at https://adrianchen.fyi. Cloudflare builds it from this repository on every push to `main` (and gives each branch a preview URL), using `npm run build` and `npx wrangler deploy` with the settings in `wrangler.jsonc`. Its build variables are `NODE_VERSION` (22) and `PUBLIC_API_URL`, set in the project's Settings → Build in the Cloudflare dashboard.

`.github/workflows/deploy.yml` still builds every push and pull request as a check, and publishes to GitHub Pages (Settings → Pages, **Source**: GitHub Actions) until that copy is retired. The Worker deploys separately, with `.github/workflows/worker.yml`.

## License

The source code is open source under the [MIT License](LICENSE). The content (blog posts and their images, the timeline and other data in `_data/`, the resume, the icons, and the written text of the pages) is copyrighted, all rights reserved, except the Nakamichi spec sheet and its data, which are public domain (CC0); see [CONTENT-LICENSE.md](CONTENT-LICENSE.md) for the full list. If you reuse the code, swap in your own content.

## Credits

The Now Playing card is adapted from [prcutler/listenbrainz-widget](https://github.com/prcutler/listenbrainz-widget) (MIT); its license notice is in `src/components/NowPlayingCard.tsx`.
