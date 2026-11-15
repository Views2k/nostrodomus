// Nostrodomus client capability runtime owner.
// Owns local-only browser/GPU capability snapshots used by diagnostics and debug readouts.
// No network reporting, no polling, and no persistent storage.

// UA-fallback browser detection, most-specific token first (used only when userAgentData brands are
// absent). Order matters: Chromium derivatives (Edge/Opera) before Chrome, Version before Safari.
const BROWSER_UA_MATCHERS = [
  [/Edg\/([0-9.]+)/, "Microsoft Edge"],
  [/OPR\/([0-9.]+)/, "Opera"],
  [/Firefox\/([0-9.]+)/, "Firefox"],
  [/Chrome\/([0-9.]+)/, "Chrome"],
  [/Version\/([0-9.]+)/, "Safari"],
  [/Safari\/([0-9.]+)/, "Safari"],
];

export function createClientCapabilitiesRuntime(options = {}) {
  const W = options?.W || globalThis;
  const documentRef = options?.documentRef || W?.document || globalThis?.document;
  const navigatorRef = options?.navigatorRef || W?.navigator || globalThis?.navigator || {};
  const performanceRef = options?.performanceRef || W?.performance || globalThis?.performance || {};
  const state = options?.state || {};
  const recordPerformanceEvent = typeof options?.recordPerformanceEvent === "function" ? options.recordPerformanceEvent : () => {};
  const roundPerformanceMetric = typeof options?.roundPerformanceMetric === "function" ? options.roundPerformanceMetric : value => value;
  const compactGpuRendererLabel = typeof options?.compactGpuRendererLabel === "function" ? options.compactGpuRendererLabel : value => String(value || "unavailable");
  const displayBrowserLabel = typeof options?.displayBrowserLabel === "function" ? options.displayBrowserLabel : () => "unknown browser";
  const displayMemoryLabel = typeof options?.displayMemoryLabel === "function" ? options.displayMemoryLabel : value => (value ? `RAM: ${value}GB` : "RAM: unknown");
  const displayViewportLabel = typeof options?.displayViewportLabel === "function" ? options.displayViewportLabel : viewport => `${viewport?.width || 0}×${viewport?.height || 0}`;
  const displayMonitorLabel = typeof options?.displayMonitorLabel === "function" ? options.displayMonitorLabel : displayViewportLabel;

  function browserInfoSnapshot() {
    const nav = navigatorRef || {};
    const uaData = nav.userAgentData || null;
    const ua = String(nav.userAgent || "");
    const brands = Array.isArray(uaData?.brands) ? uaData.brands.map(b => ({ brand: String(b.brand || "").slice(0, 40), version: String(b.version || "").slice(0, 12) })) : [];
    const brandText = brands
      .filter(b => b.brand && !/Not\.?A.Brand/i.test(b.brand))
      .map(b => `${b.brand}${b.version ? ` ${b.version}` : ""}`)
      .join(" / ");

    let name = brandText || "unknown";
    let version = "";
    if (!brandText) {
      // The most specific token wins, not the first in the string: the user agent of Edge and Opera
      // also holds "Chrome/…" before "Edg/…" or "OPR/…". Safari's version is in "Version/…"; its
      // "Safari/…" token is the WebKit build.
      for (const [token, label] of BROWSER_UA_MATCHERS) {
        const match = ua.match(token);
        if (match) { name = label; version = match[1] || ""; break; }
      }
    }

    return {
      name: String(name || "unknown").slice(0, 120),
      version: String(version || "").slice(0, 32),
      platform: String(uaData?.platform || nav.platform || "unknown").slice(0, 80),
      mobile: !!uaData?.mobile,
      userAgentBrands: brands,
    };
  }

  function computeClientGpuSnapshot() {
    const result = {
      webgpuAvailable: !!navigatorRef?.gpu,
      webglAvailable: false,
      webgl2Available: false,
      webglDebugRendererInfoAvailable: false,
      vendor: "unavailable",
      renderer: "unavailable",
      unmaskedVendor: "unavailable",
      unmaskedRenderer: "unavailable",
      displayRenderer: "unavailable",
      privacyNote: "coarse browser-exposed WebGL/WebGPU signals",
    };
    try {
      const canvas = documentRef?.createElement?.("canvas");
      const gl2 = canvas?.getContext?.("webgl2", { failIfMajorPerformanceCaveat: false }) || null;
      const gl = gl2 || canvas?.getContext?.("webgl", { failIfMajorPerformanceCaveat: false }) || canvas?.getContext?.("experimental-webgl", { failIfMajorPerformanceCaveat: false }) || null;
      result.webgl2Available = !!gl2;
      result.webglAvailable = !!gl;
      if (!gl) return result;
      try { result.vendor = String(gl.getParameter(gl.VENDOR) || "unavailable"); } catch { /* webgl context loss */ }
      try { result.renderer = String(gl.getParameter(gl.RENDERER) || "unavailable"); } catch { /* webgl context loss */ }
      const debugInfo = gl.getExtension?.("WEBGL_debug_renderer_info") || null;
      result.webglDebugRendererInfoAvailable = !!debugInfo;
      if (debugInfo) {
        try { result.unmaskedVendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "unavailable"); } catch { /* webgl context loss */ }
        try { result.unmaskedRenderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "unavailable"); } catch { /* webgl context loss */ }
      }
      result.displayRenderer = compactGpuRendererLabel(result.unmaskedRenderer && result.unmaskedRenderer !== "unavailable" ? result.unmaskedRenderer : result.renderer);
      try {
        const lose = gl.getExtension?.("WEBGL_lose_context");
        lose?.loseContext?.();
      } catch { /* webgl context loss */ }
    } catch (err) {
      result.error = String(err?.message || err).slice(0, 160);
    }
    return result;
  }

  function clientGpuSnapshot(reason = "client-capability-snapshot", options = {}) {
    const cache = state.clientGpuSnapshotCache || (state.clientGpuSnapshotCache = { value: null, sampledAt: 0, ttlMs: 30000, hits: 0, misses: 0, lastReason: "" });
    const now = Date.now();
    const ttlMs = Math.max(1000, Number(cache.ttlMs || 30000) || 30000);
    const force = !!options?.force;
    if (!force && cache.value && cache.sampledAt && now - cache.sampledAt < ttlMs) {
      cache.hits = (cache.hits || 0) + 1;
      cache.lastReason = String(reason || "client-capability-snapshot").slice(0, 96);
      recordPerformanceEvent("client-gpu-snapshot-cache-hit", 0, cache.lastReason);
      return {
        ...cache.value,
        cache: {
          cached: true,
          sampledAt: cache.sampledAt,
          ageMs: Math.max(0, now - cache.sampledAt),
          ttlMs,
          hits: cache.hits || 0,
          misses: cache.misses || 0,
          lastReason: cache.lastReason || "",
        },
      };
    }

    const snapshot = computeClientGpuSnapshot();
    cache.value = snapshot;
    cache.sampledAt = now;
    cache.ttlMs = ttlMs;
    cache.misses = (cache.misses || 0) + 1;
    cache.lastReason = String(reason || "client-capability-snapshot").slice(0, 96);
    recordPerformanceEvent("client-gpu-snapshot-cache-miss", 0, cache.lastReason);
    return {
      ...snapshot,
      cache: {
        cached: false,
        sampledAt: now,
        ageMs: 0,
        ttlMs,
        hits: cache.hits || 0,
        misses: cache.misses || 0,
        lastReason: cache.lastReason || "",
      },
    };
  }

  function clientCapabilitySnapshot(reason = "client-capability-snapshot") {
    const nav = navigatorRef || {};
    const uaData = nav.userAgentData || null;
    const memory = performanceRef?.memory || null;
    const screenInfo = W?.screen || null;
    const gpu = clientGpuSnapshot(reason);
    const browser = browserInfoSnapshot();
    const viewport = { width: W?.innerWidth || 0, height: W?.innerHeight || 0, devicePixelRatio: W?.devicePixelRatio || 1 };
    const threads = Number(nav.hardwareConcurrency || 0);
    const ramGB = Number(nav.deviceMemory || 0) || null;
    return {
      localOnly: true,
      privacyLevel: "coarse-browser-capability-snapshot",
      hardwareConcurrency: threads || null,
      deviceMemoryGB: ramGB,
      memoryPrivacyNote: "approximate browser RAM estimate",
      displayPrivacyNote: "current window/screen approximation only",
      maxTouchPoints: Number(nav.maxTouchPoints || 0) || 0,
      platform: String(nav.platform || uaData?.platform || "unknown").slice(0, 80),
      browser,
      userAgentBrands: browser.userAgentBrands,
      mobile: !!uaData?.mobile,
      language: String(nav.language || "unknown").slice(0, 32),
      viewport,
      screen: screenInfo ? { width: screenInfo.width || 0, height: screenInfo.height || 0, colorDepth: screenInfo.colorDepth || 0 } : null,
      memory: memory ? {
        usedJSHeapMB: roundPerformanceMetric((memory.usedJSHeapSize || 0) / 1048576, 2),
        totalJSHeapMB: roundPerformanceMetric((memory.totalJSHeapSize || 0) / 1048576, 2),
        jsHeapLimitMB: roundPerformanceMetric((memory.jsHeapSizeLimit || 0) / 1048576, 2),
      } : { available: false },
      featureSupport: {
        mutationObserver: typeof MutationObserver === "function",
        resizeObserver: typeof ResizeObserver === "function",
        intersectionObserver: typeof IntersectionObserver === "function",
        requestIdleCallback: typeof W?.requestIdleCallback === "function",
        schedulerPostTask: typeof W?.scheduler?.postTask === "function",
        performanceObserver: typeof W?.PerformanceObserver === "function" || typeof globalThis?.PerformanceObserver === "function",
        longTaskObserver: (() => {
          const observerCtor = W?.PerformanceObserver || globalThis?.PerformanceObserver || null;
          try { return typeof observerCtor === "function" && observerCtor.supportedEntryTypes?.includes?.("longtask"); } catch { return false; }
        })(),
        userAgentSpecificMemory: typeof performanceRef?.measureUserAgentSpecificMemory === "function",
        webgl: gpu.webglAvailable,
        webgl2: gpu.webgl2Available,
        webgpu: gpu.webgpuAvailable,
      },
      display: {
        cpu: `${threads || "?"} threads`,
        ram: displayMemoryLabel(ramGB),
        cpuRam: `${threads || "?"} threads / ${displayMemoryLabel(ramGB)}`,
        gpu: gpu.displayRenderer || compactGpuRendererLabel(gpu.unmaskedRenderer && gpu.unmaskedRenderer !== "unavailable" ? gpu.unmaskedRenderer : gpu.renderer),
        browser: displayBrowserLabel(browser),
        viewport: displayViewportLabel(viewport),
        monitor: displayMonitorLabel(viewport, screenInfo),
      },
      gpu,
    };
  }

  return {
    browserInfoSnapshot,
    computeClientGpuSnapshot,
    clientGpuSnapshot,
    clientCapabilitySnapshot,
  };
}
