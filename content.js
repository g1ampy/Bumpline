// Bumpline — relist your Vinted items in one click.
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

(() => {
  'use strict';

  // Firefox answers to `browser` and only that namespace returns promises there;
  // Chrome answers to `chrome`. One alias, and the rest of the file is written
  // once for both.
  const ext = globalThis.browser ?? globalThis.chrome;

  // The words, in the seller's language. One letter because the file says it
  // 15 times.
  const T = (key, ...subs) => BumplineText.t(key, ...subs);

  // Every request is derived from the page we are on, which is what makes the
  // extension work unchanged across all of Vinted's country domains.
  const SITE = location.origin;

  const SELECTOR = {
    card: '[data-testid^="product-item-id-"]',
    bump: 'button[data-testid="bump-button"]',
    ourButton: '.bumpline-btn',
    // Every item gets two buttons, so counting ourButton counts items twice.
    ourItem: '.bumpline-btn:not(.bumpline-btn--draft)',
    gap: '.bumpline-gap',
  };

  const CLASS = {
    button: 'bumpline-btn',
    draftButton: 'bumpline-btn--draft',
    lockedButton: 'bumpline-btn--locked',
    gap: 'bumpline-gap',
    toast: 'bumpline-toast',
    banner: 'bumpline-banner',
    ageLine: 'bumpline-age',
  };

  // Two attempts, not five. Vinted rate-limits without saying so, and a refusal
  // that is really a rate limit is only made worse by asking again four more
  // times: the old ladder spent fifteen seconds pressing a server that had
  // already said no, which is the shape of traffic that gets an account read as
  // automated. What the extra retries were protecting against — a listing lost
  // between the delete and the publish — is covered instead by the copy held on
  // this device, retried on the next page load rather than in a tight loop.
  const PUBLISH_ATTEMPTS = 2;

  const STORE_PREFIX = 'bumpline:pending:';
  const LAST_PROFILE_KEY = 'bumpline:lastProfile';
  const RELOAD_KEY = 'bumpline:reloadAfterRelist';
  const PACE_KEY = 'bumpline:pace';
  const HARD_COOLDOWN_KEY = 'bumpline:hardCooldown';
  const LOCAL_DRAFTS_KEY = 'bumpline:localDrafts';
  const RELIST_LOG_KEY = 'bumpline:relistLog';
  const BLOCK_KEY = 'bumpline:blockedUntil';
  const REFUSAL_LOG_KEY = 'bumpline:refusalLog';
  const ENABLED_KEY = 'bumpline:enabled';
  const DB_NAME = 'bumpline';
  const DB_STORE = 'photos';

  // A relist is not one request. It is a read, one upload per photo, a draft, a
  // delete and a publish, and until now they went out with no gap between them
  // at all. The steps are spaced instead, and the spacing is random so that a
  // burst does not simply become a metronome.
  const PACE = {
    safe: { step: [900, 2400] },
    fast: { step: [250, 700] },
  };

  // Ten seconds from the end of one relist to the start of the next, on top of
  // the per-step spacing.
  const HARD_COOLDOWN_MS = 10000;

  // Relists counted over two rolling windows. The page reloads after every
  // relist, so the count cannot live in memory; it is kept on disk with its
  // timestamps, which is also what the hard cooldown reads.
  //
  // An hourly limit on its own has an obvious hole: three relists an hour, all
  // day, never trips it and is unmistakably a bulk operation. The day window
  // closes it. Neither number is Vinted's — Vinted publishes none — and both
  // are deliberately cautious guesses at where tidying a wardrobe stops looking
  // like tidying a wardrobe.
  const HOUR_WINDOW_MS = 60 * 60 * 1000;
  const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
  const HOUR_ALARM_AT = 4;
  const DAY_ALARM_AT = 15;

  // The log is kept for the longer of the two windows and each count is taken
  // from it, so there is one list to write and one to prune.
  const LOG_WINDOW_MS = DAY_WINDOW_MS;

  // What a refusal costs before anything may be sent again, doubling for each
  // further refusal inside a day. Vinted's own Retry-After wins when it asks
  // for longer.
  const BLOCK_BASE_MS = { 429: 15 * 60 * 1000, 403: 30 * 60 * 1000 };
  const BLOCK_CAP_MS = 6 * 60 * 60 * 1000;

  const trace = (...parts) => console.debug('[Bumpline]', ...parts);
  const pause = ms => new Promise(done => setTimeout(done, ms));

  const randomUuid = () =>
    (crypto.randomUUID && crypto.randomUUID()) ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
      return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });


  // ===========================================================================
  // Main-world fetch bridge
  //
  // The isolated world's fetch bypasses the instrumentation DataDome applies
  // to window.fetch in the page's main world. The bridge runs a thin proxy
  // in the main world so every Vinted API call carries the same tracking
  // headers a real user's requests carry.
  //
  // The main world is the page's own, so nothing crossing this channel is
  // private to the extension: any script on the page can read the requests and
  // the replies, and could answer one first. The random channel name keeps the
  // traffic clear of unrelated listeners; it is not a trust boundary. What
  // travels over it is what the page already holds — the CSRF token is read
  // out of its own markup — and the one irreversible step of a relist reads
  // the item back from Vinted before it runs.
  // ===========================================================================

  const BRIDGE_CH = randomUuid().replace(/-/g, '').slice(0, 16);
  let bridgeAlive = false;

  // Settled when the bridge answers, and also the moment it is known not to be
  // coming. A script tag that fails to load throws nothing an enclosing try can
  // catch, so without the onerror below every first call would sit out the
  // whole handshake window before falling back.
  let bridgeSettled = () => {};

  const bridgeReady = new Promise(resolve => {
    const want = 'bl:' + BRIDGE_CH + ':ok';
    const done = event => {
      if (event.source !== window || !event.data || event.data.t !== want) return;
      bridgeAlive = true;
      bridgeSettled();
    };
    const timer = setTimeout(() => bridgeSettled(), 4000);
    bridgeSettled = () => {
      clearTimeout(timer);
      window.removeEventListener('message', done);
      resolve();
    };
    window.addEventListener('message', done);
  });

  try {
    const bridgeScript = document.createElement('script');
    bridgeScript.src = ext.runtime.getURL('bridge.js');
    bridgeScript.dataset.ch = BRIDGE_CH;
    // A page whose CSP turns extension scripts away, or a package built
    // without bridge.js in it, arrives here and nowhere else.
    bridgeScript.onerror = () => {
      trace('bridge script did not load; using the isolated-world fetch');
      bridgeSettled();
    };
    (document.head || document.documentElement).appendChild(bridgeScript);
  } catch (err) {
    trace('bridge injection failed', err);
    bridgeSettled();
  }

  function wrapBridgeResponse(data) {
    const h = data.h || {};
    return {
      ok: data.s >= 200 && data.s < 300,
      status: data.s,
      headers: { get: name => h[name.toLowerCase()] || null },
      text: () => Promise.resolve(data.b || ''),
      // async, so a body that is not JSON rejects the promise the way a real
      // Response does, instead of throwing before a .catch can be attached.
      json: async () => JSON.parse(data.b || '{}'),
    };
  }

  function directFetch(url, options) {
    const { formFields, ...rest } = options;
    if (formFields) {
      const form = new FormData();
      for (const f of formFields) {
        if (f.blob) form.append(f.name, f.blob, f.filename || 'file');
        else form.append(f.name, f.value);
      }
      return fetch(url, { ...rest, body: form });
    }
    return fetch(url, rest);
  }

  // The methods whose repetition costs nothing. A write that has gone quiet
  // may still be in flight, and sending it a second time would open a second
  // draft, upload the same photo twice or publish a duplicate listing.
  const REPEATABLE = /^(?:GET|HEAD)$/i;

  async function bridgedFetch(url, options = {}) {
    await bridgeReady;
    if (!bridgeAlive) return directFetch(url, options);

    const RES = 'bl:' + BRIDGE_CH + ':r';
    const id = randomUuid();

    const msg = {
      t: 'bl:' + BRIDGE_CH + ':q',
      id,
      url,
      method: options.method,
      headers: options.headers,
      // An AbortSignal cannot be handed across, but everything else a caller
      // sets has to reach the bridge, or the two fetch paths would disagree.
      credentials: options.credentials,
    };

    const transfers = [];
    if (options.formFields) {
      msg.fields = [];
      for (const f of options.formFields) {
        if (f.blob) {
          const buffer = await f.blob.arrayBuffer();
          msg.fields.push({ name: f.name, buffer, filename: f.filename, type: f.blob.type });
          transfers.push(buffer);
        } else {
          msg.fields.push({ name: f.name, value: f.value });
        }
      }
    } else if (options.body !== undefined) {
      msg.body = options.body;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        const method = options.method || 'GET';
        if (REPEATABLE.test(method)) {
          trace('bridge timeout, falling back', method, url);
          directFetch(url, options).then(resolve, reject);
          return;
        }
        trace('bridge timeout on a write; not repeating it', method, url);
        reject(new Error('Vinted did not answer in time. Nothing was sent twice, so try again.'));
      }, 15000);

      function handler(event) {
        if (event.source !== window || !event.data) return;
        if (event.data.t !== RES || event.data.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        if (event.data.e) reject(new Error(event.data.e));
        else resolve(wrapBridgeResponse(event.data));
      }

      window.addEventListener('message', handler);
      window.postMessage(msg, location.origin, transfers);
    });
  }

  // ===========================================================================
  // Pacing and volume
  //
  // None of this disguises the extension. It asks less of Vinted: fewer
  // requests, spread out instead of fired in a burst, and a stop when a stretch
  // of relisting starts to look like a bulk operation rather than a person
  // tidying a wardrobe.
  // ===========================================================================

  const between = (low, high) => low + Math.floor(Math.random() * (high - low + 1));

  async function readSetting(key, fallback) {
    try {
      const bag = await ext.storage.local.get(key);
      return bag[key] === undefined ? fallback : bag[key];
    } catch (_) {
      return fallback;
    }
  }

  // Read at the start of every relist, so a change made in the popup takes
  // effect without reloading the page.
  async function paceProfile() {
    return PACE[await readSetting(PACE_KEY, 'safe')] || PACE.safe;
  }

  // One gap between two calls of the same relist.
  const step = profile => pause(between(profile.step[0], profile.step[1]));

  // Timestamps inside a window, with anything older dropped on the way out.
  // Used for the relists and, with a different key, for the refusals.
  async function timestampsIn(key, window) {
    const log = await readSetting(key, []);
    if (!Array.isArray(log)) return [];
    const cutoff = Date.now() - window;
    return log.filter(at => typeof at === 'number' && at > cutoff);
  }

  const relistLog = () => timestampsIn(RELIST_LOG_KEY, LOG_WINDOW_MS);

  const countWithin = (log, window) => {
    const cutoff = Date.now() - window;
    return log.filter(at => at > cutoff).length;
  };

  // Written the moment the original is deleted: that is the irreversible half
  // of a relist, and the half Vinted counts.
  async function noteRelist() {
    const log = await relistLog();
    log.push(Date.now());
    try {
      await ext.storage.local.set({ [RELIST_LOG_KEY]: log });
    } catch (err) {
      trace('could not record the relist time', err);
    }
  }

  // Milliseconds still owed on the hard cooldown; 0 when it is spent, and 0
  // when it has been switched off.
  async function cooldownLeft() {
    if ((await readSetting(HARD_COOLDOWN_KEY, true)) === false) return 0;
    const log = await relistLog();
    if (!log.length) return 0;
    const since = Date.now() - Math.max(...log);
    return since >= HARD_COOLDOWN_MS ? 0 : HARD_COOLDOWN_MS - since;
  }

  // ===========================================================================
  // Refusals
  //
  // A 429, or a 403 carrying a bot challenge, is Vinted saying stop. Nothing
  // acted on that before: the button came back enabled, the obvious thing to do
  // was press it again, and that is how a rate limit that would have passed in
  // fifteen minutes turns into a day-long block on the account. The refusal is
  // written down instead. Every open tab goes quiet, the pending retries hold
  // off, and everything comes back on its own when the wait is over.
  // ===========================================================================

  // The markers a challenge page carries. explainFailure already looked for
  // these to word its message; now they decide whether to stop as well.
  const CHALLENGE = /captcha-delivery|__cf_chl|cf_chl|datadome/i;

  // 401 is not here on purpose: a logged-out session is fixed by logging in,
  // and locking the buttons for half an hour would only be in the way. Nor is a
  // plain 403, which Vinted also uses for "not your item".
  function refusalKind(status, body) {
    if (status === 429) return 429;
    if (status === 403 && CHALLENGE.test(body || '')) return 403;
    return 0;
  }

  // Both spellings are legal: a number of seconds, or an HTTP date.
  function retryAfterMs(reply) {
    let raw = null;
    try {
      raw = reply && reply.headers && reply.headers.get('retry-after');
    } catch (_) {
      return 0;
    }
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const at = Date.parse(raw);
    return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0;
  }

  // The stored pause, or null once it has run out. Read from storage rather
  // than from the cached copy, because another tab may have set it a second ago.
  async function readBlock() {
    const record = await readSetting(BLOCK_KEY, null);
    if (!record || typeof record !== 'object') return null;
    return record.until > Date.now() ? record : null;
  }

  // Called with every refused reply from Vinted. Most are ordinary failures and
  // it does nothing at all; the two that mean stop set the pause.
  async function noteRefusal(reply, body) {
    const kind = refusalKind(reply && reply.status, body);
    if (!kind) return;

    const strikes = await timestampsIn(REFUSAL_LOG_KEY, DAY_WINDOW_MS);
    // Each further refusal in the same day doubles the wait. Four doublings is
    // as far as it goes, and the cap is the last word either way.
    const escalated = BLOCK_BASE_MS[kind] * 2 ** Math.min(strikes.length, 4);
    const wait = Math.min(Math.max(retryAfterMs(reply), escalated), BLOCK_CAP_MS);

    strikes.push(Date.now());
    const record = {
      until: Date.now() + wait,
      status: kind,
      why:
        kind === 429
          ? 'Vinted answered "too many requests".'
          : 'Vinted answered with a bot challenge.',
    };

    try {
      await ext.storage.local.set({ [BLOCK_KEY]: record, [REFUSAL_LOG_KEY]: strikes });
    } catch (err) {
      trace('could not record the refusal', err);
    }
    // storage.onChanged reaches the other tabs; this one is done here and now.
    applyLock(record);
  }

  // ===========================================================================
  // The restriction Vinted states outright
  //
  // A refusal is only learned by being refused: the account is already limited
  // and the extension finds out by walking into it. But a restricted account
  // carries the fact in the profile payload, next to the ban fields, and the
  // page says it in a banner of its own. Reading it costs no request and it is
  // the only way the buttons can be off before anything is asked of Vinted.
  // ===========================================================================

  // Any restriction with an expiry ahead of us counts. The action code is
  // Vinted's, undocumented, and only one value has been seen in the wild, so
  // the date is what the decision rests on. The payload is JSON inside the
  // markup, so the quotes may arrive escaped, as with the CSRF token.
  const RESTRICTION_PATTERN =
    /\\?"action_restriction\\?"\s*:\s*\{[^{}]*?\\?"expiration_date\\?"\s*:\s*\\?"(\d{4}-\d{2}-\d{2})\\?"/;

  function restrictionFromMarkup(markup) {
    const hit = String(markup || '').match(RESTRICTION_PATTERN);
    if (!hit) return null;
    // A date with no clock on it. Vinted lifts the restriction at some point
    // during that day, and the end of it is the reading that never turns the
    // buttons back on early.
    const until = Date.parse(`${hit[1]}T23:59:59`);
    return Number.isFinite(until) && until > Date.now() ? until : null;
  }

  let restrictionReadAt = 0;

  // The wardrobe is read for a restriction and the stored record is made to
  // agree with it, in both directions. Only ever writing the restriction, as
  // this did until 1.0.1, leaves a record that nothing can clear: Vinted lifts
  // a restriction whenever it likes, the date it published was only the latest
  // that restriction would have run to, and the card that shows it offers no
  // way to lift what Vinted itself imposed. The buttons stayed off until a
  // date that had stopped meaning anything.
  async function noteRestriction() {
    // Vinted draws its bump buttons on nobody's wardrobe but your own, which
    // is both what makes the payload yours to read and what makes there be
    // buttons worth turning off.
    if (!document.querySelector(SELECTOR.bump)) return;

    // The markup of a wardrobe runs past a megabyte and this is reached from
    // attachButtons, which answers every mutation of the page. The payload is
    // written once, with the page, so reading it on a leash loses nothing.
    if (Date.now() - restrictionReadAt < 10000) return;
    restrictionReadAt = Date.now();

    const until = restrictionFromMarkup(
      document.documentElement && document.documentElement.innerHTML,
    );
    // Storage rather than a remembered copy, so a record cleared from the popup
    // or by another tab is seen here. The cache this used to keep is what made
    // a cleared restriction unwritable until the page was reloaded.
    const standing = await readBlock();

    // A wardrobe that draws bump buttons and states no restriction is a
    // wardrobe that is not restricted. Anything written from an earlier read is
    // out of date, and out of date here means locked out.
    if (!until) {
      // Only Vinted's own restriction is cleared. A pause the extension set
      // itself after a refusal is its own cooldown and has to run out on its
      // own, or a refused account would go straight back to asking.
      if (!standing || standing.source !== 'vinted') return;
      try {
        await ext.storage.local.remove(BLOCK_KEY);
      } catch (err) {
        trace('could not clear the restriction', err);
        return;
      }
      applyLock(null);
      return;
    }

    // Already recorded, to the millisecond, from the same source. This is the
    // common case — once every ten seconds for as long as the page is open —
    // and it is what keeps the read above from turning into a write.
    if (standing && standing.source === 'vinted' && standing.until === until) return;

    // A refusal already standing for longer is the stricter of the two, and the
    // strictest is the one that should hold. An earlier reading of Vinted's own
    // restriction is not a second opinion, though — it is this same statement,
    // out of date — so a new one replaces it whether the date it carries is
    // later or earlier.
    if (standing && standing.source !== 'vinted' && standing.until >= until) return;

    const record = {
      until,
      source: 'vinted',
      why: 'Vinted has restricted this account from listing or editing items.',
    };

    try {
      await ext.storage.local.set({ [BLOCK_KEY]: record });
    } catch (err) {
      trace('could not record the restriction', err);
    }
    applyLock(record);
  }

  // ===========================================================================
  // Switched off
  //
  // The switch in the toolbar stops the extension without uninstalling it: no
  // buttons are drawn, no unfinished relist is retried, and nothing at all is
  // sent to Vinted. It is the one setting that has to reach every open tab the
  // moment it changes, so it is read before the first button is drawn and
  // watched for the rest of the session.
  // ===========================================================================

  // null until storage answers. Nothing is drawn on a maybe: a button that
  // appears and is taken away again reads as the extension breaking.
  let enabled = null;

  async function readEnabled() {
    try {
      const bag = await ext.storage.local.get(ENABLED_KEY);
      return bag[ENABLED_KEY] !== false;
    } catch (_) {
      // Unreadable storage is not a switched-off extension. Absent means on,
      // and so does broken.
      return true;
    }
  }

  // Everything this extension put on the page, taken back off it. A relist
  // already under way keeps its own button: the copy is mid-flight, and the
  // label on that button is the only progress the seller can see.
  function removeOurUi() {
    const ours = `${SELECTOR.ourButton}, .${CLASS.gap}, .${CLASS.ageLine}, ` +
      `.${CLASS.banner}, .${CLASS.toast}`;
    for (const node of document.querySelectorAll(ours)) {
      if (node.classList.contains('is-busy')) continue;
      node.remove();
    }
  }

  function applyEnabled(on) {
    if (enabled === on) return;
    enabled = on;
    if (on) attachButtons();
    else removeOurUi();
  }

  // ===========================================================================
  // Showing the pause
  // ===========================================================================

  let lockedUntil = 0;
  let unlockTimer = null;

  const clockOf = at =>
    new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // The one place lockedUntil changes. Also arms the timer that lifts the pause
  // without the page having to be reloaded.
  function applyLock(record) {
    const until = (record && record.until) || 0;
    lockedUntil = until > Date.now() ? until : 0;

    clearTimeout(unlockTimer);
    unlockTimer = null;
    if (lockedUntil) {
      unlockTimer = setTimeout(() => applyLock(null), lockedUntil - Date.now() + 250);
    }
    paintLock();
  }

  // Idempotent, and called after every mutation, so buttons drawn while the
  // pause is on are born disabled.
  function paintLock() {
    // Switched off there is nothing of ours on the page to grey out, and the
    // note would be the only thing left of an extension that is not running.
    if (enabled !== true) return;

    for (const button of document.querySelectorAll(SELECTOR.ourButton)) {
      // A relist already under way owns its own button; leave it alone.
      if (button.classList.contains('is-busy')) continue;
      button.disabled = !!lockedUntil;
      // disabled alone stops the click, but the button borrows Vinted's own
      // markup and goes on looking pressable, which reads as the extension
      // having broken rather than having stopped on purpose.
      button.classList.toggle(CLASS.lockedButton, !!lockedUntil);
    }
  }

  // ===========================================================================
  // Credentials
  //
  // Vinted rejects any write that arrives without its CSRF token, and pairs it
  // with an anonymous id. Three places can supply the token; they are tried in
  // order of cost.
  // ===========================================================================

  // The token travels inside a JSON-encoded Next.js payload, so in the served
  // markup its quotes arrive backslash-escaped. Both forms are accepted.
  const TOKEN_PATTERN = /\\?"CSRF_TOKEN\\?"\s*:\s*\\?"([^"\\]+)\\?"/;

  function tokenFromMarkup(markup) {
    const hit = String(markup || '').match(TOKEN_PATTERN);
    return hit ? hit[1] : null;
  }

  function readCookie(wanted) {
    let found = null;
    for (const chunk of (document.cookie || '').split(';')) {
      const at = chunk.indexOf('=');
      if (at < 1) continue;
      const key = decodeURIComponent(chunk.slice(0, at).trim());
      // Later duplicates win, matching how the browser resolves them.
      if (key === wanted) found = decodeURIComponent(chunk.slice(at + 1));
    }
    return found;
  }

  // Asked as a promise, not with a callback: Firefox only offers the promise
  // shape, and Chrome has offered both since MV3. A worker that is gone, or one
  // that never answers, is not an error worth propagating — the page can still
  // read the token out of the markup — so every failure collapses to an empty
  // reply.
  function askWorker(message) {
    return Promise.resolve()
      .then(() => ext.runtime.sendMessage(message))
      .then(reply => reply || {})
      .catch(err => {
        trace('worker unreachable', err);
        return {};
      });
  }

  const workerTokens = () => askWorker({ type: 'bumpline:tokens' });

  async function anonymousId() {
    const fromCookie = readCookie('anon_id');
    if (fromCookie) return fromCookie;
    const fromWorker = await workerTokens();
    return (fromWorker && fromWorker.anonId) || null;
  }

  async function csrfToken() {
    const inPage = tokenFromMarkup(document.documentElement && document.documentElement.innerHTML);
    if (inPage) return inPage;

    const observed = await workerTokens();
    if (observed && observed.csrf) return observed.csrf;

    const page = await bridgedFetch(`${SITE}/items/new`, { credentials: 'include' });
    const captured = tokenFromMarkup(await page.text());
    if (!captured) {
      throw new Error('Could not read the Vinted security token. Reload the page and try again.');
    }
    return captured;
  }

  // ===========================================================================
  // Vinted API
  // ===========================================================================

  // The header set Vinted's own upload form sends on every write.
  async function writeHeaders(csrf, extra) {
    const anon = await anonymousId();
    return {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'x-csrf-token': csrf,
      'x-enable-multiple-size-groups': 'true',
      'X-Enable-Dynamic-Attribute-Condition': 'true',
      'X-Enable-Dynamic-Attribute-Video-Game-Rating': 'true',
      'X-Enable-Dynamic-Attribute-Size': 'true',
      ...(anon ? { 'x-anon-id': anon } : {}),
      origin: location.origin,
      referer: location.href,
      ...(extra || {}),
    };
  }

  async function readHeaders(csrf) {
    const anon = await anonymousId();
    return {
      accept: 'application/json, text/plain, */*',
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
      'x-enable-multiple-size-groups': 'true',
      ...(anon ? { 'x-anon-id': anon } : {}),
    };
  }

  // Turn a failed response body into something worth showing a person.
  function explainFailure(status, body) {
    if (status === 403 && /captcha-delivery|__cf_chl|cf_chl|datadome/i.test(body || '')) {
      return 'Vinted blocked the request as automated traffic. Log out, log back in, then retry.';
    }
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed.errors) && parsed.errors.length) {
        return parsed.errors.map(e => `${e.field}: ${e.value}`).join('; ');
      }
      if (parsed.message) return parsed.message;
    } catch (_) {
      // not JSON; fall through
    }
    return `${status} ${String(body).slice(0, 200)}`;
  }

  // The editor endpoint is the only one that still returns an item in a shape
  // that can be copied. The public /api/v2/items/<id> route answers 404 with an
  // HTML body and is of no use here.
  async function loadEditableItem(itemId, csrf) {
    const reply = await bridgedFetch(`${SITE}/api/v2/item_upload/items/${itemId}`, {
      credentials: 'include',
      headers: await readHeaders(csrf),
    });
    if (!reply.ok) {
      const body = await reply.text();
      await noteRefusal(reply, body);
      if (reply.status === 404) {
        throw new Error(`Item ${itemId} cannot be edited: it is sold, reserved or already gone.`);
      }
      throw new Error(explainFailure(reply.status, body));
    }
    const parsed = await reply.json();
    return parsed.item || parsed || {};
  }

  // Confirms an item is reachable and that the session is not behind a
  // challenge. Used as the last check before anything destructive.
  async function assertItemReachable(itemId, csrf) {
    const item = await loadEditableItem(itemId, csrf);
    if (!item || !item.id) throw new Error(`Item ${itemId} returned no data.`);
    return item;
  }

  async function loadSizeGroups(catalogId, csrf) {
    const url = `${SITE}/api/v2/item_upload/size_groups?catalog_ids[]=${encodeURIComponent(catalogId)}`;
    const reply = await bridgedFetch(url, { credentials: 'include', headers: await readHeaders(csrf) });
    if (!reply.ok) {
      await noteRefusal(reply, await reply.text().catch(() => ''));
      throw new Error(`Size lookup failed with HTTP ${reply.status}`);
    }
    const parsed = await reply.json();
    return parsed.size_groups || [];
  }

  async function sendPhoto(csrf, blob, sessionId) {
    const anon = await anonymousId();
    const reply = await bridgedFetch(`${SITE}/api/v2/photos`, {
      method: 'POST',
      credentials: 'include',
      formFields: [
        { name: 'photo[type]', value: 'item' },
        { name: 'photo[temp_uuid]', value: sessionId },
        { name: 'photo[file]', blob, filename: 'photo.jpg' },
      ],
      headers: {
        'x-csrf-token': csrf,
        'x-enable-multiple-size-groups': 'true',
        ...(anon ? { 'x-anon-id': anon } : {}),
      },
    });
    if (!reply.ok) {
      await noteRefusal(reply, await reply.text().catch(() => ''));
      throw new Error(`Photo upload failed with HTTP ${reply.status}`);
    }
    return reply.json();
  }

  // A draft is private and is not a listing, so it does not collide with the
  // original while that is still online.
  async function openDraft(csrf, item, sessionId) {
    const reply = await bridgedFetch(`${SITE}/api/v2/item_upload/drafts`, {
      method: 'POST',
      credentials: 'include',
      headers: await writeHeaders(csrf),
      body: JSON.stringify({ draft: item, parcel: null, upload_session_id: sessionId }),
    });
    const body = await reply.text();
    if (!reply.ok) {
      await noteRefusal(reply, body);
      const failure = new Error(`Could not save the draft: ${explainFailure(reply.status, body)}`);
      failure.status = reply.status;
      throw failure;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch (_) {
      // handled below
    }
    const draft = parsed && (parsed.draft || parsed.item || parsed);
    if (!draft || !draft.id) throw new Error('Vinted accepted the draft but returned no id.');
    return draft;
  }

  // The two endpoints name the photos differently, and the wrong name is not
  // ignored: `assigned_photos` is what creates a draft, `photos` is what
  // completes one. Measured against a scratch draft, the creation spelling drew
  // `photos: Error uploading photo` every time and this one drew nothing.
  function forCompletion(item, draftId) {
    const { assigned_photos: attached, ...rest } = item;
    return {
      ...rest,
      id: draftId,
      photos: (attached || []).map(photo => ({ id: photo.id, orientation: photo.orientation || 0 })),
    };
  }

  // Completion validates the draft in the request body, not the one already
  // stored, and the object POST /drafts answers with is a stub: an id and
  // nothing else, 62 bytes of it. Echoing that back made Vinted refuse the
  // publish with every required field reported empty — title, category, price,
  // size, brand — while the same draft published by hand from Vinted's own
  // form. Nor can the draft be read back to check: GET /item_upload/drafts/<id>
  // is a 404. So the payload that built the draft is the only full copy there
  // is, and it goes out again wearing the id the draft was given.
  async function publishDraft(csrf, draft, sessionId, item) {
    const full = item ? forCompletion(item, draft.id) : draft;

    const reply = await bridgedFetch(`${SITE}/api/v2/item_upload/drafts/${draft.id}/completion`, {
      method: 'POST',
      credentials: 'include',
      headers: await writeHeaders(csrf),
      body: JSON.stringify({
        draft: full,
        push_up: false,
        parcel: null,
        upload_session_id: sessionId,
      }),
    });
    const body = await reply.text();
    if (!reply.ok) {
      await noteRefusal(reply, body);
      const failure = new Error(`Could not publish the draft: ${explainFailure(reply.status, body)}`);
      failure.status = reply.status;
      // Field names only, never values: enough to see which shape was sent
      // when a refusal has to be reported, and nothing of the listing itself.
      failure.sentKeys = Object.keys(full);
      throw failure;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch (_) {
      // handled by the caller
    }
    return (parsed && (parsed.item || parsed.draft || parsed)) || {};
  }

  async function discardDraft(csrf, draftId) {
    try {
      await bridgedFetch(`${SITE}/api/v2/item_upload/drafts/${draftId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: await writeHeaders(csrf),
      });
    } catch (err) {
      trace('could not discard draft', draftId, err);
    }
  }

  async function removeListing(csrf, itemId) {
    const anon = await anonymousId();
    const reply = await bridgedFetch(`${SITE}/api/v2/items/${itemId}/delete`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*',
        'x-csrf-token': csrf,
        ...(anon ? { 'x-anon-id': anon } : {}),
      },
    });
    if (!reply.ok) {
      const body = await reply.text().catch(() => '');
      await noteRefusal(reply, body);
      throw new Error(`Could not delete the original: ${explainFailure(reply.status, body)}`);
    }
    try {
      return await reply.json();
    } catch (_) {
      return { ok: true };
    }
  }

  // ===========================================================================
  // Photos
  // ===========================================================================

  function photoUrlsOf(item) {
    const urls = [];
    for (const photo of item.photos || []) {
      const url =
        photo.full_size_url ||
        photo.url ||
        (photo.thumbnails && photo.thumbnails[0] && photo.thumbnails[0].url);
      if (url) urls.push(url);
    }
    return urls;
  }

  // The CDN serves images publicly, but a cross-origin read from the page can
  // still be refused; the service worker has host permissions and can fetch the
  // bytes when that happens.
  async function grabPhoto(url) {
    try {
      const direct = await fetch(url, { credentials: 'omit', mode: 'cors' });
      if (direct.ok) return direct.blob();
    } catch (_) {
      // fall through to the worker
    }

    const relayed = await askWorker({ type: 'bumpline:fetchBinary', url });
    if (!relayed || !relayed.ok || !relayed.buffer) {
      const why = (relayed && (relayed.status || relayed.error)) || 'no response';
      throw new Error(`Could not download a photo (${why})`);
    }
    return new Blob([relayed.buffer], { type: relayed.contentType || 'image/jpeg' });
  }

  // ===========================================================================
  // Styling and page furniture
  // ===========================================================================

  const STYLE_ID = 'bumpline-style';

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const sheet = document.createElement('style');
    sheet.id = STYLE_ID;
    sheet.textContent = `
      .${CLASS.button} { display: block !important; margin-top: 8px !important; }
      .${CLASS.button}.is-busy { opacity: .6; pointer-events: none; }

      /* The pause. Drained of colour and dimmed, so the button says it is not
         to be pressed before anyone presses it. The note at the bottom left
         says until when. */
      .${CLASS.button}.${CLASS.lockedButton} {
        opacity: .45;
        filter: grayscale(1);
        cursor: not-allowed;
      }
      .${CLASS.draftButton} { margin-top: 6px !important; }

      /* The three things this extension puts on the page — a toast, the pause,
         a stuck relist — are one card in three places. Their colours are fixed
         rather than following the page: a card with its own background reads on
         a light Vinted and on a dark one. */
      .bumpline-card {
        /* The toolbar popup's own tokens, value for value — shadcn preset
           b1tepwVzU, style base-luma, on the logo's hue — so the two halves of
           the extension are one thing. They are declared on the card rather
           than on :root: Vinted has its own custom properties and this must not
           reach them. The 26px corner is base-luma's rounded-4xl, the same one
           the popup's cards use. */
        --bl-card: oklch(1 0 0);
        --bl-ink: oklch(0.21 0.022 213);
        --bl-muted-ink: oklch(0.545 0.032 210);
        --bl-destructive: oklch(0.54 0.225 25);
        --bl-success: oklch(0.53 0.155 148);
        --bl-ring: oklch(0.21 0.022 213 / 5%);

        position: fixed;
        z-index: 2147483647;
        box-sizing: border-box;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        max-width: 320px;
        padding: 14px 16px;
        border-radius: 26px;
        background: var(--bl-card);
        color: var(--bl-ink);
        box-shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1),
                    0 0 0 1px var(--bl-ring);
        font: 14px/1.4285 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
              Helvetica, Arial, sans-serif;
        animation: bumpline-card-in 180ms cubic-bezier(.16,1,.3,1);
      }

      /* Vinted follows the system theme and so does the popup, so this does
         too rather than sitting on the page as a white slab. */
      @media (prefers-color-scheme: dark) {
        .bumpline-card {
          --bl-card: oklch(0.225 0.018 215);
          --bl-ink: oklch(0.97 0.007 203);
          --bl-muted-ink: oklch(0.72 0.026 210);
          --bl-destructive: oklch(0.71 0.185 25);
          --bl-success: oklch(0.75 0.155 148);
          --bl-ring: oklch(1 0 0 / 10%);
        }
      }
      .bumpline-card[data-leaving] {
        animation: bumpline-card-out 180ms ease forwards;
      }
      .bumpline-card__icon {
        flex: none;
        width: 16px;
        height: 16px;
        margin-top: 1px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .bumpline-card__body { min-width: 0; }
      .bumpline-card--ok  .bumpline-card__icon { color: var(--bl-success); }
      .bumpline-card--bad .bumpline-card__icon { color: var(--bl-destructive); }

      @keyframes bumpline-card-in {
        from { opacity: 0; transform: translateY(8px) scale(.98); }
      }
      @keyframes bumpline-card-out {
        to { opacity: 0; transform: translateY(4px); }
      }
      @media (prefers-reduced-motion: reduce) {
        .bumpline-card { animation: none; }
        .bumpline-card[data-leaving] { opacity: 0; animation: none; }
      }

      /* Two corners, so neither can cover the other. */
      .${CLASS.toast}  { right: 16px; bottom: 16px; font-weight: 500; }
      .${CLASS.banner} { right: 16px; top: 16px; max-width: 340px; }
      .bumpline-card__why {
        margin-top: 8px;
        font-size: 13px;
        overflow-wrap: anywhere;
        color: var(--bl-muted-ink);
      }
      .bumpline-banner__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .bumpline-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,.45);
      }
      .bumpline-modal__panel {
        width: min(420px, 90vw);
        padding: 20px;
        border-radius: 10px;
        background: #fff;
        color: #111;
        font-size: 14px;
        line-height: 1.4;
        box-shadow: 0 8px 32px rgba(0,0,0,.3);
      }
      .bumpline-modal__title { margin-bottom: 8px; font-size: 16px; font-weight: 700; }
      .bumpline-modal__body { margin-bottom: 14px; }
      .bumpline-modal__picker {
        width: 100%;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 6px;
        background: #fff;
        color: #111;
        font-size: 14px;
      }
      .bumpline-modal__actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 16px;
      }
    `;
    document.head.appendChild(sheet);
  }

  // Borrows Vinted's own button markup so the additions do not look bolted on.
  function buildButton(label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      'web_ui__Button__button web_ui__Button__outlined web_ui__Button__small ' +
      'web_ui__Button__primary web_ui__Button__truncated';

    const content = document.createElement('span');
    content.className = 'web_ui__Button__content';
    const text = document.createElement('span');
    text.className = 'web_ui__Button__label';
    text.textContent = label;

    content.appendChild(text);
    button.appendChild(content);
    return button;
  }

  function setButtonLabel(button, label) {
    const text = button.querySelector('.web_ui__Button__label');
    if (text) text.textContent = label;
    else button.textContent = label;
  }

  const TOAST_ID = 'bumpline-toast';

  // Lucide check, triangle-alert and circle-pause. The tone is in the glyph as
  // well as in the colour, so a card survives a greyscale screen.
  const CARD_GLYPH = {
    ok: ['M20 6 9 17l-5-5'],
    bad: [
      'M12 9v4',
      'M12 17h.01',
      'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
    ],
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Empties a card, gives it its icon, and hands back the body to fill. One
  // builder, so the three cards cannot drift apart.
  function paintCard(node, place, tone, glyph) {
    node.className = `bumpline-card bumpline-card--${tone} ${place}`;
    node.textContent = '';

    const icon = document.createElementNS(SVG_NS, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('class', 'bumpline-card__icon');
    for (const d of glyph) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      icon.appendChild(path);
    }

    const body = document.createElement('div');
    body.className = 'bumpline-card__body';
    node.append(icon, body);
    return body;
  }

  // A confirmation is read in a glance; a refusal takes longer and is worth
  // reading twice, and gets the same ten seconds the pause gets.
  const TOAST_MS = { ok: 4000, bad: 10000 };

  // Everything the extension puts in a corner fades the same way, and takes the
  // same fifth of a second to do it.
  const FADE_MS = 200;

  function fadeOut(node) {
    node.setAttribute('data-leaving', '');
    setTimeout(() => node.remove(), FADE_MS);
  }

  function toast(message, kind = 'ok') {
    const tone = kind === 'bad' ? 'bad' : 'ok';

    let node = document.getElementById(TOAST_ID);
    if (!node) {
      node = document.createElement('div');
      node.id = TOAST_ID;
      document.body.appendChild(node);
    }

    node.removeAttribute('data-leaving');
    node.setAttribute('role', 'alert');
    node.setAttribute('aria-live', tone === 'bad' ? 'assertive' : 'polite');
    paintCard(node, CLASS.toast, tone, CARD_GLYPH[tone]).textContent = message;

    // Everything goes away on its own now, refusals included. A toast is the
    // one thing on the page with no way to be dismissed by hand, and a refusal
    // worth acting on is on the banner and in the toolbar popup as well — the
    // toast was only ever the first place it was said.
    clearTimeout(Number(node.dataset.timer));
    node.dataset.timer = String(setTimeout(() => fadeOut(node), TOAST_MS[tone]));
  }

  // ===========================================================================
  // Reading the page
  // ===========================================================================

  const ID_IN_TESTID = /^product-item-id-(\d+)/;

  function itemIdFor(node) {
    for (let cursor = node; cursor && cursor !== document.body; cursor = cursor.parentElement) {
      const testid = cursor.getAttribute && cursor.getAttribute('data-testid');
      const hit = testid && testid.match(ID_IN_TESTID);
      if (hit) return hit[1];
    }
    const card = node.closest && node.closest(SELECTOR.card);
    if (card) {
      const hit = (card.getAttribute('data-testid') || '').match(ID_IN_TESTID);
      if (hit) return hit[1];
    }
    return null;
  }

  function itemIdsOnScreen() {
    const ids = [];
    for (const card of document.querySelectorAll(SELECTOR.card)) {
      const hit = (card.getAttribute('data-testid') || '').match(ID_IN_TESTID);
      if (hit) ids.push(hit[1]);
    }
    return ids;
  }

  function descriptionSlotFor(id) {
    return (
      document.querySelector(`[data-testid="product-item-id-${id}--description--content"]`) ||
      document.querySelector(`[data-testid="product-item-id-${id}--description"] .web_ui__Cell__body`)
    );
  }

  function currentMemberId() {
    const fromPath = (location.pathname || '').match(/\/member\/(\d+)/);
    if (fromPath) return fromPath[1];
    const fromCookie = readCookie('v_uid');
    return /^\d+$/.test(fromCookie || '') ? fromCookie : null;
  }

  // ===========================================================================
  // Wardrobe index
  //
  // One paged call gives the metadata the page itself does not render: whether
  // an item is still editable, and when it was first put online.
  // ===========================================================================

  const itemIndex = new Map();
  const ageLabels = new Map();
  // busy is what keeps the two readers below off each other. Both are fired,
  // unawaited, by every run of attachButtons, and attachButtons runs on every
  // mutation of the page — so while the first page is in the air, lastPage is
  // still 0 and totalPages still null, and each mutation that lands in that
  // window used to start another reader that asked for lastPage + 1: page one,
  // again. A wardrobe of eighteen items drew up to nine identical requests in
  // three seconds, which is the burst of traffic this extension exists to
  // avoid making.
  const pager = { started: false, busy: false, lastPage: 0, totalPages: null };

  // Vinted does not expose a creation date, but the oldest photo carries an
  // upload timestamp, which is the same moment in practice.
  function ageOf(item) {
    let oldest = null;
    for (const photo of (item && item.photos) || []) {
      const raw = photo && photo.high_resolution && photo.high_resolution.timestamp;
      if (raw == null) continue;
      const seconds = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
      if (Number.isNaN(seconds)) continue;
      oldest = oldest == null ? seconds : Math.min(oldest, seconds);
    }
    if (oldest == null) return null;

    // Compare calendar days rather than elapsed hours, so something posted last
    // night reads as one day old rather than zero.
    const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const created = new Date(oldest * 1000);
    const days = Math.max(0, Math.round((startOfDay(new Date()) - startOfDay(created)) / 86400000));
    return days;
  }

  const ageLabel = days => (days <= 0 ? 'Created today' : `Created ${days} days ago`);

  async function loadWardrobePage(page) {
    const member = currentMemberId();
    if (!member) return null;

    let csrf = null;
    try {
      csrf = await csrfToken();
    } catch (_) {
      // The listing endpoint tolerates a missing token.
    }
    const anon = await anonymousId();
    const query = new URLSearchParams({ page: String(page), per_page: '20', order: 'relevance' });

    try {
      const reply = await bridgedFetch(`${SITE}/api/v2/wardrobe/${member}/items?${query}`, {
        credentials: 'include',
        headers: {
          accept: 'application/json, text/plain, */*',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
          ...(anon ? { 'x-anon-id': anon } : {}),
          referer: location.href,
        },
      });
      // The one call that runs on every page load, and so the only chance the
      // extension has of hearing a rate limit before a seller presses
      // anything. It used to be thrown away.
      if (!reply.ok) {
        await noteRefusal(reply, await reply.text().catch(() => ''));
        return null;
      }

      const parsed = await reply.json().catch(() => null);
      if (!parsed) return null;

      if (parsed.pagination && parsed.pagination.total_pages) {
        pager.totalPages = parsed.pagination.total_pages;
      }
      const items = parsed.items || [];
      for (const item of items) {
        if (!item || !item.id) continue;
        const key = String(item.id);
        itemIndex.set(key, item);
        const days = ageOf(item);
        if (days != null) ageLabels.set(key, ageLabel(days));
      }
      return items;
    } catch (err) {
      trace('wardrobe page failed', page, err);
      return null;
    }
  }

  async function indexFirstPage() {
    if (pager.started) return;
    pager.started = true;
    // Claimed before the first await, so a reader starting in the same tick
    // sees it.
    pager.busy = true;
    try {
      const items = await loadWardrobePage(1);
      if (!items) return;
      pager.lastPage = 1;
      paintAgeLabels();
      dropButtonsOnClosedItems();
    } finally {
      pager.busy = false;
    }
  }

  // Infinite scroll reveals cards the first page never covered, so keep pulling
  // pages until the visible ids are all accounted for.
  async function indexRemainingPages() {
    // A page is already being read. Whatever it brings back changes both the
    // answers below, so there is nothing to decide until it lands.
    if (pager.busy) return;

    const missing = itemIdsOnScreen().filter(id => !itemIndex.has(id));
    if (!missing.length) return;
    if (pager.totalPages !== null && pager.lastPage >= pager.totalPages) return;

    let page = pager.lastPage + 1;
    let budget = 10;

    pager.busy = true;
    try {
      while (budget-- > 0 && missing.some(id => !itemIndex.has(id))) {
        if (pager.totalPages !== null && page > pager.totalPages) break;
        const items = await loadWardrobePage(page);
        if (!items || !items.length) break;
        pager.lastPage = page;
        page += 1;
        await pause(100); // stay polite with the API
      }
    } finally {
      pager.busy = false;
    }

    paintAgeLabels();
    dropButtonsOnClosedItems();
  }

  function paintAgeLabels() {
    for (const [id, label] of ageLabels) {
      const slot = descriptionSlotFor(id);
      if (!slot || slot.querySelector(`.${CLASS.ageLine}`)) continue;
      const line = document.createElement('div');
      line.className = `new-item-box__description ${CLASS.ageLine}`;
      const text = document.createElement('p');
      text.className =
        'web_ui__Text__text web_ui__Text__caption web_ui__Text__left web_ui__Text__truncated';
      text.textContent = label;
      line.appendChild(text);
      slot.appendChild(line);
    }
  }

  // Sold, reserved and otherwise closed items have no editable record, so a
  // relist could only ever fail on them. Unknown items are left alone: the
  // metadata may simply not have arrived yet.
  function canRelist(id) {
    const item = itemIndex.get(String(id));
    if (!item) return true;
    if (item.is_closed) return false;
    if (item.item_closing_action) return false;
    return item.can_edit !== false;
  }

  function dropButtonsOnClosedItems() {
    for (const button of document.querySelectorAll(SELECTOR.ourButton)) {
      const id = itemIdFor(button);
      if (!id || canRelist(id)) continue;
      const host = button.parentElement;
      button.remove();
      const gap = host && host.querySelector(SELECTOR.gap);
      if (gap && !host.querySelector(SELECTOR.ourButton)) gap.remove();
    }
  }

  // ===========================================================================
  // Pending work
  //
  // Written to disk before the original is deleted. The draft on Vinted is the
  // primary safety net; this is the second one, and it is what lets an
  // interrupted relist resume by itself.
  // ===========================================================================

  const pendingKey = itemId => `${STORE_PREFIX}${SITE}:${itemId}`;

  function withStore(mode, work) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(DB_STORE)) {
          open.result.createObjectStore(DB_STORE);
        }
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(DB_STORE, mode);
        let request;
        try {
          request = work(tx.objectStore(DB_STORE));
        } catch (err) {
          db.close();
          reject(err);
          return;
        }
        tx.oncomplete = () => {
          db.close();
          resolve(request ? request.result : undefined);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  }

  const stashPhotos = (itemId, blobs) => withStore('readwrite', s => s.put(blobs, pendingKey(itemId)));
  const takePhotos = itemId => withStore('readonly', s => s.get(pendingKey(itemId)));
  const dropPhotos = itemId => withStore('readwrite', s => s.delete(pendingKey(itemId)));

  // Held inside the then for the reason rememberProfile is: an extension that
  // has been reloaded under this page throws at the call rather than rejecting,
  // and every caller here is written to await a promise. This is the record a
  // relist is recovered from, so a failure has to reach them in the shape they
  // are watching for rather than escaping sideways.
  const savePending = (itemId, record) =>
    Promise.resolve().then(() =>
      ext.storage.local.set({ [pendingKey(itemId)]: record })
    );

  async function readPending(itemId) {
    const bag = await ext.storage.local.get(pendingKey(itemId));
    return bag[pendingKey(itemId)] || null;
  }

  async function forgetPending(itemId) {
    try {
      await ext.storage.local.remove(pendingKey(itemId));
    } catch (err) {
      trace('could not clear pending record', err);
    }
    try {
      await dropPhotos(itemId);
    } catch (err) {
      trace('could not clear cached photos', err);
    }
  }

  // ===========================================================================
  // Recovery UI
  // ===========================================================================

  const bannerId = itemId => `bumpline-banner-${itemId}`;

  function showBanner(itemId, record) {
    let box = document.getElementById(bannerId(itemId));
    if (!box) {
      box = document.createElement('div');
      box.id = bannerId(itemId);
      document.body.appendChild(box);
    }
    const body = paintCard(box, CLASS.banner, 'bad', CARD_GLYPH.bad);

    const name = (record.snapshot && record.snapshot.title) || itemId;
    const message = document.createElement('div');
    message.textContent =
      `“${name}” was deleted and is not published yet. ` +
      (record.draft
        ? 'The copy is in your Vinted drafts. '
        : 'The copy is saved on this device. ') +
      'Publishing is retried on every Vinted page you open.';
    body.appendChild(message);

    // Vinted's own words for the refusal. They used to reach the console only,
    // which meant a stuck relist could not be reported by the person it
    // happened to: they could see that it failed, never why.
    if (record.lastError) {
      const reason = document.createElement('div');
      reason.className = 'bumpline-card__why';
      reason.textContent = `Vinted refused it: ${record.lastError}`;
      body.appendChild(reason);
    }

    const actions = document.createElement('div');
    actions.className = 'bumpline-banner__actions';

    const retry = buildButton('Retry now');
    retry.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      retry.disabled = true;
      const paused = await readBlock();
      if (paused) {
        retry.disabled = false;
        toast(`Publishing is paused until ${clockOf(paused.until)}.`, 'bad');
        return;
      }
      const done = await advancePending(itemId, await readPending(itemId));
      retry.disabled = false;
      if (done) await settle(itemId, 'Published.');
    });

    const save = buildButton('Download data');
    save.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      // Two readers: the seller, who may have to rebuild the listing by hand,
      // and whoever gets the bug report, who needs the payload and the refusal.
      const report = {
        itemId,
        site: record.site || SITE,
        version: ext.runtime.getManifest().version,
        startedAt: record.startedAt || null,
        attempts: record.attempts || 0,
        lastError: record.lastError || null,
        lastShape: record.lastShape || null,
        draftId: (record.draft && record.draft.id) || null,
        sent: record.item || null,
        snapshot: record.snapshot || null,
      };
      const file = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = href;
      link.download = `bumpline-item-${itemId}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 5000);
    });

    const forget = buildButton('Discard');
    forget.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      await forgetPending(itemId);
      box.remove();
    });

    actions.append(retry, save, forget);
    body.appendChild(actions);
  }

  function hideBanner(itemId) {
    const box = document.getElementById(bannerId(itemId));
    if (box) box.remove();
  }

  // ===========================================================================
  // Publishing a pending relist
  // ===========================================================================

  // Photo ids belong to an upload session and go stale. When they do, the bytes
  // kept on disk are sent again under a fresh session.
  async function refreshPhotos(csrf, itemId) {
    const blobs = await takePhotos(itemId);
    if (!blobs || !blobs.length) return null;

    const sessionId = randomUuid();
    const assigned = [];
    for (const blob of blobs) {
      const stored = await sendPhoto(csrf, blob, sessionId);
      if (stored && stored.id) assigned.push({ id: stored.id, orientation: stored.orientation || 0 });
    }
    return assigned.length ? { sessionId, assigned } : null;
  }

  async function attemptPublish(itemId, record, onAttempt) {
    let lastError = null;
    const pace = await paceProfile();

    // A relist stuck from before the size fix carries the size as an attribute
    // and no size_id, which completion refuses. Repairing the stored payload
    // costs one line and saves the seller from rebuilding the listing by hand.
    if (record.item && record.item.size_id == null) {
      const known = sizeOf(record.item);
      if (known != null) {
        record.item = { ...record.item, size_id: known };
        await savePending(itemId, record);
      }
    }

    for (let attempt = 1; attempt <= PUBLISH_ATTEMPTS; attempt++) {
      if (onAttempt) onAttempt(attempt, PUBLISH_ATTEMPTS);

      let csrf = null;
      try {
        csrf = await csrfToken();
      } catch (err) {
        lastError = err;
      }

      if (csrf) {
        try {
          if (!record.draft) {
            record.draft = await openDraft(csrf, record.item, record.sessionId);
            await savePending(itemId, record);
            // Now, and only now, is the superseded draft safe to remove: the
            // copy it was standing in for exists again. Otherwise every retry
            // would leave another copy of the same listing in the seller's
            // drafts, which is untidy but never dangerous.
            if (record.staleDraft) {
              await discardDraft(csrf, record.staleDraft);
              record.staleDraft = null;
              await savePending(itemId, record);
            }
            await step(pace);
          }
          const published = await publishDraft(csrf, record.draft, record.sessionId, record.item);
          if (published && published.id) return published;
          lastError = new Error('Vinted published the draft but returned no id.');
        } catch (err) {
          lastError = err;

          if (err.status === 404) {
            // The draft is gone; the next pass will build a new one.
            record.draft = null;
            await savePending(itemId, record);
          } else if (/photo/i.test(err.message || '')) {
            try {
              const fresh = await refreshPhotos(csrf, itemId);
              if (fresh) {
                record.item = {
                  ...record.item,
                  temp_uuid: fresh.sessionId,
                  assigned_photos: fresh.assigned,
                };
                record.sessionId = fresh.sessionId;
                // The draft is the only copy left: the original was deleted
                // before it was made. It is noted for deletion but not deleted
                // here — its replacement has to exist first, or a failure in
                // between would leave the listing nowhere at all.
                if (record.draft) record.staleDraft = record.draft.id;
                record.draft = null;
                await savePending(itemId, record);
              }
            } catch (retryErr) {
              trace('photo refresh failed', retryErr);
            }
          }
        }
      }

      // One wait, and a long one. If the refusal was really a rate limit, the
      // second attempt has to land well clear of the first to be worth making.
      if (attempt < PUBLISH_ATTEMPTS) await pause(between(4000, 9000));
    }

    throw lastError || new Error('Publishing failed after several attempts.');
  }

  // Safe to call as often as you like; it either finishes the job or records
  // why it could not.
  async function advancePending(itemId, record, onAttempt) {
    if (!record) return false;
    try {
      const published = await attemptPublish(itemId, record, onAttempt);
      const newId = published.id;
      await forgetPending(itemId);
      hideBanner(itemId);
      // Completion answers with the published item. Vinted attaches the photos
      // from the draft rather than from the request, so if the copy came out
      // without any, say so at once: the listing is live and the seller is the
      // only one who can fix it.
      const photos = published.photos;
      if (Array.isArray(photos) && !photos.length) {
        toast('Relisted, but the copy has no photos. Add them on Vinted.', 'bad');
      } else {
        toast('Relisted.');
      }
      return newId;
    } catch (err) {
      console.error('[Bumpline] relist still pending for item', itemId, err);
      record.attempts = (record.attempts || 0) + 1;
      record.lastError = (err && err.message) || String(err);
      // Field names of what went out and what Vinted had stored. No values, so
      // nothing of the listing travels with a bug report.
      record.lastShape = err && err.sentKeys ? { sent: err.sentKeys } : null;
      await savePending(itemId, record);
      showBanner(itemId, record);
      return false;
    }
  }

  let resumeDone = false;

  async function resumeInterrupted() {
    if (resumeDone) return;
    resumeDone = true;

    let bag;
    try {
      bag = await ext.storage.local.get(null);
    } catch (err) {
      trace('could not read pending records', err);
      return;
    }

    const prefix = `${STORE_PREFIX}${SITE}:`;
    // Opening a page while Vinted is refusing must not answer with a run of
    // retries; the banners still go up, so nothing becomes invisible.
    const paused = await readBlock();
    const pace = await paceProfile();
    let first = true;
    for (const key of Object.keys(bag || {})) {
      if (!key.startsWith(prefix)) continue;
      const itemId = key.slice(prefix.length);
      showBanner(itemId, bag[key]);
      if (paused) continue;
      // Several stuck relists resuming together was the one place the extension
      // opened a page and sent a run of writes off its own bat.
      if (!first) await step(pace);
      first = false;
      await advancePending(itemId, bag[key]);
    }
  }

  // ===========================================================================
  // Size handling
  // ===========================================================================

  // A catalog can offer several parallel size groups (S/M/L, EU, IT, UK, US,
  // FR). Every size id is unique across all of them, so a copied id is valid as
  // long as it appears somewhere in the union.
  // Vinted moved the size the same way it moved the condition: out of the
  // top-level size_id and into item_attributes. Reading only the old field made
  // every listing look sizeless, so every relist stopped to ask for a size the
  // item already had. Listings that predate the move still carry size_id.
  function sizeOf(item) {
    for (const attribute of item.item_attributes || []) {
      if (attribute && attribute.code === 'size' && attribute.ids && attribute.ids.length) {
        return attribute.ids[0];
      }
    }
    return item.size_id != null ? item.size_id : null;
  }

  // The size the copy will carry has to be written where Vinted now reads it,
  // not only where it used to.
  function withSize(attributes, sizeId) {
    const rest = (attributes || []).filter(attribute => !attribute || attribute.code !== 'size');
    return [...rest, { code: 'size', ids: [sizeId] }];
  }

  async function inspectSize(item, csrf) {
    if (!item.catalog_id) return { ok: true };

    let groups;
    try {
      groups = await loadSizeGroups(item.catalog_id, csrf);
    } catch (err) {
      // A lookup failure proves nothing; do not block the relist over it.
      trace('size lookup failed', err);
      return { ok: true, checked: false };
    }

    if (!groups.length) return { ok: true, required: false };

    const current = sizeOf(item);
    if (current == null) {
      // Listings predating a catalog that has since made the size mandatory.
      // Publishing them unchanged fails with "Fill in size to continue".
      return { ok: false, groups, why: 'this category now requires a size and the listing has none' };
    }

    const accepted = new Set();
    for (const group of groups) {
      for (const size of group.sizes || []) accepted.add(size.id);
      for (const id of group.size_ids || []) accepted.add(id);
    }
    if (!accepted.has(current)) {
      return { ok: false, groups, why: `size ${current} is no longer valid for this category` };
    }
    return { ok: true, required: true };
  }

  // The panel askForSize uses, reduced to a yes and a no. A warning about the
  // account cannot be got past by not reading it: carrying on is a separate,
  // deliberate click, and the cancel is the button holding focus.
  function askToContinue({ title, body, proceed, cancel }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'bumpline-modal';

      const panel = document.createElement('div');
      panel.className = 'bumpline-modal__panel';

      const heading = document.createElement('div');
      heading.className = 'bumpline-modal__title';
      heading.textContent = title;

      const text = document.createElement('div');
      text.className = 'bumpline-modal__body';
      text.textContent = body;

      const actions = document.createElement('div');
      actions.className = 'bumpline-modal__actions';

      const stop = buildButton(cancel);
      stop.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        overlay.remove();
        resolve(false);
      });

      const go = buildButton(proceed);
      go.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        overlay.remove();
        resolve(true);
      });

      actions.append(stop, go);
      panel.append(heading, text, actions);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      stop.focus();
    });
  }

  // Resolves to the chosen size id, or null if the person backs out. Always
  // shown before anything is deleted, so backing out costs nothing.
  function askForSize(groups, title, why) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'bumpline-modal';

      const panel = document.createElement('div');
      panel.className = 'bumpline-modal__panel';

      const heading = document.createElement('div');
      heading.className = 'bumpline-modal__title';
      heading.textContent = 'Pick a size to continue';

      const body = document.createElement('div');
      body.className = 'bumpline-modal__body';
      body.textContent =
        `"${title}" cannot be relisted as it is: ${why}. Choose the size the new ` +
        'listing should carry. Nothing has been deleted yet.';

      const picker = document.createElement('select');
      picker.className = 'bumpline-modal__picker';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = 'Select a size';
      picker.appendChild(blank);

      for (const group of groups) {
        const section = document.createElement('optgroup');
        section.label = group.description || group.caption || `Group ${group.id}`;
        for (const size of group.sizes || []) {
          const choice = document.createElement('option');
          choice.value = String(size.id);
          choice.textContent = size.title;
          section.appendChild(choice);
        }
        if (section.children.length) picker.appendChild(section);
      }

      const actions = document.createElement('div');
      actions.className = 'bumpline-modal__actions';

      const cancel = buildButton('Cancel relist');
      cancel.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        overlay.remove();
        resolve(null);
      });

      const accept = buildButton('Use this size');
      accept.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!picker.value) return;
        overlay.remove();
        resolve(Number(picker.value));
      });

      actions.append(cancel, accept);
      panel.append(heading, body, picker, actions);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      picker.focus();
    });
  }

  // ===========================================================================
  // Building the copy
  // ===========================================================================

  // Condition lives in item_attributes as { code: 'condition', ids: [n] }. The
  // former top-level status_id is no longer returned, and reading it blindly
  // used to relist every worn item as new.
  function conditionOf(item) {
    for (const attribute of item.item_attributes || []) {
      if (attribute && attribute.code === 'condition' && attribute.ids && attribute.ids.length) {
        return attribute.ids[0];
      }
    }
    return item.status_id != null ? item.status_id : null;
  }

  function copyOf(source, sessionId, photos, conditionId) {
    const sizeId = sizeOf(source);
    const priceBox = source.price || {};
    const amount = source.price_numeric || parseFloat(priceBox.amount || '0') || 0;
    const currency = source.price_currency || priceBox.currency_code || source.currency || 'EUR';
    const colours = source.color_ids || [source.color1_id, source.color2_id].filter(Boolean);
    const brandName =
      source.brand_title || source.brand || (source.brand_dto && source.brand_dto.title) || null;

    const keep = field => (source[field] != null ? source[field] : null);

    return {
      id: null,
      temp_uuid: sessionId,
      title: source.title || '',
      description: source.description || '',
      price: amount,
      currency,
      brand_id: source.brand_id || null,
      brand: brandName && String(brandName).trim() ? brandName : null,
      // Vinted reads the size out of item_attributes and writes it back in
      // size_id: an editor payload arrives with the attribute and no size_id,
      // and a completion carrying only the attribute is refused with
      // "size: Fill in size to continue". Both are sent; measured against a
      // scratch draft, size_id alone passes and the attribute alone does not.
      size_id: sizeId,
      catalog_id: source.catalog_id || null,
      status_id: conditionId,
      is_unisex: Boolean(source.is_unisex),
      color_ids: colours || [],
      // A listing old enough to keep its size in size_id would otherwise be
      // copied without one, since that is not where Vinted reads it any more.
      item_attributes:
        sizeId != null ? withSize(source.item_attributes, sizeId) : source.item_attributes || [],
      assigned_photos: photos,
      package_size_id: source.package_size_id || 1,
      shipment_prices: { domestic: null, international: null },
      manufacturer: keep('manufacturer'),
      manufacturer_labelling: keep('manufacturer_labelling'),
      ontology_collection_id: keep('ontology_collection_id'),
      ontology_model_id: keep('ontology_model_id'),
      // Books, media and games carry their own fields.
      isbn: keep('isbn'),
      author: keep('author'),
      book_title: keep('book_title'),
      model: keep('model'),
      video_game_rating_id: keep('video_game_rating_id'),
      // Measurements, when the seller filled them in.
      measurement_length: keep('measurement_length'),
      measurement_width: keep('measurement_width'),
      measurement_unit: keep('measurement_unit'),
    };
  }

  function snapshotOf(source, itemId, item, conditionId, photoUrls) {
    return {
      id: source.id || itemId,
      title: item.title,
      description: item.description,
      price: item.price,
      currency: item.currency,
      brand: item.brand,
      brand_id: item.brand_id,
      size_id: item.size_id,
      catalog_id: item.catalog_id,
      condition_id: conditionId,
      condition: source.status || null,
      package_size_id: item.package_size_id,
      color_ids: item.color_ids,
      isbn: item.isbn,
      author: item.author,
      book_title: item.book_title,
      model: item.model,
      video_game_rating_id: item.video_game_rating_id,
      measurement_length: item.measurement_length,
      measurement_width: item.measurement_width,
      measurement_unit: item.measurement_unit,
      photos: photoUrls,
    };
  }

  // Reloading is the honest way to show the result: the page still lists an
  // item that no longer exists, and does not list the copy. Some people would
  // rather keep their scroll position and their filters, so it can be turned
  // off — at the cost of a list that is knowingly out of date.
  async function reloadWanted() {
    try {
      const bag = await ext.storage.local.get(RELOAD_KEY);
      return bag[RELOAD_KEY] !== false;
    } catch (_) {
      return true; // the default, and the safer of the two
    }
  }

  function dropCard(itemId) {
    for (const card of document.querySelectorAll(SELECTOR.card)) {
      const hit = (card.getAttribute('data-testid') || '').match(ID_IN_TESTID);
      if (hit && hit[1] === String(itemId)) card.remove();
    }
  }

  // Ends a finished relist: reload, or take away the card of the listing that
  // no longer exists and say plainly that the rest of the page is stale.
  async function settle(itemId, message) {
    if (await reloadWanted()) {
      toast(`${message} Reloading…`);
      setTimeout(() => location.reload(), 1200);
      return;
    }
    dropCard(itemId);
    toast(`${message} Reload to see it.`);
  }

  // ===========================================================================
  // The relist itself
  // ===========================================================================

  async function relist(button, mode) {
    const itemId = itemIdFor(button);
    if (!itemId) {
      toast('Could not tell which item that button belongs to.', 'bad');
      return;
    }

    // An unfinished relist means an original is already gone. Finish that
    // before starting anything new.
    const outstanding = await readPending(itemId);
    if (outstanding) {
      toast('An unfinished relist of this item. Resuming it.', 'bad');
      await advancePending(itemId, outstanding);
      return;
    }

    const draftOnly = mode === 'draft';
    const restingLabel = draftOnly ? T('button.draft') : T('button.relist');

    button.disabled = true;
    button.classList.add('is-busy');

    try {
      // --- the gate. Nothing below it sends a request, so stopping here costs
      // nothing and leaves nothing behind.

      // A refusal that is still standing is not negotiable from here. Lifting
      // it early is a deliberate act, and it lives in the popup.
      const paused = await readBlock();
      if (paused) {
        applyLock(paused);
        toast(`Relisting is paused until ${clockOf(paused.until)}.`, 'bad');
        return;
      }

      const pace = await paceProfile();

      const owed = await cooldownLeft();
      for (let left = Math.ceil(owed / 1000); left > 0; left--) {
        setButtonLabel(button, T('button.cooldown', left));
        await pause(1000);
      }

      // The day count is the wider net and the one worth naming first when both
      // are over: an hour can be a burst, a day is a habit.
      const log = await relistLog();
      const today = countWithin(log, DAY_WINDOW_MS);
      const thisHour = countWithin(log, HOUR_WINDOW_MS);
      const overDay = today >= DAY_ALARM_AT;

      if (overDay || thisHour >= HOUR_ALARM_AT) {
        setButtonLabel(button, T('button.waiting'));
        const carryOn = await askToContinue({
          title: overDay
            ? 'You have relisted a lot of items today'
            : 'You are relisting a lot of items',
          body:
            (overDay
              ? `${today} items have been relisted from this browser in the ` +
                'last 24 hours, which is a whole wardrobe going round rather ' +
                'than a few listings being refreshed. '
              : `${thisHour} items have been relisted from this browser in the ` +
                'last hour. ') +
            'That is what Vinted reads as automated activity, and what it does ' +
            'about it is stop the account editing or publishing anything for ' +
            'about a day. Nothing has been deleted yet.',
          proceed: 'Relist anyway',
          cancel: 'Stop for now',
        });
        if (!carryOn) {
          toast('Stopped. Nothing was deleted.');
          return;
        }
      }

      // Scroll to the item card, as a person would look at what they are
      // about to relist. scrollIntoView generates real scroll events that
      // are indistinguishable from a user scrolling.
      const card = button.closest(SELECTOR.card);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await pause(between(800, 2000));
      }

      setButtonLabel(button, T('button.relisting'));

      // Visit the item page through the bridge. This creates a page-view
      // event in Vinted's analytics — the navigation a real user would
      // have before editing or deleting an item.
      try {
        await bridgedFetch(`${SITE}/items/${itemId}`, { credentials: 'include' });
      } catch (_) {
        // The visit is cosmetic; a failure must not block the relist.
      }
      await pause(between(1500, 4000));

      const csrf = await csrfToken();
      const source = await loadEditableItem(itemId, csrf);
      await step(pace);

      // Reading time: a real user spends a few seconds looking at the
      // item data and photos before deciding to proceed.
      await pause(between(2000, 5000));

      // --- photos: fetch, re-upload, and keep the bytes for recovery
      const sessionId = randomUuid();
      const photoUrls = photoUrlsOf(source);
      const assigned = [];
      const blobs = [];
      let failures = 0;

      for (const url of photoUrls) {
        // A full photo set is twenty uploads. Back to back they were the
        // densest run of writes the extension made.
        if (blobs.length || failures) await step(pace);
        try {
          const blob = await grabPhoto(url);
          blobs.push(blob);
          const stored = await sendPhoto(csrf, blob, sessionId);
          if (stored && stored.id) {
            assigned.push({ id: stored.id, orientation: stored.orientation || 0 });
          }
        } catch (err) {
          failures += 1;
          trace('photo failed', url, err);
        }
      }

      const conditionId = conditionOf(source);
      const item = copyOf(source, sessionId, assigned, conditionId);
      const snapshot = snapshotOf(source, itemId, item, conditionId, photoUrls);

      // --- checks that can be made while the original is still safe
      if (!assigned.length) {
        throw new Error('No photo could be uploaded. Nothing was deleted.');
      }
      if (photoUrls.length && assigned.length < photoUrls.length) {
        throw new Error(
          `Only ${assigned.length} of ${photoUrls.length} photos uploaded ` +
            `(${failures} failed). Nothing was deleted, so try again in a moment.`
        );
      }
      if (!item.title) {
        throw new Error('The listing has no title. Nothing was deleted.');
      }
      if (conditionId == null) {
        throw new Error(
          'Could not read the item condition, and relisting it with the wrong one ' +
            'would be worse than stopping. Nothing was deleted.'
        );
      }

      setButtonLabel(button, T('button.checkingSize'));
      const size = await inspectSize(source, csrf);
      if (!size.ok) {
        if (!size.groups || !size.groups.length) {
          throw new Error(`${size.why}. Nothing was deleted.`);
        }
        setButtonLabel(button, T('button.waitingSize'));
        const chosen = await askForSize(size.groups, item.title, size.why);
        if (!chosen) throw new Error('Cancelled. Nothing was deleted.');
        item.size_id = chosen;
        item.item_attributes = withSize(item.item_attributes, chosen);
        snapshot.size_id = chosen;
      }

      setButtonLabel(button, T('button.checking'));
      await assertItemReachable(itemId, csrf);

      // --- the copy is put somewhere safe before the original is touched
      //
      // "Relist as draft" means the draft on Vinted *is* the result, so that
      // path still opens one here and behaves exactly as it did. A plain relist
      // no longer does. There the draft was only ever a staging post on the way
      // to the publish, and it cost a write to create, another to create again
      // on every retry, and a delete for each one superseded — a stream of
      // calls for a listing that is about to exist anyway. The payload and the
      // photo bytes are held on this device instead, and the draft is opened at
      // the moment of publishing, which is the one point Vinted's API needs one.
      const localDrafts = (await readSetting(LOCAL_DRAFTS_KEY, true)) !== false;
      let draft = null;
      if (draftOnly || !localDrafts) {
        setButtonLabel(button, T('button.savingDraft'));
        await step(pace);
        draft = await openDraft(csrf, item, sessionId);
      }

      const record = {
        site: SITE,
        // The page the buttons live on is also the only page the retry runs on,
        // so remember it: the toolbar popup uses it to send the user back here
        // when publishing has failed.
        profileUrl: `${SITE}${location.pathname}`,
        itemId,
        startedAt: Date.now(),
        attempts: 0,
        sessionId,
        item,
        draft,
        snapshot,
      };
      // With no draft on Vinted the local copy is the only copy, so a failure
      // to write it has to stop the relist rather than be logged past: the
      // alternative is deleting a listing that then exists nowhere.
      setButtonLabel(button, T('button.savingCopy'));
      try {
        await stashPhotos(itemId, blobs);
      } catch (err) {
        trace('could not cache photos', err);
        if (!draft) {
          throw new Error(
            'The copy could not be saved on this device, and without it the ' +
              'original cannot be deleted safely. Nothing was deleted.'
          );
        }
      }
      await savePending(itemId, record);

      // --- from here the original goes. The copy is on this device, and on
      // Vinted too when a draft was opened above.
      // Deciding time: a real user pauses before the irreversible step.
      await pause(between(1000, 2500));
      setButtonLabel(button, T('button.deleting'));
      await step(pace);
      try {
        await removeListing(csrf, itemId);
      } catch (err) {
        // Nothing was destroyed, so leave no draft or record behind.
        if (draft) await discardDraft(csrf, draft.id);
        await forgetPending(itemId);
        throw err;
      }

      // The deletion is the point of no return and the event Vinted counts, so
      // it is what the cooldown and the hourly total are both measured from.
      await noteRelist();

      if (draftOnly) {
        // The draft is the finished result, not something still pending.
        await forgetPending(itemId);
        await settle(itemId, 'Original deleted. The copy is in your Vinted drafts.');
        return;
      }

      setButtonLabel(button, T('button.publishing'));
      await step(pace);
      const newId = await advancePending(itemId, record, (attempt, total) => {
        setButtonLabel(button, attempt === 1 ? T('button.publishing') : T('button.retrying', attempt, total));
      });
      if (newId) await settle(itemId, 'Relisted.');
      // On failure advancePending has already stored the record and raised the
      // banner, and the next page load will try again.
    } catch (err) {
      console.error('[Bumpline]', err);
      toast(`Relist stopped: ${(err && err.message) || err}`, 'bad');
    } finally {
      button.disabled = false;
      button.classList.remove('is-busy');
      setButtonLabel(button, restingLabel);
      // A refusal may have arrived mid-relist. Re-enabling the button above is
      // unconditional, so the pause has to be put back over the top of it.
      paintLock();
    }
  }

  // ===========================================================================
  // Wiring the buttons into the page
  // ===========================================================================

  function attachButtons() {
    // Off means off: no styles, no index, no retries, no buttons. The observer
    // goes on calling this, and it goes on costing a comparison.
    if (enabled !== true) return;

    installStyles();
    noteRestriction();
    indexFirstPage();
    indexRemainingPages();
    resumeInterrupted();
    dropButtonsOnClosedItems();

    let added = 0;

    for (const bump of document.querySelectorAll(SELECTOR.bump)) {
      const host = bump.parentElement;
      if (!host || host.querySelector(SELECTOR.ourButton)) continue;

      const id = itemIdFor(bump);
      if (id && !canRelist(id)) continue;

      const publish = buildButton(T('button.relist'));
      publish.classList.add(CLASS.button);
      publish.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        relist(publish, 'publish');
      });

      const draft = buildButton(T('button.draft'));
      draft.classList.add(CLASS.button, CLASS.draftButton);
      draft.title = T('button.draft.title');
      draft.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        relist(draft, 'draft');
      });

      const gap = document.createElement('div');
      gap.className = CLASS.gap;
      gap.style.width = '100%';
      gap.style.height = '8px';

      host.append(gap, publish, draft);
      added += 1;
    }

    paintAgeLabels();
    paintLock();
    rememberProfile();
    if (added) trace('added buttons to', added, 'item(s)');
  }

  // The URL of somebody else's wardrobe looks exactly like the URL of your own,
  // so the popup cannot tell them apart and must not try. It asks the page
  // instead, and the page answers with what it actually put on screen.
  ext.runtime.onMessage.addListener((message, _sender, respond) => {
    if (!message || message.type !== 'bumpline:pageState') return false;
    respond({
      profileUrl: `${SITE}${location.pathname}`,
      relistable: document.querySelectorAll(SELECTOR.ourItem).length,
    });
    return false; // answered on the spot
  });

  // The popup also has no way of knowing which country site the seller uses, or
  // their member id. Leaving a note here means it can offer to open the right
  // profile page from any tab. Only a wardrobe of your own is worth recording:
  // that is the only page where buttons appear.
  function rememberProfile() {
    if (!document.querySelector(SELECTOR.ourButton)) return;
    // The call sits inside the then rather than in front of it, the same way
    // askWorker holds its own. An extension that is reloaded, updated or
    // switched off takes its half of this script away and leaves the page's
    // half running, and from that moment ext.storage throws where it is
    // touched instead of rejecting the promise it would have returned. A
    // .catch() hung off a promise that was never created cannot see that, so
    // the failure used to land in the page's console as an uncaught error.
    // Failing here only costs the popup a shortcut; nothing else depends on it.
    Promise.resolve()
      .then(() => ext.storage.local.set({ [LAST_PROFILE_KEY]: `${SITE}${location.pathname}` }))
      .catch(() => {});
  }

  // A pause set in one tab has to reach the others, or the buttons stay live
  // exactly where the seller is most likely to press them again.
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes) return;
    // The switch first: a pause repainted onto a page the extension has just
    // left would be the only thing on it.
    if (ENABLED_KEY in changes) applyEnabled(changes[ENABLED_KEY].newValue !== false);
    if (BLOCK_KEY in changes) applyLock(changes[BLOCK_KEY].newValue);
  });

  readBlock()
    .then(applyLock)
    .catch(err => trace('could not read the pause', err));

  new MutationObserver(() => attachButtons()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // The switch decides whether there is anything to draw at all, so it is read
  // before the first attempt rather than after it.
  readEnabled().then(applyEnabled);
})();
