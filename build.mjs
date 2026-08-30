// Bumpline — packages the extension for both stores.
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

// Two stores, one source tree. The only file that differs between them is the
// manifest, and it differs in three ways Chrome and Firefox will not forgive:
// the background entry point, the add-on id Firefox needs to keep an install
// attached to its data, and the data-collection notice AMO asks every add-on to
// carry. Everything else is copied byte for byte.
//
//   node build.mjs            both packages
//   node build.mjs firefox    just one of them
//
// Output lands in build/ as a folder to load unpacked and a zip to upload.

import { deflateRawSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'build');

// Everything the extension needs at runtime, plus the licence the source is
// given under. The manifest is absent on purpose: each target writes its own.
const PAYLOAD = [
  'background.js',
  'bridge.js',
  'content.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'welcome',
  // Inter, the typeface the shadcn preset asks for. Manifest v3 refuses a
  // remote font, so the two Latin subsets ship with the extension, and OFL.txt
  // is the licence they ship under.
  'fonts',
  'LICENSE',
];

// The off*.png are the action's grey state, set by the background worker when
// the switch goes off; they are not manifest icons and are named in no manifest
// key, so they have to be listed here or they would not ship.
const ICONS = [
  'icon16.png', 'icon24.png', 'icon32.png', 'icon48.png', 'icon128.png',
  'off16.png', 'off24.png', 'off32.png',
  'logo.svg',
];

// Firefox refuses an add-on whose id it cannot pin down, and without one every
// update looks like a fresh install with an empty storage.local.
const GECKO_ID = 'giampy@privacyrequired.com';

// Manifest v3 landed in Firefox 109, but the data-collection notice below only
// became a manifest key in 140 — which is also the current ESR, so nothing is
// lost by asking for it.
const GECKO_MIN = '140.0';
const GECKO_ANDROID_MIN = '142.0';

const TARGETS = {
  // Chrome takes the manifest as it is written in the repo.
  chrome: manifest => manifest,

  firefox: manifest => {
    const out = { ...manifest };

    // A Chrome key, and Firefox's own floor is set below rather than here.
    delete out.minimum_chrome_version;
    
    // Firefox has no service worker to give: an MV3 background there is an
    // event page, woken by the same listeners and torn down the same way.
    out.background = { scripts: ['background.js'] };

    out.browser_specific_settings = {
      gecko: {
        id: GECKO_ID,
        strict_min_version: GECKO_MIN,
        // Nothing leaves the browser, and saying so in the manifest is what
        // spares the reviewer from having to take it on trust.
        data_collection_permissions: { required: ['none'] },
      },
      // Android got the same key two releases later. Whether the add-on is
      // offered on phones at all is a switch on the store listing; this only
      // says which builds could run it if it is.
      gecko_android: { strict_min_version: GECKO_ANDROID_MIN },
    };

    return out;
  },
};

// ---------------------------------------------------------------------------
// A zip writer, because the alternatives are a dependency or PowerShell's
// Compress-Archive, which writes backslash-separated entries that both stores
// reject. Deflate, no zip64: the whole package is well under a megabyte.
// ---------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, byte) => {
  let value = byte;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const deflated = deflateRawSync(entry.data);

    // Deflate is not guaranteed to shrink anything; store the original when it
    // does not, which is what every other zip writer does.
    const stored = deflated.length >= entry.data.length;
    const body = stored ? entry.data : deflated;
    const method = stored ? 0 : 8;
    const sum = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // utf-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // time — fixed, so a rebuild is reproducible
    local.writeUInt16LE(0x21, 12); // date — 1 January 1980
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field
    name.copy(local, 30);

    const header = Buffer.alloc(46 + name.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4); // version made by
    header.writeUInt16LE(20, 6); // version needed
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0x21, 14);
    header.writeUInt32LE(sum, 16);
    header.writeUInt32LE(body.length, 20);
    header.writeUInt32LE(entry.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    // Extra field, comment, disk number and both attribute words stay zero.
    header.writeUInt32LE(offset, 42);
    name.copy(header, 46);

    locals.push(local, body);
    central.push(header);
    offset += local.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}

// ---------------------------------------------------------------------------

// Walks a file or a directory into the flat list of names the zip wants, with
// forward slashes on every platform.
function collect(source, name, into) {
  const path = resolve(ROOT, source);
  if (statSync(path).isDirectory()) {
    for (const child of readdirSync(path).sort()) {
      collect(join(path, child), posix.join(name, child), into);
    }
    return;
  }
  into.push({ name, data: readFileSync(path) });
}

function build(target, manifest) {
  const version = manifest.version;
  const stem = `bumpline-${version}-${target}`;
  const folder = join(OUT, stem);

  const entries = [
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(TARGETS[target](manifest), null, 2) + '\n', 'utf8') },
  ];
  for (const item of PAYLOAD) collect(item, item, entries);
  for (const icon of ICONS) collect(join('icons', icon), posix.join('icons', icon), entries);

  // The unpacked folder is what you load while developing; the zip is what the
  // store takes. Both are rebuilt from scratch so a deleted source file cannot
  // survive in the output.
  rmSync(folder, { recursive: true, force: true });
  for (const entry of entries) {
    const path = join(folder, entry.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, entry.data);
  }

  const archive = join(OUT, `${stem}.zip`);
  writeFileSync(archive, zip(entries));

  const size = (statSync(archive).size / 1024).toFixed(0);
  console.log(`${target}: ${relative(ROOT, archive)} (${entries.length} files, ${size} kB)`);
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const asked = process.argv.slice(2);
const wanted = asked.length ? asked : Object.keys(TARGETS);

for (const target of wanted) {
  if (!TARGETS[target]) {
    console.error(`unknown target "${target}" — pick from ${Object.keys(TARGETS).join(', ')}`);
    process.exitCode = 1;
    continue;
  }
  mkdirSync(OUT, { recursive: true });
  build(target, manifest);
}
