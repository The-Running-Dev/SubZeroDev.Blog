import React from 'react';
import Link from '@docusaurus/Link';
import RouteRedirect from './RouteRedirect';
import { Entry, EntryList, Page } from './JournalDiscovery';

export default function LegacyTopicPage({ legacy }: { legacy: { label: string; target?: string; posts: Entry[] } }): React.JSX.Element {
  if (legacy.target) return <RouteRedirect destination={legacy.target} title={legacy.label + ' topic moved'} />;
  return <Page title={legacy.label} description="An earlier journal index, kept available for existing links. Browse current subjects in Topics or follow a Chronicle."><p><Link to="/tags/">Browse current topics</Link></p><EntryList entries={legacy.posts} dates /></Page>;
}
