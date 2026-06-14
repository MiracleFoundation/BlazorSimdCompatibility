# BlazorSimdCompatibility — Usage & Deployment Skill

## When to use this skill

Use this skill when:

- The user has a Blazor WebAssembly app (.NET 8+) and wants SIMD compatibility across all browsers/devices.
- Users report a blank page, `CompileError`, `bad type`, or silent startup failure on some devices.
- The user wants to add `BlazorSimdCompatibility` NuGet package to their project.
- The user needs to publish a dual-build (SIMD + compat) Blazor WASM app.
- The user is deploying a Blazor WASM app to Azure, GitHub Pages, Docker, or any static host.
- The user asks about SIMD, WASM exception handling, or jiterpreter compatibility.

Do **not** use this skill if the project targets .NET 7 or earlier.

---

## Part 1: Adding the Package

### Step 1 — Install NuGet package

```bash
dotnet add package BlazorSimdCompatibility
```

This automatically:
- Adds a `ReleaseCompat` build configuration to the project (via `.props`)
- Sets `WasmEnableSIMD=false`, `BlazorWebAssemblyJiterpreter=false`, `WasmEnableExceptionHandling=false` for `ReleaseCompat`
- Bundles `blazor-simd-compat.js` and `wasm-feature-detect.1.5.1.js` as static web assets

### Step 2 — Update `wwwroot/index.html`

Replace the default Blazor script tag with the detection setup:

```html
<!-- BEFORE (default — no compat): -->
<script src="_framework/blazor.webassembly.js"></script>

<!-- AFTER (with SIMD detection): -->
<script src="_framework/blazor.webassembly.js"
        autostart="false"
        onerror="window.__blazorLoaderFailed=true;console.error('[boot] Blazor loader failed');"></script>

<script src="_content/BlazorSimdCompatibility/wasm-feature-detect.1.5.1.js"
        onerror="window.__featureDetectFailed=true;console.error('[boot] wasm-feature-detect failed');"></script>

<script src="_content/BlazorSimdCompatibility/blazor-simd-compat.js"></script>
```

Key points:
- `autostart="false"` is **required** — otherwise Blazor boots before detection runs.
- **.NET 8**: use literal `_framework/blazor.webassembly.js`
- **.NET 9+**: use `_framework/blazor.webassembly#[.{fingerprint}].js` (content-hash placeholder for cache busting)
- The `onerror` handlers are cheap insurance — without them, a 404 silently produces `ReferenceError: Can't find variable: Blazor`.

### Step 3 — For Blazor Web App (hosted, .NET 8+)

If using `App.razor` or `_Host.cshtml` instead of `index.html`, place the scripts in the `<body>` section of the host page, after the Blazor script tag with `autostart="false"`.

---

## Part 2: Publishing

### Option A — Manual dual publish

```bash
# 1. SIMD build (default Release)
dotnet publish --configuration Release --output bin/Publish

# 2. Compat build (auto-configured by the .props)
dotnet publish --no-restore --configuration ReleaseCompat --output bin/PublishCompat

# 3. Merge compat framework into main build
# Windows:
xcopy /I /E /Y "bin\PublishCompat\wwwroot\_framework" "bin\Publish\wwwroot\_frameworkCompat"
# Linux/macOS:
cp -R bin/PublishCompat/wwwroot/_framework/. bin/Publish/wwwroot/_frameworkCompat/
```

Deploy `bin/Publish/wwwroot/` (or `bin/Publish/` for hosted apps).

### Option B — CLI tool (recommended)

```bash
# Install the CLI tool
dotnet tool install -g BlazorSimdCompatibility.Cli

# One command: dual publish + merge
blazor-simd-compat publish

# With PWA support
blazor-simd-compat publish --pwa

# Custom output path
blazor-simd-compat publish --output bin/Release

# Verify the output
blazor-simd-compat verify bin/Publish/wwwroot
```

### Option C — CI/CD (GitHub Actions)

```yaml
- name: Setup .NET
  uses: actions/setup-dotnet@v4
  with:
    dotnet-version: '8.0.x'

- name: Install wasm-tools
  run: dotnet workload install wasm-tools

- name: Install CLI tool
  run: dotnet tool install -g BlazorSimdCompatibility.Cli

- name: Restore
  run: dotnet restore

- name: Dual publish
  run: blazor-simd-compat publish

- name: Verify output
  run: blazor-simd-compat verify bin/Publish/wwwroot

- name: Deploy
  # Use your deployment step here (Azure, GitHub Pages, etc.)
```

**Important:** `wasm-tools` workload is required for `ReleaseCompat` build. Without it, publish fails with `NETSDK1147`.

---

## Part 3: Deployment Scenarios

### Azure Static Web Apps

```yaml
# In GitHub Actions workflow:
- name: Build and Publish
  run: |
    dotnet workload install wasm-tools
    dotnet tool install -g BlazorSimdCompatibility.Cli
    blazor-simd-compat publish

- name: Deploy
  uses: Azure/static-web-apps-deploy@v1
  with:
    app_location: "bin/Publish/wwwroot"
```

### GitHub Pages

```bash
blazor-simd-compat publish
# Copy contents of bin/Publish/wwwroot/ to gh-pages branch
```

Note: If hosted on a subpath, set `<base href="/repo-name/" />` and update the `base` variable in the service worker (for PWAs).

### Docker

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
RUN dotnet workload install wasm-tools
WORKDIR /src
COPY . .
RUN dotnet tool install -g BlazorSimdCompatibility.Cli
RUN blazor-simd-compat publish --output /app/publish

FROM nginx:alpine
COPY --from=build /app/publish/wwwroot /usr/share/nginx/html
```

### Nginx / Static hosting

Ensure `.dat` files are served with correct MIME type:

```nginx
location ~* \.dat$ {
    types { application/octet-stream dat; }
}
```

### ASP.NET Core hosted

In server `Program.cs`, allow `.dat` files:

```csharp
using Microsoft.AspNetCore.StaticFiles;

var provider = new FileExtensionContentTypeProvider();
provider.Mappings[".dat"] = "application/octet-stream";

app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = provider
});
```

---

## Part 4: Debugging

### Query string flags

| Flag | Effect |
|------|--------|
| `?verboseStart=1` | Log SIMD detection results to browser console |
| `?forceCompatMode=1` | Force compat build (for testing fallback) |

Example: `https://myapp.com/?verboseStart=1&forceCompatMode=1`

### Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank page on old device | SIMD not supported, no compat build | Add package + dual publish |
| `NETSDK1147` during publish | Missing `wasm-tools` workload | `dotnet workload install wasm-tools` |
| `ReferenceError: Can't find variable: Blazor` | Missing `autostart="false"` | Add `autostart="false"` to script tag |
| 404 on `.dat` files | Missing MIME type mapping | Add `.dat` → `application/octet-stream` |
| Compat build missing files | Didn't merge `_frameworkCompat/` | Use `blazor-simd-compat publish` or manual copy |
| Service worker caches wrong build (PWA) | Missing `service-worker-assets-compat.js` | Use `blazor-simd-compat publish --pwa` |

### Verify command output

```
PASS _framework/ exists
PASS _frameworkCompat/ exists
PASS _framework/ contains dotnet*.wasm — dotnet.native.wasm
PASS _frameworkCompat/ contains dotnet*.wasm — dotnet.native.wasm
PASS _framework/ contains icudt*.dat — icudt_EFIGS.dat
PASS _frameworkCompat/ contains icudt*.dat — icudt_EFIGS.dat
PASS _framework/ and _frameworkCompat/ have the same file set
PASS wasm-feature-detect*.js self-hosted — wasm-feature-detect.1.5.1.js
```

---

## Part 5: Architecture Summary

```
Browser loads index.html
  ↓
blazor-simd-compat.js executes (autostart=false prevents premature boot)
  ↓
wasm-feature-detect checks SIMD + exception-handling support
  ↓
┌─ Both supported → Blazor.start() loads _framework/ (SIMD build)
└─ Either missing → loadBootResource remaps to _frameworkCompat/ (compat build)
  ↓
Blazor boots normally — user sees the app on both paths
```

### What the .props auto-configures

When the user installs the NuGet package, this is injected into their build:

```xml
<PropertyGroup Condition="'$(Configuration)' == 'ReleaseCompat'">
  <WasmEnableSIMD>false</WasmEnableSIMD>
  <BlazorWebAssemblyJiterpreter>false</BlazorWebAssemblyJiterpreter>
  <WasmEnableExceptionHandling>false</WasmEnableExceptionHandling>
</PropertyGroup>
```

No manual `.csproj` editing required.

---

## Quick Reference

```bash
# Install
dotnet add package BlazorSimdCompatibility

# Publish
blazor-simd-compat publish

# Verify
blazor-simd-compat verify bin/Publish/wwwroot

# Debug in browser
https://myapp.com/?verboseStart=1
```
