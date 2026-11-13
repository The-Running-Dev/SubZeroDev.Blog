import React from 'react';
import ContentHub from '@site/src/components/ContentHub';

export default function GameEngine(): React.JSX.Element {
  return (
    <ContentHub
      title="Game Engine"
      description="The game-engine project: reusable systems, expanding scope, and the Lucifer Chronicles game concept. The narrative Chronicle is a separate reading path."
      eyebrow="Project"
      entries={[
        {
          title: "Lucifer Chronicles: The Game I Apparently Started Writing Without Realizing It",
          description: "A game engine turns years of absurd encounters into the accidental first chapter of Lucifer Chronicles.",
          href: "/lucifer-chronicles/",
          label: "The game concept"
        },
        {
          title: "How a Quick Question Became 44 Work Units",
          description: "A week ago I asked an LLM how Jones in the Fast Lane worked. Somehow that became a deterministic game engine, a public landing page, a roadmap, and 44 completed work units.",
          href: "/quick-question-became-44-work-units/",
          label: "Engine development"
        },
        {
          title: "Two Weeks Ago I Asked About Jones in the Fast Lane. This Escalated.",
          description: "Two weeks ago I asked an LLM how Jones in the Fast Lane worked. Today the engine is 98% complete, has three game kinds, replay, determinism, MCP, and somehow a publishing platform appeared too.",
          href: "/two-weeks-jones-escalated/",
          label: "How it escalated"
        },
        {
          title: "State of Dev - Week of August 3, 2026",
          description: "Weekly development journal covering the continued accidental construction of the SubZeroDev ecosystem.",
          href: "/state-of-dev-2026-08-03/",
          label: "Development update"
        },
        {
          title: "Lucifer Chronicles: the narrative collection",
          description: "Stories and observations through the Lucifer persona, separate from the game-development project.",
          href: "/series/lucifer-chronicles/",
          label: "Related Chronicle",
          variant: "related"
        }
      ]}
    />
  );
}
