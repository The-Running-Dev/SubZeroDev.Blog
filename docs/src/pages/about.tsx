import React from 'react';
import ContentHub from '@site/src/components/ContentHub';

export default function About(): React.JSX.Element {
  return (
    <ContentHub
      description="A practical introduction to who I am, how I work, the pattern behind the work, and the expectations that make collaboration fit."
      eyebrow="About Me"
      title="About Me"
      entries={[
        {
          label: 'Start here',
          title: 'For Humans',
          description:
            'The short, non-corporate version of how someone ends up ahead of every rubric they are handed.',
          href: '/for-humans/'
        },
        {
          label: 'Origin story',
          title: 'Ahead of the Rubric',
          description:
            "Three decades of building things before the institutions around them were ready to grade them.",
          href: '/ahead-of-the-rubric/'
        },
        {
          label: 'Evidence',
          title: 'Selected Incidents',
          description:
            'A running, incomplete list of times being early looked a lot like being wrong.',
          href: '/selected-incidents/'
        },
        {
          label: 'Working style',
          title: 'How I Work',
          description:
            'The actual pattern behind how things get done: iterative, direct, autonomous, and accountable.',
          href: '/how-i-work/'
        },
        {
          label: 'Boundaries',
          title: "What I'm Not",
          description:
            'A pre-emptive filter for environments built around optics, dogma, or compliance over curiosity.',
          href: '/what-im-not/'
        },
        {
          label: 'Collaboration',
          title: 'What I Expect From You',
          description:
            'The mirror: honesty, curiosity, ownership, direct communication, mutual respect, and room to think.',
          href: '/what-i-expect-from-you/'
        }
      ]}
    />
  );
}
