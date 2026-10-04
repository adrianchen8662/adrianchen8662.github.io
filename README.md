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
| `src/components/` | Navigation, footer, typewriter heading, timeline, ListenBrainz card |
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

It's published at `/<blog>/title-of-post/`.

## Adding a blog

1. Create `_posts/<id>/` for its posts. Until it has one, keep an empty `.gitkeep` file in it, since git doesn't store empty folders.
2. Add the blog to `src/blogs.ts`. It shows up in the Blogs menu and the footer, at `/<id>/`.

## Updating the timeline

Add an entry to `_data/timeline.yml`; order doesn't matter. The home page sorts entries from the present back into the past and groups jobs at the same organization into one card.

```yaml
- kind: work            # work, education or project
  title: Software Engineer
  organization: ASRC Federal
  start: 2025-12        # YYYY-MM or YYYY; leave out end while it's ongoing
  description:
    - One line per bullet
  skills:
    - C++
```

`type`, `location`, `workplace`, `end` and `link` (`label` and `href`) are optional; the comments at the top of the file list them.

## Deploying

Every push to `main` builds the site and publishes it with `.github/workflows/deploy.yml`; pull requests get a build check. In the repository's Settings → Pages, **Source** must be set to **GitHub Actions**.

## Credits

The ListenBrainz card is adapted from [prcutler/listenbrainz-widget](https://github.com/prcutler/listenbrainz-widget) (MIT); its license notice is in `src/components/ListenBrainzCard.tsx`.
