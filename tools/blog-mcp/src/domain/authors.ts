import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface AuthorEntry {
  key: string;
  name: string;
  url: string;
}

export function authorsYmlPath(repoRoot: string, blogDir: string): string {
  return path.join(repoRoot, blogDir, 'authors.yml');
}

export function loadAuthors(repoRoot: string, blogDir: string): AuthorEntry[] {
  const filePath = authorsYmlPath(repoRoot, blogDir);
  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed: unknown = parseYaml(raw);
  if (typeof parsed !== 'object' || parsed === null) return [];

  const entries: AuthorEntry[] = [];
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const record = value as Record<string, unknown>;
    entries.push({
      key,
      name: typeof record.name === 'string' ? record.name : '',
      url: typeof record.url === 'string' ? record.url : ''
    });
  }
  return entries;
}
