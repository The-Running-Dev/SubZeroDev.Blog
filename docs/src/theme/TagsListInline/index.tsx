import React from 'react';
import Link from '@docusaurus/Link';
import { useJournal } from '../../components/JournalDiscovery';

interface Tag { label: string; permalink: string }

export default function TagsListInline({ tags }: { tags: Tag[] }): React.JSX.Element {
  const { collectionTags, collections } = useJournal();
  const subjects: Tag[] = [];
  const chronicles: Array<{ title: string; href: string }> = [];
  for (const tag of tags) {
    const key = tag.permalink.replace(/\/$/, '').split('/').pop() ?? '';
    const collection = collections.find((item) => item.id === collectionTags[key]);
    if (collection) chronicles.push(collection);
    else subjects.push(tag);
  }
  return <div className="journal-post-links">
    {subjects.length > 0 && <div><b>Topics:</b><ul>{subjects.map((tag) => <li key={tag.permalink}><Link to={tag.permalink}>{tag.label}</Link></li>)}</ul></div>}
    {chronicles.length > 0 && <div><b>Chronicles:</b><ul>{chronicles.map((item) => <li key={item.href}><Link to={item.href}>{item.title}</Link></li>)}</ul></div>}
  </div>;
}
