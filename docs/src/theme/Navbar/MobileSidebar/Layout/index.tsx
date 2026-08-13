import React, { type ReactNode } from 'react';

type Props = {
  header: ReactNode;
  primaryMenu: ReactNode;
};

/**
 * Docusaurus routes a mobile blog page straight to its recent-post secondary
 * panel. The masthead's Explore control instead owns the global local-nav
 * drawer, so it intentionally renders the primary menu only.
 */
export default function NavbarMobileSidebarLayout({ header, primaryMenu }: Props): ReactNode {
  return (
    <div className="navbar-sidebar">
      {header}
      <div className="navbar-sidebar__items">
        <div className="navbar-sidebar__item menu">{primaryMenu}</div>
      </div>
    </div>
  );
}
