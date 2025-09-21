import type { Options } from './options';
import type { DirectoryTree, DirNode, FileNode } from './model';

// Deterministic stub tree (pretend it was scanned)
function makeStubTree(rootName: string, opts: Options): DirectoryTree {
  const files: FileNode[] = opts.dirsOnly
    ? []
    : [
        {
          kind: 'file',
          name: 'index.ts',
          path: 'index.ts',
          size: 512,
          ext: '.ts',
        },
        {
          kind: 'file',
          name: 'README.md',
          path: 'docs/README.md',
          size: 2048,
          ext: '.md',
        },
      ];

  const tree: DirNode = {
    kind: 'dir',
    name: rootName || '.',
    path: '',
    children: [
      { kind: 'dir', name: 'src', path: 'src', children: [] },
      { kind: 'dir', name: 'docs', path: 'docs', children: [] },
      ...files,
    ],
  };

  // Apply a trivial depth cap: if depth === 0, no children
  if (opts.depth === 0) {
    return { ...tree, children: [] };
  }
  return tree;
}

export function scanDirectoryStub(options: Options): DirectoryTree {
  // We *don’t* touch the file system here.
  // Later we’ll implement a real scanner honoring ignore rules and depth.
  const rootName =
    options.targetPath === '.'
      ? '.'
      : (options.targetPath
          .replace(/[/\\]+$/, '')
          .split(/[\\/]/)
          .pop() ?? '.');
  return makeStubTree(rootName, options);
}
