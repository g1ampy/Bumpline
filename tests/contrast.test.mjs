// Every pair of text and ground the panel draws, held to 4.5:1 in both
// schemes, and every icon on its own badge to 3:1. Read from popup.css itself,
// so a token changed there is measured here before it ships.
//
//   node --test "tests/*.test.mjs"
//
// The colours are Material 3 system tokens generated from the logo's teal
// (tools/material/build.mjs --theme), plus the panel's own alert roles. The
// light values are on the first :root block, the dark ones twice: once under
// prefers-color-scheme and once under [data-theme="dark"]. The two dark blocks
// have to agree, and the first test says so.
//
// content.js draws the cards and dialogs on Vinted's page from tokens of its
// own, declared on them, and those have to be popup.css's, value for value.

import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const css = readFileSync(new URL('../popup.css', import.meta.url), 'utf8');
const content = readFileSync(new URL('../content.js', import.meta.url), 'utf8');

// The declarations of every block in `text` that opens with `opener`.
function blocks(text, opener) {
  const found = [];
  for (let at = text.indexOf(opener); at >= 0; at = text.indexOf(opener, at + opener.length)) {
    const open = text.indexOf('{', at + opener.length - 1);
    const close = text.indexOf('}', open);
    found.push(Object.fromEntries(
      [...text.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
    ));
  }
  return found;
}

// The declarations of the first block that opens with `opener`.
function block(opener) {
  const [first] = blocks(css, opener);
  assert.ok(first, `popup.css has ${opener}`);
  return first;
}

const LIGHT = block(':root {');
const DARK = block(':root[data-theme="dark"] {');
const DARK_MEDIA = block(':root:not([data-theme="light"]) {');

// What a token finally says, following references. A scheme's missing names
// are its light scheme's.
function valueOf(scheme, base, name, seen = new Set()) {
  assert.ok(!seen.has(name), `${name} refers to itself`);
  seen.add(name);
  const value = scheme[name] ?? base[name];
  assert.ok(value, `${name} is defined`);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? valueOf(scheme, base, ref[1], seen) : value.toLowerCase();
}

// A token is a hex colour, a reference to another token, or transparent.
function resolve(scheme, name) {
  const value = valueOf(scheme, LIGHT, name);
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  assert.ok(hex, `${name} is a colour this test can read (${value})`);
  return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16) / 255);
}

const decode = x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const luminance = rgb => {
  const [r, g, b] = rgb.map(decode);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (x, y) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

// [what it is, ink, ground]. Text first, at 4.5:1.
const TEXT = [
  ['page text', 'on-surface', 'surface'],
  ['the power word and the footer links', 'on-surface-variant', 'surface'],
  ['a picked language and the rating link', 'primary', 'surface'],
  ['setting group headings', 'primary', 'surface'],
  ['card titles', 'on-surface', 'surface-container-low'],
  ['card notes and stat labels', 'on-surface-variant', 'surface-container-low'],
  ['"Ready on this page"', 'bl-success', 'surface-container-low'],
  ['the filled button', 'on-primary', 'primary'],
  ['the tonal buttons', 'on-secondary-container', 'secondary-container'],
  ['the risky answer in the warning', 'error', 'surface-container-high'],
  ['the warning\'s text', 'on-surface-variant', 'surface-container-high'],
  ['info notice title', 'on-surface', 'surface-container-high'],
  ['info notice body', 'on-surface-variant', 'surface-container-high'],
  ['attention notice title and link', 'bl-attn-ink', 'bl-attn-surface'],
  ['attention notice body', 'bl-attn-text', 'bl-attn-surface'],
  ['"N changed" in Settings', 'bl-attn-ink', 'bl-attn-surface'],
  ['alert card title and figures', 'bl-alert-ink', 'bl-alert-surface'],
  ['alert card note and list, warning notice body', 'bl-alert-text', 'bl-alert-surface'],
  ['the quiet answer in a dialog on the page', 'primary', 'surface-container-high'],
];

// Icons on a badge are graphics, held to 3:1.
const ICONS = [
  ['a card\'s icon', 'on-secondary-container', 'secondary-container'],
  ['an alert card\'s icon', 'bl-alert-on-badge', 'bl-alert-badge'],
  ['the ready icon', 'bl-on-success-container', 'bl-success-container'],
  ['the alert bar on its track', 'bl-alert-line', 'bl-alert-surface'],
  ['the warning notice\'s icon', 'bl-alert-line', 'bl-alert-surface'],
  ['the attention notice\'s icon', 'bl-attn-icon', 'bl-attn-surface'],
  ['a dialog\'s icon on the page', 'secondary', 'surface-container-high'],
  ['a warning\'s icon on the page', 'error', 'surface-container-high'],
];

describe('popup.css', () => {
  it('declares the same dark scheme under prefers-color-scheme and [data-theme="dark"]', () => {
    assert.deepEqual(DARK_MEDIA, DARK);
  });

  for (const [scheme, tokens] of [['light', LIGHT], ['dark', DARK]]) {
    const at = name => resolve(tokens, `--${name.startsWith('bl-') ? name : `md-sys-color-${name}`}`);

    for (const [what, ink, ground] of TEXT) {
      it(`${what} reads at 4.5:1 or better (${scheme})`, () => {
        const measured = ratio(at(ink), at(ground));
        assert.ok(measured >= 4.5, `${ink} on ${ground}: ${measured.toFixed(2)}:1`);
      });
    }

    for (const [what, ink, ground] of ICONS) {
      it(`${what} stands out at 3:1 or better (${scheme})`, () => {
        const measured = ratio(at(ink), at(ground));
        assert.ok(measured >= 3, `${ink} on ${ground}: ${measured.toFixed(2)}:1`);
      });
    }
  }
});

describe('content.js', () => {
  // Light first, then the dark one under prefers-color-scheme.
  const [PAGE_LIGHT, PAGE_DARK, ...more] = blocks(content, '.bumpline-card, .bumpline-modal {');

  it('declares the page\'s tokens once light and once dark', () => {
    assert.ok(PAGE_LIGHT && PAGE_DARK, 'content.js has both blocks');
    assert.equal(more.length, 0);
  });

  for (const [scheme, page, panel] of [['light', PAGE_LIGHT, LIGHT], ['dark', PAGE_DARK, DARK]]) {
    it(`draws the page in the panel's colours (${scheme})`, () => {
      // A Material role the panel has no value for is a typo, not a choice.
      for (const name of Object.keys(page)) {
        if (name.startsWith('--md-sys-color-')) assert.ok(name in LIGHT, `popup.css has ${name}`);
      }
      // The page's own tokens, like the dark hairline, are not the panel's.
      const shared = Object.keys(page).filter(name => name in LIGHT);
      assert.ok(shared.length > 0, 'the page shares tokens with the panel');
      for (const name of shared) {
        assert.equal(valueOf(page, PAGE_LIGHT, name), valueOf(panel, LIGHT, name), name);
      }
    });
  }
});
