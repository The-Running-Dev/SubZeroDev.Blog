import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useLocation } from '@docusaurus/router';
import NavbarItem from '@theme/NavbarItem';
import NavbarNavLink from '@theme/NavbarItem/NavbarNavLink';
import type { Props } from '@theme/NavbarItem/DropdownNavbarItem/Desktop';

/**
 * Docusaurus leaves a dropdown parent visually inactive when one of its child
 * routes is current. The publication rail treats Series and Builds as real
 * destinations, so their activeBasePath is promoted to the normal active
 * navbar class.
 */
export default function DropdownNavbarItemDesktop({
  activeBasePath,
  items,
  position,
  className,
  onClick,
  ...props
}: Props): ReactNode {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const { pathname } = useLocation();
  const active = activeBasePath !== undefined && pathname.startsWith(activeBasePath);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent | FocusEvent) => {
      if (!dropdownRef.current || dropdownRef.current.contains(event.target as Node)) return;
      setShowDropdown(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('focusin', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('focusin', handleClickOutside);
    };
  }, []);

  return (
    <div
      ref={dropdownRef}
      className={clsx('navbar__item', 'dropdown', 'dropdown--hoverable', {
        'dropdown--right': position === 'right',
        'dropdown--show': showDropdown
      })}
    >
      <NavbarNavLink
        aria-haspopup="true"
        aria-expanded={showDropdown}
        role="button"
        href={props.to ? undefined : '#'}
        className={clsx('navbar__link', className, {
          'navbar__link--active': active
        })}
        {...props}
        onClick={props.to ? undefined : (event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setShowDropdown(!showDropdown);
          }
        }}
      >
        {props.children ?? props.label}
      </NavbarNavLink>
      <ul className="dropdown__menu">
        {items.map((childItemProps, index) => (
          <NavbarItem
            isDropdownItem
            activeClassName="dropdown__link--active"
            {...childItemProps}
            key={index}
          />
        ))}
      </ul>
    </div>
  );
}
