import React, { type ReactNode } from 'react';
import { useThemeConfig } from '@docusaurus/theme-common';
import { useNavbarMobileSidebar } from '@docusaurus/theme-common/internal';
import NavbarItem, { type Props as NavbarItemConfig } from '@theme/NavbarItem';

function useLocalNavbarItems(): NavbarItemConfig[] {
  const items = useThemeConfig().navbar.items as NavbarItemConfig[];
  return items.filter((item) => item.position !== 'right');
}

/**
 * The ecosystem links stay visible in the mobile publication rail. Keeping
 * them out of the Explore drawer prevents two competing copies of the same
 * global navigation while retaining Docusaurus' nested local menus.
 */
export default function NavbarMobilePrimaryMenu(): ReactNode {
  const mobileSidebar = useNavbarMobileSidebar();
  const items = useLocalNavbarItems();

  return (
    <ul className="menu__list">
      {items.map((item, index) => (
        <NavbarItem
          mobile
          {...item}
          onClick={() => mobileSidebar.toggle()}
          key={index}
        />
      ))}
    </ul>
  );
}
