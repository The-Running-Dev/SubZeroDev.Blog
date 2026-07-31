import React from 'react';
import ContentHub from '@site/src/components/ContentHub';

export default function GameEngine(): React.JSX.Element {
  return (
    <ContentHub
      description="Notes from the game-engine work that became the unexpected foundation for Lucifer Chronicles."
      eyebrow="Project"
      title="Game Engine"
      entries={[
        {
          title: 'Lucifer Chronicles: The Game I Apparently Started Writing Without Realizing It',
          description:
            'How building a game engine revealed the first chapter of an ongoing story collection.',
          href: '/lucifer-chronicles/'
        },
        {
          label: 'Related series',
          title: 'Lucifer Chronicles',
          description:
            'Continue with the stories, arguments, and failed negotiations surrounding the project.',
          href: '/series/lucifer-chronicles/',
          variant: 'related'
        }
      ]}
    />
  );
}
