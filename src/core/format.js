// Nostrodomus pure formatting helpers.
// Color-format helpers for the runtime.
// Keep this module pure: no DOM access, Settings access, runtime state, timers, storage, network calls, or logging.

import { clampNumber } from './string.js';

export function hslaFromHue(hue, saturation = 1, lightness = 64, opacity = 1) {
  const h = Math.round(clampNumber(hue, 0, 360, 195));
  const s = Math.round(clampNumber(saturation, 0, 2.5, 1) * 100);
  const l = Math.round(clampNumber(lightness, 0, 100, 64));
  const a = clampNumber(opacity, 0, 1, 1);
  return `hsla(${h}, ${s}%, ${l}%, ${a.toFixed(3)})`;
}

export function hexToRgb(color) {
  const hex = String(color || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  return null;
}

export function syntaxHue(hue) {
  const n = Number(hue);
  if (!Number.isFinite(n)) return 210;
  return ((Math.round(n) % 360) + 360) % 360;
}

export function syntaxHsl(theme, offset, lightnessShift = 0, saturationShift = 0) {
  const h = syntaxHue((theme?.baseHue ?? 210) + offset);
  const saturationBoost = clampNumber(theme?.saturationMultiplier, 0.35, 1.85, 1);
  const s = Math.round(clampNumber(((theme?.saturation ?? 0.9) + saturationShift) * saturationBoost, 0.20, 1.85, 0.9) * 100);
  const l = Math.round(clampNumber((theme?.lightness ?? 64) + lightnessShift, 24, 84, 64));
  return `hsl(${h} ${s}% ${l}%)`;
}


export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), s, l];
}


// HSL -> RGB. hue 0..360 (wrapped), saturation/lightness 0..1. Returns [r,g,b] 0..255
// integers. Pure inverse of rgbToHsl; used to render an accent color into the
// `r, g, b` triplet form that `rgba(var(--token), alpha)` consumes.
export function hslToRgb(hue, saturation, lightness) {
  const h = ((((Number(hue) || 0) % 360) + 360) % 360) / 360;
  const s = clampNumber(saturation, 0, 1, 0);
  const l = clampNumber(lightness, 0, 1, 0);
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    let tc = t;
    if (tc < 0) tc += 1;
    if (tc > 1) tc -= 1;
    if (tc < 1 / 6) return p + (q - p) * 6 * tc;
    if (tc < 1 / 2) return q;
    if (tc < 2 / 3) return p + (q - p) * (2 / 3 - tc) * 6;
    return p;
  };
  return [
    Math.round(channel(h + 1 / 3) * 255),
    Math.round(channel(h) * 255),
    Math.round(channel(h - 1 / 3) * 255),
  ];
}


export function syntaxColorWithOpacity(color, opacity = 1, fallbackColor = '#d4d4d4') {
  const raw = String(color || fallbackColor).trim();
  const alpha = clampNumber(opacity, 0.35, 1, 1);
  if (alpha >= 0.999) return raw;
  const hex = raw.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }
  const hsl = raw.match(/^hsl\((.*)\)$/i);
  if (hsl) {
    const inner = hsl[1].replace(/\s*\/\s*[^)]+$/, '').trim();
    return `hsl(${inner} / ${alpha.toFixed(3)})`;
  }
  const rgb = raw.match(/^rgb\((.*)\)$/i);
  if (rgb) {
    const inner = rgb[1].replace(/\s*\/\s*[^)]+$/, '').trim();
    return `rgb(${inner} / ${alpha.toFixed(3)})`;
  }
  return `color-mix(in srgb, ${raw} ${Math.round(alpha * 100)}%, transparent)`;
}

export function syntaxColorWithSaturation(color, multiplier = 1) {
  const boost = clampNumber(multiplier, 0.35, 1.85, 1);
  if (Math.abs(boost - 1) < 0.001) return color;
  const raw = String(color || '').trim();
  const hsl = raw.match(/^hsl\(([-0-9.]+)\s+([-0-9.]+)%\s+([-0-9.]+)%\)$/i);
  if (hsl) {
    const h = Math.round(Number(hsl[1]));
    const s = Math.round(clampNumber((Number(hsl[2]) / 100) * boost, 0.18, 1, 0.7) * 100);
    const l = Math.round(clampNumber(Number(hsl[3]), 0, 100, 64));
    return `hsl(${h} ${s}% ${l}%)`;
  }
  const rgb = hexToRgb(raw);
  if (rgb) {
    const [h, sat, light] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const s = Math.round(clampNumber(sat * boost, 0.12, 1, sat) * 100);
    const l = Math.round(clampNumber(light, 0, 1, light) * 100);
    return `hsl(${h} ${s}% ${l}%)`;
  }
  return raw;
}
