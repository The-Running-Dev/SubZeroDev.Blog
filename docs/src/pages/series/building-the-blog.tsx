import React from 'react';
import ContentHub from '@site/src/components/ContentHub';

export default function BuildingTheBlog(): React.JSX.Element {
  return (
    <ContentHub
      description="How a small Git-backed blog became a publishing system and a journal with a life of its own."
      eyebrow="Chronicle"
      title="Building the Journal"
      entries={[
        {
          label: 'Origin',
          title: 'Welcome to SubZeroDev Blog',
          description:
            'The deliberately small first milestone: a public home, a repeatable publishing path, and repository-backed documentation.',
          href: '/welcome/'
        },
        {
          label: 'The workflow',
          title: 'Publishing This Blog from ChatGPT Work',
          description:
            'How a phone conversation becomes validated Markdown, a protected pull request, and a verified deployment.',
          href: '/publishing-this-blog-from-chatgpt-work/'
        },
        {
          label: 'What it became',
          title: 'I Accidentally Automated Myself Into Being a Blogger',
          description:
            'The moment a simple Markdown blog became an API, an MCP server, and a self-reinforcing automation loop.',
          href: '/accidentally-built-an-ai-blogging-machine/'
        },
        {
          title: "My Blog Is Turning into a Journal",
          description: "Fifty published posts, another seventy-eight waiting, and the realization that publication dates aren't a map of my life.",
          href: "/my-blog-is-turning-into-a-journal/",
          label: "Becoming a journal"
        },
        {
          label: 'Related architecture',
          title: 'Architecture, the Terraform Runner, and Publishing',
          description:
            'The wider control model behind repository artifacts, external state, and the content pipeline.',
          href: '/ai-workflow-architecture/',
          variant: 'related'
        }
      ]}
    />
  );
}
