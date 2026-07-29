import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

/**
 * Local Docusaurus config — overrides the base image's default when this
 * directory is copied over /template (see ./Dockerfile). Content lives in
 * ./docs (games/); the sidebar is ./sidebar.ts.
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
          routeBasePath: 'blog',
          blogTitle: 'SubZeroDev Blog',
          blogDescription: 'Notes on building and maintaining SubZeroDev projects.',
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
          to: '/blog/',
          position: 'left',
          label: 'Blog'
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
