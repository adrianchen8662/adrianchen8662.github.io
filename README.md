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
| `src/components/` | Navigation, footer, typewriter heading, timeline, ListenBrainz cards |
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

## ListenBrainz on the About page

Now Playing is live: every visitor's browser asks ListenBrainz directly. Most played reads `/listenbrainz.json`,
a snapshot of the counts for each range that's made when the site is built, so visitors don't each fetch
thousands of listens.

- Only builds with `LISTENBRAINZ_SNAPSHOT=true` fetch it. The deploy workflow sets it, and rebuilds every
  hour to keep the counts fresh. If ListenBrainz is down, the build keeps the snapshot already on the site.
- Each run's page in the Actions tab says what happened: a notice with the time of the counts, or a warning
  that the old counts were kept. GitHub sometimes skips scheduled runs; **Run workflow** refreshes it by hand.
- Other builds, including `npm run build` on your computer, publish an empty snapshot, and the page then
  counts the listens in the browser. To build with one locally, run `LISTENBRAINZ_SNAPSHOT=true npm run build`.

## Deploying

Every push to `main` builds the site and publishes it with `.github/workflows/deploy.yml`; pull requests get a build check. In the repository's Settings → Pages, **Source** must be set to **GitHub Actions**.

## Credits

The ListenBrainz card is adapted from [prcutler/listenbrainz-widget](https://github.com/prcutler/listenbrainz-widget) (MIT); its license notice is in `src/components/ListenBrainzCard.tsx`.
