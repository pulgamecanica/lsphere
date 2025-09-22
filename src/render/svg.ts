import { hierarchy, pack } from 'd3-hierarchy';
import { scaleLog, scaleOrdinal } from 'd3-scale';
import type { Snapshot, DirNode, FileNode } from '../core/model';
import type { Options } from '../core/options';
import { pickD3Scheme } from '../core/palettes';

type Node = DirNode | FileNode;

export function renderSvgFromSnapshot(
  snapshot: Snapshot,
  options: Options,
): string {
  // canvas + margins (room for title)
  const W = 1000;
  const H = 900;
  const margin = { top: 72, right: 24, bottom: 24, left: 24 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const padding = 2;
  const layerCircles: string[] = [];
  const layerFileLabels: string[] = [];
  const layerDirLabels: { r: number; chunk: string }[] = [];
  const extColorMap = new Map<string, string>();

  // hierarchy over union
  const root = hierarchy<Node>(snapshot.tree as Node, (d) =>
    d.kind === 'dir' ? (d.children as Node[]) : null,
  );

  // log-compress dynamic range of file sizes
  const sizes: number[] = [];
  (function walk(n: Node) {
    if (n.kind === 'file') sizes.push(Math.max(1, n.size));
    else for (const c of n.children) walk(c as Node);
  })(snapshot.tree as Node);

  const sMin = sizes.length ? Math.max(1, Math.min(...sizes)) : 1;
  const sMax = sizes.length ? Math.max(sMin + 1, Math.max(...sizes)) : sMin + 1;

  const weight = scaleLog<number, number>()
    .domain([sMin, sMax])
    .range([1, 100]) // relative weights for pack()
    .clamp(true);

  root.sum((d) => (d.kind === 'file' ? weight(Math.max(1, d.size)) : 0));

  const scheme = pickD3Scheme(options.palette);
  const fileColorScale = scaleOrdinal<string, string>()
    .domain([]) // domain grows dynamically
    .range(scheme);
  // Stable categorical colors by extension (fallback to filename)
  function colorForFile(ext: string | undefined, name: string): string {
    if (ext && options.extColors[ext]) return options.extColors[ext];
    const key = ext && ext.length ? ext : name;
    const color = fileColorScale(key);
    if (ext) extColorMap.set(ext, color);
    return color;
  }

  // layout inside inner area
  const layout = pack<Node>().size([innerW, innerH]).padding(padding);
  const packed = layout(root);

  for (const node of packed.descendants()) {
    if (node.depth === 0) continue; // skip enclosing root circle

    const { x, y, r } = node;
    const name = node.data.name;

    if (node.data.kind === 'dir') {
      // directory: white fill, dark stroke, arched label on top of rim
      const stroke = '#222';
      const strokeWidth = 1.2;
      const fill = '#fff';

      // base circle: fill only (no full stroke)
      layerCircles.push(
        `    <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="${fill}" />`,
      );

      if (r > 12) {
        const fontSize = clamp(9, 14, r / 4);
        const labelPad = 10; // px each side
        const gapPx = estimateTextWidth(name, fontSize) + 2 * labelPad;

        // circumference + dash split for a top gap (where the text will go)
        const C = 2 * Math.PI * r;
        const gapClamped = Math.min(
          Math.max(gapPx, 10),
          Math.max(C * 0.45, 10),
        );
        const dash = Math.max(C - gapClamped, 0);
        const dashLeft = dash / 2;

        // stroke with a gap centered at 12 o’clock
        layerCircles.push(
          `    <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}"`,
          `            fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"`,
          `            stroke-dasharray="${fmt(dashLeft)} ${fmt(gapClamped)} ${fmt(dashLeft)}"`,
          `            transform="rotate(90 ${fmt(x)} ${fmt(y)})" />`,
        );

        // text follows the actual rim (continuation of the circumference)
        const theta = gapClamped / Math.max(1, r); // radians to span
        const a0 = -Math.PI / 2 - theta / 2; // start angle (left of top)
        const a1 = -Math.PI / 2 + theta / 2; // end angle (right of top)
        const x0 = x + r * Math.cos(a0),
          y0 = y + r * Math.sin(a0) + 4;
        const x1 = x + r * Math.cos(a1),
          y1 = y + r * Math.sin(a1) + 4;
        const arcId = `rim-${safeId(node)}-${Math.round(x)}-${Math.round(y)}`;

        const labelChunk = [
          `    <defs><path id="${arcId}" d="M ${fmt(x0)} ${fmt(y0)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x1)} ${fmt(y1)}"/></defs>`,
          `    <text font-family="sans-serif" font-size="${fontSize}" fill="#000">`,
          `      <textPath href="#${arcId}" startOffset="50%" text-anchor="middle">${escapeXml(name)}</textPath>`,
          `    </text>`,
        ].join('\n');
        layerDirLabels.push({ r, chunk: labelChunk });
      }
    } else if (node.data.kind === 'file') {
      // file: colored fill (placeholder), label inside if big enough
      const fill = colorForFile(node.data.ext, name); // NEW: D3 palette + overrides

      layerCircles.push(
        `    <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="${fill}" />`,
      );

      if (r > 12) {
        const fs = clamp(8, 13, r / 3.5);
        layerFileLabels.push(
          `    <text x="${fmt(x)}" y="${fmt(y)}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${fs}" fill="#fff">${escapeXml(name)}</text>`,
        );
      }
    }
  }

  // Legend panel sits immediately after the Pack packed area
  const LEGEND_W = 100;
  const W2 = W + LEGEND_W;

  const SW = 12; // swatch size
  const GAP = 8; // gap between swatch and text
  const ROW = 18; // row height (vertical spacing)

  const r = SW / 2;

  // Bottom-anchored so items fill bottom → top
  const legendBottom = H - margin.bottom;
  const legendLeft = W - 100;

  const entries = Array.from(extColorMap.entries()).sort(); // your sort choice
  const count = entries.length;

  const legendGroup: string[] = ['  <g class="legend">'];
  for (let idx = 0; idx < count; idx++) {
    const [ext, color] = entries[idx];
    const y = legendBottom - (count - 1 - idx) * ROW;

    legendGroup.push(
      // each row in its own group for clean positioning
      `    <g transform="translate(${fmt(legendLeft)}, ${fmt(y)})">`,
      // swatch as a circle, vertically centered on y
      `      <circle cx="${fmt(r)}" cy="0" r="${fmt(r)}" fill="${color}" />`,
      // label aligned to middle vertically
      `      <text x="${fmt(SW + GAP)}" y="0" font-family="sans-serif" font-size="12"`,
      `            dominant-baseline="middle" fill="#000">${escapeXml(ext)}</text>`,
      `    </g>`,
    );
  }
  legendGroup.push('  </g>');

  // Build the SVG
  const svg: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H}" viewBox="0 0 ${W2} ${H}">`,
    `  <rect width="${W2}" height="${H}" fill="${options.bgColor}" />`,
    // title (top-left)
    `  <text x="${margin.left}" y="${Math.max(24, margin.top * 0.55)}" font-family="sans-serif" font-size="18" fill="#333">`,
    `    ${escapeXml(snapshot.meta.root)}`,
    `  </text>`,
    `  <g transform="translate(${margin.left},${margin.top})">`,
  ];

  svg.push(
    ...layerCircles, // bottom: all circles
    ...layerFileLabels, // middle: file labels
    ...layerDirLabels // top: dir labels (we'll sort first)
      .sort((a, b) => b.r - a.r) // larger/outer directories last → on top
      .map((d) => d.chunk),
  );

  svg.push(`  </g>`, ``); // Close the <g> tag for the pack
  svg.push(...legendGroup);
  svg.push(`</svg>`, ``);

  return svg.join('\n');
}

// heuristics/utilities
function estimateTextWidth(text: string, fontSize: number): number {
  return fontSize * 0.5 * text.length; // decent sans-serif heuristic
}
function clamp(min: number, max: number, v: number): number {
  return Math.max(min, Math.min(max, v));
}
function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : String(n);
}
function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<'
      ? '&lt;'
      : c === '>'
        ? '&gt;'
        : c === '&'
          ? '&amp;'
          : c === '"'
            ? '&quot;'
            : '&#39;',
  );
}
function safeId(node: import('d3-hierarchy').HierarchyNode<Node>): string {
  return node
    .ancestors()
    .map((a) => a.data.name.replace(/[^a-zA-Z0-9_-]+/g, '-'))
    .join('-');
}
