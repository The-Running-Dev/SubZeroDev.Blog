import React, { useEffect } from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';

interface RouteRedirectProps {
  destination: string;
  title: string;
}

export default function RouteRedirect({
  destination,
  title
}: RouteRedirectProps): React.JSX.Element {
  const resolvedDestination = useBaseUrl(destination);

  useEffect(() => {
    window.location.replace(resolvedDestination);
  }, [resolvedDestination]);

  return (
    <Layout title={title}>
      <Head>
        <meta
          httpEquiv="refresh"
          content={`0;url=${resolvedDestination}`}
        />
      </Head>
      <main className="container margin-vert--lg">
        <h1>{title}</h1>
        <p>
          This route has moved to{' '}
          <Link to={resolvedDestination}>{resolvedDestination}</Link>.
        </p>
      </main>
    </Layout>
  );
}
