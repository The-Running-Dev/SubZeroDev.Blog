import React, { useMemo, useState } from 'react';
import Link from '@docusaurus/Link';
import { EntryList, Page, useJournal } from './index';

export default function Journal(): React.JSX.Element {
  const { posts } = useJournal();
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return posts.filter((post) => {
      const text = [post.title, post.description, ...post.tags.map((tag) => tag.label)].join(' ').toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [query, posts]);
  return (
    <Page title="Journal" description="Every entry, newest first. These are publication dates; the stories have their own timelines.">
      <div className="journal-index-tools">
        <div><label htmlFor="journal-search">Find an entry</label><input id="journal-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, descriptions, or topics" /></div>
        <nav aria-label="More ways to browse"><Link to="/archive/">Archive by year</Link><Link to="/tags/">Browse topics</Link><a href="/rss.xml">RSS feed</a></nav>
      </div>
      <p className="journal-result-count" role="status">{visible.length} {visible.length === 1 ? 'entry' : 'entries'}{query ? ' found' : ''}</p>
      <EntryList entries={visible} dates />
      {!visible.length && <p>Try a different phrase, or <button className="journal-text-button" onClick={() => setQuery('')}>show all entries</button>.</p>}
    </Page>
  );
}
