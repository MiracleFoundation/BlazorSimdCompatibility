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

  var RETRY_FLAG = 'bsdCompatRetry';

  async function detectAndStart() {
    var url = new URL(location.href);
    var verboseStart = url.searchParams.get('verboseStart') === '1';
    var forceCompatMode = url.searchParams.get('forceCompatMode') === '1';
    var isRetry = url.searchParams.get(RETRY_FLAG) === '1';

    if (window.__blazorLoaderFailed) {
      showBootError(new Error('blazor.webassembly.js failed to load'));
      return;
    }

    // Check if wasm-feature-detect is available
    var featureDetectAvailable = typeof wasmFeatureDetect !== 'undefined' && !window.__featureDetectFailed;

    if (!featureDetectAvailable) {
      if (verboseStart) console.warn('[blazor-simd-compat] wasm-feature-detect unavailable — falling back to compat build');
      forceCompatMode = true;
    }

    // Detect SIMD support
    var supportsSimd = false;
    if (!forceCompatMode) {
      try {
        supportsSimd = await wasmFeatureDetect.simd();
      } catch (e) {
        console.warn('[blazor-simd-compat] SIMD detection threw:', e);
      }
    }

    // Detect exception handling support
    var supportsExceptions = false;
    if (!forceCompatMode) {
      try {
        supportsExceptions = await wasmFeatureDetect.exceptions();
      } catch (e) {
        console.warn('[blazor-simd-compat] Exception-handling detection threw:', e);
      }
    }

    // Skip compat mode if we're retrying from a previous failed boot
    var useCompatMode = !isRetry && (!supportsSimd || !supportsExceptions || forceCompatMode);
    var compatFrameworkPath = window.__blazorSimdCompatPath || '_frameworkCompat/';

    if (verboseStart) {
      console.log('[blazor-simd-compat] supportsSimd:', supportsSimd);
      console.log('[blazor-simd-compat] supportsExceptions:', supportsExceptions);
      console.log('[blazor-simd-compat] useCompatMode:', useCompatMode);
      console.log('[blazor-simd-compat] compatFrameworkPath:', compatFrameworkPath);
      console.log('[blazor-simd-compat] isRetry:', isRetry);
      console.log('[blazor-simd-compat] userAgent:', navigator.userAgent);
    }

    // Verify compat framework exists before falling back
    if (useCompatMode) {
      try {
        var bootCheckUrl = compatFrameworkPath + 'dotnet.js';
        var response = await fetch(bootCheckUrl, { method: 'HEAD', cache: 'no-cache' });
        if (!response.ok) {
          console.warn('[blazor-simd-compat] Compat NOT found at ' + bootCheckUrl + ' (HTTP ' + response.status + ')');
          useCompatMode = false;
        } else if (verboseStart) {
          console.log('[blazor-simd-compat] Compat verified at ' + bootCheckUrl);
        }
      } catch (e) {
        console.warn('[blazor-simd-compat] Compat check failed:', e, '— using default');
        useCompatMode = false;
      }
    }

    startBlazor(useCompatMode, compatFrameworkPath);
  }

  function waitForBlazor(timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (typeof Blazor !== 'undefined') {
        resolve();
        return;
      }
      if (window.__blazorLoaderFailed) {
        reject(new Error('blazor.webassembly.js failed to load'));
        return;
      }
      var start = Date.now();
      var timer = setInterval(function () {
        if (typeof Blazor !== 'undefined') {
          clearInterval(timer);
          resolve();
          return;
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error('Blazor global not defined within ' + timeoutMs + 'ms'));
        }
      }, 100);
    });
  }

  async function startBlazor(useCompatMode, compatFrameworkPath) {
    try {
      console.log('[blazor-simd-compat] Booting:', useCompatMode ? 'COMPAT' : 'DEFAULT');

      await waitForBlazor(15000);
      await Blazor.start({
        loadBootResource: function (type, name, defaultUri, integrity) {
          if (!useCompatMode) return defaultUri;
          var compatUri = defaultUri.replace('_framework/', compatFrameworkPath);
          console.log('[blazor-simd-compat] loadBootResource:', type, name, '→', compatUri);
          return compatUri;
        },
      });
    } catch (err) {
      console.error('[blazor-simd-compat] Blazor.start() rejected:', err);

      // On compat failure, retry once without compat mode
      if (useCompatMode && !isRetryParam()) {
        var retryUrl = window.location.href;
        retryUrl += (window.location.search ? '&' : '?') + RETRY_FLAG + '=1';
        console.warn('[blazor-simd-compat] Retrying without compat mode:', retryUrl);
        window.location.href = retryUrl;
        return;
      }

      showBootError(err);
    }
  }

  function isRetryParam() {
    return new URL(location.href).searchParams.get(RETRY_FLAG) === '1';
  }

  function showBootError(err) {
    var msg = err ? (err.message || String(err)) : '';
    console.error('[blazor-simd-compat] Boot failed:', msg);

    // Show error in the existing blazor-error-ui
    var errorUi = document.getElementById('blazor-error-ui');
    if (errorUi) {
      var p = document.createElement('p');
      p.style.marginTop = '8px';
      p.style.fontSize = '14px';
      p.style.wordBreak = 'break-all';
      p.textContent = msg;
      errorUi.insertBefore(p, errorUi.firstChild);
      errorUi.style.display = 'block';
    }
  }

  // Auto-start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', detectAndStart);
  } else {
    detectAndStart();
  }
})();
