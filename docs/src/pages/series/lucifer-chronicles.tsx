import React from 'react';
import ContentHub from '@site/src/components/ContentHub';

export default function LuciferChronicles(): React.JSX.Element {
  return (
    <ContentHub
      description="A growing collection of impossible encounters, cosmic negotiations, and the game-engine work that accidentally gave the stories a home."
      eyebrow="Series"
      title="Lucifer Chronicles"
      entries={[
        {
          label: 'Start here',
          title: 'Lucifer Chronicles: The Game I Apparently Started Writing Without Realizing It',
          description:
            'A game engine turns years of absurd encounters into the accidental first chapter of Lucifer Chronicles.',
          href: '/lucifer-chronicles/'
        },
        {
          title: "God's Greatest Practical Joke",
          description:
            'Lucifer asks God to explain one particularly absurd human and discovers the joke may have been intentional.',
          href: '/gods-greatest-practical-joke/'
        },
        {
          title: 'Lucifer, the Fly, and the Negotiation That Failed Spectacularly',
          description: 'A perfectly reasonable attempt at diplomacy.',
          href: '/lucifer-fly-negotiation/'
        },
        {
          title: 'The Night I Ended Up in Hell Discussing Philosophy With Lucifer',
          description:
            'A sleepless trip to Hell becomes a cosmic argument about ego, free will, God, and customer support.',
          href: '/night-in-hell-discussing-philosophy-with-lucifer/'
        },
        {
          title: 'The Absurdity of Humanity',
          description: "God and Lucifer inspect humanity's missing escape hatch.",
          href: '/the-absurdity-of-humanity/'
        },
        {
          title: 'Lucifer Finally Fixed AI Project Management',
          description:
            'Lucifer responds to humanity wasting expensive reasoning models by publishing a model-selection policy.',
          href: '/lucifer-ai-model-selection-policy/'
        },
        {
          label: 'Spin-off project',
          title: 'The Absurd Adventures of Neo',
          description:
            'A project brief for an awake, amused Neo and a recurring Lucifer who refuses to let the system stay dramatic.',
          href: '/the-absurd-adventures-of-neo/',
          variant: 'related'
        },
        {
          title: 'Much Ado About Nothing',
          description: 'A dramatic declaration granting permission for something that was already happening.',
          href: '/much-ado-about-nothing/'
        }
      ]}
    />
  );
}
