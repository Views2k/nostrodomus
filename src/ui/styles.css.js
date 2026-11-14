// Style-module wiring sentinel.
// Visual CSS strings stay owned by src/main.legacy.js until a dedicated
// visual-layer extraction can be tested against the known-good frosted/glow/codebox
// behavior. This module is wired only to register the seam without moving style
// ownership.

export const STYLE_CSS_MODULE_STATUS = Object.freeze({
  id: "nostrodomus-styles-css-module",
  wired: true,
  ownsVisualCss: false,
  visualOwner: "src/main.legacy.js",
  extractionPolicy: "sentinel-only-no-style-ownership-transfer",
});

export function styleCssModuleStatus() {
  return STYLE_CSS_MODULE_STATUS;
}
