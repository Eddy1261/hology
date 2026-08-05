// Platform detection for artifact downloads (Track C-8).
//
// Maps the client platform to the SERVER's artifact vocabulary used by the
// marketplace catalog (C-5): os ∈ {linux, windows, macos}, arch ∈ {x64,
// arm64, x86}. This is the ONLY place the mapping lives — never a second
// OS/architecture vocabulary.

export interface ClientPlatform {
  os: string;
  arch: string;
}

export function detectPlatform(
  ua: string,
  uaData?: { platform?: string; architecture?: string } | null,
): ClientPlatform {
  // Chrome UA-CH provides reliable os + arch when available.
  const p = uaData?.platform?.toLowerCase() ?? "";
  const a = uaData?.architecture?.toLowerCase() ?? "";
  let os = p;
  let arch = a;

  if (!p || !a) {
    const lower = ua.toLowerCase();
    if (lower.includes("windows")) os = "windows";
    else if (lower.includes("mac os") || lower.includes("macintosh")) os = "macos";
    else if (lower.includes("linux") || lower.includes("x11")) os = "linux";
    else os = "linux";
    if (lower.includes("arm") || lower.includes("aarch64")) arch = "arm64";
    else if (lower.includes("x86_64") || lower.includes("x64") || lower.includes("win64") || lower.includes("intel")) arch = "x64";
    else if (lower.includes("i386") || lower.includes("i686") || lower.includes("i586")) arch = "x86";
    else arch = "x64"; // safe default: modern hosts are x64
  }
  if (!["linux", "windows", "macos"].includes(os)) os = "linux";
  if (!["x64", "arm64", "x86"].includes(arch)) arch = "x64";
  return { os, arch };
}

/** Current client platform (browser). Server vocabulary (C-5). */
export function currentPlatform(): ClientPlatform {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const ua = nav?.userAgent ?? "";
  const uaData = (nav as unknown as { userAgentData?: { platform?: string; architecture?: string } } | undefined)
    ?.userAgentData ?? null;
  return detectPlatform(ua, uaData);
}
