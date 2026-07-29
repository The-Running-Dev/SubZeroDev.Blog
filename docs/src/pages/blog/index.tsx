import React from 'react';
import RouteRedirect from '@site/src/components/RouteRedirect';

export default function LegacyBlogIndex(): React.JSX.Element {
  return <RouteRedirect destination="/" title="Blog moved" />;
}
