import * as process from 'node:process';
import * as kleur from 'kleur';

export type ExitCode =
  | 0 // OK
  | 1 // Generic failure
  | 2 // CLI usage error (bad flags/values)
  | 3 // Scan error (fs/path)
  | 4 // Render error
  | 5; // I/O error (read/write/network)

export interface ReporterOptions {
  verbose: boolean; // show info/success/debug when true
  useColor?: boolean; // override auto-detection, default auto
  scope?: string; // optional scope prefix, e.g., "cli" | "render" | "scan"
}

export interface Reporter {
  info: (msg: string) => void; // stdout (hidden if !verbose)
  success: (msg: string) => void; // stdout (hidden if !verbose)
  warn: (msg: string) => void; // stderr (always shown)
  error: (msg: string) => void; // stderr (always shown)
  debug: (msg: string) => void; // stdout (only if verbose)
  exit: (code: ExitCode, msg?: string) => never; // print (if provided) then process.exit(code)
}

function supportsColor(): boolean {
  if (process.env.NO_COLOR) return false;
  return process.stdout.isTTY === true;
}

function prefix(scope?: string): string {
  return scope ? `${kleur.blue(scope)} ` : '';
}

export function createReporter(opts: ReporterOptions): Reporter {
  const color = opts.useColor ?? supportsColor();
  // Bind decolorized variants if color is disabled
  const K = color
    ? kleur
    : (new Proxy(kleur, {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        get(_, p: keyof typeof kleur) {
          return (x: unknown) => String(x);
        },
      }) as unknown as typeof kleur);

  const scopePfx = prefix(opts.scope);

  const info = (msg: string) => {
    if (!opts.verbose) return;
    process.stdout.write(`${scopePfx}${K.cyan('ℹ︎')} ${msg}\n`);
  };

  const success = (msg: string) => {
    if (!opts.verbose) return;
    process.stdout.write(`${scopePfx}${K.green('✓')} ${msg}\n`);
  };

  const warn = (msg: string) => {
    process.stderr.write(`${scopePfx}${K.yellow('⚠︎')} ${msg}\n`);
  };

  const error = (msg: string) => {
    process.stderr.write(`${scopePfx}${K.red('✖')} ${msg}\n`);
  };

  const debug = (msg: string) => {
    if (!opts.verbose) return;
    process.stdout.write(`${scopePfx}${K.magenta('…')} ${msg}\n`);
  };

  const exit = (code: ExitCode, msg?: string): never => {
    if (msg) {
      if (code === 0) success(msg);
      else error(msg);
    }
    // Ensure trailing newline flushed
    process.exit(code);
  };

  return { info, success, warn, error, debug, exit };
}
