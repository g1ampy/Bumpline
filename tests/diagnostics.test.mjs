// The extension's own log: cleaning, capping, and the links that carry it to
// the website's report form. diagnostics.js is a plain script with no module
// system, loaded here the way the broadcast tests load broadcast.js.
//
//   node --test tests/

import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../diagnostics.js', import.meta.url), 'utf8');
const L = new Function(source + '; return BumplineLog;')();

// The same file as the website's tests/fixtures/clean-vectors.json, so the
// two copies of the rules cannot drift apart.
const vectors = JSON.parse(readFileSync(new URL('./clean-vectors.json', import.meta.url), 'utf8'));

const decode = encoded => JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));

function memoryStorage() {
  const bag = {};
  return {
    bag,
    async get(key) { return key in bag ? { [key]: bag[key] } : {}; },
    async set(items) { Object.assign(bag, items); },
  };
}

describe('clean', () => {
  for (const { in: input, out } of vectors) {
    it(`cleans ${input}`, () => assert.equal(L.clean(input), out));
  }
});

describe('format', () => {
  it('stamps the time, says what an error was, and cleans the line', () => {
    assert.equal(
      L.format(['relist failed for', 4829301123, new Error('boom')], new Date(2026, 9, 27, 12, 4, 31)),
      '12:04:31 relist failed for [id] Error: boom',
    );
  });

  it('cuts a long object short', () => {
    const line = L.format([{ text: 'x'.repeat(1000) }], new Date(2026, 9, 27, 0, 0, 0));
    assert.ok(line.length < 320);
  });
});

describe('append', () => {
  it('keeps the newest lines within the line cap', () => {
    let lines = [];
    for (let i = 0; i < 250; i++) lines = L.append(lines, `line ${i}`);
    assert.equal(lines.length, L.MAX_LINES);
    assert.equal(lines.at(-1), 'line 249');
  });

  it('keeps within the byte cap', () => {
    let lines = [];
    for (let i = 0; i < 50; i++) lines = L.append(lines, 'x'.repeat(1000));
    assert.ok(Buffer.byteLength(lines.join('\n')) <= L.MAX_BYTES);
  });
});

describe('encode', () => {
  it('survives accents and emoji', () => {
    assert.deepEqual(decode(L.encode(['ciao è 🙂'])), ['ciao è 🙂']);
  });
});

describe('siteOf', () => {
  it('names a Vinted site by its domain, and nothing else', () => {
    assert.equal(L.siteOf('www.vinted.co.uk'), 'vinted.co.uk');
    assert.equal(L.siteOf('www.vinted.com.au'), 'vinted.com.au');
    assert.equal(L.siteOf('evil.com'), null);
    assert.equal(L.siteOf(''), null);
  });
});

describe('reportUrl', () => {
  const SITE = 'https://bumpline.giampy.tech';

  it('falls back to English, and leaves out what it does not know', () => {
    assert.equal(
      L.reportUrl(SITE, { lang: 'de', version: '1.1.7', site: null, lines: [] }),
      `${SITE}/en/report/?from=popup&v=1.1.7`,
    );
  });

  it('carries the site and the log, the log after the #', () => {
    const url = new URL(L.reportUrl(SITE, {
      lang: 'it', version: '1.1.7', site: 'vinted.it', lines: ['12:04:31 boom'],
    }));
    assert.equal(url.pathname, '/it/report/');
    assert.equal(url.searchParams.get('site'), 'vinted.it');
    assert.deepEqual(decode(url.hash.slice('#log='.length)), ['12:04:31 boom']);
  });
});

describe('goodbyeUrl', () => {
  it('tells the goodbye page the version and, when known, the site', () => {
    assert.equal(
      L.goodbyeUrl('https://bumpline.giampy.tech', '1.1.7', 'vinted.it'),
      'https://bumpline.giampy.tech/goodbye/?v=1.1.7&site=vinted.it',
    );
    assert.equal(
      L.goodbyeUrl('https://bumpline.giampy.tech', '1.1.7', null),
      'https://bumpline.giampy.tech/goodbye/?v=1.1.7',
    );
  });
});

describe('record and read', () => {
  it('stores cleaned lines only', async () => {
    const storage = memoryStorage();
    await L.record(storage, ['relist pending for item', 4829301123]);
    const lines = await L.read(storage);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /relist pending for item \[id\]$/);
    assert.doesNotMatch(JSON.stringify(storage.bag), /4829301123/);
  });

  it('never throws, even when storage does', async () => {
    const broken = { get: async () => { throw new Error('gone'); }, set: async () => { throw new Error('gone'); } };
    await L.record(broken, ['x']);
    assert.deepEqual(await L.read(broken), []);
  });
});
