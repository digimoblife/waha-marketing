import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';

const rootDir = process.cwd();

function tryResolveTs(basePath) {
  const candidates = [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, 'index.ts'),
    basePath,
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return pathToFileURL(c).href;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = tryResolveTs(path.join(rootDir, 'src', specifier.slice(2)));
    if (resolved) return nextResolve(resolved, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    if (parentDir.startsWith(path.join(rootDir, 'src')) && !path.extname(specifier)) {
      const resolved = tryResolveTs(path.resolve(parentDir, specifier));
      if (resolved) return nextResolve(resolved, context);
    }
  }
  if (specifier === 'next/server') {
    return nextResolve(
      pathToFileURL(path.join(rootDir, 'node_modules/next/server.js')).href,
      context
    );
  }
  return nextResolve(specifier, context);
}
