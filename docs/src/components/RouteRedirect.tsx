import React, { useEffect } from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';

interface RouteRedirectProps {
  destination: string;
  title: string;
}

export default function RouteRedirect({
  destination,
  title
}: RouteRedirectProps): React.JSX.Element {
  useEffect(() => {
    window.location.replace(destination);
  }, [destination]);

  return (
    <Layout title={title}>
      <main className="container margin-vert--lg">
        <h1>{title}</h1>
        <p>
          This route has moved to <Link to={destination}>{destination}</Link>.
        </p>
      </main>
    </Layout>
  );
}
