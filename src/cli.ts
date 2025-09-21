#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve as resolvePath } from 'path';
import { Command } from 'commander';
import { scaleLinear } from 'd3-scale';
import kleur from 'kleur';

import { resolveOptions, type RawCLI, type Options } from './core/options';

const program = new Command();

program
  .name('lsphere')
  .description('lsphere demo: generate a simple SVG with a single circle')
  .argument('[path]', 'target directory', '.')
  .option('-o, --out <dir>', 'output directory')
  // output selection
  .option('--svg', 'emit SVG')
  .option('--html', 'emit HTML viewer')
  .option('--json', 'emit JSON metadata')
  .option('--png', 'emit PNG (from SVG, future)')
  .option('--composite', 'enable all common outputs (svg+json+html)')
  // behavior / presentation
  .option('-d, --depth <n>', 'max recursion depth (negative means unlimited)')
  .option('--dirs-only', 'render only directories')
  .option('--no-folders', 'hide folder names')
  .option('--bg <color>', 'background color')
  .option('--palette <name>', 'palette name')
  .option(
    '--ext-colors <map>',
    'extension color overrides, e.g. ".ts=#3178c6,.js=#f7df1e"',
  )
  .option('--contrast <mode>', 'text contrast: auto|on|off')
  // ignoring
  .option(
    '--ignore <patterns>',
    'space-separated patterns (quote the whole argument)',
  )
  .option('--ignore-file <file>', 'ignore file path (default: .lsignore)')
  .option('--no-ignore-file', 'disable reading any ignore file')
  // verbosity
  .option('-v, --verbose', 'verbose output (default: on)')
  .option('-q, --quiet', 'quiet mode (alias for --no-verbose)')
  .action((pathArg: string, opts: RawCLI) => {
    const raw: RawCLI = { ...opts, targetPath: pathArg };
    const options: Options = resolveOptions(raw);

    if (options.verbose) printSummary(options);

    // --- Smoke test render: single circle (ignoring flags intentionally) ---
    const width = 600;
    const height = 600;

    const rScale = scaleLinear()
      .domain([0, 1])
      .range([0, Math.min(width, height) / 2]);
    const r = rScale(0.7);

    const cx = width / 2;
    const cy = height / 2;
    const bg = options.bgColor || '#ffffff';
    const fill = '#69b3a2';

    const svg = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `  <rect width="${width}" height="${height}" fill="${bg}" />`,
      `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`,
      `</svg>`,
      ``,
    ].join('\n');

    const outDir = options.outDir;
    const outFile = join(outDir, 'composite.svg');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(outFile, svg, 'utf8');

    if (options.verbose) {
      console.log(kleur.green(`✔ wrote SVG → ${kleur.bold(outFile)}`));
    } else {
      console.log(outFile);
    }
  });

program.parse(process.argv);

// --- helpers ---

function printSummary(o: Options) {
  const title = kleur.bold().cyan('lsphere — execution summary');
  const path = kleur.bold(resolvePath(o.targetPath));
  const out = kleur.bold(o.outDir);

  const outputs = [
    o.outputs.svg ? kleur.green('svg') : kleur.gray('svg'),
    o.outputs.json ? kleur.green('json') : kleur.gray('json'),
    o.outputs.html ? kleur.green('html') : kleur.gray('html'),
    o.outputs.png ? kleur.green('png') : kleur.gray('png'),
  ].join(kleur.gray(' • '));

  const depthStr = o.depth < 0 ? 'unlimited' : String(o.depth);

  const ignoreFileStr =
    o.ignoreFile === null ? kleur.gray('disabled') : o.ignoreFile;
  const ignoreInlineCount = o.ignorePatterns.length;

  const extColorCount = Object.keys(o.extColors).length;

  console.log('\n' + title);
  console.log(`${kleur.gray('target')}     ${path}`);
  console.log(`${kleur.gray('out dir')}    ${out}`);
  console.log(`${kleur.gray('outputs')}    ${outputs}`);
  console.log(`${kleur.gray('depth')}      ${depthStr}`);
  console.log(
    `${kleur.gray('mode')}       ${o.dirsOnly ? 'dirs-only' : 'normal'}`,
  );
  console.log(
    `${kleur.gray('labels')}     ${o.noFolders ? 'hidden' : 'shown'}`,
  );
  console.log(
    `${kleur.gray('bg/palette')} ${o.bgColor} / ${o.palette} (${o.contrast})`,
  );
  console.log(
    `${kleur.gray('ignore')}     file: ${ignoreFileStr}, inline: ${ignoreInlineCount}`,
  );
  console.log(`${kleur.gray('ext colors')} ${extColorCount} override(s)`);
  console.log('');
}
