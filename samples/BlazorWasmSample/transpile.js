/**
 * Transpile blazor.webassembly.js for Safari 15 compatibility.
 * The only Safari-15-incompatible feature in .NET 10's bootloader is
 * static{} (class static initialization blocks), which requires Safari 16.4+.
 *
 * This script runs Babel on the published blazor.webassembly.js to strip
 * static{} blocks while preserving all other behavior.
 *
 * Usage: node transpile.js [publish-dir]
 * Default publish dir: ./bin/Release/net10.0/publish
 */

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const publishDir = process.argv[2] || './bin/Release/net10.0/publish';
const blazorJsPath = path.join(
  publishDir,
  'wwwroot',
  '_framework',
  'blazor.webassembly.js'
);

if (!fs.existsSync(blazorJsPath)) {
  console.error(`[transpile] blazor.webassembly.js not found at: ${blazorJsPath}`);
  process.exit(1);
}

const code = fs.readFileSync(blazorJsPath, 'utf8');
console.log(`[transpile] Read ${(code.length / 1024).toFixed(1)} KB from ${blazorJsPath}`);

const result = babel.transformSync(code, {
  filename: 'blazor.webassembly.js',
  plugins: ['@babel/plugin-transform-class-static-block'],
  compact: false,   // keep minified as-is, just strip static{}
  sourceMaps: false,
});

fs.writeFileSync(blazorJsPath, result.code, 'utf8');
console.log(`[transpile] Written ${(result.code.length / 1024).toFixed(1)} KB back to ${blazorJsPath}`);

// Verify static{} was removed
if (result.code.includes('static{')) {
  console.error('[transpile] WARNING: static{} still present after transpilation!');
  process.exit(1);
} else {
  console.log('[transpile] OK: no static{} blocks remaining.');
}

// Also check compressed versions exist and need updating
const brotliPath = blazorJsPath + '.br';
const gzipPath = blazorJsPath + '.gz';
if (fs.existsSync(brotliPath)) {
  fs.rmSync(brotliPath);
  console.log(`[transpile] Removed stale .br (will be regenerated on deploy)`);
}
if (fs.existsSync(gzipPath)) {
  fs.rmSync(gzipPath);
  console.log(`[transpile] Removed stale .gz (will be regenerated on deploy)`);
}

console.log('[transpile] Done.');
