import React from 'react';
import RouteRedirect from '@site/src/components/RouteRedirect';

export default function LegacyWelcomePost(): React.JSX.Element {
  return <RouteRedirect destination="/welcome/" title="Post moved" />;
}
