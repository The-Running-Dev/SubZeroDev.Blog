import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

/**
 * Local Docusaurus config — overrides the base image's default when this
 * directory is copied over /template (see ./Dockerfile). Content lives in
 * ./docs and ./blog; the sidebar is ./sidebar.ts.
 *
 * Site identity and route contract for the custom-domain deployment.
 */
const config: Config = {
  title: 'SubZeroDev Blog',
  tagline: 'The source and project documentation for the SubZeroDev technical blog.',
  url: 'https://blog.subzerodev.com',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw'
    }
  },
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebar.ts',
          routeBasePath: 'docs'
        },
        theme: {
          customCss: './src/css/custom.css'
        },
        blog: {
          path: 'blog',
          routeBasePath: '/',
          blogTitle: 'SubZeroDev Blog',
          blogDescription: 'Notes on building and maintaining SubZeroDev projects.',
          tags: 'tags.yml',
          onInlineTags: 'throw',
          exclude: [
            '**/_*.{js,jsx,ts,tsx,md,mdx}',
            '**/_*/**',
            '**/*.test.{js,jsx,ts,tsx}',
            '**/__tests__/**'
          ],
          feedOptions: {
            type: ['rss', 'atom'],
            title: 'SubZeroDev Blog',
            description: 'Notes on building and maintaining SubZeroDev projects.',
            copyright: `Copyright © ${new Date().getFullYear()} SubZeroDev`,
            language: 'en',
            // Docusaurus defaults this to the 20 most recent posts. A one-day
            // batch of new posts (like a content migration) can push an older
            // post past that cutoff even though it's still a live route --
            // unlimited keeps the feed a complete index rather than a
            // moving window that silently drops posts as the blog grows.
            limit: false
          },
          showReadingTime: true,
          blogSidebarCount: 20
        }
      } satisfies Preset.Options
    ]
  ],

  themeConfig: {
    navbar: {
      title: 'SubZeroDev Blog',
      items: [
        {
          to: '/',
          position: 'left',
          label: 'Blog'
        },
        {
          to: '/archive/',
          position: 'left',
          label: 'Archive'
        },
        {
          to: '/tags/',
          position: 'left',
          label: 'Tags'
        },
        {
          label: 'Series',
          position: 'left',
          items: [
            {
              to: '/series/ai-assisted-engineering/',
              label: 'AI-Assisted Engineering'
            },
            {
              to: '/series/building-the-blog/',
              label: 'Building the Blog'
            },
            {
              to: '/series/docker/',
              label: 'Docker'
            },
            {
              to: '/series/state-of-dev/',
              label: 'State of Dev'
            },
            {
              to: '/series/lucifer-chronicles/',
              label: 'Lucifer Chronicles'
            }
          ]
        },
        {
          label: 'Projects',
          position: 'left',
          items: [
            {
              to: '/projects/game-engine/',
              label: 'Game Engine'
            },
            {
              to: '/the-absurd-adventures-of-neo/',
              label: 'The Absurd Adventures of Neo'
            }
          ]
        },
        {
          to: '/about/',
          position: 'left',
          label: 'About Me'
        },
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs'
        }
      ]
    },
    // SubZeroDev.com's presentation layer defines one dark palette, not a
    // light/dark pair -- the switch is disabled so the blog can't drift into
    // a light theme this palette was never designed against.
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false
    },
    footer: { style: 'dark', links: [] }
  } satisfies Preset.ThemeConfig
};

export default config;
