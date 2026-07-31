import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';

interface ContentHubEntry {
  description: string;
  href: string;
  label?: string;
  title: string;
  variant?: 'related';
}

interface ContentHubProps {
  description: string;
  entries: ContentHubEntry[];
  eyebrow: string;
  title: string;
}

export default function ContentHub({
  description,
  entries,
  eyebrow,
  title
}: ContentHubProps): React.JSX.Element {
  return (
    <Layout title={title} description={description}>
      <main className="content-hub container margin-vert--xl">
        <header className="content-hub__hero">
          <p className="content-hub__eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        <section aria-label={`${title} reading list`} className="content-hub__list">
          {entries.map((entry) => (
            <article
              className={
                entry.variant === 'related'
                  ? 'content-hub__entry content-hub__entry--related'
                  : 'content-hub__entry'
              }
              key={entry.href}
            >
              {entry.label ? (
                <p className={entry.variant === 'related' ? 'content-hub__badge' : undefined}>
                  {entry.label}
                </p>
              ) : null}
              <h2>
                <Link to={entry.href}>{entry.title}</Link>
              </h2>
              <p>{entry.description}</p>
              <Link className="content-hub__link" to={entry.href}>
                Read entry <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </section>
      </main>
    </Layout>
  );
}
