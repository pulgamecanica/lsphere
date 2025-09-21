#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import got from 'got';
import { createReporter } from './reporter';
import { type HtmlTemplate } from './options';

const DEFAULT_HTML: string = String.raw`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>lsphere</title>
<style>
  body { margin: 0; background: {{BG}}; color: #222; font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  .wrap { padding: 16px; }
  code { background: rgba(0,0,0,.05); padding: 2px 4px; border-radius: 4px; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>lsphere</h1>
    <p>Template: <code>default</code> — Palette: <code>{{PALETTE}}</code></p>
    <p>Loading data from <code>{{JSON_PATH}}</code>…</p>
    <pre id="out">(waiting)</pre>
  </div>
  <script type="module">
    (async () => {
      try {
        const res = await fetch('{{JSON_PATH}}', { cache: 'no-store' });
        const data = await res.json();
        document.getElementById('out').textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        document.getElementById('out').textContent = 'Failed to load JSON: ' + err;
      }
    })();
  </script>
</body>
</html>`;

export function describeTemplate(t: HtmlTemplate): string {
  switch (t.kind) {
    case 'default':
      return 'default (built-in)';
    case 'local':
      return `local: ${t.path}`;
    case 'remote':
      return `remote: ${t.url} (cache=${t.cacheDir}, timeout=${t.timeoutMs}ms${t.hash ? `, hash=${t.hash.slice(0, 8)}…` : ''}${t.noNetwork ? ', no-network' : ''})`;
  }
}

export function applyTemplate(
  template: string,
  vars: Record<string, string>,
): string {
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

export async function loadTemplate(
  t: HtmlTemplate,
  reporter: ReturnType<typeof createReporter>,
): Promise<string> {
  switch (t.kind) {
    case 'default':
      return DEFAULT_HTML;
    case 'local': {
      try {
        return readFileSync(t.path, 'utf8');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        reporter.error(`✖ Failed to read template file: ${t.path}`);
        reporter.exit(5);
        break;
      }
    }
    case 'remote': {
      // Honor no-network
      if (t.noNetwork) {
        reporter.error('✖ --no-network forbids fetching remote templates');
        reporter.exit(2);
      }
      // Ensure cache dir exists
      mkdirSync(t.cacheDir, { recursive: true });
      const cacheKey = sha256Hex(t.url);
      const cachePath = join(t.cacheDir, `${cacheKey}.html`);
      // Use cache if present
      if (existsSync(cachePath)) {
        const cached = readFileSync(cachePath, 'utf8');
        if (t.hash && sha256Hex(cached) !== t.hash.toLowerCase()) {
          reporter.error(
            '✖ Cached template hash mismatch. Delete cache or provide correct --template-hash.',
          );
          reporter.exit(2);
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
          reporter.error(
            '✖ Remote template hash mismatch (integrity check failed).',
          );
          reporter.exit(2);
        }
        writeFileSync(cachePath, html, 'utf8');
        return html;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        reporter.error('Failed to fetch remote template');
        reporter.exit(5);
      }
    }
  }
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
