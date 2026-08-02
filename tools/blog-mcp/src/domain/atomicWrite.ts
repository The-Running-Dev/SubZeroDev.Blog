import fs from 'node:fs';
import path from 'node:path';
import { InfrastructureError } from '../errors.js';

export interface AtomicWriteFile {
  absolutePath: string;
  content: string;
}

/**
 * Writes every file's candidate content, or none of them. TODO-NEXT.md sec9
 * ("Transaction and filesystem strategy"): the primary defense is ordering --
 * callers validate the complete candidate state (front matter, YAML
 * integrity, duplicate slugs, allowed paths) before ever reaching this
 * function, so a rejected candidate never gets here at all. This function's
 * own job is the narrower one of surviving a mid-sequence filesystem failure:
 * each file is written to a temp sibling in the same directory first (same
 * `.<name>.<pid>.<ts>.tmp` convention as scheduler/store.ts's saveSchedule,
 * so the final rename is atomic on one filesystem, POSIX or NTFS), and only
 * once every temp write has succeeded are the files renamed into place. If a
 * rename fails partway through, every already-renamed file is restored from
 * the prior bytes captured up front, and the failure surfaces as an
 * InfrastructureError rather than leaving a partially-written result.
 */
export function writeFilesAtomically(files: AtomicWriteFile[]): void {
  const priorBytes = new Map<string, Buffer | undefined>();
  for (const file of files) {
    priorBytes.set(file.absolutePath, fs.existsSync(file.absolutePath) ? fs.readFileSync(file.absolutePath) : undefined);
  }

  const tempPaths = new Map<string, string>();
  try {
    for (const file of files) {
      fs.mkdirSync(path.dirname(file.absolutePath), { recursive: true });
      const tmp = path.join(path.dirname(file.absolutePath), `.${path.basename(file.absolutePath)}.${process.pid}.${Date.now()}.tmp`);
      fs.writeFileSync(tmp, file.content, 'utf8');
      tempPaths.set(file.absolutePath, tmp);
    }
  } catch (err) {
    for (const tmp of tempPaths.values()) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        // Best-effort cleanup of a temp file that never got renamed.
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new InfrastructureError(`Failed to write candidate file(s): ${message}`);
  }

  const renamed: string[] = [];
  try {
    for (const file of files) {
      const tmp = tempPaths.get(file.absolutePath);
      if (!tmp) continue;
      fs.renameSync(tmp, file.absolutePath);
      renamed.push(file.absolutePath);
    }
  } catch (err) {
    for (const absolutePath of renamed) {
      const prior = priorBytes.get(absolutePath);
      try {
        if (prior === undefined) {
          fs.rmSync(absolutePath, { force: true });
        } else {
          fs.writeFileSync(absolutePath, prior);
        }
      } catch {
        // Best-effort restore; the InfrastructureError thrown below still
        // surfaces the original failure to the caller either way.
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new InfrastructureError(`Failed to finalize candidate file write(s), restored prior content: ${message}`);
  }
}
