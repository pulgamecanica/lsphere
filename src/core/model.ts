import { ContrastMode } from './options';

export type NodeKind = 'file' | 'dir';

export interface BaseNode {
  kind: NodeKind;
  name: string; // basename only
  path: string; // normalized, POSIX-style relative to target root
}

export interface FileNode extends BaseNode {
  kind: 'file';
  size: number; // in bytes
  ext: string; // with leading dot, e.g. ".ts" or "" if none
}

export interface DirNode extends BaseNode {
  kind: 'dir';
  children: (DirNode | FileNode)[];
}

export type DirectoryTree = DirNode;

// A lightweight metadata header to include in JSON outputs
export interface SnapshotMeta {
  tool: 'lsphere';
  version: string; // semantic version (populate from package.json if you like, for now keep "0.0.0")
  generatedAt: string; // ISO timestamp
  root: string; // absolute or normalized input path
  options: {
    depth: number;
    dirsOnly: boolean;
    noDirs: boolean;
    bgColor: string;
    palette: string;
    contrast: ContrastMode;
  };
}

export interface Snapshot {
  meta: SnapshotMeta;
  tree: DirectoryTree;
}
