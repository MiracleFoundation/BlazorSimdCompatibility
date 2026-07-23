# BlazorSimdCompatibility

Runtime SIMD/exception-handling detection for Blazor WebAssembly. Automatically falls back to a compatibility build on unsupported browsers — no manual configuration needed.

## Problem

.NET 8+ Blazor WASM enables SIMD, exception handling, and jiterpreter by default. These features break on:
- Older CPUs (AMD Phenom II, pre-SSE4 Intel)
- Older Android builds
- Some Firefox versions
- Any browser without WebAssembly SIMD support

The app fails **before** any C# code runs, so in-app error handling cannot rescue it.

## Solution

BlazorSimdCompatibility provides:
1. **Runtime detection** — JavaScript detects SIMD/exception support before Blazor boots
2. **Auto-fallback** — loads a compat build transparently on unsupported devices
3. **Auto-config** — NuGet `.props` adds `ReleaseCompat` build configuration automatically
4. **CLI tool** — verify and automate dual-build + merge

## Quick Start

### 1. Install the NuGet package

```bash
dotnet add package BlazorSimdCompatibility
```

### 2. Update `index.html`

> **Important**: .NET 10 uses `??=` (nullish assignment) and `static{}` (class initialization blocks).
> - `??=` is a **SyntaxError on Safari < 15.4 / iOS < 15.4**. The inline pre-check below catches this before loading `blazor.webassembly.js`.
> - `static{}` is **transpiled away at build time** by the `TranspileBlazorJs` MSBuild target (uses Babel's `@babel/plugin-transform-class-static-block`). This ensures the bootloader works on **Safari 15+** without requiring Safari 16.4+.

```html
<!-- Pre-check: detect ??= support (required by blazor.webassembly.js).
     static{} is transpiled away at build time — see TranspileBlazorJs MSBuild target. -->
<!-- Split-script approach: CSP-safe, no eval/Function -->
<script>window.__blazorIncompatibleBrowser = true;</script>
<script>window.__blazorIncompatibleBrowser = false; var _bsdCompatTest_; _bsdCompatTest_ ??= 1;</script>

<!-- Blazor loader with autostart=false -->
<script src="_framework/blazor.webassembly.js" autostart="false"
    onload="window.__blazorScriptLoaded=true"
    onerror="window.__blazorLoaderFailed=true"></script>

<!-- wasm-feature-detect (bundled in the package) -->
<script src="_content/BlazorSimdCompatibility/wasm-feature-detect.1.5.1.js"
    onerror="window.__featureDetectFailed=true"></script>

<!-- SIMD detection + auto-start -->
<script src="_content/BlazorSimdCompatibility/blazor-simd-compat.js"></script>
```

### 3. Publish dual build

```bash
# Install the CLI tool
dotnet tool install -g BlazorSimdCompatibility.Cli

# Dual publish + merge
blazor-simd-compat publish

# Verify output
blazor-simd-compat verify bin/Publish/wwwroot
```

### 4. Deploy

Deploy `bin/Publish/wwwroot/`. Modern devices get `_framework/` (SIMD), older devices get `_frameworkCompat/` (compat) — transparently.

## How It Works

```
Browser loads index.html
  ↓
??= + static{} pre-check (inline script)
  ↓
┌─ Missing → early error: "upgrade your browser"
└─ Supported → blazor.webassembly.js loads
                   ↓
              blazor-simd-compat.js runs
                   ↓
              wasm-feature-detect checks SIMD + exceptions
                   ↓
              ┌─ Supported → Blazor.start() loads _framework/ (SIMD build)
              └─ Not supported → loadBootResource remaps to _frameworkCompat/
```

## CLI Commands

```bash
# Verify dual-publish output
blazor-simd-compat verify bin/Publish/wwwroot
blazor-simd-compat verify bin/Publish/wwwroot --pwa

# Dual publish + merge
blazor-simd-compat publish
blazor-simd-compat publish --output bin/Release --pwa
blazor-simd-compat publish --project ./MyApp
```

## Debug Flags

Add query string flags to debug in the browser:

| Flag | Effect |
|------|--------|
| `?verboseStart=1` | Log detection results to console |
| `?forceCompatMode=1` | Force compat build (for testing) |

Example: `https://myapp.com/?verboseStart=1&forceCompatMode=1`

## PWA Support

For Blazor PWA apps, use `--pwa` flag:

```bash
blazor-simd-compat publish --pwa
```

This copies `service-worker-assets-compat.js` for SIMD-aware service worker caching. See the [original skill documentation](https://github.com/chicuong2k3/blazor-toolkit/tree/main/skills/blazor-wasm-simd-compatibility) for the full PWA service worker implementation.

## AI Skill (Claude Code Plugin)

This repo includes a Claude Code skill at `.claude/skills/blazor-simd-compatibility/SKILL.md`. Install it as a plugin to get AI-guided setup:

```bash
# In your Blazor project directory
claude plugin install path/to/BlazorSimdCompatibility
```

Then ask Claude in natural language:
- "Add SIMD compatibility to my Blazor WASM app"
- "My app shows a blank page on older Android phones"
- "Set up dual publish for my Blazor project"
- "Deploy my Blazor WASM app to Azure with SIMD compat"

The skill covers: package setup, `index.html` configuration, dual publish, CI/CD (GitHub Actions), deployment (Azure, GitHub Pages, Docker, Nginx), and debugging.

## Requirements

- .NET 8.0 SDK or newer
- `wasm-tools` workload (for `ReleaseCompat` build): `dotnet workload install wasm-tools`

## License

MIT
