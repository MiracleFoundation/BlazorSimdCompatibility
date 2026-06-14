using System.Diagnostics;
using System.Text.RegularExpressions;

// BlazorSimdCompatibility CLI Tool
// Commands:
//   verify <wwwroot-path> [--pwa]   — verify dual-publish output
//   publish [--output <path>] [--pwa] [--project <path>] — dual publish + merge

if (args.Length == 0 || args[0] is "-h" or "--help" or "help")
{
    PrintHelp();
    return 0;
}

return args[0] switch
{
    "verify" => RunVerify(args.Skip(1).ToArray()),
    "publish" => RunPublish(args.Skip(1).ToArray()),
    _ => Error($"Unknown command: {args[0]}. Use 'help' for usage.")
};

// ── Help ──────────────────────────────────────────────────────────────────

static void PrintHelp()
{
    Console.WriteLine("""
        BlazorSimdCompatibility CLI

        Commands:
          verify <wwwroot-path> [--pwa]     Verify dual-publish output
          publish [--output <path>] [--pwa] [--project <path>]
                                            Dual publish + merge

        Examples:
          blazor-simd-compat verify bin/Publish/wwwroot
          blazor-simd-compat verify bin/Publish/wwwroot --pwa
          blazor-simd-compat publish
          blazor-simd-compat publish --output bin/Release --pwa
        """);
}

// ── Verify ────────────────────────────────────────────────────────────────

static int RunVerify(string[] args)
{
    var flagSet = args.Where(a => a.StartsWith("--")).ToHashSet();
    var positional = args.Where(a => !a.StartsWith("--")).ToArray();

    var publishRoot = Path.GetFullPath(
        positional.Length > 0 ? positional[0] : Path.Combine("bin", "Publish", "wwwroot"));
    var requirePwa = flagSet.Contains("--pwa");

    int fails = 0, warns = 0;

    void Report(string level, string name, string? detail = null)
    {
        var tag = level.PadRight(4);
        Console.WriteLine(detail is null ? $"{tag} {name}" : $"{tag} {name} — {detail}");
        if (level == "FAIL") fails++;
        if (level == "WARN") warns++;
    }

    string[] MatchDir(string dir, string pattern)
    {
        if (!Directory.Exists(dir)) return [];
        var re = new Regex(pattern);
        return new DirectoryInfo(dir).EnumerateFiles()
            .Where(f => re.IsMatch(f.Name))
            .Select(f => f.Name)
            .ToArray();
    }

    HashSet<string> Entries(string dir) =>
        Directory.Exists(dir)
            ? new DirectoryInfo(dir).EnumerateFileSystemInfos().Select(i => i.Name).ToHashSet()
            : [];

    // ── Preconditions ──

    if (!Directory.Exists(publishRoot))
    {
        Console.Error.WriteLine($"ERROR: publish root not found: {publishRoot}");
        Console.Error.WriteLine("Pass a path: blazor-simd-compat verify path/to/wwwroot");
        return 2;
    }

    Console.WriteLine($"Verifying: {publishRoot}{(requirePwa ? " (PWA mode)" : "")}\n");

    var fw = Path.Combine(publishRoot, "_framework");
    var fwc = Path.Combine(publishRoot, "_frameworkCompat");

    // ── Directory presence ──

    Report(Directory.Exists(fw) ? "PASS" : "FAIL",
        Directory.Exists(fw) ? "_framework/ exists" : "_framework/ missing",
        Directory.Exists(fw) ? null : "did `dotnet publish -c Release` run?");

    Report(Directory.Exists(fwc) ? "PASS" : "FAIL",
        Directory.Exists(fwc) ? "_frameworkCompat/ exists" : "_frameworkCompat/ missing",
        Directory.Exists(fwc) ? null
            : "copy bin/PublishCompat/wwwroot/_framework/ to bin/Publish/wwwroot/_frameworkCompat/");

    // ── dotnet.wasm in both builds ──

    foreach (var (label, dir) in new[] { ("_framework", fw), ("_frameworkCompat", fwc) })
    {
        if (!Directory.Exists(dir)) continue;
        var hits = MatchDir(dir, @"^dotnet.*\.wasm$");
        if (hits.Length > 0)
            Report("PASS", $"{label}/ contains dotnet*.wasm", string.Join(", ", hits));
        else
            Report("FAIL", $"{label}/ has no dotnet*.wasm", "build artifact missing or corrupted");
    }

    // ── icudt*.dat in both builds ──

    foreach (var (label, dir) in new[] { ("_framework", fw), ("_frameworkCompat", fwc) })
    {
        if (!Directory.Exists(dir)) continue;
        var hits = MatchDir(dir, @"^icudt.*\.dat$");
        if (hits.Length > 0)
            Report("PASS", $"{label}/ contains icudt*.dat", string.Join(", ", hits));
        else
            Report("WARN", $"{label}/ has no icudt*.dat",
                "OK if <InvariantGlobalization>true</InvariantGlobalization>, otherwise missing");
    }

    // ── File-set parity ──

    if (Directory.Exists(fw) && Directory.Exists(fwc))
    {
        var fwSet = Entries(fw);
        var fwcSet = Entries(fwc);
        var onlyInFw = fwSet.Except(fwcSet).ToArray();
        var onlyInFwc = fwcSet.Except(fwSet).ToArray();
        if (onlyInFw.Length == 0 && onlyInFwc.Length == 0)
        {
            Report("PASS", "_framework/ and _frameworkCompat/ have the same file set");
        }
        else
        {
            var parts = new List<string>();
            if (onlyInFw.Length > 0)
                parts.Add($"only in _framework: {string.Join(", ", onlyInFw.Take(5))}{(onlyInFw.Length > 5 ? "…" : "")}");
            if (onlyInFwc.Length > 0)
                parts.Add($"only in _frameworkCompat: {string.Join(", ", onlyInFwc.Take(5))}{(onlyInFwc.Length > 5 ? "…" : "")}");
            Report("WARN", "file-set drift between builds",
                $"{string.Join(" · ", parts)} — rerun full publish script");
        }
    }

    // ── wasm-feature-detect self-hosted ──
    // Check both root and _content/BlazorSimdCompatibility/ (NuGet static web assets)

    var wfd = MatchDir(publishRoot, @"^wasm-feature-detect.*\.js$");
    var wfdContent = MatchDir(
        Path.Combine(publishRoot, "_content", "BlazorSimdCompatibility"),
        @"^wasm-feature-detect.*\.js$");

    if (wfd.Length > 0)
        Report("PASS", "wasm-feature-detect*.js self-hosted (root)", string.Join(", ", wfd));
    else if (wfdContent.Length > 0)
        Report("PASS", "wasm-feature-detect*.js self-hosted (_content/BlazorSimdCompatibility/)",
            string.Join(", ", wfdContent));
    else
        Report("FAIL", "wasm-feature-detect*.js not found",
            "self-host a copy — CDN breaks offline PWAs");

    // ── PWA-specific artifacts ──

    var swPublished = Path.Combine(publishRoot, "service-worker.published.js");
    var swAssets = Path.Combine(publishRoot, "service-worker-assets.js");
    var swAssetsCompat = Path.Combine(publishRoot, "service-worker-assets-compat.js");
    var looksLikePwa = File.Exists(swPublished) || File.Exists(swAssets);

    if (requirePwa || looksLikePwa)
    {
        var mode = requirePwa ? "required" : "detected";
        Report(File.Exists(swAssets) ? "PASS" : "FAIL",
            $"service-worker-assets.js {(File.Exists(swAssets) ? "present" : "missing")} (PWA {mode})");
        Report(File.Exists(swAssetsCompat) ? "PASS" : "FAIL",
            $"service-worker-assets-compat.js {(File.Exists(swAssetsCompat) ? "present" : "missing")} (PWA {mode})",
            File.Exists(swAssetsCompat) ? null
                : "copy bin/PublishCompat/wwwroot/service-worker-assets.js to bin/Publish/wwwroot/service-worker-assets-compat.js");
    }
    else
    {
        Report("WARN", "no service-worker.published.js detected — skipping PWA checks",
            "pass --pwa to enforce anyway");
    }

    // ── Summary ──

    Console.WriteLine();
    if (fails > 0)
    {
        Console.WriteLine($"FAIL: {fails} failing check(s), {warns} warning(s)");
        return 1;
    }
    Console.WriteLine($"OK: 0 failures, {warns} warning(s)");
    return 0;
}

// ── Publish ───────────────────────────────────────────────────────────────

static int RunPublish(string[] args)
{
    var flagSet = args.Where(a => a.StartsWith("--")).ToHashSet();

    var outputDir = "bin/Publish";
    var projectPath = ".";
    var isPwa = flagSet.Contains("--pwa");

    // Parse --output <path> and --project <path>
    for (int i = 0; i < args.Length; i++)
    {
        if (args[i] == "--output" && i + 1 < args.Length) outputDir = args[i + 1];
        if (args[i] == "--project" && i + 1 < args.Length) projectPath = args[i + 1];
    }

    var outputCompatDir = outputDir + "Compat";

    Console.WriteLine("=== BlazorSimdCompatibility Dual Publish ===\n");

    // Step 1: Normal build (SIMD enabled)
    Console.WriteLine("[1/4] Publishing Release (SIMD build)...");
    if (Run("dotnet", $"publish --nologo --configuration Release --output \"{outputDir}\" \"{projectPath}\"") != 0)
        return Error("Release publish failed.");

    // Step 2: Compat build (SIMD disabled)
    Console.WriteLine("[2/4] Publishing ReleaseCompat (compat build)...");
    if (Run("dotnet", $"publish --nologo --no-restore --configuration ReleaseCompat --output \"{outputCompatDir}\" \"{projectPath}\"") != 0)
        return Error("ReleaseCompat publish failed.");

    // Step 3: Merge compat _framework into main build
    Console.WriteLine("[3/4] Merging compat build...");
    var fwCompatSrc = Path.Combine(outputCompatDir, "wwwroot", "_framework");
    var fwCompatDst = Path.Combine(outputDir, "wwwroot", "_frameworkCompat");

    if (Directory.Exists(fwCompatSrc))
    {
        if (Directory.Exists(fwCompatDst)) Directory.Delete(fwCompatDst, true);
        CopyDirectory(fwCompatSrc, fwCompatDst);
        Console.WriteLine($"  Copied _framework/ → _frameworkCompat/");
    }
    else
    {
        return Error($"Compat framework not found at {fwCompatSrc}");
    }

    // Step 4: PWA assets
    if (isPwa)
    {
        Console.WriteLine("[4/4] Copying PWA compat assets...");
        var swAssetsSrc = Path.Combine(outputCompatDir, "wwwroot", "service-worker-assets.js");
        var swAssetsDst = Path.Combine(outputDir, "wwwroot", "service-worker-assets-compat.js");
        if (File.Exists(swAssetsSrc))
        {
            File.Copy(swAssetsSrc, swAssetsDst, overwrite: true);
            Console.WriteLine($"  Copied service-worker-assets-compat.js");
        }
        else
        {
            Console.WriteLine("  WARN: service-worker-assets.js not found in compat build");
        }
    }
    else
    {
        Console.WriteLine("[4/4] Skipping PWA assets (use --pwa to enable)");
    }

    Console.WriteLine($"\nDone! Deploy: {Path.GetFullPath(outputDir)}/wwwroot");
    return 0;
}

// ── Helpers ───────────────────────────────────────────────────────────────

static int Run(string fileName, string arguments)
{
    var psi = new ProcessStartInfo
    {
        FileName = fileName,
        Arguments = arguments,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
    };

    using var process = Process.Start(psi)!;
    process.OutputDataReceived += (_, e) => { if (e.Data != null) Console.WriteLine(e.Data); };
    process.ErrorDataReceived += (_, e) => { if (e.Data != null) Console.Error.WriteLine(e.Data); };
    process.BeginOutputReadLine();
    process.BeginErrorReadLine();
    process.WaitForExit();
    return process.ExitCode;
}

static void CopyDirectory(string source, string destination)
{
    Directory.CreateDirectory(destination);
    foreach (var file in Directory.GetFiles(source))
    {
        File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), overwrite: true);
    }
    foreach (var dir in Directory.GetDirectories(source))
    {
        CopyDirectory(dir, Path.Combine(destination, Path.GetFileName(dir)));
    }
}

static int Error(string message)
{
    Console.Error.WriteLine($"ERROR: {message}");
    return 1;
}
