import React from 'react';
import ContentHub from '@site/src/components/ContentHub';

export default function StateOfDev(): React.JSX.Element {
  return (
    <ContentHub
      description="Periodic field notes from the point where an AI-assisted engineering workflow starts behaving like an automation platform."
      eyebrow="Chronicle"
      title="State of Dev"
      entries={[
{"title":"State of Dev - Week of August 3, 2026","description":"Weekly development journal covering the continued accidental construction of the SubZeroDev ecosystem.","href":"/state-of-dev-2026-08-03/","label":"Issue 2"},
        {
          label: 'Issue 1',
          title: 'State of Dev – Week of July 27, 2026',
          description:
            'A humorous state-of-development report on an AI-assisted software workflow that keeps becoming an automation platform.',
          href: '/state-of-dev-week-of-july-27-2026/'
        }
      ]}
    />
  );
}
