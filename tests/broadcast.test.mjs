// The website's notices: reading the file, aiming it, badging the icon and
// refreshing it. broadcast.js is a plain script with no module system, loaded
// here the way build.mjs loads strings.js.
//
//   node --test tests/

import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../broadcast.js', import.meta.url), 'utf8');
const B = new Function(source + '; return BumplineBroadcast;')();

const notice = (patch = {}) => ({
  id: 'n',
  level: 'info',
  text: { en: { title: 'T', body: 'B' } },
  ...patch,
});
const file = (...messages) => ({ messages });

const NOW = Date.parse('2026-10-20T12:00:00Z');
const ctx = (patch = {}) => ({
  lang: 'en', family: 'chrome', version: '1.1.4', now: NOW, dismissed: [], ...patch,
});
const shownIds = (messages, patch) => B.eligible(B.parse(file(...messages)), ctx(patch)).map(n => n.id);

describe('parse', () => {
  it('refuses what is not a notice file', () => {
    assert.equal(B.parse('<html>'), null);
    assert.equal(B.parse({}), null);
    assert.equal(B.parse(null), null);
  });

  it('keeps the valid notices and drops the invalid one alone', () => {
    const parsed = B.parse(file(notice({ id: 'good' }), notice({ id: 'bad', level: 'urgent' })));
    assert.deepEqual(parsed.map(n => n.id), ['good']);
  });

  it('drops a later notice that reuses an id', () => {
    const parsed = B.parse(file(notice({ id: 'x' }), notice({ id: 'x', level: 'warning' })));
    assert.deepEqual(parsed.map(n => n.level), ['info']);
  });

  it('reads a bare until date as the end of that day, UTC', () => {
    const [parsed] = B.parse(file(notice({ until: '2026-11-30' })));
    assert.equal(parsed.until, Date.parse('2026-11-30T23:59:59.999Z'));
  });

  it('drops a notice whose link is not https', () => {
    const bad = notice({ text: { en: { title: 'T', body: 'B', link: 'javascript:alert(1)' } } });
    assert.deepEqual(B.parse(file(bad)), []);
  });

  it('drops a notice in a language the extension does not speak only', () => {
    assert.deepEqual(B.parse(file(notice({ text: { de: { title: 'T', body: 'B' } } }))), []);
  });

  // An install keeps the rules it shipped with. A language or browser added to
  // the file later must not take the rest of a notice away from it.
  it('keeps the languages it knows when a notice also carries one it does not', () => {
    const [parsed] = B.parse(file(notice({ text: { en: { title: 'T', body: 'B' }, de: { title: 'T', body: 'B' } } })));
    assert.deepEqual(Object.keys(parsed.text), ['en']);
  });

  it('keeps the browsers it knows when a notice also names one it does not', () => {
    const [parsed] = B.parse(file(notice({ browsers: ['chrome', 'safari'] })));
    assert.deepEqual(parsed.browsers, ['chrome']);
  });

  it('drops a notice aimed only at browsers it does not know', () => {
    assert.deepEqual(B.parse(file(notice({ browsers: ['safari'] }))), []);
  });

  it('takes until only as an ISO date, or a date-time with its offset', () => {
    for (const until of ['2026-11-30T18:00:00Z', '2026-11-30T18:00:00+01:00', '2026-11-30T18:00Z']) {
      assert.equal(B.parse(file(notice({ until }))).length, 1, until);
    }
    for (const until of ['30 Nov 2026', '2026/11/30', '2026-02-30', '2026-11-30T18:00', 'next week']) {
      assert.deepEqual(B.parse(file(notice({ until }))), [], until);
    }
  });
});

describe('compareVersions', () => {
  it('compares each part as a number', () => {
    assert.equal(B.compareVersions('1.1.10', '1.1.5'), 1);
    assert.equal(B.compareVersions('1.1.4', '1.1.5'), -1);
  });

  it('counts a missing part as zero', () => {
    assert.equal(B.compareVersions('1.2', '1.2.0'), 0);
  });
});

describe('eligible', () => {
  it('shows a notice below its version and hides it from there on', () => {
    const below = notice({ versions: { below: '1.1.5' } });
    assert.deepEqual(shownIds([below], { version: '1.1.4' }), ['n']);
    assert.deepEqual(shownIds([below], { version: '1.1.5' }), []);
  });

  it('hides a notice before its first version', () => {
    assert.deepEqual(shownIds([notice({ versions: { from: '1.1.5' } })], { version: '1.1.4' }), []);
  });

  it('hides a notice from the other browser family', () => {
    assert.deepEqual(shownIds([notice({ browsers: ['firefox'] })], { family: 'chrome' }), []);
  });

  it('shows a notice only in a language it is written in', () => {
    const italian = notice({ text: { it: { title: 'Titolo', body: 'Testo' } } });
    assert.deepEqual(shownIds([italian], { lang: 'en' }), []);
    const [shown] = B.eligible(B.parse(file(italian)), ctx({ lang: 'it' }));
    assert.equal(shown.title, 'Titolo');
    assert.equal(shown.body, 'Testo');
    assert.equal(shown.link, null);
  });

  it('hides a notice past its end', () => {
    assert.deepEqual(shownIds([notice({ until: '2026-10-19' })]), []);
  });

  it('hides a dismissed notice', () => {
    assert.deepEqual(shownIds([notice({ id: 'gone' })], { dismissed: ['gone'] }), []);
  });

  it('puts the most severe first, file order within a level', () => {
    const ids = shownIds([
      notice({ id: 'i1', level: 'info' }),
      notice({ id: 'a1', level: 'attention' }),
      notice({ id: 'w1', level: 'warning' }),
      notice({ id: 'i2', level: 'info' }),
    ]);
    assert.deepEqual(ids, ['w1', 'a1', 'i1', 'i2']);
  });
});

describe('badgeFor', () => {
  const shown = (...levels) => levels.map((level, i) => ({ id: String(i), level }));

  it('says nothing for no notice or only news', () => {
    assert.equal(B.badgeFor([]), null);
    assert.equal(B.badgeFor(shown('info')), null);
  });

  it('takes the most severe level', () => {
    assert.equal(B.badgeFor(shown('attention', 'info')), 'attention');
    assert.equal(B.badgeFor(shown('warning', 'attention')), 'warning');
  });
});

describe('refresh', () => {
  function memory(initial = {}) {
    const bag = { ...initial };
    return {
      bag,
      get: async keys => {
        const out = {};
        for (const key of [].concat(keys)) if (key in bag) out[key] = bag[key];
        return out;
      },
      set: async values => { Object.assign(bag, values); },
    };
  }
  const reply = (body, status = 200) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  const stale = NOW - B.CHECK_EVERY_MS - 1;

  it('does not ask again within the hour', async () => {
    const store = memory({ [B.CHECKED_KEY]: NOW - 1000 });
    let calls = 0;
    const fetched = await B.refresh({ ...store, now: () => NOW, fetch: async () => { calls += 1; return reply(file()); } });
    assert.equal(fetched, false);
    assert.equal(calls, 0);
  });

  it('notes the attempt before asking, then stores the file', async () => {
    const store = memory({ [B.CHECKED_KEY]: stale });
    let askedFor = null;
    let checkedWhenAsked = null;
    const fetched = await B.refresh({
      ...store,
      now: () => NOW,
      fetch: async url => {
        askedFor = url;
        checkedWhenAsked = store.bag[B.CHECKED_KEY];
        return reply(file(notice({ id: 'fresh' })));
      },
    });
    assert.equal(fetched, true);
    assert.equal(askedFor, B.FILE_URL);
    assert.equal(checkedWhenAsked, NOW);
    assert.deepEqual(store.bag[B.NOTICES_KEY].map(n => n.id), ['fresh']);
  });

  it('keeps the last notices when the site answers with a page instead of JSON', async () => {
    const kept = B.parse(file(notice({ id: 'kept' })));
    const store = memory({ [B.NOTICES_KEY]: kept });
    const fetched = await B.refresh({ ...store, now: () => NOW, fetch: async () => reply('<html>challenge</html>') });
    assert.equal(fetched, false);
    assert.deepEqual(store.bag[B.NOTICES_KEY], kept);
  });

  it('keeps the last notices on a failed status', async () => {
    const kept = B.parse(file(notice({ id: 'kept' })));
    const store = memory({ [B.NOTICES_KEY]: kept });
    const fetched = await B.refresh({ ...store, now: () => NOW, fetch: async () => reply(file(), 503) });
    assert.equal(fetched, false);
    assert.deepEqual(store.bag[B.NOTICES_KEY], kept);
  });

  it('keeps the last notices when the request fails, and still counts the attempt', async () => {
    const kept = B.parse(file(notice({ id: 'kept' })));
    const store = memory({ [B.NOTICES_KEY]: kept });
    const fetched = await B.refresh({ ...store, now: () => NOW, fetch: async () => { throw new TypeError('offline'); } });
    assert.equal(fetched, false);
    assert.deepEqual(store.bag[B.NOTICES_KEY], kept);
    assert.equal(store.bag[B.CHECKED_KEY], NOW);
  });

  it('forgets dismissed ids the file no longer holds', async () => {
    const store = memory({ [B.DISMISSED_KEY]: ['gone', 'kept'] });
    await B.refresh({ ...store, now: () => NOW, fetch: async () => reply(file(notice({ id: 'kept' }))) });
    assert.deepEqual(store.bag[B.DISMISSED_KEY], ['kept']);
  });

  // Firefox reports every key a set() names, changed or not, and the panel
  // redraws on each report: a warning would be announced again for nothing.
  it('writes nothing but the check time when the file has not changed', async () => {
    const same = B.parse(file(notice({ id: 'same' })));
    const store = memory({ [B.NOTICES_KEY]: same, [B.DISMISSED_KEY]: ['same'] });
    const written = [];
    const set = async values => { written.push(...Object.keys(values)); await store.set(values); };
    const fetched = await B.refresh({ ...store, set, now: () => NOW, fetch: async () => reply(file(notice({ id: 'same' }))) });
    assert.equal(fetched, false);
    assert.deepEqual(written, [B.CHECKED_KEY]);
  });

  it('keeps a notice closed while the file was on its way', async () => {
    const store = memory();
    await B.refresh({
      ...store,
      now: () => NOW,
      fetch: async () => {
        await store.set({ [B.DISMISSED_KEY]: ['closed'] });
        return reply(file(notice({ id: 'closed' })));
      },
    });
    assert.deepEqual(store.bag[B.DISMISSED_KEY], ['closed']);
  });

  it('asks once when two checks start together', async () => {
    const store = memory();
    let calls = 0;
    const deps = { ...store, now: () => NOW, fetch: async () => { calls += 1; return reply(file()); } };
    await Promise.all([B.refresh(deps), B.refresh(deps)]);
    assert.equal(calls, 1);
  });
});
