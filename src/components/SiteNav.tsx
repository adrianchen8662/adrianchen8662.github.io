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
