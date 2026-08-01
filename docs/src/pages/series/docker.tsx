import React from 'react';
import ContentHub from '@site/src/components/ContentHub';

export default function Docker(): React.JSX.Element {
  return (
    <ContentHub
      description="A practical path from installing Docker and running a first container to choosing a reusable Compose setup."
      eyebrow="Series"
      title="Docker"
      entries={[
        {
          label: 'Start here',
          title: 'Getting Started with Docker on Windows 11',
          description:
            'Install WSL2 and Docker Desktop, run a first container, and build the core mental model.',
          href: '/getting-started-with-docker-on-windows-11/'
        },
        {
          label: 'Next step',
          title: 'Docker Run vs. Docker Compose',
          description:
            'Choose between a quick one-off container command and a reusable, shareable Compose definition.',
          href: '/docker-run-vs-docker-compose/'
        }
      ]}
    />
  );
}
