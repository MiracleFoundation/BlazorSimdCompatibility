// BlazorSimdCompatibility — Runtime SIMD/exception-handling detection
// Detects WebAssembly SIMD and exception-handling support, then starts Blazor
// with the correct build (SIMD or compat).
//
// Usage in index.html:
//   <script src="_framework/blazor.webassembly.js" autostart="false"></script>
//   <script src="_content/BlazorSimdCompatibility/blazor-simd-compat.js"></script>
//
// Debug flags (query string):
//   ?verboseStart=1    — log detection results to console
//   ?forceCompatMode=1 — force compat build (for testing)

(function () {
  'use strict';

  // Intentionally NOT stubbing BigInt64Array/BigUint64Array: on iOS 15.0-15.3
  // these are undefined. Stubbing them as function(){} tricks Blazor's WASM
  // runtime into attempting typed-array operations that silently fail.

  async function detectAndStart() {
    var url = new URL(location.href);
    var verboseStart = url.searchParams.get('verboseStart') === '1';
    var forceCompatMode = url.searchParams.get('forceCompatMode') === '1';

    // Check if wasm-feature-detect is available
    var featureDetectAvailable = typeof wasmFeatureDetect !== 'undefined' && !window.__featureDetectFailed;

    if (!featureDetectAvailable) {
      if (verboseStart) console.warn('[blazor-simd-compat] wasm-feature-detect unavailable — falling back to compat build');
      forceCompatMode = true;
    }

    // Detect SIMD support — wrap in try/catch so a detection failure doesn't kill startup
    var supportsSimd = false;
    if (!forceCompatMode) {
      try {
        supportsSimd = await wasmFeatureDetect.simd();
      } catch (e) {
        console.warn('[blazor-simd-compat] SIMD detection threw:', e);
      }
    }

    // Detect exception handling support — independently wrapped
    var supportsExceptions = false;
    if (!forceCompatMode) {
      try {
        supportsExceptions = await wasmFeatureDetect.exceptions();
      } catch (e) {
        console.warn('[blazor-simd-compat] Exception-handling detection threw:', e);
      }
    }

    var useCompatMode = !supportsSimd || !supportsExceptions || forceCompatMode;
    var compatFrameworkPath = window.__blazorSimdCompatPath || '_frameworkCompat/';

    if (verboseStart) {
      console.log('[blazor-simd-compat] supportsSimd:', supportsSimd);
      console.log('[blazor-simd-compat] supportsExceptions:', supportsExceptions);
      console.log('[blazor-simd-compat] useCompatMode:', useCompatMode);
      console.log('[blazor-simd-compat] compatFrameworkPath:', compatFrameworkPath);
      console.log('[blazor-simd-compat] userAgent:', navigator.userAgent);
    }

    // Verify compat framework exists before falling back
    if (useCompatMode) {
      try {
        var bootCheckUrl = compatFrameworkPath + 'blazor.boot.json';
        var response = await fetch(bootCheckUrl, { method: 'HEAD', cache: 'no-cache' });
        if (!response.ok) {
          console.warn('[blazor-simd-compat] Compat framework NOT found at ' + bootCheckUrl + ' (HTTP ' + response.status + ') — falling back to default build. Did you run `blazor-simd-compat publish`?');
          useCompatMode = false;
        } else if (verboseStart) {
          console.log('[blazor-simd-compat] Compat framework verified at ' + bootCheckUrl);
        }
      } catch (e) {
        console.warn('[blazor-simd-compat] Compat framework check failed:', e, '— falling back to default build');
        useCompatMode = false;
      }
    }

    startBlazor(useCompatMode, compatFrameworkPath);
  }

  function startBlazor(useCompatMode, compatFrameworkPath) {
    try {
      console.log('[blazor-simd-compat] Booting with mode:', useCompatMode ? 'COMPAT (' + compatFrameworkPath + ')' : 'DEFAULT (_framework/)');

      // IMPORTANT: loadBootResource must be at the TOP LEVEL for standalone
      // Blazor WASM (blazor.webassembly.js).  Nesting it under webAssembly: {}
      // is silently ignored by blazor.webassembly.js in .NET 8/9.
      // See dotnet/aspnetcore #51611.
      Blazor.start({
        loadBootResource: function (type, name, defaultUri, integrity) {
          if (!useCompatMode) return defaultUri;
          var compatUri = defaultUri.replace('_framework/', compatFrameworkPath);
          console.log('[blazor-simd-compat] loadBootResource:', type, name, defaultUri, '→', compatUri);
          return compatUri;
        },
      });
    } catch (err) {
      console.error('[blazor-simd-compat] Blazor.start() failed:', err);
    }
  }

  // Auto-start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', detectAndStart);
  } else {
    detectAndStart();
  }
})();
