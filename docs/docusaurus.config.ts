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
            language: 'en'
          },
          showReadingTime: true
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
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs'
        }
      ]
    },
    footer: { style: 'dark', links: [] }
  } satisfies Preset.ThemeConfig
};

export default config;
