import React, { type ReactNode } from 'react';
import Link from '@docusaurus/Link';
import NavbarContent from '@theme/Navbar/Content';
import NavbarLayout from '@theme/Navbar/Layout';

/**
 * The SubZeroDev.com apex owns this identity: see its `composeApex` and
 * Presentation primitives. This is the Docusaurus translation for the blog,
 * kept local so the blog does not gain a runtime dependency on the apex site.
 */
export default function Navbar(): ReactNode {
  return (
    <header className="site-masthead">
      <div className="site-masthead__identity">
        <Link className="site-masthead__brand" href="https://subzerodev.com/">
          SubZeroDev
        </Link>
        <p className="site-masthead__meta">Professional uncertainty since 2026.</p>
        <p className="site-masthead__slogan">Well… Why not?</p>
      </div>
      <NavbarLayout>
        <NavbarContent />
      </NavbarLayout>
    </header>
  );
}
