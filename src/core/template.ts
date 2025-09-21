export const DEFAULT_HTML: string = String.raw`<!doctype html>
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