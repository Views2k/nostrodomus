// Nostrodomus diagnostics helper module.
//
// Pure runtime-error formatting only. Runtime error collection, debug APIs,
// Settings UI, DOM mounting, provider behavior, and visual layers live elsewhere.
// Keep this module free of host globals, storage, events, timers, DOM/query APIs,
// and network access.

export function boundedRuntimeErrorString(value, max = 260) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function safeRuntimeErrorDetail(detail) {
  if (detail == null) return null;
  if (typeof detail !== "object") return boundedRuntimeErrorString(detail, 220);
  const out = {};
  for (const [key, value] of Object.entries(detail).slice(0, 16)) {
    if (value == null || typeof value === "number" || typeof value === "boolean") out[key] = value;
    // Bound string values like every other branch does — a raw pass-through let an
    // error- or payload-derived string pin megabytes verbatim in state.runtimeErrors.
    else if (typeof value === "string") out[key] = boundedRuntimeErrorString(value, 220);
    else if (Array.isArray(value)) out[key] = value.slice(0, 8).map(item => boundedRuntimeErrorString(item, 120));
    else out[key] = boundedRuntimeErrorString(value?.constructor?.name || typeof value, 80);
  }
  return out;
}
