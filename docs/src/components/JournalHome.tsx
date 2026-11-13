import React from 'react';
import BlogListPage from '@theme/BlogListPage';
import { Home } from './JournalDiscovery';

// Keep older paginated list URLs readable while the root becomes discovery.
export default function JournalHome(props: React.ComponentProps<typeof BlogListPage>): React.JSX.Element {
  return props.metadata.page === 1 ? <Home /> : <BlogListPage {...props} />;
}
