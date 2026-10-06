import { getCollection, type CollectionEntry } from 'astro:content';
import { BLOGS, blogUrl, type Blog } from '../blogs';

export type Post = CollectionEntry<'posts'>;

/** Splits _posts/<blog>/YYYY-MM-DD-Name.md (or .mdx) into its blog folder and name */
function source(post: Post) {
  const match = post.filePath?.match(/([^/]+)\/\d{4}-\d{2}-\d{2}-([^/]+)\.mdx?$/);
  if (!match) {
    throw new Error(`Name posts _posts/<blog>/YYYY-MM-DD-Title.md or .mdx (found ${post.filePath})`);
  }
  return { blogId: match[1], name: match[2] };
}

export function blogOf(post: Post): Blog {
  const { blogId } = source(post);
  const blog = BLOGS.find((b) => b.id === blogId);
  if (!blog) {
    throw new Error(`${post.filePath} is in _posts/${blogId}/, which isn't a blog in src/blogs.ts`);
  }
  return blog;
}

export function postSlug(post: Post) {
  return source(post).name.toLowerCase();
}

export function postUrl(post: Post) {
  return `${blogUrl(blogOf(post))}${postSlug(post)}/`;
}

/** Where the Jekyll site published a post: /<categories>/<yyyy>/<mm>/<dd>/<Name>/ */
export function jekyllUrl(post: Post) {
  const date = post.data.date;
  const parts = [
    ...post.data.categories.map((c) => c.toLowerCase()),
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    source(post).name,
  ];
  return `/${parts.join('/')}/`;
}

/** Posts newest first, optionally from one blog. Same-day posts keep Jekyll's order: reverse file name. */
export async function getPosts(blogId?: string) {
  const posts = await getCollection('posts');
  return posts
    .filter((post) => blogId === undefined || blogOf(post).id === blogId)
    .sort((a, b) => {
      const byDate = b.data.date.valueOf() - a.data.date.valueOf();
      if (byDate !== 0) return byDate;
      return (a.filePath ?? '') < (b.filePath ?? '') ? 1 : -1;
    });
}

/** First paragraph of a post as plain text, for post lists and the feed */
export function excerpt(post: Post) {
  const paragraph = (post.body ?? '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !/^(#|!\[|```|<sub|\||import |export )/.test(block));
  if (!paragraph) return '';
  return paragraph
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric', timeZone: 'UTC' });
}
