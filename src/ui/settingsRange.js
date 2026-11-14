// Nostrodomus Settings range helper seams.
//
// Keep these helpers pure: no DOM access, no browser storage, no events, no
// timers, no styling, and no Home Assistant runtime reads.

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
