#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve as resolvePath } from 'path';
import { Command } from 'commander';
import { createReporter } from './core/reporter';
import { scanDirectory } from './core/scan';
import { type Snapshot } from './core/model';

import kleur from 'kleur';

import { resolveOptions, type RawCLI, type Options } from './core/options';

import { describeTemplate, applyTemplate, loadTemplate } from './core/template';
import { renderSvgFromSnapshot } from './render/svg';

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
  .option('--no-dirs', 'hide directory names')
  .option('--bg <color>', 'background color')
  .option(
    '--palette <name>',
    'palette name: category10|tableau10|set3|paired|dark2|accent|pastel1|pastel2|set1|set2',
  )
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

    let tree;
    try {
      tree = await scanDirectory(options, reporter);
    } catch (err: unknown) {
      reporter.error(String((err as Error)?.message ?? err));
      reporter.exit(3); // scan error
    }
    if (!tree) return;

    const snapshot: Snapshot = {
      meta: {
        tool: 'lsphere',
        version: '0.0.0', // TODO: optionally read from package.json later
        generatedAt: new Date().toISOString(),
        root: resolvePath(options.targetPath),
        options: {
          depth: options.depth,
          dirsOnly: options.dirsOnly,
          noDirs: options.noDirs,
          bgColor: options.bgColor,
          palette: options.palette,
          contrast: options.contrast,
        },
      },
      tree,
    };

    const outDir = options.outDir;
    mkdirSync(outDir, { recursive: true });

    // --- Demo circle SVG (if requested) ---
    if (options.outputs.svg) {
      const svgPath = join(outDir, 'circle.svg');
      const svg = renderSvgFromSnapshot(snapshot, options);
      writeFileSync(svgPath, svg, 'utf8');
      reporter.success(`wrote SVG → ${kleur.bold(svgPath)}`);
    }

    // --- Demo JSON (if requested or implied by HTML) ---
    let jsonPath: string | null = null;
    if (options.outputs.json) {
      jsonPath = join(outDir, 'circle.json');

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
    `${kleur.white('labels')}     ${o.noDirs ? 'hidden' : 'shown'}`,
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
