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

// Everything rides after the #, which the browser keeps to itself: opening
// either page sends the website nothing about the add-on. The page reads the
// fragment, and it reaches anyone only if the seller sends the form.
describe('reportUrl', () => {
  const SITE = 'https://bumpline.giampy.tech';

  it('falls back to English, and leaves out what it does not know', () => {
    assert.equal(
      L.reportUrl(SITE, { lang: 'de', version: '1.1.7', site: null, lines: [] }),
      `${SITE}/en/report/#from=popup&v=1.1.7`,
    );
  });

  it('carries the site and the log, all after the #', () => {
    const url = new URL(L.reportUrl(SITE, {
      lang: 'it', version: '1.1.7', site: 'vinted.it', lines: ['12:04:31 boom'],
    }));
    assert.equal(url.pathname, '/it/report/');
    assert.equal(url.search, '');
    const fragment = new URLSearchParams(url.hash.slice(1));
    assert.equal(fragment.get('from'), 'popup');
    assert.equal(fragment.get('v'), '1.1.7');
    assert.equal(fragment.get('site'), 'vinted.it');
    assert.deepEqual(decode(fragment.get('log')), ['12:04:31 boom']);
  });
});

// Firefox counts the version, the site and an error log as technical data,
// which may only leave with the user's consent: the optional
// technicalAndInteraction permission, offered at install and in about:addons.
// Without it the links carry nothing. Chrome has no such permission.
describe('technical data', () => {
  const SITE = 'https://bumpline.giampy.tech';
  const firefox = data_collection => ({
    permissions: { getAll: async () => (data_collection ? { permissions: [], data_collection } : { permissions: [] }) },
  });

  it('is allowed on Chrome, where there is nothing to grant', async () => {
    assert.equal(await L.technicalDataAllowed(firefox(null), false), true);
  });

  it('is allowed on Firefox only once the user has granted it', async () => {
    assert.equal(await L.technicalDataAllowed(firefox(['technicalAndInteraction']), true), true);
    assert.equal(await L.technicalDataAllowed(firefox([]), true), false);
    // No data_collection key: a Firefox without the built-in consent.
    assert.equal(await L.technicalDataAllowed(firefox(null), true), false);
  });

  it('is refused when Firefox cannot be asked', async () => {
    const broken = { permissions: { getAll: async () => { throw new Error('no'); } } };
    assert.equal(await L.technicalDataAllowed(broken, true), false);
    assert.equal(await L.technicalDataAllowed({}, true), false);
  });

  it('leaves everything out of the report link when it is not allowed', () => {
    assert.equal(
      L.reportUrl(SITE, { lang: 'it', version: '1.1.7', site: 'vinted.it', lines: ['boom'], allowed: false }),
      `${SITE}/it/report/#from=popup`,
    );
  });

  it('leaves everything out of the goodbye address when it is not allowed', () => {
    assert.equal(L.goodbyeUrl(SITE, '1.1.7', 'vinted.it', false), `${SITE}/goodbye/`);
  });

  it('is declared as optional in the Firefox package', () => {
    const build = readFileSync(new URL('../build.mjs', import.meta.url), 'utf8');
    assert.match(build, /data_collection_permissions: \{ required: \['none'\], optional: \['technicalAndInteraction'\] \}/);
  });

  it('is asked before the panel and the background build their links', () => {
    for (const name of ['popup.js', 'background.js']) {
      const script = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
      assert.match(script, /BumplineLog\.technicalDataAllowed\(ext, BumplineStore\.isFirefox\(\)\)/, name);
    }
    const popup = readFileSync(new URL('../popup.js', import.meta.url), 'utf8');
    assert.match(popup, /allowed: report\.allowed/);
    const background = readFileSync(new URL('../background.js', import.meta.url), 'utf8');
    assert.match(background, /goodbyeUrl\(.*, allowed\);/);
  });
});

describe('goodbyeUrl', () => {
  it('tells the goodbye page the version and, when known, the site, after the #', () => {
    assert.equal(
      L.goodbyeUrl('https://bumpline.giampy.tech', '1.1.7', 'vinted.it'),
      'https://bumpline.giampy.tech/goodbye/#v=1.1.7&site=vinted.it',
    );
    assert.equal(
      L.goodbyeUrl('https://bumpline.giampy.tech', '1.1.7', null),
      'https://bumpline.giampy.tech/goodbye/#v=1.1.7',
    );
  });

  it('stays within the 1023 characters Chrome allows an uninstall address', () => {
    assert.ok(L.goodbyeUrl('https://bumpline.giampy.tech', '1.1.7', 'vinted.com.au').length < 1023);
  });
});

// Each script loads diagnostics.js before using it, in every place the
// extension is put together.
describe('loading', () => {
  const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

  it('comes before content.js in the content script', () => {
    const [script] = JSON.parse(read('manifest.json')).content_scripts;
    assert.ok(script.js.indexOf('diagnostics.js') > -1);
    assert.ok(script.js.indexOf('diagnostics.js') < script.js.indexOf('content.js'));
  });

  it('comes before background.js on Chrome and on Firefox', () => {
    assert.match(read('background.js'), /importScripts\([^)]*'diagnostics\.js'/);
    assert.match(read('build.mjs'), /'diagnostics\.js', 'background\.js'/);
  });

  it('leaves every script it was wired into parseable', () => {
    for (const name of ['background.js', 'content.js', 'popup.js', 'diagnostics.js']) {
      assert.doesNotThrow(() => new Function(read(name)), name);
    }
  });

  it('ships in the package and loads before popup.js', () => {
    assert.match(read('build.mjs'), /^\s*'diagnostics\.js',$/m);
    const popup = read('popup.html');
    assert.ok(popup.indexOf('src="diagnostics.js"') > -1);
    assert.ok(popup.indexOf('src="diagnostics.js"') < popup.indexOf('src="popup.js"'));
  });
});

describe('record, from many places at once', () => {
  it('keeps every line written by one script, however close together', async () => {
    const storage = memoryStorage();
    await Promise.all([L.record(storage, ['one']), L.record(storage, ['two']), L.record(storage, ['three'])]);
    const lines = await L.read(storage);
    assert.deepEqual(lines.map(line => line.slice(9)), ['one', 'two', 'three']);
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
