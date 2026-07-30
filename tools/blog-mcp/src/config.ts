import fs from 'node:fs';
import path from 'node:path';
import { PreconditionError } from './errors.js';

export interface HubConfig {
  id: string;
  path: string;
  match: { tags?: string[]; slugPrefix?: string };
}

export interface BlogConfig {
  repoRoot: string;
  baseBranch: string;
  siteRoot: string;
  blogDir: string;
  authorId: string;
  cloneUrl: string;
  canonicalUrl: string;
  requiredChecks: string[];
  deployWorkflow: string;
  branchPrefixes: string[];
  hubs: HubConfig[];
}

const DEFAULT_HUBS: HubConfig[] = [
  {
    id: 'lucifer-chronicles',
    path: 'docs/src/pages/series/lucifer-chronicles.tsx',
    match: { tags: ['lucifer'] }
  },
  {
    id: 'ai-assisted-engineering',
    path: 'docs/src/pages/series/ai-assisted-engineering.tsx',
    match: { tags: ['ai-assisted-engineering'] }
  },
  {
    id: 'state-of-dev',
    path: 'docs/src/pages/series/state-of-dev.tsx',
    match: { slugPrefix: 'state-of-dev-' }
  },
  {
    id: 'game-engine',
    path: 'docs/src/pages/projects/game-engine.tsx',
    match: {}
  }
];

/**
 * Find the repository root by walking upward for a `.git` entry (directory
 * or file, so worktrees work too) -- the same algorithm
 * Find-DocumentationRepositoryRoot in build/Test-Documentation.ps1 uses, so
 * the two agree on what "the repo" means.
 */
function findRepoRootFrom(start: string): string | undefined {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function resolveRepoRoot(explicit?: string): string {
  if (explicit) {
    const found = findRepoRootFrom(explicit);
    if (!found) {
      throw new PreconditionError(`--repo '${explicit}' is not inside a git repository.`);
    }
    return found;
  }

  const envRepo = process.env.BLOG_MCP_REPO;
  if (envRepo) {
    const found = findRepoRootFrom(envRepo);
    if (!found) {
      throw new PreconditionError(`BLOG_MCP_REPO='${envRepo}' is not inside a git repository.`);
    }
    return found;
  }

  if (fs.existsSync('/repo/.git')) {
    return '/repo';
  }

  const found = findRepoRootFrom(process.cwd());
  if (!found) {
    throw new PreconditionError(
      'Could not locate a git repository from --repo, BLOG_MCP_REPO, /repo, or the working directory.'
    );
  }
  return found;
}

interface RawBlogJson {
  repo_path?: string;
  clone_url?: string;
  base_branch?: string;
  site_root?: string;
  blog_dir?: string;
  author_id?: string;
  canonical_url?: string;
  required_checks?: string[];
  deploy_workflow?: string;
  branch_prefixes?: string[];
  hubs?: HubConfig[];
}

export function loadConfig(repoRoot: string): BlogConfig {
  const configPath = path.join(repoRoot, '.config', 'blog.json');
  let raw: RawBlogJson = {};
  if (fs.existsSync(configPath)) {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as RawBlogJson;
  }

  const config: BlogConfig = {
    repoRoot,
    baseBranch: raw.base_branch ?? 'main',
    siteRoot: raw.site_root ?? 'docs',
    blogDir: raw.blog_dir ?? 'docs/blog',
    authorId: raw.author_id ?? 'subzerodev',
    cloneUrl: raw.clone_url ?? '',
    canonicalUrl: raw.canonical_url ?? 'https://blog.subzerodev.com',
    requiredChecks: raw.required_checks ?? ['Documentation links and terminology', 'Verify Documentation Build'],
    deployWorkflow: raw.deploy_workflow ?? 'Docs Deploy',
    branchPrefixes: raw.branch_prefixes ?? ['blog', 'content', 'fix', 'feature', 'docs'],
    hubs: raw.hubs ?? DEFAULT_HUBS
  };

  return config;
}
