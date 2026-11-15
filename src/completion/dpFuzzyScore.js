// DP fuzzy match score (fzy/fzf-style).
//
// Finds the optimal alignment of `needle` within `haystack` (a dynamic-programming search, where
// orderedSubsequenceMatch in scoring.js takes the first match), then scores it. It orders rows
// within a match tier: among candidates that all match, the one whose match sits on word
// boundaries or in consecutive runs ranks first, so `lk` puts `light.kitchen` and `ltn`
// `light.turn_on` first. Home Assistant ids are segmented by dots and underscores, so `.` `_` `-`
// `/` and space are word boundaries (a match right after one earns the boundary bonus).
//
// Integer arithmetic only, so results are stable across runs. Pure: no DOM, window, storage,
// timers, or globals. Returns 0 when `needle` is not an ordered subsequence of `haystack`, or for
// empty or oversized input; callers treat 0 as no fuzzy signal.

const SCORE_MIN = -1e7;

// A boundary or consecutive match outweighs a gappy mid-word one, while gaps cost little: the
// score orders rows, and the match tier already decides which rows are in the list.
const BONUS_BOUNDARY = 80;     // first char, or immediately after . _ - / or whitespace
const BONUS_CAMEL = 70;        // lower→Upper, or letter→digit (camel / segment) boundary
const BONUS_CONSECUTIVE = 100; // directly follows the previously matched char (a run)
const GAP_LEADING = -1;        // per haystack char skipped before the first match
const GAP_INNER = -2;          // per char skipped between matches
const GAP_TRAILING = -1;       // per char after the last match
const MAX_LEN = 120;           // the length cap of orderedSubsequenceMatch; bounds the table

function isSeparator(ch) {
  return ch === '' || ch === '.' || ch === '_' || ch === '-' || ch === '/' || /\s/.test(ch);
}

// Boundary bonus earned by matching a needle char at haystack position j, independent of the
// rest of the alignment (precomputed once per haystack).
function positionBonus(haystack, j) {
  if (j === 0) return BONUS_BOUNDARY;
  const prev = haystack[j - 1];
  const ch = haystack[j];
  if (isSeparator(prev)) return BONUS_BOUNDARY;
  if (/[a-z]/.test(prev) && /[A-Z]/.test(ch)) return BONUS_CAMEL;
  if (/[A-Za-z]/.test(prev) && /[0-9]/.test(ch)) return BONUS_CAMEL;
  return 0;
}

/**
 * Optimal-alignment fuzzy score of `needle` within `haystack`. Higher is a better match;
 * 0 means no ordered-subsequence match (or degenerate input).
 * @param {string} haystack
 * @param {string} needle
 * @returns {number} integer score >= 0
 */
export function dpFuzzyScore(haystack = '', needle = '') {
  const H = String(haystack || '');
  const N = String(needle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = H.length;
  const m = N.length;
  if (!m || !n || m > n || n > MAX_LEN) return 0;

  const lower = H.toLowerCase();
  const bonus = new Array(n);
  for (let j = 0; j < n; j += 1) bonus[j] = positionBonus(H, j);

  // D[j] = best score with needle[i] matched exactly at haystack[j].
  // M[j] = best score matching needle[0..i] within haystack[0..j].
  let prevD = new Array(n).fill(SCORE_MIN);
  let prevM = new Array(n).fill(SCORE_MIN);

  for (let i = 0; i < m; i += 1) {
    const D = new Array(n).fill(SCORE_MIN);
    const M = new Array(n).fill(SCORE_MIN);
    const gap = i === m - 1 ? GAP_TRAILING : GAP_INNER;
    let rowM = SCORE_MIN; // M[i][j-1]
    for (let j = 0; j < n; j += 1) {
      let d = SCORE_MIN;
      if (N[i] === lower[j]) {
        if (i === 0) {
          d = j * GAP_LEADING + bonus[j];
        } else if (j > 0) {
          const fromGap = prevM[j - 1] > SCORE_MIN ? prevM[j - 1] + bonus[j] : SCORE_MIN;
          const fromRun = prevD[j - 1] > SCORE_MIN ? prevD[j - 1] + BONUS_CONSECUTIVE : SCORE_MIN;
          d = Math.max(fromGap, fromRun);
        }
      }
      D[j] = d;
      const mGap = rowM > SCORE_MIN ? rowM + gap : SCORE_MIN;
      M[j] = Math.max(d, mGap);
      rowM = M[j];
    }
    prevD = D;
    prevM = M;
  }

  const result = prevM[n - 1];
  return result > SCORE_MIN ? Math.max(0, result) : 0;
}
