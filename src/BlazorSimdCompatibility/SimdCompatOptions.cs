namespace BlazorSimdCompatibility;

/// <summary>
/// Options for BlazorSimdCompatibility runtime detection.
/// Set via <c>window.__blazorSimdCompatOptions</c> in JavaScript before the script loads.
/// </summary>
public class SimdCompatOptions
{
    /// <summary>
    /// Enable verbose logging in the browser console.
    /// Equivalent to <c>?verboseStart=1</c> query string flag.
    /// </summary>
    public bool VerboseStart { get; set; }

    /// <summary>
    /// Path to the compatibility framework folder (default: "_frameworkCompat/").
    /// </summary>
    public string CompatFrameworkPath { get; set; } = "_frameworkCompat/";

    /// <summary>
    /// Force compatibility mode regardless of SIMD support detection.
    /// Equivalent to <c>?forceCompatMode=1</c> query string flag.
    /// </summary>
    public bool ForceCompatMode { get; set; }
}
