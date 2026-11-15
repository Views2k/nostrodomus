// The value labels of the Style range controls in Settings. Pure functions: no DOM, storage,
// events, timers or Home Assistant reads.

import { hueLabel, percentLabel, sliderNumberLabel } from '../core/string.js';
import { glowSizeLabel } from './settingsLabels.js';

export function styleRangeGroupTouchesSyntax(group = "") {
  return String(group || "").toLowerCase().includes("syntax");
}

export function formatStyleRangeValue(format, group, value) {
  return format === "hue"
    ? hueLabel(value)
    : format === "glow-size"
      ? glowSizeLabel(value)
      : String(group || "").toLowerCase().includes("saturation")
        ? sliderNumberLabel(value)
        : percentLabel(value);
}
