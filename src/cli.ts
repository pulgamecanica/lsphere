#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve as resolvePath } from 'path';
import { Command } from 'commander';
import { scaleLinear } from 'd3-scale';
import { createReporter } from './core/reporter';
import { scanDirectoryStub } from './core/scan';
import { type Snapshot } from './core/model';

import kleur from 'kleur';

import { resolveOptions, type RawCLI, type Options } from './core/options';

import { describeTemplate, applyTemplate, loadTemplate } from './core/template';

const program = new Command();

program
  .name('lsphere')
  .description('lsphere demo: generate a simple SVG with a single circle')
  .argument('[path]', 'target directory', '.')
  .option('-o, --out <dir>', 'output directory')
  // outputs
  .option('--svg', 'emit SVG')
  .option('--html', 'emit HTML viewer')
  .option('--json', 'emit JSON metadata')
  .option('--png', 'emit PNG (future)')
  .option('--composite', 'enable svg+json+html')
  // behavior
  .option('-d, --depth <n>', 'max recursion depth (negative = unlimited)')
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
    'space-separated patterns (quote the whole arg)',
  )
  .option('--ignore-file <file>', 'ignore file path (default: .lsignore)')
  .option('--no-ignore-file', 'disable reading any ignore file')
  // html template
  .option('--html-template <src>', 'default | local path | http(s) url')
  .option(
    '--template-cache-dir <dir>',
    'cache dir for remote templates (default: .lsphere-cache)',
  )
  .option('--no-network', 'forbid network fetches for template')
  .option('--template-timeout <ms>', 'network timeout in ms for template fetch')
  .option('--template-hash <sha256>', 'optional integrity check for template')
  // verbosity
  .option('-v, --verbose', 'verbose output (default: on)')
  .option('-q, --quiet', 'quiet mode (alias for --no-verbose)')
  .action(async (pathArg: string, opts: RawCLI) => {
    const raw: RawCLI = { ...opts, targetPath: pathArg };
    const options: Options = resolveOptions(raw);

    const reporter = createReporter({
      verbose: options.verbose,
      scope: 'lsphere:',
    });

    if (options.verbose) printSummary(options, reporter);

    // ensure we actually have something to do
    if (
      !options.outputs.svg &&
      !options.outputs.json &&
      !options.outputs.html &&
      !options.outputs.png
    ) {
      reporter.error(
        '✖ No outputs selected (svg/json/html/png are all disabled)',
      );
      reporter.exit(2);
    }

    // We need the tree regardless
    const tree = scanDirectoryStub(options);

    // --- Demo circle SVG (if requested) ---
    const outDir = options.outDir;
    mkdirSync(outDir, { recursive: true });

    if (options.outputs.svg) {
      const svgPath = join(outDir, 'circle.svg');
      const svg = renderDemoCircle(options);
      writeFileSync(svgPath, svg, 'utf8');
      reporter.success(`wrote SVG → ${kleur.bold(svgPath)}`);
    }

    // --- Demo JSON (if requested or implied by HTML) ---
    let jsonPath: string | null = null;
    if (options.outputs.json) {
      jsonPath = join(outDir, 'circle.json');
      const snapshot: Snapshot = {
        meta: {
          tool: 'lsphere',
          version: '0.0.0', // TODO: optionally read from package.json later
          generatedAt: new Date().toISOString(),
          root: resolvePath(options.targetPath),
          options: {
            depth: options.depth,
            dirsOnly: options.dirsOnly,
            noFolders: options.noFolders,
            bgColor: options.bgColor,
            palette: options.palette,
            contrast: options.contrast,
          },
        },
        tree,
      };
      writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2), 'utf8');
      reporter.success(`wrote JSON → ${kleur.bold(jsonPath)}`);
    }

    // --- HTML (template-driven; JSON is guaranteed on by resolver when html=true) ---
    if (options.outputs.html) {
      const htmlPath = join(outDir, 'circle.html');
      const templateStr = await loadTemplate(options.htmlTemplate, reporter);
      const html = applyTemplate(templateStr, {
        JSON_PATH: 'circle.json',
        BG: options.bgColor,
        PALETTE: options.palette,
      });
      writeFileSync(htmlPath, html, 'utf8');
      reporter.success(`wrote HTML → ${kleur.bold(htmlPath)}`);
    }
  });

program.parseAsync(process.argv);

// ---------- helpers ----------

function renderDemoCircle(options: Options): string {
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

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="${width}" height="${height}" fill="${bg}" />`,
    `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`,
    `</svg>`,
    ``,
  ].join('\n');
}

function printSummary(o: Options, reporter: ReturnType<typeof createReporter>) {
  const title = kleur.bold().white('lsphere — execution summary');
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

  reporter.info(title);
  reporter.info(`${kleur.white('target')}     ${path}`);
  reporter.info(`${kleur.white('out dir')}    ${out}`);
  reporter.info(`${kleur.white('outputs')}    ${outputs}`);
  reporter.info(`${kleur.white('depth')}      ${depthStr}`);
  reporter.info(
    `${kleur.white('mode')}       ${o.dirsOnly ? 'dirs-only' : 'normal'}`,
  );
  reporter.info(
    `${kleur.white('labels')}     ${o.noFolders ? 'hidden' : 'shown'}`,
  );
  reporter.info(
    `${kleur.white('bg/palette')} ${o.bgColor} / ${o.palette} (${o.contrast})`,
  );
  reporter.info(
    `${kleur.white('ignore')}     file: ${ignoreFileStr}, inline: ${ignoreInlineCount}`,
  );
  reporter.info(`${kleur.white('ext colors')} ${extColorCount} override(s)`);
  reporter.info(
    `${kleur.white('template')}   ${describeTemplate(o.htmlTemplate)}`,
  );
}
