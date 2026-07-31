import { describe, expect, it } from 'vitest';
import { parseOwnerRepo, resolveOwnerRepo } from '../src/domain/github.js';

describe('domain/github: parseOwnerRepo', () => {
  it('parses an HTTPS URL with .git suffix', () => {
    expect(parseOwnerRepo('https://github.com/The-Running-Dev/SubZeroDev.Blog.git')).toEqual({
      owner: 'The-Running-Dev',
      repo: 'SubZeroDev.Blog'
    });
  });

  it('parses an HTTPS URL without .git suffix', () => {
    expect(parseOwnerRepo('https://github.com/The-Running-Dev/SubZeroDev.Blog')).toEqual({
      owner: 'The-Running-Dev',
      repo: 'SubZeroDev.Blog'
    });
  });

  it('parses an SSH URL', () => {
    expect(parseOwnerRepo('git@github.com:The-Running-Dev/SubZeroDev.Blog.git')).toEqual({
      owner: 'The-Running-Dev',
      repo: 'SubZeroDev.Blog'
    });
  });

  it('throws on an unparseable URL', () => {
    expect(() => parseOwnerRepo('not a url')).toThrow();
  });
});

describe('domain/github: resolveOwnerRepo', () => {
  it('returns the configured value when both agree', () => {
    const result = resolveOwnerRepo(
      'https://github.com/The-Running-Dev/SubZeroDev.Blog.git',
      'https://github.com/The-Running-Dev/SubZeroDev.Blog.git'
    );
    expect(result).toEqual({ owner: 'The-Running-Dev', repo: 'SubZeroDev.Blog' });
  });

  it('throws when the configured clone_url disagrees with the actual remote', () => {
    expect(() =>
      resolveOwnerRepo('https://github.com/Owner-A/repo-a.git', 'https://github.com/Owner-B/repo-b.git')
    ).toThrow(/disagrees/);
  });

  it('falls back to the actual remote when no clone_url is configured', () => {
    const result = resolveOwnerRepo('', 'https://github.com/The-Running-Dev/SubZeroDev.Blog.git');
    expect(result).toEqual({ owner: 'The-Running-Dev', repo: 'SubZeroDev.Blog' });
  });

  it('throws when neither is available', () => {
    expect(() => resolveOwnerRepo('', undefined)).toThrow();
  });

  it('falls back to the configured clone_url when the actual remote is not GitHub-shaped (e.g. a local scratch-remote path)', () => {
    const result = resolveOwnerRepo('https://github.com/The-Running-Dev/SubZeroDev.Blog.git', 'C:\\Users\\test\\scratch\\origin.git');
    expect(result).toEqual({ owner: 'The-Running-Dev', repo: 'SubZeroDev.Blog' });
  });

  it('throws when the configured clone_url is set but the actual remote is neither GitHub-shaped nor absent-safe -- still resolves via configured, not a crash', () => {
    expect(() => resolveOwnerRepo('not a url either', '/some/local/path')).toThrow(/Could not resolve/);
  });
});
