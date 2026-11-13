import React from 'react';
import Link from '@docusaurus/Link';
import { Page, useJournal } from './index';

export default function Topics(): React.JSX.Element {
  const { topicGroups, otherTopics } = useJournal();
  return (
    <Page title="Topics" description="Browse by subject. Entries can cross several topics; Chronicles connect them into longer reading paths.">
      <nav className="journal-topic-jump" aria-label="Topic groups">
        {topicGroups.map((group, i) => <a href={'#topic-group-' + i} key={group.title}>{group.title}</a>)}
      </nav>
      <div className="journal-topic-groups">
        {topicGroups.map((group, i) => (
          <section id={'topic-group-' + i} key={group.title}>
            <h2>{group.title}</h2>
            <ul className="journal-topics">
              {group.topics.map((topic) => <li key={topic.key}><Link to={topic.permalink}>{topic.label}</Link><span>{topic.count} {topic.count === 1 ? 'entry' : 'entries'}</span></li>)}
            </ul>
          </section>
        ))}
      </div>
      <section className="journal-follow-on"><h2>Also explore</h2><ul className="journal-topics">{otherTopics.map((topic) => <li key={topic.key}><Link to={topic.permalink}>{topic.label}</Link><span>{topic.count} {topic.count === 1 ? 'entry' : 'entries'}</span></li>)}</ul><p>For Lucifer, Marcus Aurelius, and recurring stories, explore the <Link to="/chronicles/">Chronicles</Link>.</p></section>
    </Page>
  );
}
