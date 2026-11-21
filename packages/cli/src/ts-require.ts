/**
 * rn-perf-kit packages ship TypeScript source (React Native's bundler compiles it).
 * Node can't, so the CLI transpiles .ts/.tsx on require with the `typescript` package.
 * This lets it reuse the real budget/frame/report code and load perf.config.ts.
 */
import Module = require('module');
import { readFileSync } from 'fs';

let registered = false;

export function registerTypeScript(): void {
  if (registered) return;
  registered = true;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ts: typeof import('typescript') = require('typescript');
  const compile = (module: any, filename: string) => {
    const source = readFileSync(filename, 'utf8');
    const out = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        esModuleInterop: true,
        jsx: ts.JsxEmit.React,
      },
    });
    module._compile(out.outputText, filename);
  };
  const extensions = (Module as any)._extensions as Record<string, unknown>;
  extensions['.ts'] = compile;
  extensions['.tsx'] = compile;
}

/** Loads a module's default export (or module.exports) from a .ts/.js/.json file. */
export function loadModule<T>(absPath: string): T {
  registerTypeScript();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(absPath);
  return (mod && typeof mod === 'object' && 'default' in mod ? mod.default : mod) as T;
}
