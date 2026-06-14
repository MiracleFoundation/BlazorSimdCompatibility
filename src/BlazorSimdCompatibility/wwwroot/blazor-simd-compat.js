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

  // Stub BigInt64Array/BigUint64Array so detection doesn't crash on very old engines.
  if (!globalThis.BigInt64Array) globalThis.BigInt64Array = function () { };
  if (!globalThis.BigUint64Array) globalThis.BigUint64Array = function () { };

  async function detectAndStart() {
    try {
      var url = new URL(location.href);
      var verboseStart = url.searchParams.get('verboseStart') === '1';
      var forceCompatMode = url.searchParams.get('forceCompatMode') === '1';

      // Check if wasm-feature-detect is available
      var featureDetectAvailable = typeof wasmFeatureDetect !== 'undefined' && !window.__featureDetectFailed;

      if (!featureDetectAvailable) {
        if (verboseStart) console.warn('[blazor-simd-compat] wasm-feature-detect unavailable — falling back to compat build');
        forceCompatMode = true;
      }

      var supportsSimd = forceCompatMode ? false : await wasmFeatureDetect.simd();
      var supportsExceptions = forceCompatMode ? false : await wasmFeatureDetect.exceptions();
      var useCompatMode = !supportsSimd || !supportsExceptions || forceCompatMode;

      if (verboseStart) {
        console.log('[blazor-simd-compat] supportsSimd:', supportsSimd);
        console.log('[blazor-simd-compat] supportsExceptions:', supportsExceptions);
        console.log('[blazor-simd-compat] useCompatMode:', useCompatMode);
        console.log('[blazor-simd-compat] userAgent:', navigator.userAgent);
      }

      var compatFrameworkPath = window.__blazorSimdCompatPath || '_frameworkCompat/';

      console.log('[blazor-simd-compat] useCompatMode:', useCompatMode, '— will', useCompatMode ? 'REDIRECT to _frameworkCompat/' : 'use _framework/');

      var webAssemblyConfig = {
        loadBootResource: function (type, name, defaultUri, integrity) {
          var newUri = useCompatMode ? defaultUri.replace('_framework/', compatFrameworkPath) : defaultUri;
          console.log('[blazor-simd-compat] loadBootResource:', type, name, defaultUri, '→', newUri);
          return newUri;
        },
      };

      console.log('[blazor-simd-compat] Calling Blazor.start()...');
      Blazor.start({ webAssembly: webAssemblyConfig });
    } catch (err) {
      console.error('[blazor-simd-compat] Startup failed:', err);
    }
  }

  // Auto-start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', detectAndStart);
  } else {
    detectAndStart();
  }
})();
