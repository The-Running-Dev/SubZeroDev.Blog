import { describe, expect, it } from 'vitest';
import { insertTruncateMarker, buildFilename, canonicalUrl } from '../src/domain/post.js';

describe('insertTruncateMarker', () => {
  it('no-ops if the marker is already present', () => {
    const body = 'Intro.\n\n<!-- truncate -->\n\nMore.';
    expect(insertTruncateMarker(body, 'anything')).toBe(body);
  });

  it('inserts after the given afterText', () => {
    const body = 'First paragraph.\n\nSecond paragraph.';
    const result = insertTruncateMarker(body, 'First paragraph.');
    expect(result).toBe('First paragraph.\n\n<!-- truncate -->\n\nSecond paragraph.');
  });

  it('no-ops if afterText is not found', () => {
    const body = 'First paragraph.\n\nSecond paragraph.';
    expect(insertTruncateMarker(body, 'Not present anywhere')).toBe(body);
  });

  it('with no afterText, inserts after the first paragraph following a leading H1 -- not at index 0', () => {
    const body = "# God's Greatest Practical Joke\n\nLucifer looked up at God and asked:\n\n> A quote.\n\nMore.";
    const result = insertTruncateMarker(body, '');
    expect(result).toBe(
      "# God's Greatest Practical Joke\n\nLucifer looked up at God and asked:\n\n<!-- truncate -->\n\n> A quote.\n\nMore."
    );
  });

  it('with no afterText and no leading heading, inserts after the first paragraph', () => {
    const body = 'Just a first paragraph, no heading.\n\nSecond paragraph.';
    const result = insertTruncateMarker(body, '');
    expect(result).toBe('Just a first paragraph, no heading.\n\n<!-- truncate -->\n\nSecond paragraph.');
  });

  it('with no afterText and a single block (no paragraph boundary), appends the marker at the end', () => {
    const body = 'One single paragraph with no blank line anywhere.';
    const result = insertTruncateMarker(body, '');
    expect(result).toBe('One single paragraph with no blank line anywhere.\n\n<!-- truncate -->\n\n');
  });
});

describe('buildFilename', () => {
  it('combines the date prefix and slug', () => {
    expect(buildFilename('2026-05-17T21:00:00Z', 'my-slug')).toBe('2026-05-17-my-slug.md');
  });
});

describe('canonicalUrl', () => {
  it('joins the base and slug with a trailing slash', () => {
    expect(canonicalUrl('https://example.com', 'my-slug')).toBe('https://example.com/my-slug/');
  });

  it('strips a trailing slash on the base before joining', () => {
    expect(canonicalUrl('https://example.com/', 'my-slug')).toBe('https://example.com/my-slug/');
  });
});
