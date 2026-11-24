import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

/**
 * Loads app TypeScript modules (with "@/..." imports) in Node by transpiling them on the fly,
 * so validation scripts can test pure app logic without a build.
 */
const require = createRequire(import.meta.url);

function resolveTsModule(specifier, fromDirectory, srcRoot) {
  if (specifier.startsWith('@/')) {
    return path.resolve(srcRoot, specifier.slice(2));
  }

  const basePath = path.resolve(fromDirectory, specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.mjs'),
  ];

  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(`Unable to resolve module ${specifier} from ${fromDirectory}`);
  }

  return match;
}

function resolveWithExtensions(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.mjs'),
  ];

  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(`Unable to resolve module ${basePath}`);
  }

  return match;
}

export function createTsModuleLoader(srcRoot) {
  const cache = new Map();

  function loadModule(filePath) {
    const absolutePath = resolveWithExtensions(path.resolve(filePath));
    if (cache.has(absolutePath)) {
      return cache.get(absolutePath);
    }

    const source = fs.readFileSync(absolutePath, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: absolutePath,
    });

    const moduleRecord = { exports: {} };
    cache.set(absolutePath, moduleRecord.exports);

    const localRequire = (specifier) => {
      if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        return loadModule(resolveTsModule(specifier, path.dirname(absolutePath), srcRoot));
      }

      return require(specifier);
    };

    const evaluator = new Function('require', 'module', 'exports', '__filename', '__dirname', transpiled.outputText);
    evaluator(localRequire, moduleRecord, moduleRecord.exports, absolutePath, path.dirname(absolutePath));
    cache.set(absolutePath, moduleRecord.exports);
    return moduleRecord.exports;
  }

  return { loadModule };
}
