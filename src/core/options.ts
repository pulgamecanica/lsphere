// Single responsibility: define the Options shape and resolve raw CLI inputs into a
// normalized, immutable Options object. No scanning, no rendering here.

export type ContrastMode = 'auto' | 'on' | 'off';

export interface OutputMode {
  svg: boolean;
  html: boolean;
  json: boolean;
  png: boolean; // reserved for future (SVG->PNG)
}

export type Options = Readonly<{
  targetPath: string;
  outDir: string;
  outputs: OutputMode;

  depth: number; // -1 means "no limit" (infinite)
  dirsOnly: boolean; // render only directories (when we implement it)
  noFolders: boolean; // hide directory labels (rendering detail)

  bgColor: string; // any CSS color string (we’ll validate later)
  palette: string; // named palette (we’ll define later)
  extColors: Record<string, string>; // extension → color map (normalized keys start with '.')

  contrast: ContrastMode;

  // Ignoring
  ignoreFile: string | null; // null => do not read an ignore file
  ignorePatterns: string[]; // inline CLI patterns, already split

  verbose: boolean; // default true
}>;

// Raw CLI shape (what cli.ts passes to resolveOptions). Keep it separate from Options.
export interface RawCLI {
  // positional
  targetPath?: string;

  // flags
  out?: string;
  svg?: boolean;
  html?: boolean;
  json?: boolean;
  png?: boolean;
  composite?: boolean;

  depth?: string | number;
  dirsOnly?: boolean;
  noFolders?: boolean;

  bg?: string;
  palette?: string;
  extColors?: string; // ".ts=#3178c6,.js=#f7df1e"
  contrast?: string; // "auto" | "on" | "off"

  ignore?: string; // space-separated, quoted
  ignoreFile?: string; // path
  noIgnoreFile?: boolean; // from --no-ignore-file

  verbose?: boolean; // commander defaulted + --no-verbose will flip this
  quiet?: boolean; // alias => sets verbose=false
}

// Single place to define defaults
export const DEFAULTS = Object.freeze({
  outDir: 'output',
  outputs: { svg: true, html: true, json: true, png: true } as OutputMode,
  depth: -1, // unlimited
  dirsOnly: false,
  noFolders: false,
  bgColor: '#ffffff',
  palette: 'default',
  extColors: {} as Record<string, string>,
  contrast: 'auto' as ContrastMode,
  ignoreFile: '.lsignore',
  ignorePatterns: [] as string[],
  verbose: true,
});

export function resolveOptions(raw: RawCLI): Options {
  const targetPath =
    raw.targetPath && raw.targetPath.trim().length > 0 ? raw.targetPath : '.';

  // outputs: start from defaults, apply --composite, then individual toggles if provided
  let outputs: OutputMode = { ...DEFAULTS.outputs };
  if (raw.composite) {
    outputs = { svg: true, html: true, json: true, png: outputs.png };
  }
  // Allow explicit booleans to override (only if user provided them)
  if (typeof raw.svg === 'boolean') outputs.svg = raw.svg;
  if (typeof raw.html === 'boolean') outputs.html = raw.html;
  if (typeof raw.json === 'boolean') outputs.json = raw.json;
  if (typeof raw.png === 'boolean') outputs.png = raw.png;

  // depth: accept string/number, normalize; negative => unlimited
  const depthNum = ((): number => {
    if (raw.depth === undefined || raw.depth === null || raw.depth === '')
      return DEFAULTS.depth;
    const n = typeof raw.depth === 'string' ? Number(raw.depth) : raw.depth;
    if (!Number.isFinite(n)) return DEFAULTS.depth;
    return Math.trunc(n);
  })();

  // extColors: ".ts=#3178c6,.js=#f7df1e"
  const extColors = parseExtColors(raw.extColors);

  // ignore patterns: split on whitespace, keeping simple; user should quote the whole arg
  const ignorePatterns = raw.ignore
    ? raw.ignore.trim().split(/\s+/).filter(Boolean)
    : DEFAULTS.ignorePatterns;

  // ignore file: --no-ignore-file wins
  const ignoreFile =
    raw.noIgnoreFile === true ? null : (raw.ignoreFile ?? DEFAULTS.ignoreFile);

  // verbose: quiet wins
  const verbose = raw.quiet ? false : (raw.verbose ?? DEFAULTS.verbose);

  // sanitize contrast
  const contrast = ((): 'auto' | 'on' | 'off' => {
    const v = (raw.contrast ?? DEFAULTS.contrast).toString().toLowerCase();
    return v === 'on' || v === 'off' ? (v as ContrastMode) : 'auto';
  })();

  // normalize palette/bg
  const palette = raw.palette ?? DEFAULTS.palette;
  const bgColor = raw.bg ?? DEFAULTS.bgColor;

  // dirsOnly / noFolders
  const dirsOnly = !!raw.dirsOnly;
  const noFolders = !!raw.noFolders;

  // out dir
  const outDir = raw.out ?? DEFAULTS.outDir;

  const resolved: Options = Object.freeze({
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
    verbose,
  });

  return resolved;
}

// --- helpers ---

function parseExtColors(mapStr?: string): Record<string, string> {
  if (!mapStr || !mapStr.trim()) return DEFAULTS.extColors;
  const out: Record<string, string> = {};
  // entries separated by comma
  for (const entry of mapStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const idx = entry.indexOf('=');
    if (idx <= 0) continue;
    let ext = entry.slice(0, idx).trim();
    const color = entry.slice(idx + 1).trim();
    if (!ext) continue;
    // ensure leading dot on ext (normalize)
    if (!ext.startsWith('.')) ext = `.${ext}`;
    if (!color) continue;
    out[ext] = color;
  }
  return out;
}
