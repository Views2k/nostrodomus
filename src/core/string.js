// Nostrodomus pure string/value formatting helpers.
// Keep this module pure: no DOM access, Settings access, runtime state, timers,
// storage, network calls, or logging.

export function clampNumber(value, min, max, fallback) {
  // Only real numbers and non-empty numeric strings are coerced; null / '' / whitespace / false /
  // arrays / objects all coerce via Number() to a finite 0 and would otherwise silently clamp to a
  // min>0 bound (e.g. a corrupt persisted `syntaxThemeSaturation: null` -> 0.35) instead of the
  // intended fallback. Fail dark to the fallback for every non-numeric input.
  const n = (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function hueLabel(value) {
  return `${Math.round(clampNumber(value, 0, 360, 0))}°`;
}

export function percentLabel(value) {
  return `${Math.round(clampNumber(value, 0, 1, 0) * 100)}%`;
}

export function sliderNumberLabel(value) {
  return `${Math.round(clampNumber(value, 0, 2.5, 1) * 100)}%`;
}

export function safeString(value, maxLen = 512) {
  const s = String(value ?? "");
  if (s.length <= maxLen) return s;
  // A cap landing between a surrogate pair would emit a lone surrogate (ill-formed
  // text → renders as U+FFFD); step back one unit so truncation ends on a whole code point.
  const lastCode = s.charCodeAt(maxLen - 1);
  return s.slice(0, lastCode >= 0xd800 && lastCode <= 0xdbff ? maxLen - 1 : maxLen);
}

function roundDisplayMetric(value, places = 3) {
  const factor = 10 ** places;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * factor) / factor;
}

export function displayMemoryLabel(deviceMemoryGB) {
  const memory = Number(deviceMemoryGB || 0);
  if (!memory) return "RAM: unavailable";
  const suffix = memory >= 32 ? "+" : "";
  return `RAM: ${memory}GB${suffix}`;
}

export function displayViewportLabel(viewport = {}) {
  const viewportWidth = Number(viewport?.width || 0);
  const viewportHeight = Number(viewport?.height || 0);
  const dpr = roundDisplayMetric(Number(viewport?.devicePixelRatio || 1), 2);
  if (viewportWidth && viewportHeight) return `${viewportWidth}x${viewportHeight} @${dpr}x`;
  return "viewport unavailable";
}

// eslint-disable-next-line no-unused-vars -- the signature (screenInfo included) is pinned source+dist by test_client_capability_display_static.py
export function displayMonitorLabel(viewport = {}, screenInfo = {}) {
  // Compatibility alias for older diagnostics callers. This reports the
  // browser-visible viewport only; frontend JavaScript cannot reliably
  // enumerate a user's physical multi-monitor layout.
  return displayViewportLabel(viewport);
}

export function compactGpuRendererLabel(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "unavailable") return "unavailable";

  const cleanSegment = (segment) => String(segment || "")
    .replace(/\s*\(0x[0-9a-f]+\)\s*/ig, " ")
    .replace(/\s*\[[^\]]+\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const angle = raw.match(/^ANGLE\s*\((.*)\)$/i);
  const parts = (angle ? angle[1] : raw)
    .split(",")
    .map(cleanSegment)
    .filter(Boolean);

  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  const nvidiaModel = joined.match(/\bNVIDIA\s+GeForce\s+(?:RTX|GTX)\s+\d{3,4}(?:\s*(?:Ti|SUPER|Laptop GPU|Mobile))?/i);
  if (nvidiaModel) return nvidiaModel[0].replace(/\s+/g, " ").trim();

  const amdModel = joined.match(/\bAMD\s+Radeon\s+(?:RX\s+)?[0-9A-Za-z ]{3,20}?\b/i);
  if (amdModel) return amdModel[0].replace(/\s+/g, " ").trim();

  const vendorGpu = parts.find(part => /(NVIDIA\s+GeForce|AMD\s+Radeon|Intel\(R\)|Intel\s+Arc|Apple\s+M\d|Apple\s+GPU)/i.test(part));
  if (vendorGpu) return vendorGpu.replace(/^NVIDIA,?\s+/i, "NVIDIA ").replace(/\b(?:Direct3D|D3D|Vulkan|OpenGL|Metal)\b.*$/i, "").replace(/\s+/g, " ").trim();

  const generic = parts.find(part => /(GeForce|Radeon|Intel|Apple|Adreno|Mali|PowerVR)/i.test(part));
  if (generic) return generic.replace(/\b(?:Direct3D|D3D|Vulkan|OpenGL|Metal)\b.*$/i, "").replace(/\s+/g, " ").trim();

  return cleanSegment(raw);
}

export function displayBrowserLabel(browser = {}) {
  const rawName = String(browser?.name || "unknown").trim();
  const platform = String(browser?.platform || "unknown").trim();
  const parts = rawName
    .split("/")
    .map(part => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter(part => !/Not\W*A\W*Brand/i.test(part));

  const preferred = parts.find(part => /\bBrave\b/i.test(part))
    || parts.find(part => /\bMicrosoft Edge\b|\bEdge\b/i.test(part))
    || parts.find(part => /\bFirefox\b/i.test(part))
    || parts.find(part => /\bChrome\b/i.test(part))
    || parts.find(part => /\bChromium\b/i.test(part))
    || parts[0]
    || rawName;

  const compact = String(preferred || "unknown")
    .replace(/\s+Brand$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42);
  const platformLabel = platform && platform !== "unknown" ? platform.replace(/^Win32$/i, "Windows") : "";
  return `${compact || "unknown"}${platformLabel ? ` / ${platformLabel}` : ""}`.slice(0, 64);
}
