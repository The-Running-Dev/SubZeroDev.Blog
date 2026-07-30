import React from 'react';
import ContentHub from '@site/src/components/ContentHub';

export default function AiAssistedEngineering(): React.JSX.Element {
  return (
    <ContentHub
      description="A practical record of the operating model behind SubZeroDev projects: roles, environments, delivery, measurement, and the limits that keep the system honest."
      eyebrow="Series"
      title="AI-Assisted Engineering"
      entries={[
        {
          label: 'Start here',
          title: 'The AI-Assisted Software Engineering Workflow',
          description:
            'The living overview of the operating model, with links to each part of the full series.',
          href: '/ai-assisted-engineering-workflow/'
        },
        {
          label: 'Part 1',
          title: 'Roles and the End-to-End Workflow',
          description:
            'Which model or tool owns which job, and the nine stages from repository bootstrap to protocol extraction.',
          href: '/ai-workflow-roles-and-pipeline/'
        },
        {
          label: 'Part 2',
          title: 'Architecture, the Terraform Runner, and Publishing',
          description:
            'The two control layers behind external state, repository artifacts, and the content pipeline for this blog.',
          href: '/ai-workflow-architecture/'
        },
        {
          label: 'Part 3',
          title: 'Development Environments and Mobility',
          description:
            'Why execution stays local for now, how unfinished work moves between machines, and what portability requires.',
          href: '/ai-workflow-environments/'
        },
        {
          label: 'Part 4',
          title: 'Observations and Operating Limits',
          description:
            'The human role, practical concurrency limits, and dated observations about working with AI systems.',
          href: '/ai-workflow-observations-and-limits/'
        },
        {
          label: 'Part 5',
          title: 'Metrics to Track',
          description:
            'Delivery, quality, AI efficiency, and human load—plus the comparisons worth running.',
          href: '/ai-workflow-metrics/'
        },
        {
          label: 'Part 6',
          title: 'Current State, Roadmap, and Projects as Code',
          description:
            'What is proven, experimental, and planned as the workflow converges on its target model.',
          href: '/ai-workflow-state-and-roadmap/'
        },
        {
          label: 'In practice',
          title: 'Publishing This Blog from ChatGPT Work',
          description:
            'The client-to-pull-request workflow that turns a conversation into a reviewed blog post.',
          href: '/publishing-this-blog-from-chatgpt-work/'
        }
      ]}
    />
  );
}
