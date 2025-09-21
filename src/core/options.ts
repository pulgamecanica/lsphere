// Single responsibility: define the Options shape and resolve raw CLI inputs into a
// normalized, immutable Options object. No scanning, no rendering here.

export type ContrastMode = 'auto' | 'on' | 'off';

export interface OutputMode {
  svg: boolean;
  html: boolean;
  json: boolean;
  png: boolean;
}

export interface HtmlTemplateDefault {
  kind: 'default';
}
export interface HtmlTemplateLocal {
  kind: 'local';
  path: string;
}
export interface HtmlTemplateRemote {
  kind: 'remote';
  url: string;
  timeoutMs: number;
  cacheDir: string;
  hash?: string;
  noNetwork: boolean;
}
export type HtmlTemplate =
  | HtmlTemplateDefault
  | HtmlTemplateLocal
  | HtmlTemplateRemote;

export interface Options {
  targetPath: string;
  outDir: string;
  outputs: OutputMode;

  depth: number; // -1 = unlimited
  dirsOnly: boolean;
  noFolders: boolean;

  bgColor: string;
  palette: string;
  extColors: Record<string, string>;

  contrast: ContrastMode;

  // Ignoring
  ignoreFile: string | null;
  ignorePatterns: string[];

  // HTML template config
  htmlTemplate: HtmlTemplate;

  verbose: boolean;
}

export interface RawCLI {
  // positional
  targetPath?: string;

  // outputs
  out?: string;
  svg?: boolean;
  html?: boolean;
  json?: boolean;
  png?: boolean;
  composite?: boolean;

  // behavior
  depth?: string | number;
  dirsOnly?: boolean;
  noFolders?: boolean;
  bg?: string;
  palette?: string;
  extColors?: string;
  contrast?: string;

  // ignoring
  ignore?: string;
  ignoreFile?: string;
  noIgnoreFile?: boolean;

  // html template
  htmlTemplate?: string; // "default" | path | url
  templateCacheDir?: string; // default ".lsphere-cache"
  noNetwork?: boolean;
  templateTimeout?: string | number; // ms
  templateHash?: string;

  // verbosity
  verbose?: boolean;
  quiet?: boolean;
}

export const DEFAULTS = Object.freeze({
  outDir: 'output',
  outputs: { svg: true, html: true, json: true, png: false } as OutputMode,
  depth: -1,
  dirsOnly: false,
  noFolders: false,
  bgColor: '#ffffff',
  palette: 'default',
  extColors: {} as Record<string, string>,
  contrast: 'auto' as ContrastMode,
  ignoreFile: '.lsignore',
  ignorePatterns: [] as string[],
  verbose: true,
  htmlTemplate: { kind: 'default' } as HtmlTemplate,
  templateCacheDir: '.lsphere-cache',
  templateTimeoutMs: 10_000,
});

export function resolveOptions(raw: RawCLI): Options {
  const targetPath =
    raw.targetPath && raw.targetPath.trim().length > 0 ? raw.targetPath : '.';

  // Start from defaults
  let outputs: OutputMode = { ...DEFAULTS.outputs };
  if (raw.composite) {
    outputs = { svg: true, html: true, json: true, png: outputs.png };
  }
  if (typeof raw.svg === 'boolean') outputs.svg = raw.svg;
  if (typeof raw.html === 'boolean') outputs.html = raw.html;
  if (typeof raw.json === 'boolean') outputs.json = raw.json;
  if (typeof raw.png === 'boolean') outputs.png = raw.png;

  // HTML implies JSON
  if (outputs.html) outputs.json = true;

  const depthNum = (() => {
    if (raw.depth === undefined || raw.depth === null || raw.depth === '')
      return DEFAULTS.depth;
    const n = typeof raw.depth === 'string' ? Number(raw.depth) : raw.depth;
    if (!Number.isFinite(n)) return DEFAULTS.depth;
    return Math.trunc(n);
  })();

  const extColors = parseExtColors(raw.extColors);
  const ignorePatterns = raw.ignore
    ? raw.ignore.trim().split(/\s+/).filter(Boolean)
    : DEFAULTS.ignorePatterns;
  const ignoreFile =
    raw.noIgnoreFile === true ? null : (raw.ignoreFile ?? DEFAULTS.ignoreFile);
  const verbose = raw.quiet ? false : (raw.verbose ?? DEFAULTS.verbose);
  const contrast = normalizeContrast(raw.contrast);
  const palette = raw.palette ?? DEFAULTS.palette;
  const bgColor = raw.bg ?? DEFAULTS.bgColor;
  const dirsOnly = !!raw.dirsOnly;
  const noFolders = !!raw.noFolders;
  const outDir = raw.out ?? DEFAULTS.outDir;

  const htmlTemplate = resolveHtmlTemplate({
    src: raw.htmlTemplate,
    cacheDir: raw.templateCacheDir ?? DEFAULTS.templateCacheDir,
    noNetwork: !!raw.noNetwork,
    timeoutMs: toMs(raw.templateTimeout) ?? DEFAULTS.templateTimeoutMs,
    hash: raw.templateHash,
  });

  return Object.freeze({
    targetPath,
    outDir,
    outputs,
    depth: depthNum,
    dirsOnly,
    noFolders,
    bgColor,
    palette,
    extColors,
    contrast,
    ignoreFile,
    ignorePatterns,
    htmlTemplate,
    verbose,
  });
}

// ---------- helpers ----------

function parseExtColors(mapStr?: string): Record<string, string> {
  if (!mapStr || !mapStr.trim()) return DEFAULTS.extColors;
  const out: Record<string, string> = {};
  for (const entry of mapStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const idx = entry.indexOf('=');
    if (idx <= 0) continue;
    let ext = entry.slice(0, idx).trim();
    const color = entry.slice(idx + 1).trim();
    if (!ext || !color) continue;
    if (!ext.startsWith('.')) ext = `.${ext}`;
    out[ext] = color;
  }
  return out;
}

function normalizeContrast(v?: string): ContrastMode {
  const s = (v ?? DEFAULTS.contrast).toString().toLowerCase();
  return s === 'on' || s === 'off' ? (s as ContrastMode) : 'auto';
}

function toMs(v?: string | number): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

function resolveHtmlTemplate(params: {
  src?: string;
  cacheDir: string;
  noNetwork: boolean;
  timeoutMs: number;
  hash?: string;
}): HtmlTemplate {
  const { src, cacheDir, noNetwork, timeoutMs, hash } = params;
  if (!src || src === 'default') {
    return { kind: 'default' };
  }
  // Is it a URL?
  const isUrl = (() => {
    try {
      const u = new URL(src.startsWith('git+') ? src.slice(4) : src);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  })();
  if (isUrl) {
    return {
      kind: 'remote',
      url: src,
      timeoutMs,
      cacheDir,
      hash,
      noNetwork,
    };
  }
  // Otherwise treat as local path
  return { kind: 'local', path: src };
}
