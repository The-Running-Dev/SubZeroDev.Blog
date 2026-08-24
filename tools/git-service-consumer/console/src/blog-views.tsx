import type { ConsoleViewRegistration } from '@subzerodev-git/console';
import BlogPostsView from './blog-posts-view.tsx';
import BlogComposeView from './blog-compose-view.tsx';

/**
 * S37's console view registrations. Each `capabilities` entry lists only the
 * blog's own `content.*` capabilities (`declarations.ts`) -- never the base
 * git/PR capabilities each screen's publish pipeline also calls
 * (`git.local.write`, `git.remote.write`, `host.pr.write`) -- so `eligibleViews`
 * (`console/src/view-registry.ts`) gates on exactly the dimension S37.2
 * demonstrates: a second declaration with full git capabilities but no
 * `content.*` grant still never sees these screens.
 */
export const BLOG_VIEWS: readonly ConsoleViewRegistration[] = [
  {
    id: 'blog-posts',
    title: 'Blog posts',
    capabilities: ['content.post.read'],
    render: (props) => <BlogPostsView {...props} />,
  },
  {
    id: 'blog-compose',
    title: 'Compose',
    capabilities: [
      'content.post.read',
      'content.post.write',
      'content.tag.read',
      'content.tag.write',
      'content.author.read',
      'content.author.write',
      'content.markdown.read',
    ],
    render: (props) => <BlogComposeView {...props} />,
  },
];
