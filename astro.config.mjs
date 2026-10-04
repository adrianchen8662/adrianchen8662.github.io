// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { BLOGS } from './src/blogs.ts';

// Old addresses only forward to new ones (see src/pages/[...moved].astro), so keep them out of the sitemap
const formerBlogPaths = BLOGS.flatMap((blog) => (blog.formerSlugs ?? []).map((slug) => `/${slug}/`));
/** @param {string} path */
const isMoved = (path) => /\/\d{4}\/\d{2}\/\d{2}\//.test(path) || formerBlogPaths.some((prefix) => path.startsWith(prefix));

export default defineConfig({
  site: 'https://adrianchen8662.github.io',
  // Code blocks: GitHub's dark theme, whose comments stay readable (the default's don't pass contrast)
  markdown: { shikiConfig: { theme: 'github-dark-default' } },
  // Images next to posts and in the timeline are compressed and served in several sizes;
  // files in public/ (full-size photos, say) are published untouched
  image: { layout: 'constrained' },
  integrations: [
    react(),
    sitemap({ filter: (page) => !isMoved(new URL(page).pathname) }),
  ],
});
