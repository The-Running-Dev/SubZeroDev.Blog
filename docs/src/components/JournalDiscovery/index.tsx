import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { usePluginData } from '@docusaurus/useGlobalData';

export interface Entry {
  title: string;
  description: string;
  href: string;
  slug: string;
  date: string;
  tagKeys: string[];
  tags: Array<{ label: string; permalink: string }>;
}

interface Topic { key: string; label: string; permalink: string; description: string; count: number }
interface Chronicle { id: string; title: string; href: string; description: string; start: string }
interface DiscoveryData {
  posts: Entry[];
  topicGroups: Array<{ title: string; topics: Topic[] }>;
  otherTopics: Topic[];
  collections: Chronicle[];
  collectionTags: Record<string, string>;
  startingPoints: Entry[];
}

export function useJournal(): DiscoveryData {
  return usePluginData('journal-discovery') as unknown as DiscoveryData;
}

export function Page({ title, description, children }: { title: string; description: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <Layout title={title} description={description}>
      <main className="journal-discovery container margin-vert--xl">
        <header className="journal-discovery__intro">
          <Link className="journal-discovery__home" to="/">SubZeroDev Journal</Link>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        {children}
      </main>
    </Layout>
  );
}

export function EntryList({ entries, dates = false }: { entries: Entry[]; dates?: boolean }): React.JSX.Element {
  return (
    <div className="journal-entries">
      {entries.map((entry) => (
        <article className="journal-entry" key={entry.href}>
          {dates && <time dateTime={entry.date}>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(entry.date))}</time>}
          <h3><Link to={entry.href}>{entry.title}</Link></h3>
          <p>{entry.description}</p>
        </article>
      ))}
    </div>
  );
}

export function Home(): React.JSX.Element {
  const { posts, startingPoints } = useJournal();
  return (
    <Page title="Life, software, and everything in between." description="Stories, observations, and experiments. Some involve code. Others involve dogs, motorcycles, family, or Lucifer asking perfectly reasonable questions.">
      <nav className="journal-paths" aria-label="Explore the journal">
        <Link to="/journal/"><strong>Journal</strong><span>Every entry, newest first</span></Link>
        <Link to="/chronicles/"><strong>Chronicles</strong><span>Follow a voice or a thread</span></Link>
        <Link to="/tags/"><strong>Topics</strong><span>Find something on your mind</span></Link>
        <Link to="/projects/"><strong>Projects</strong><span>See what the experiments became</span></Link>
      </nav>
      <div className="journal-home-columns">
        <section aria-labelledby="recent-title">
          <div className="journal-section-heading"><h2 id="recent-title">Recent entries</h2><Link to="/journal/">All entries</Link></div>
          <EntryList entries={posts.slice(0, 8)} dates />
        </section>
        <aside aria-labelledby="starting-title">
          <h2 id="starting-title">A few places to start</h2>
          <EntryList entries={startingPoints} />
          <Link to="/about/">More about me</Link>
        </aside>
      </div>
    </Page>
  );
}

export function Chronicles(): React.JSX.Element {
  const { collections } = useJournal();
  return (
    <Page title="Chronicles" description="Connected entries, collected into reading paths. Follow a recurring voice, a long-running experiment, or a story that takes more than one entry to tell.">
      <div className="journal-collections">
        {collections.map((collection) => (
          <article key={collection.id}>
            <h2><Link to={collection.href}>{collection.title}</Link></h2>
            <p>{collection.description}</p>
            <div className="journal-actions"><Link to={collection.href}>Explore the Chronicle</Link><Link to={'/' + collection.start + '/'}>Start reading</Link></div>
          </article>
        ))}
      </div>
    </Page>
  );
}

export function Projects(): React.JSX.Element {
  return (
    <Page title="Projects" description="Things being built, and the journal entries behind them. Each project has its own starting point and a trail of decisions, experiments, and occasional escalation.">
      <div className="journal-collections">
        <article><h2><Link to="/projects/game-engine/">Game Engine</Link></h2><p>Reusable game systems, an expanding engine, and the Lucifer Chronicles game concept that emerged along the way.</p><Link to="/projects/game-engine/">Explore the project</Link></article>
        <article><h2><Link to="/the-absurd-adventures-of-neo/">The Absurd Adventures of Neo</Link></h2><p>A creative project brief: premise, character, and the world around Neo.</p><Link to="/the-absurd-adventures-of-neo/">Read the project brief</Link></article>
      </div>
      <section className="journal-follow-on"><h2>The publishing experiment</h2><p>The journal itself has a development story, collected in <Link to="/series/building-the-blog/">Building the Journal</Link>.</p></section>
    </Page>
  );
}
