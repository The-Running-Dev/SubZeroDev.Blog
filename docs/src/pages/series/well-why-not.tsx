import React from 'react';
import ContentHub from '@site/src/components/ContentHub';

export default function WellWhyNot(): React.JSX.Element {
  return (
    <ContentHub
      title="Well, Why Not?"
      description="Small experiments, unexpected platforms, and the recurring habit of building the thing first."
      eyebrow="Chronicle"
      entries={[
        {
          title: "Two Weeks Ago I Asked About Jones in the Fast Lane. This Escalated.",
          description: "Two weeks ago I asked an LLM how Jones in the Fast Lane worked. Today the engine is 98% complete, has three game kinds, replay, determinism, MCP, and somehow a publishing platform appeared too.",
          href: "/two-weeks-jones-escalated/",
          label: "Start here"
        },
        {
          title: "I Accidentally Automated Myself Into Being a Blogger",
          description: "I set out to make publishing easier. Somewhere along the way I accidentally built a fully automated AI-assisted publishing pipeline.",
          href: "/accidentally-built-an-ai-blogging-machine/"
        },
        {
          title: "Beyond Blogging: Git as a Workflow Platform",
          description: "A concept for treating Git repositories as the foundation for AI-driven workflows, where blogging, notes, documentation, and other systems are simply different workflow definitions built on the same platform.",
          href: "/git-workflow-platform/"
        },
        {
          title: "How a Quick Question Became 44 Work Units",
          description: "A week ago I asked an LLM how Jones in the Fast Lane worked. Somehow that became a deterministic game engine, a public landing page, a roadmap, and 44 completed work units.",
          href: "/quick-question-became-44-work-units/"
        },
        {
          title: "I Tried to Reuse a Landing Page. Lucifer Found a Framework.",
          description: "A simple attempt to abstract some React UI quietly became a static-site toolkit, application framework, deployment system, and possibly a recursive UI platform.",
          href: "/lucifer-found-a-framework/"
        },
        {
          title: "I Accidentally Built Another Platform",
          description: "I needed a portfolio. Then hot corners. Then window state. Then session restore. This is how infrastructure happens.",
          href: "/i-accidentally-built-another-platform/"
        },
        {
          title: "Beat Me at Tabletop Hockey and Win an Ice Cream",
          description: "A strange dream, a giant hockey game in the camper, and a plan to become the bar's most ridiculous final boss.",
          href: "/beat-me-at-tabletop-hockey-and-win-an-ice-cream/"
        },
        {
          title: "I Don't Want to Build This at Home. I Already Have.",
          description: "I went in for a €17 Wi-Fi adapter, accidentally retired a ten-year-old router, and discovered that 'supports VPN' is not the same question as 'what can this box actually do?'",
          href: "/i-dont-want-to-build-this-at-home/"
        },
        {
          title: "I Switch Operating Systems for Variety",
          description: "A maxed-out 2018 machine, three operating systems, Parallels sitting right there, and the completely reasonable decision to boot all of them bare metal anyway.",
          href: "/i-switch-operating-systems-for-variety/"
        },
        {
          title: "Jack of All Trades, Including Van Geometry",
          description: "I am not entirely sure when knowing where the right tire of a Mercedes van is became one of my transferable skills.",
          href: "/jack-of-all-trades-including-van-geometry/"
        },
        {
          title: "Apparently My Parallel-Universe Job Is Delta Force",
          description: "Not because I am secretly a commando, but because an absurd collection of adaptability, privacy habits, machinery, improvisation, and 'I'll figure it out' keeps pointing at the same joke.",
          href: "/apparently-my-parallel-universe-job-is-delta-force/"
        },
        {
          title: "The Projects Are Reproducing",
          description: "I started taking software apart with REA and Ghidra. Now I have a desktop ecosystem taking shape and a memory system to remember what the hell I'm building.",
          href: "/projects-are-reproducing/"
        },
        {
          title: "The Devil, the Ogre, and the Seventeen Accidental Projects",
          description: "Lucifer reviews the damage after one innocent look at CCleaner somehow becomes an entire software ecosystem.",
          href: "/the-devil-the-ogre-and-the-seventeen-accidental-projects/"
        },
        {
          title: "Apparently, the Operating System Is on Wednesday",
          description: "Twenty years after telling Herb that building an operating system was insane, I have a Wednesday experiment on the calendar.",
          href: "/apparently-operating-system-on-wednesday/"
        },
        {
          title: "One Fucking Guy",
          description: "Lucifer inspects a one-man software enterprise with exhausted build quotas, a personal dashboard, and a finance department that spent a week avoiding four dollars.",
          href: "/one-fucking-guy/"
        }
      ]}
    />
  );
}
