import { useEffect, useRef, useState } from 'react';
import type { NavItem, NavLink } from '../site';

interface Props {
  items: NavItem[];
  currentPath: string;
}

function NavAnchor({ link, currentPath }: { link: NavLink; currentPath: string }) {
  const active = link.href === currentPath;
  const className = [link.highlight && 'highlight', active && 'active'].filter(Boolean).join(' ');
  return (
    <a href={link.href} className={className || undefined} aria-current={active ? 'page' : undefined}>
      {link.name}
    </a>
  );
}

type Theme = 'light' | 'dark';

const systemTheme = (): Theme => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const currentTheme = (): Theme => (document.documentElement.dataset.theme as Theme | undefined) ?? systemTheme();

/** Light/dark switch. The pick is saved; picking the device's own theme goes back to following the device. */
function ThemeToggle() {
  // Unknown until the page is in the browser; the icons are switched by CSS, so nothing flickers meanwhile
  const [dark, setDark] = useState<boolean>();

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(currentTheme() === 'dark');
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  function toggle() {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    const followDevice = next === systemTheme();
    const root = document.documentElement;
    if (followDevice) delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (followDevice) localStorage.removeItem('theme');
      else localStorage.setItem('theme', next);
    } catch {
      // Storage can be blocked; the switch still works for this page
    }
    setDark(next === 'dark');
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Dark theme"
      aria-pressed={dark}
      title={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
      onClick={toggle}
    >
      <svg className="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </svg>
      <svg className="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}

export default function SiteNav({ items, currentPath }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // Close the dropdown on a click outside the nav or on Escape
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!navRef.current?.contains(event.target as Node)) setOpenDropdown(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenDropdown(null);
    }
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <nav ref={navRef} className={menuOpen ? 'site-nav open' : 'site-nav'} aria-label="Main">
      <ThemeToggle />
      <button
        type="button"
        className="nav-toggle"
        aria-label="Menu"
        aria-controls="nav-links"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        &#9776;
      </button>
      <ul id="nav-links" className="nav-links">
        {items.map((item) => {
          if (!('items' in item)) {
            return (
              <li key={item.href}>
                <NavAnchor link={item} currentPath={currentPath} />
              </li>
            );
          }
          const open = openDropdown === item.name;
          const active = item.items.some((link) => link.href === currentPath);
          const menuId = `nav-${item.name.toLowerCase()}`;
          return (
            <li key={item.name} className={open ? 'dropdown open' : 'dropdown'}>
              <button
                type="button"
                className={active ? 'dropdown-toggle active' : 'dropdown-toggle'}
                aria-controls={menuId}
                aria-expanded={open}
                onClick={() => setOpenDropdown(open ? null : item.name)}
              >
                {item.name}
              </button>
              <ul id={menuId} className="dropdown-menu">
                {item.items.map((link) => (
                  <li key={link.href}>
                    <NavAnchor link={link} currentPath={currentPath} />
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
