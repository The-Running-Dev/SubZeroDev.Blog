import React from 'react';
import ContentHub from '@site/src/components/ContentHub';

export default function BuildingTheBlog(): React.JSX.Element {
  return (
    <ContentHub
      description="How a small Git-backed blog turned into a repository-governed, AI-assisted publishing system."
      eyebrow="Series"
      title="Building the Blog"
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
