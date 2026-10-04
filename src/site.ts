import { BLOGS, blogUrl } from './blogs';

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
  { name: 'ListenBrainz', href: 'https://listenbrainz.org/user/adrianchen8662/' },
  { name: 'Strava', href: 'https://www.strava.com/athletes/142545549' },
];
