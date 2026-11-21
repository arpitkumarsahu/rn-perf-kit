/**
 * Lets plain Node (CI runs Node 18) require the packages' TypeScript sources, so tests
 * exercise the real code instead of copies pasted into the test file.
 *
 * - .ts/.tsx are transpiled with the root `typescript` devDependency.
 * - @rn-perf-kit/<name> resolves to packages/<name>/src (perf-provider = rn-perf-kit).
 * - react-native is replaced by a small stub (AppState you can drive, no native module).
 */
const Module = require('module');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

function compile(module, filename) {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
  });
  module._compile(out.outputText, filename);
}
Module._extensions['.ts'] = compile;
Module._extensions['.tsx'] = compile;

// ── react-native stub ────────────────────────────────────────────────────────
const appStateListeners = new Set();
const reactNativeStub = {
  TurboModuleRegistry: { get: () => null, getEnforcing: () => { throw new Error('no native module in tests'); } },
  AppState: {
    currentState: 'active',
    addEventListener(_type, cb) {
      appStateListeners.add(cb);
      return { remove: () => appStateListeners.delete(cb) };
    },
  },
  Platform: { OS: 'android' },
  StatusBar: { currentHeight: 24 },
  StyleSheet: { create: (s) => s },
  View: 'View',
  Text: 'Text',
};
/** Test helper: simulate the app moving to background/active. */
reactNativeStub.__setAppState = (state) => {
  reactNativeStub.AppState.currentState = state;
  appStateListeners.forEach((cb) => cb(state));
};

const STUBS = { 'react-native': reactNativeStub };
const PACKAGE_DIRS = {
  'rn-perf-kit': 'perf-provider',
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request in STUBS) return request;
  const m = /^(@rn-perf-kit\/([^/]+)|rn-perf-kit)(\/.*)?$/.exec(request);
  if (m) {
    const dir = m[2] ?? PACKAGE_DIRS[m[1]];
    const sub = m[3] ?? '/src/index.ts';
    return originalResolve.call(this, path.join(ROOT, 'packages', dir, sub), parent, ...rest);
  }
  return originalResolve.call(this, request, parent, ...rest);
};
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request in STUBS) return STUBS[request];
  return originalLoad.call(this, request, ...rest);
};

globalThis.__DEV__ = true;
if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = () => 0;

module.exports = { ROOT, reactNativeStub };
