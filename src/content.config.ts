import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  // _posts/<blog>/YYYY-MM-DD-Title.md
  loader: glob({ pattern: '*/*.md', base: './_posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    categories: z.array(z.string()).default([]),
  }),
});

export const collections = { posts };
