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
          title: 'Lucifer, the Fly, and the Negotiation That Failed Spectacularly',
          description: 'A perfectly reasonable attempt at diplomacy.',
          href: '/lucifer-fly-negotiation/'
        },
        {
          title: 'The Night I Ended Up in Hell Discussing Philosophy With Lucifer',
          description:
            'A sleepless trip to Hell becomes a cosmic argument about ego, free will, God, and customer support.',
          href: '/night-in-hell-discussing-philosophy-with-lucifer/'
        }
      ]}
    />
  );
}
