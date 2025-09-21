#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, resolve as resolvePath } from 'path';
import { createHash } from 'crypto';
import { Command } from 'commander';
import { scaleLinear } from 'd3-scale';
import got from 'got';
import kleur from 'kleur';

import {
  resolveOptions,
  type RawCLI,
  type Options,
  type HtmlTemplate,
} from './core/options';

import { DEFAULT_HTML } from './core/template'

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
  .option('--ext-colors <map>', 'extension color overrides, e.g. ".ts=#3178c6,.js=#f7df1e"')
  .option('--contrast <mode>', 'text contrast: auto|on|off')
  // ignoring
  .option('--ignore <patterns>', 'space-separated patterns (quote the whole arg)')
  .option('--ignore-file <file>', 'ignore file path (default: .lsignore)')
  .option('--no-ignore-file', 'disable reading any ignore file')
  // html template
  .option('--html-template <src>', 'default | local path | http(s) url')
  .option('--template-cache-dir <dir>', 'cache dir for remote templates (default: .lsphere-cache)')
  .option('--no-network', 'forbid network fetches for template')
  .option('--template-timeout <ms>', 'network timeout in ms for template fetch')
  .option('--template-hash <sha256>', 'optional integrity check for template')
  // verbosity
  .option('-v, --verbose', 'verbose output (default: on)')
  .option('-q, --quiet', 'quiet mode (alias for --no-verbose)')
  .action(async (pathArg: string, opts: RawCLI) => {
    const raw: RawCLI = { ...opts, targetPath: pathArg };
    const options: Options = resolveOptions(raw);

    if (options.verbose) printSummary(options);

    // ensure we actually have something to do
    if (!options.outputs.svg && !options.outputs.json && !options.outputs.html && !options.outputs.png) {
      console.error(kleur.red('✖ No outputs selected (svg/json/html/png are all disabled)'));
      process.exitCode = 2;
      return;
    }

    // --- Demo circle SVG (if requested) ---
    const outDir = options.outDir;
    mkdirSync(outDir, { recursive: true });

    if (options.outputs.svg) {
      const svgPath = join(outDir, 'circle.svg');
      const svg = renderDemoCircle(options);
      writeFileSync(svgPath, svg, 'utf8');
      if (options.verbose) console.log(kleur.green(`✔ wrote SVG → ${kleur.bold(svgPath)}`));
      else console.log(svgPath);
    }

    // --- Demo JSON (if requested or implied by HTML) ---
    let jsonPath: string | null = null;
    if (options.outputs.json) {
      jsonPath = join(outDir, 'circle.json');
      const payload = { demo: true, note: 'lsphere JSON stub', palette: options.palette, bg: options.bgColor };
      writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
      if (options.verbose) console.log(kleur.green(`✔ wrote JSON → ${kleur.bold(jsonPath)}`));
      else console.log(jsonPath);
    }

    // --- HTML (template-driven; JSON is guaranteed on by resolver when html=true) ---
    if (options.outputs.html) {
      const htmlPath = join(outDir, 'circle.html');
      const templateStr = await loadTemplate(options.htmlTemplate, options);
      const html = applyTemplate(templateStr, {
        JSON_PATH: 'circle.json',
        BG: options.bgColor,
        PALETTE: options.palette,
      });
      writeFileSync(htmlPath, html, 'utf8');
      if (options.verbose) console.log(kleur.green(`✔ wrote HTML → ${kleur.bold(htmlPath)}`));
      else console.log(htmlPath);
    }
  });

program.parseAsync(process.argv);

// ---------- helpers ----------

function renderDemoCircle(options: Options): string {
  const width = 600;
  const height = 600;
  const rScale = scaleLinear().domain([0, 1]).range([0, Math.min(width, height) / 2]);
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
  const ignoreFileStr = o.ignoreFile === null ? kleur.gray('disabled') : o.ignoreFile;
  const ignoreInlineCount = o.ignorePatterns.length;
  const extColorCount = Object.keys(o.extColors).length;

  console.log('\n' + title);
  console.log(`${kleur.gray('target')}     ${path}`);
  console.log(`${kleur.gray('out dir')}    ${out}`);
  console.log(`${kleur.gray('outputs')}    ${outputs}`);
  console.log(`${kleur.gray('depth')}      ${depthStr}`);
  console.log(`${kleur.gray('mode')}       ${o.dirsOnly ? 'dirs-only' : 'normal'}`);
  console.log(`${kleur.gray('labels')}     ${o.noFolders ? 'hidden' : 'shown'}`);
  console.log(`${kleur.gray('bg/palette')} ${o.bgColor} / ${o.palette} (${o.contrast})`);
  console.log(`${kleur.gray('ignore')}     file: ${ignoreFileStr}, inline: ${ignoreInlineCount}`);
  console.log(`${kleur.gray('ext colors')} ${extColorCount} override(s)`);
  console.log(`${kleur.gray('template')}   ${describeTemplate(o.htmlTemplate)}`);
  console.log('');
}

function describeTemplate(t: HtmlTemplate): string {
  switch (t.kind) {
    case 'default': return 'default (built-in)';
    case 'local': return `local: ${t.path}`;
    case 'remote': return `remote: ${t.url} (cache=${t.cacheDir}, timeout=${t.timeoutMs}ms${t.hash ? `, hash=${t.hash.slice(0,8)}…` : ''}${t.noNetwork ? ', no-network' : ''})`;
  }
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, val] of Object.entries(vars)) {
    const token = new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, 'g');
    out = out.replace(token, val);
  }
  return out;
}
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadTemplate(t: HtmlTemplate, options: Options): Promise<string> {
  switch (t.kind) {
    case 'default':
      return DEFAULT_HTML;
    case 'local': {
      try {
        return readFileSync(t.path, 'utf8');
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        console.error(kleur.red(`✖ Failed to read template file: ${t.path}`));
        console.error(String(err?.message ?? err));
        process.exitCode = 5;
        return DEFAULT_HTML;
      }
    }
    case 'remote': {
      // Honor no-network
      if (t.noNetwork) {
        console.error(kleur.red('✖ --no-network forbids fetching remote templates'));
        process.exitCode = 2;
        return DEFAULT_HTML;
      }
      // Ensure cache dir exists
      mkdirSync(t.cacheDir, { recursive: true });
      const cacheKey = sha256Hex(t.url);
      const cachePath = join(t.cacheDir, `${cacheKey}.html`);
      // Use cache if present
      if (existsSync(cachePath)) {
        const cached = readFileSync(cachePath, 'utf8');
        if (t.hash && sha256Hex(cached) !== t.hash.toLowerCase()) {
          console.error(kleur.red('✖ Cached template hash mismatch. Delete cache or provide correct --template-hash.'));
          process.exitCode = 2;
          return DEFAULT_HTML;
        }
        return cached;
      }
      // Fetch with got
      try {
        const url = t.url.startsWith('git+') ? t.url.slice(4) : t.url;
        const res = await got.get(url, {
          timeout: { request: t.timeoutMs },
          retry: { limit: 2 },
          followRedirect: true,
        });
        const html = res.body;
        if (t.hash && sha256Hex(html) !== t.hash.toLowerCase()) {
          console.error(kleur.red('✖ Remote template hash mismatch (integrity check failed).'));
          process.exitCode = 2;
          return DEFAULT_HTML;
        }
        writeFileSync(cachePath, html, 'utf8');
        return html;
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        console.error(kleur.red('✖ Failed to fetch remote template'));
        console.error(String(err?.message ?? err));
        process.exitCode = 5;
        return DEFAULT_HTML;
      }
    }
  }
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
