import * as fssync from 'node:fs';
import * as path from 'node:path';
import ignore from 'ignore';

import type { Options } from './options';
import type { DirectoryTree, DirNode, FileNode } from './model';
import { createReporter } from './reporter';

type Ig = ReturnType<typeof ignore>;

function extOf(name: string): string {
  const e = path.extname(name);
  return e || '';
}

function buildIgnoreMatcher(
  rootAbs: string,
  options: Options,
  reporter: ReturnType<typeof createReporter>,
): Ig | null {
  const ig = ignore();
  let added = false;

  // 1) file-based patterns
  if (options.ignoreFile) {
    const filePath = path.isAbsolute(options.ignoreFile)
      ? options.ignoreFile
      : path.join(rootAbs, options.ignoreFile);

    if (fssync.existsSync(filePath)) {
      const filePatterns = fssync
        .readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));

      if (filePatterns.length) {
        ig.add(filePatterns);
        added = true;

        reporter.info(
          `loaded ${filePatterns.length} ignore pattern(s) from ${filePath}`,
        );
        for (const pat of filePatterns) reporter.debug(`  ignore: ${pat}`);
      }
    } else {
      if (options.ignoreFile)
        reporter.error(`ignore file not found: ${filePath}`);
      else reporter.warn(`ignore file not found: ${filePath}`);
    }
  }

  // 2) inline patterns
  if (options.ignorePatterns.length) {
    ig.add(options.ignorePatterns);
    added = true;

    reporter.info(
      `added ${options.ignorePatterns.length} inline ignore pattern(s)`,
    );
    for (const pat of options.ignorePatterns)
      reporter.debug(`  ignore: ${pat}`);
  }

  return added ? ig : null;
}

async function scanDirRecursive(
  params: {
    rootAbs: string;
    currentAbs: string;
    currentRel: string; // relative path from root ('', 'src', 'src/x')
    depthLeft: number; // -1 means unlimited
    dirsOnly: boolean;
    ig: Ig | null;
  },
  reporter: ReturnType<typeof createReporter>,
): Promise<DirNode> {
  const { rootAbs, currentAbs, currentRel, depthLeft, dirsOnly, ig } = params;

  const dirNode: DirNode = {
    kind: 'dir',
    name:
      currentRel === '' ? path.basename(rootAbs) : path.basename(currentAbs),
    path: currentRel,
    children: [],
  };

  // Depth 0 => do not descend or . & ..
  if (depthLeft === 0 || ['.', '..'].includes(currentRel)) {
    return dirNode;
  }

  let entries: fssync.Dirent[];
  try {
    // Use sync op for Dirent because perf is fine and types are simpler
    entries = fssync.readdirSync(currentAbs, { withFileTypes: true });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_) {
    // unreadable dir — treat as empty
    return dirNode;
  }

  // Sort stable: dirs first, then files; alphabetically within groups
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  reporter.debug(`scanning: ${currentRel || '.'}`);
  for (const ent of entries) {
    const childAbs = path.join(currentAbs, ent.name);
    const childRel = currentRel ? `${currentRel}/${ent.name}` : ent.name;

    // ignore matcher uses POSIX-style rel paths
    if (ig && ig.ignores(childRel)) {
      reporter.debug(`  skipped by ignore: ${childRel}`);
      continue;
    }

    // lstat to avoid following symlink directories (prevent cycles)
    let lst: fssync.Stats;
    try {
      lst = fssync.lstatSync(childAbs);
    } catch {
      continue; // race/unreadable entry
    }

    if (lst.isSymbolicLink()) {
      reporter.warn(`  skipped symlink: ${childRel}`);
      continue;
    }

    if (lst.isDirectory()) {
      const child = await scanDirRecursive(
        {
          rootAbs,
          currentAbs: childAbs,
          currentRel: childRel,
          depthLeft: depthLeft < 0 ? -1 : depthLeft - 1,
          dirsOnly,
          ig,
        },
        reporter,
      );
      dirNode.children.push(child);
      reporter.debug(`  dir: ${childRel}/`);
    } else if (!dirsOnly && lst.isFile()) {
      const fnode: FileNode = {
        kind: 'file',
        name: ent.name,
        path: childRel,
        size: lst.size,
        ext: extOf(ent.name),
      };
      dirNode.children.push(fnode);
      reporter.debug(`  file: ${childRel} (${lst.size} bytes)`);
    } else {
      // ignore other types (fifo, socket, device)
      continue;
    }
  }

  return dirNode;
}

/**
 * Scan a directory according to options.
 * - Honors depth, dirsOnly, ignoreFile + inline ignores.
 * - Skips symlinks to avoid cycles.
 */
export async function scanDirectory(
  options: Options,
  reporter: ReturnType<typeof createReporter>,
): Promise<DirectoryTree> {
  const rootInput =
    options.targetPath && options.targetPath.trim().length > 0
      ? options.targetPath
      : '.';

  const rootAbs = path.resolve(rootInput);

  // Validate that rootAbs is a directory
  let stat: fssync.Stats;
  try {
    stat = fssync.statSync(rootAbs);
  } catch {
    throw new Error(`Path not found: ${rootInput}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${rootInput}`);
  }

  const depthLeft = options.depth;
  const ig = buildIgnoreMatcher(rootAbs, options, reporter);

  reporter.info(`scanning root: ${rootAbs}`);
  const tree = await scanDirRecursive(
    {
      rootAbs,
      currentAbs: rootAbs,
      currentRel: '',
      depthLeft,
      dirsOnly: options.dirsOnly,
      ig,
    },
    reporter,
  );
  reporter.success(`scan complete: ${tree.children.length} top-level entries`);

  return tree;
}
