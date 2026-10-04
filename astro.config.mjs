// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://adrianchen8662.github.io',
  integrations: [
    react(),
    // Old Jekyll post URLs only redirect to the new ones, so keep them out of the sitemap
    sitemap({ filter: (page) => !/\/\d{4}\/\d{2}\/\d{2}\//.test(page) }),
  ],
});
