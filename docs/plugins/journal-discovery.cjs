const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function journalDiscovery({ siteDir }) {
  const configPath = path.join(siteDir, 'journal.config.json');
  return {
    name: 'journal-discovery',
    getPathsToWatch: () => [configPath],
    async allContentLoaded({ allContent, actions }) {
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const content = allContent['docusaurus-plugin-content-blog']?.default;
      if (!content) throw new Error('Journal discovery requires the default blog plugin.');
      const posts = content.blogPosts
        .filter(({ metadata: m }) => !m.unlisted && !m.frontMatter.draft)
        .map(({ metadata: m }) => ({
          title: m.title,
          description: m.description,
          href: m.permalink,
          slug: String(m.frontMatter.slug).replace(/^\/+|\/+$/g, ''),
          date: new Date(m.date).toISOString(),
          tags: m.tags,
          tagKeys: m.frontMatter.tags
        }))
        .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
      const bySlug = new Map(posts.map((post) => [post.slug, post]));
      const topicMap = new Map();
      for (const post of posts) {
        for (let i = 0; i < post.tagKeys.length; i++) {
          const key = post.tagKeys[i];
          const tag = post.tags.find((t) => t.permalink.replace(/\/$/, '').endsWith('/' + key));
          if (!tag) throw new Error(`Topic ${key} was not resolved for ${post.slug}.`);
          if (!topicMap.has(key)) topicMap.set(key, { ...tag, key, count: 0 });
          topicMap.get(key).count++;
        }
      }
      const referencedKeys = config.topicGroups.flatMap((group) => group.keys).concat(config.otherTopics, Object.keys(config.collectionTags));
      if (new Set(referencedKeys).size !== referencedKeys.length) throw new Error('A topic appears in more than one discovery group.');
      for (const key of referencedKeys) if (!topicMap.has(key)) throw new Error(`Discovery topic has no entries: ${key}`);
      for (const key of topicMap.keys()) if (!referencedKeys.includes(key)) throw new Error(`Topic missing from discovery configuration: ${key}`);
      for (const collection of config.collections) {
        if (!bySlug.has(collection.start)) throw new Error(`Missing Chronicle starting entry: ${collection.start}`);
      }
      for (const slug of config.startingPoints) if (!bySlug.has(slug)) throw new Error(`Missing starting point: ${slug}`);
      const data = {
        posts,
        topicGroups: config.topicGroups.map((group) => ({ title: group.title, topics: group.keys.map((key) => topicMap.get(key)) })),
        otherTopics: config.otherTopics.map((key) => topicMap.get(key)),
        collections: config.collections,
        collectionTags: config.collectionTags,
        startingPoints: config.startingPoints.map((slug) => bySlug.get(slug))
      };
      actions.setGlobalData(data);
      for (const legacy of config.legacyTopics) {
        const modulePath = await actions.createData(`legacy-${legacy.key}.json`, JSON.stringify({
          ...legacy,
          posts: legacy.slugs.map((slug) => {
            if (!bySlug.has(slug)) throw new Error(`Missing historical tag entry: ${slug}`);
            return bySlug.get(slug);
          })
        }));
        actions.addRoute({ path: `/tags/${legacy.key}/`, exact: true, component: '@site/src/components/LegacyTopicPage.tsx', modules: { legacy: modulePath } });
      }
    }
  };
};
