// Turns a built copy of the site into one where every page forwards to the same address on adrianchen.fyi.
// GitHub Pages publishes the result at adrianchen8662.github.io so old links, and Google, follow along.
// GitHub Pages can't send real 301s, so each page is an instant meta refresh with a canonical link to the new
// address, which Google treats as a permanent redirect. 404.html forwards any other path (images, the resume PDF)
// to the same path on the new site.
//
// Usage: node scripts/github-pages-redirects.mjs [built site, default dist] [output, default redirect-site]
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

const ORIGIN = 'https://adrianchen.fyi';
const [, , fromDir = 'dist', toDir = 'redirect-site'] = process.argv;

/** Copied as they are: Search Console's ownership check for the old address, and the feed, so subscribers keep working */
const keepAsIs = (path) => /^google[0-9a-f]+\.html$/.test(path) || path === 'feed.xml';

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const page = (target) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved to ${ORIGIN.replace('https://', '')}</title>
<link rel="canonical" href="${escapeHtml(target)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body><p>This page has moved to <a href="${escapeHtml(target)}">${escapeHtml(target)}</a>.</p></body>
</html>
`;

// Keeps the path, query and hash. Without JavaScript it falls back to the new home page.
const notFound = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved to ${ORIGIN.replace('https://', '')}</title>
<script>location.replace(${JSON.stringify(ORIGIN)} + location.pathname + location.search + location.hash);</script>
<noscript><meta http-equiv="refresh" content="0; url=${ORIGIN}/"></noscript>
</head>
<body><p>This site has moved to <a href="${ORIGIN}/">${ORIGIN.replace('https://', '')}</a>.</p></body>
</html>
`;

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

await rm(toDir, { recursive: true, force: true });
await mkdir(toDir, { recursive: true });

let pages = 0;
for await (const file of files(fromDir)) {
  const path = relative(fromDir, file).split(sep).join('/');
  if (keepAsIs(path)) {
    await mkdir(dirname(join(toDir, path)), { recursive: true });
    await copyFile(file, join(toDir, path));
  } else if (path === '404.html') {
    await writeFile(join(toDir, path), notFound);
  } else if (path.endsWith('.html')) {
    // about/index.html is /about/; index.html is /
    let urlPath = path === 'index.html' ? '/' : path.endsWith('/index.html') ? `/${path.slice(0, -'index.html'.length)}` : `/${path}`;
    // The site's own pages for old addresses already forward to a current one: go straight there, in one hop
    const forwards = (await readFile(file, 'utf8')).match(/http-equiv="refresh" content="0; url=(\/[^"]*)"/);
    if (forwards) urlPath = forwards[1];
    await mkdir(dirname(join(toDir, path)), { recursive: true });
    await writeFile(join(toDir, path), page(ORIGIN + urlPath));
    pages++;
  }
}

if (pages === 0) throw new Error(`No pages found in ${fromDir}; build the site first`);
console.log(`Wrote ${pages} redirect pages to ${toDir}`);
