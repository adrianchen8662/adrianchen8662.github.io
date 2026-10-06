import { BLOGS, blogUrl } from './blogs';

/** Whose listening the About page shows */
export const LISTENBRAINZ_USER = 'adrianchen8662';

/**
 * The Worker (worker/) that answers what's playing and what's played most. It's set when the site is built,
 * from the PUBLIC_API_URL variable (a repository variable in GitHub, or .env when working locally).
 */
export const API_URL: string = import.meta.env.PUBLIC_API_URL ?? '';

/**
 * Google Analytics 4 measurement ID (the id in the tag, not a secret). Carried over from the Jekyll site's
 * google_analytics_key. Pages only send data when served from the site's own address, so previews and local
 * runs don't count. Set to '' to turn analytics off.
 */
export const GA_MEASUREMENT_ID = 'G-93RXGJMV4K';

export const SITE = {
  name: 'Adrian Chen',
  title: "Adrian Chen's Website",
  description: "Adrian Chen's personal website.",
};

export interface NavLink {
  name: string;
  href: string;
  /** Outlined, like a button */
  highlight?: boolean;
}

export interface NavMenu {
  name: string;
  items: NavLink[];
}

export type NavItem = NavLink | NavMenu;

export const NAV: NavItem[] = [
  { name: 'Resume', href: '/resume/', highlight: true },
  { name: 'Blogs', items: BLOGS.map((blog) => ({ name: blog.name, href: blogUrl(blog) })) },
  { name: 'About', href: '/about/' },
  { name: 'Contact', href: '/contact/' },
];

export interface Profile {
  name: string;
  href: string;
  /** Shown in the footer with this icon */
  icon?: 'github' | 'linkedin';
}

export const PROFILES: Profile[] = [
  { name: 'GitHub', href: 'https://github.com/adrianchen8662/', icon: 'github' },
  { name: 'LinkedIn', href: 'https://www.linkedin.com/in/adrian-chen-728513181/', icon: 'linkedin' },
  { name: 'ListenBrainz', href: `https://listenbrainz.org/user/${LISTENBRAINZ_USER}/` },
  { name: 'Strava', href: 'https://www.strava.com/athletes/142545549' },
];
