import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { parse } from 'yaml';

const posts = defineCollection({
  // _posts/<blog>/YYYY-MM-DD-Title.md, or .mdx for a post that uses components such as <ExplodedView>
  loader: glob({ pattern: '*/*.{md,mdx}', base: './_posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    categories: z.array(z.string()).default([]),
  }),
});

// YAML reads a bare year like 2019 as a number, so accept either and keep it as text
const yearMonth = z.coerce.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'Use YYYY-MM or YYYY');

const timeline = defineCollection({
  // Entries don't need ids in the file; number them in file order
  loader: file('_data/timeline.yml', {
    parser: (text) => (parse(text) as Record<string, unknown>[]).map((entry, i) => ({ id: String(i + 1), ...entry })),
  }),
  schema: ({ image }) =>
    z.object({
      kind: z.enum(['work', 'education', 'project', 'certification']),
      title: z.string(),
      organization: z.string(),
      type: z.string().optional(),
      location: z.string().optional(),
      workplace: z.string().optional(),
      /** For a certification, when it was issued */
      start: yearMonth,
      end: yearMonth.optional(),
      /** Certifications only */
      expires: yearMonth.optional(),
      description: z.array(z.string()).default([]),
      skills: z.array(z.string()).default([]),
      link: z.object({ label: z.string(), href: z.string() }).optional(),
      /** A picture on the card; the path is relative to _data/timeline.yml */
      image: z.object({ src: image(), alt: z.string() }).optional(),
    }),
});

export const collections = { posts, timeline };
