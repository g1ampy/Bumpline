// Bumpline — regenerates the Material files the toolbar panel ships with.
// Copyright (C) 2026 g1ampy
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation, either version 3 of the License, or (at your option)
// any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along
// with this program. If not, see <https://www.gnu.org/licenses/>.

// The extension itself has no dependencies and no build step beyond the
// packer in the repository root. What it takes from Material is committed as
// plain files, and this is the one place those files come from:
//
//   vendor/material.js     the md-* components, bundled from entry.js
//   vendor/LICENSE-*       the licences that bundle ships under
//   icons.js               Material Symbols, as path data md-icon can draw
//   fonts/roboto-flex-*    Roboto Flex, Latin and Latin Extended
//   fonts/OFL.txt          the licence the font ships under
//
//   cd tools/material
//   npm install
//   node build.mjs            write all of the above
//   node build.mjs --theme    print the colour tokens popup.css starts from
//
// Every version is pinned in package.json, so running this twice writes the
// same bytes.

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const MODULES = join(HERE, 'node_modules');
const require = createRequire(import.meta.url);
const versionOf = name => require(`${name}/package.json`).version;

// The logo's teal, which every colour in the panel is generated from.
const SOURCE = '#007580';

// --- the theme -------------------------------------------------------------

// Printed rather than written: popup.css carries the tokens alongside the
// reasons for the few it overrides, and a script that rewrote the file would
// take the reasons with it. Paste over the generated blocks and keep the rest.
async function theme() {
  // material-color-utilities ships ES modules without file extensions, which
  // Node will not resolve on its own; esbuild will.
  const { outputFiles } = await build({
    stdin: {
      contents: `export * from '@material/material-color-utilities';`,
      resolveDir: HERE,
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  const mcu = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
  const { argbFromHex, hexFromArgb, Hct, SchemeTonalSpot, MaterialDynamicColors, Blend, TonalPalette } = mcu;

  const source = Hct.fromInt(argbFromHex(SOURCE));
  const kebab = name => name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
  const ROLES = [
    'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
    'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
    'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
    'error', 'onError', 'errorContainer', 'onErrorContainer',
    'background', 'onBackground', 'surface', 'onSurface',
    'surfaceVariant', 'onSurfaceVariant', 'outline', 'outlineVariant',
    'shadow', 'scrim', 'inverseSurface', 'inverseOnSurface', 'inversePrimary',
    'surfaceDim', 'surfaceBright', 'surfaceContainerLowest', 'surfaceContainerLow',
    'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest', 'surfaceTint',
  ];
  // Material has no success or amber role. These two are harmonised towards
  // the teal and given the four tones every role gets.
  const CUSTOM = [['success', '#2e8b3d'], ['attention', '#b26a00']];

  for (const dark of [false, true]) {
    const scheme = new SchemeTonalSpot(source, dark, 0);
    const lines = ROLES.map(role =>
      `  --md-sys-color-${kebab(role)}: ${hexFromArgb(MaterialDynamicColors[role].getArgb(scheme))};`);
    for (const [name, hex] of CUSTOM) {
      const palette = TonalPalette.fromInt(Blend.harmonize(argbFromHex(hex), source.toInt()));
      const tones = dark ? [80, 20, 30, 90] : [40, 100, 90, 10];
      const [color, on, container, onContainer] = tones.map(tone => hexFromArgb(palette.tone(tone)));
      lines.push(`  --bl-${name}: ${color};`, `  --bl-on-${name}: ${on};`,
        `  --bl-${name}-container: ${container};`, `  --bl-on-${name}-container: ${onContainer};`);
    }
    // Dark, the alerts are redrawn at their own hue with a fifth of the
    // chroma: the generated containers are a saturated block on a dark panel.
    if (dark) {
      const quiet = (hex, chroma, tone) => hexFromArgb(Hct.from(Hct.fromInt(argbFromHex(hex)).hue, chroma, tone).toInt());
      const error = hexFromArgb(MaterialDynamicColors.error.getArgb(scheme));
      const amber = hexFromArgb(TonalPalette.fromInt(Blend.harmonize(argbFromHex('#b26a00'), source.toInt())).tone(80));
      lines.push(
        `  --bl-alert-surface: ${quiet(error, 16, 15)};`, `  --bl-alert-text: ${quiet(error, 16, 85)};`,
        `  --bl-alert-badge: ${quiet(error, 30, 30)};`, `  --bl-alert-outline: ${quiet(error, 24, 28)};`,
        `  --bl-attn-surface: ${quiet(amber, 16, 15)};`, `  --bl-attn-text: ${quiet(amber, 16, 85)};`,
      );
    }
    console.log(`/* ${dark ? 'dark' : 'light'} */\n${lines.join('\n')}\n`);
  }
}

// --- the components ----------------------------------------------------------

async function components() {
  const banner = [
    '// Material Web ' + versionOf('@material/web') + ' (Apache-2.0) and Lit (BSD-3-Clause), bundled.',
    '// Generated by tools/material/build.mjs from tools/material/entry.js. Do not',
    '// edit: change entry.js and run the script again. Licences in vendor/LICENSE-*.',
  ].join('\n');
  await build({
    entryPoints: [join(HERE, 'entry.js')],
    outfile: join(ROOT, 'vendor', 'material.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    // Chrome 111 is the manifest's floor; Firefox's is 140.
    target: ['chrome111', 'firefox140'],
    legalComments: 'eof',
    banner: { js: banner },
    logLevel: 'warning',
  });
  copyFileSync(join(MODULES, '@material/web/LICENSE'), join(ROOT, 'vendor', 'LICENSE-material-web'));
  copyFileSync(join(MODULES, 'lit/LICENSE'), join(ROOT, 'vendor', 'LICENSE-lit'));
  copyFileSync(join(MODULES, '@material-symbols/svg-400/LICENSE'), join(ROOT, 'vendor', 'LICENSE-material-symbols'));
}

// --- the icons ---------------------------------------------------------------

// The name the panel and content.js use, and the Material Symbol it draws.
// Rounded, weight 400; -fill is the filled form of the same symbol.
const ICONS = {
  check: 'check',
  check_circle: 'check_circle-fill',
  close: 'close',
  coffee: 'coffee',
  error: 'error-fill',
  expand_more: 'keyboard_arrow_down',
  favorite: 'favorite-fill',
  info: 'info-fill',
  language: 'language',
  lightbulb: 'lightbulb-fill',
  open_in_new: 'open_in_new',
  pause_circle: 'pause_circle-fill',
  power_settings_new: 'power_settings_new',
  schedule: 'schedule',
  straighten: 'straighten-fill',
  tune: 'tune',
  warning: 'warning-fill',
};

function icons() {
  const paths = {};
  for (const [name, file] of Object.entries(ICONS)) {
    const svg = readFileSync(join(MODULES, '@material-symbols/svg-400/rounded', `${file}.svg`), 'utf8');
    paths[name] = svg.match(/ d="([^"]+)"/)[1];
  }
  const out = [
    '// Bumpline — the panel\'s icons: Material Symbols Rounded, weight 400',
    `// (@material-symbols/svg-400 ${versionOf('@material-symbols/svg-400')}, Apache-2.0), as path data on a`,
    '// 0 -960 960 960 box. md-icon draws an inline <svg> in currentColor, so the',
    '// panel needs no icon font. Generated by tools/material/build.mjs; to add one,',
    '// add it to ICONS there and run the script again.',
    `const BumplineIcons = ${JSON.stringify(paths, null, 2)};`,
    '',
  ].join('\n');
  writeFileSync(join(ROOT, 'icons.js'), out);
}

// --- the font ----------------------------------------------------------------

// The cut with the weight axis alone: everything the panel sets, at a
// fraction of the full variable font.
function fonts() {
  const files = join(MODULES, '@fontsource-variable/roboto-flex/files');
  for (const subset of ['latin', 'latin-ext']) {
    copyFileSync(join(files, `roboto-flex-${subset}-wght-normal.woff2`),
      join(ROOT, 'fonts', `roboto-flex-${subset}.woff2`));
  }
  copyFileSync(join(MODULES, '@fontsource-variable/roboto-flex/LICENSE'), join(ROOT, 'fonts', 'OFL.txt'));
}

if (process.argv.includes('--theme')) {
  await theme();
} else {
  mkdirSync(join(ROOT, 'vendor'), { recursive: true });
  await components();
  icons();
  fonts();
  console.log('vendor/material.js, icons.js and fonts/ written.');
}
