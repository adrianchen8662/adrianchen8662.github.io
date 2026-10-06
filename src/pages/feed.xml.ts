import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE } from '../site';
import { excerpt, getPosts, postUrl } from '../lib/posts';

export async function GET(context: APIContext) {
  const posts = await getPosts();
  return rss({
    title: `${SITE.name}'s blog posts`,
    description: SITE.description,
    site: context.site ?? 'https://adrianchen.fyi',
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      link: postUrl(post),
      description: excerpt(post),
      categories: post.data.categories,
    })),
  });
}
