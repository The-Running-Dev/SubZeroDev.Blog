import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

/**
 * Local Docusaurus config — overrides the base image's default when this
 * directory is copied over /template (see ./Dockerfile). Content lives in
 * ./docs and ./blog; the sidebar is ./sidebar.ts.
 *
 * Site identity and route contract for the custom-domain deployment.
 */

// The masthead's right-aligned outbound group and the footer's link row are
// the same four links to the same destinations -- one source list so an edit
// to a URL or label can't update one and silently miss the other.
const ecosystemLinks: Array<{ href: string; label: string; className?: string }> = [
  {
    href: 'https://subzerodev.com/',
    label: 'SubZeroDev.com'
  },
  {
    href: 'https://blog.subzerodev.com/',
    label: 'Journal',
    className: 'site-masthead__ecosystem-active'
  },
  {
    href: 'https://github.com/The-Running-Dev?tab=repositories',
    label: 'Projects'
  },
  {
    href: 'https://portfolio.subzerodev.com/',
    label: 'Portfolio'
  }
];

const config: Config = {
  title: 'SubZeroDev Journal',
  tagline: 'Life, software, and the things that happen in between.',
  url: 'https://blog.subzerodev.com',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw'
    }
  },
  i18n: { defaultLocale: 'en', locales: ['en'] },
  plugins: ['./plugins/journal-discovery.cjs'],
  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexDocs: true,
        indexBlog: true,
        indexPages: true
      }
    ]
  ],
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
          blogTitle: 'SubZeroDev Journal',
          blogDescription: 'Stories, observations, and experiments from life, software, and everything in between.',
          tags: 'tags.yml',
          blogListComponent: '@site/src/components/JournalHome.tsx',
          blogTagsListComponent: '@site/src/components/JournalDiscovery/Topics.tsx',
          onInlineTags: 'throw',
          exclude: [
            '**/_*.{js,jsx,ts,tsx,md,mdx}',
            '**/_*/**',
            '**/*.test.{js,jsx,ts,tsx}',
            '**/__tests__/**'
          ],
          feedOptions: {
            type: ['rss', 'atom'],
            title: 'SubZeroDev Journal',
            description: 'Stories, observations, and experiments from life, software, and everything in between.',
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
      items: [
        { to: '/journal/', position: 'left', label: 'Journal' },
        { to: '/chronicles/', position: 'left', label: 'Chronicles' },
        { to: '/tags/', position: 'left', label: 'Topics' },
        { to: '/projects/', position: 'left', label: 'Projects' },
        { to: '/about/', position: 'left', label: 'About' },
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs' },
        ...ecosystemLinks.map((link) => ({ ...link, position: 'right' as const }))
      ]
    },
    // Enable persisted theme choices; the Navbar/ColorModeToggle overlay
    // removes the duplicate control in favour of the masthead controls.
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false
    },
    // Mirrors the masthead's outbound group (same four links, same active
    // marker) so the ecosystem row survives a scroll to the bottom of a
    // long post. No quote or copyright: apexFooterQuote is apex-authored
    // prose with no claim on this repository.
    footer: {
      style: 'dark',
      links: ecosystemLinks
    }
  } satisfies Preset.ThemeConfig
};

export default config;
