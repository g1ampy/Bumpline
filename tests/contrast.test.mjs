// The notices' strips against the 4.5:1 the rest of the panel holds to (the
// list at the top of popup.css). Read from popup.css itself: each level's ink,
// light and dark, on its own tint over the page, for the title and link in the
// ink and for the body mixed towards the page's ink.
//
//   node --test "tests/*.test.mjs"

import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const css = readFileSync(new URL('../popup.css', import.meta.url), 'utf8');

// [light, dark]: the first declaration is the light scheme, the next one the
// dark scheme's override.
function token(name) {
  const found = [...css.matchAll(new RegExp(`(?<![\\w-])--${name}:\\s*oklch\\(([^)]+)\\)`, 'g'))]
    .map(match => match[1].trim().split(/\s+/).map(Number));
  assert.ok(found.length >= 2, `--${name} has a light and a dark value`);
  return found.slice(0, 2);
}

// The percentage a rule gives its ink in a color-mix, falling back to the base
// strip's for a level that does not set its own.
function share(selector, pattern) {
  const block = css.match(new RegExp(`${selector.replace(/[.-]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  const hit = block && block[1].match(pattern);
  return hit ? Number(hit[1]) / 100 : null;
}

const oklabOf = ([L, C, h]) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];

function linearOf([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(x => Math.min(1, Math.max(0, x)));
}

const encode = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const decode = x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const srgbOf = lab => linearOf(lab).map(encode);
const luminance = rgb => {
  const [r, g, b] = rgb.map(decode);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (x, y) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

// color-mix(in oklab, ink p%, transparent) painted over the page: the ink at
// alpha p, composited in sRGB.
const tint = (ink, page, p) => srgbOf(ink).map((c, i) => c * p + srgbOf(page)[i] * (1 - p));
// color-mix(in oklab, ink p%, foreground): mixed in oklab.
const mix = (ink, other, p) => srgbOf(ink.map((c, i) => c * p + other[i] * (1 - p)));

const LEVELS = {
  info: 'primary',
  attention: 'news-attention',
  warning: 'destructive',
};

const base = share('.news__item', /var\(--ink\) (\d+)%, transparent/);
const bodyShare = share('.news__body', /var\(--ink\) (\d+)%/);

describe('notice strips', () => {
  for (const [scheme, at] of [['light', 0], ['dark', 1]]) {
    const page = oklabOf(token('background')[at]);
    const text = oklabOf(token('foreground')[at]);

    for (const [level, name] of Object.entries(LEVELS)) {
      const ink = oklabOf(token(name)[at]);
      const p = share(`.news__item--${level}`, /var\(--ink\) (\d+)%, transparent/) ?? base;
      const ground = tint(ink, page, p);

      it(`${level} title and link read at 4.5:1 or better (${scheme})`, () => {
        const measured = ratio(srgbOf(ink), ground);
        assert.ok(measured >= 4.5, `${measured.toFixed(2)}:1`);
      });

      it(`${level} body reads at 4.5:1 or better (${scheme})`, () => {
        const measured = ratio(mix(ink, text, bodyShare), ground);
        assert.ok(measured >= 4.5, `${measured.toFixed(2)}:1`);
      });
    }
  }
});
