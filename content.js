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

  // The words, in the seller's language. One letter because this file says it
  // on nearly every line that puts something on screen, and a count written
  // here would be wrong again by the next commit.
  const T = (key, ...subs) => BumplineText.t(key, ...subs);

  // A refusal as it is read rather than as it was thrown.
  //
  // Vinted's own words arrive as a string and are shown as they arrived: they
  // are Vinted's in every language, and this extension has no business
  // translating them. Bumpline's own sentences arrive as { code, args } and are
  // written out here, at the moment they are read — which matters because some
  // of them are stored in record.lastError and read back on a later page load,
  // possibly by a seller who has changed language in between. A sentence frozen
  // into storage in one language is the defect the pause-reason ruling was
  // written to prevent, and this is the same ruling applied to refusals.
  //
  // Every record written by 1.0.1 carries a finished English sentence in
  // lastError instead, and some of those are still on disk with a live pending
  // relist. A string is a string: it comes back out exactly as it went in.
  function sayReason(reason) {
    if (!reason || typeof reason !== 'object' || !reason.code) return String(reason);
    // args may hold reasons of their own — a refusal quoted inside a sentence
    // of ours — so each is resolved the same way before it is substituted.
    return T(reason.code, ...(reason.args || []).map(sayReason));
  }

  // An Error that carries its own key and arguments as well as its message, so
  // the same throw can be shown at once in a toast and stored for later without
  // being written twice. The message is finished here because that is what the
  // console, the trace log and the toast all read; the code is what survives.
  function fail(code, ...args) {
    const failure = new Error(sayReason({ code, args }));
    failure.code = code;
    failure.args = args;
    return failure;
  }

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
  const KEEP_ORIGINAL_KEY = 'bumpline:draftKeepsOriginal';
  const RELIST_LOG_KEY = 'bumpline:relistLog';
  const BLOCK_KEY = 'bumpline:blockedUntil';
  const REFUSAL_LOG_KEY = 'bumpline:refusalLog';
  const ENABLED_KEY = 'bumpline:enabled';
  const LANG_KEY = 'bumpline:lang';
  const RELIST_COUNT_KEY = 'bumpline:relistCount';
  const DONATE_DUE_KEY = 'bumpline:donateDue';
  const DRAFT_TIP_KEY = 'bumpline:draftTipSeen';
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

  // The request for a donation comes after the fifth finished relist and then
  // after every twenty-fifth: a seller who tried it once never sees it, and
  // one who relists every week sees it now and then rather than every day.
  // The same address as the panel's button, in popup.html.
  const DONATE_URL = 'https://ko-fi.com/bumpline';
  const DONATE_FIRST_AT = 5;
  const DONATE_EVERY = 25;
  const DONATE_DELAY_MS = 1500;

  // Every line also goes to the log a bug report can carry (diagnostics.js),
  // cleaned before it is stored.
  const trace = (...parts) => {
    console.debug('[Bumpline]', ...parts);
    BumplineLog.record(ext.storage.local, parts);
  };
  const logError = (...parts) => {
    console.error('[Bumpline]', ...parts);
    BumplineLog.record(ext.storage.local, parts);
  };
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
        reject(fail('relist.error.noAnswer'));
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
    // A code, not a sentence: the popup is the only reader of this record, and
    // a sentence written in one language would still be sitting in
    // storage.local, in that language, the moment the seller switched to
    // another one.
    const record = {
      until: Date.now() + wait,
      status: kind,
      why: kind === 429 ? 'rateLimit' : 'botCheck',
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
      why: 'restricted',
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

  // 'auto' is the default and the fallback: an unreadable storage is not a
  // seller who asked for English, it is a question that could not be answered.
  async function readLanguage() {
    try {
      const bag = await ext.storage.local.get(LANG_KEY);
      return bag[LANG_KEY] || 'auto';
    } catch (_) {
      return 'auto';
    }
  }

  // The words are already in memory, so the ordinary case — no override — has
  // nothing to repaint: the buttons were born in the right language. Only a
  // seller who overruled the browser pays for a second paint, and removeOurUi
  // is what the switch uses for the same job.
  //
  // locale() is a formatting tag rather than the catalogue's name, but it
  // answers this question exactly: it is either the browser's tag, which begins
  // with the active language, or the active language itself, so two different
  // catalogues can never produce the same string and the same catalogue always
  // produces the same one.
  function applyLanguage(lang) {
    const before = BumplineText.locale();
    BumplineText.use(lang);
    if (BumplineText.locale() === before) return;
    removeOurUi();
    // Puts the buttons back, and paintAgeLabels puts the age lines back with
    // them — worded from ageDays, so they come back in the new language rather
    // than the one they were first written in.
    attachButtons();
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

  // Whether the draft button only copies the listing into the drafts and leaves
  // the original online, a setting in the panel. Held here like the switch, so
  // every draft button is named for what it will do the moment it is drawn,
  // and the name is what a click acts on.
  let keepOriginal = false;

  function draftWords() {
    return keepOriginal
      ? { label: T('button.copyDraft'), title: T('button.copyDraft.title') }
      : { label: T('button.draft'), title: T('button.draft.title') };
  }

  function applyKeepOriginal(on) {
    if (keepOriginal === on) return;
    keepOriginal = on;
    const { label, title } = draftWords();
    for (const button of document.querySelectorAll(`.${CLASS.draftButton}`)) {
      // A button mid-relist shows its progress, and is renamed when it is done.
      if (button.classList.contains('is-busy')) continue;
      setButtonLabel(button, label);
      button.title = title;
    }
  }

  // ===========================================================================
  // Showing the pause
  // ===========================================================================

  let lockedUntil = 0;
  let unlockTimer = null;

  const clockOf = at =>
    new Date(at).toLocaleTimeString(BumplineText.locale(), { hour: '2-digit', minute: '2-digit' });

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
      throw fail('relist.error.noToken');
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

  // Turn a failed response body into something worth showing a person: a reason
  // in the sense sayReason means. Vinted's own words come back as the string
  // they arrived as; the one sentence below is Bumpline's, so it comes back as
  // a code and is written out only when it is read. Callers that store the
  // result therefore store no English.
  function explainFailure(status, body) {
    if (status === 403 && /captcha-delivery|__cf_chl|cf_chl|datadome/i.test(body || '')) {
      return { code: 'relist.error.automated', args: [] };
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

  // The field names Vinted put in a refusal, and nothing else from it. A
  // refusal that names `size` is the only trustworthy statement that the
  // category demands one — see inspectSize for why nothing readable beforehand
  // is.
  function fieldsRefused(body) {
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed.errors)) {
        return parsed.errors.map(error => error && error.field).filter(Boolean);
      }
    } catch (_) {
      // not JSON; no fields to name
    }
    return [];
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
        throw new Error(T('relist.error.itemGone', itemId));
      }
      throw new Error(sayReason(explainFailure(reply.status, body)));
    }
    const parsed = await reply.json();
    return parsed.item || parsed || {};
  }

  // Confirms an item is reachable and that the session is not behind a
  // challenge. Used as the last check before anything destructive.
  async function assertItemReachable(itemId, csrf) {
    const item = await loadEditableItem(itemId, csrf);
    if (!item || !item.id) throw new Error(T('relist.error.itemNoData', itemId));
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
      const failure = fail('relist.error.draftNotSaved', explainFailure(reply.status, body));
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
    if (!draft || !draft.id) throw fail('relist.error.draftNoId');
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
      const failure = fail('relist.error.publishFailed', explainFailure(reply.status, body));
      failure.status = reply.status;
      failure.fields = fieldsRefused(body);
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
      throw new Error(T('relist.error.deleteFailed', sayReason(explainFailure(reply.status, body))));
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

  // The worker sends the bytes as base64, the one shape that survives Chrome's
  // JSON message channel (see base64Of in background.js).
  function bytesOf(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
    return bytes;
  }

  // The CDN serves images publicly, but a cross-origin read from the page can
  // still be refused — and is, every time, for the photos Vinted now stores as
  // WebP: that backend sends no CORS header. The service worker has host
  // permissions and can fetch the bytes when that happens.
  async function grabPhoto(url) {
    try {
      const direct = await fetch(url, { credentials: 'omit', mode: 'cors' });
      if (direct.ok) return direct.blob();
    } catch (_) {
      // fall through to the worker
    }

    const relayed = await askWorker({ type: 'bumpline:fetchBinary', url });
    if (!relayed || !relayed.ok || typeof relayed.data !== 'string') {
      const why = (relayed && (relayed.status || relayed.error)) || 'no response';
      throw new Error(`Could not download a photo (${why})`);
    }
    return new Blob([bytesOf(relayed.data)], { type: relayed.contentType || 'image/jpeg' });
  }

  // ===========================================================================
  // Styling and page furniture
  // ===========================================================================

  const STYLE_ID = 'bumpline-style';

  // Roboto Flex, the panel's face, for the cards and dialogs on the page. The
  // page's stylesheet cannot point at a font inside the extension unless the
  // file is listed in web_accessible_resources, which lets any page find out
  // the extension is installed, and what the page may load as a font is up to
  // Vinted's CSP. So the worker reads the two subsets out of the package and
  // they become FontFaces here: a face built from bytes is not fetched, and no
  // CSP has a say in it. Under a family of its own, so it can never stand in
  // for a Roboto Flex of Vinted's. The ranges are popup.css's.
  const FONT_FAMILY = 'Bumpline Roboto Flex';
  const FONT_FILES = [
    ['fonts/roboto-flex-latin.woff2',
      'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, ' +
      'U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, ' +
      'U+2212, U+2215, U+FEFF, U+FFFD'],
    ['fonts/roboto-flex-latin-ext.woff2',
      'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, ' +
      'U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, ' +
      'U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'],
  ];

  // A face that does not arrive leaves the cards in the next font on the list,
  // which is a look, not a fault, so it is only traced.
  async function installFont() {
    for (const [file, unicodeRange] of FONT_FILES) {
      const reply = await askWorker({ type: 'bumpline:fetchBinary', url: ext.runtime.getURL(file) });
      if (!reply.ok || typeof reply.data !== 'string') {
        trace('font did not arrive', file, reply.status || reply.error || 'no response');
        continue;
      }
      try {
        const face = new FontFace(FONT_FAMILY, bytesOf(reply.data), {
          weight: '100 1000',
          unicodeRange,
          display: 'swap',
        });
        document.fonts.add(await face.load());
      } catch (err) {
        trace('font did not load', file, err);
      }
    }
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    installFont();
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
         a stuck relist — are one card in three places, and every question it
         asks there is one dialog. Both are drawn as the toolbar panel draws
         its own: its Material 3 tokens, value for value (tests/contrast.test.mjs
         holds the two files to the same numbers), its face and its shapes, so
         the two halves of the extension are one thing. The tokens are declared
         on the card and the modal rather than on :root: Vinted has its own
         custom properties and this must not reach them. Their colours are
         fixed rather than following the page: a card with its own background
         reads on a light Vinted and on a dark one. */
      .bumpline-card, .bumpline-modal {
        --md-sys-color-primary: #006973;
        --md-sys-color-secondary: #4a6366;
        --md-sys-color-secondary-container: #cde7eb;
        --md-sys-color-on-secondary-container: #324b4e;
        --md-sys-color-error: #ba1a1a;
        --md-sys-color-on-surface: #171d1e;
        --md-sys-color-on-surface-variant: #3f484a;
        --md-sys-color-outline: #6f797a;
        --md-sys-color-outline-variant: #bec8ca;
        --md-sys-color-surface-container-low: #eff5f5;
        --md-sys-color-surface-container-high: #e3e9ea;
        --bl-success-container: #8af8bf;
        --bl-on-success-container: #002112;
        --bl-alert-surface: #ffdad6;
        --bl-alert-text: #93000a;
        --bl-alert-badge: #ba1a1a;
        --bl-alert-on-badge: #ffffff;
        --bl-alert-outline: transparent;
        --bl-card-edge: transparent;
        color-scheme: light;
      }

      /* Vinted follows the system theme and so does the panel, so this does
         too rather than sitting on the page as a white slab. Dark, a shadow no
         longer draws a card's edge, so a hairline does, as it does for the
         panel's alerts. */
      @media (prefers-color-scheme: dark) {
        .bumpline-card, .bumpline-modal {
          --md-sys-color-primary: #81d3df;
          --md-sys-color-secondary: #b1cbcf;
          --md-sys-color-secondary-container: #324b4e;
          --md-sys-color-on-secondary-container: #cde7eb;
          --md-sys-color-error: #ffb4ab;
          --md-sys-color-on-surface: #dee4e4;
          --md-sys-color-on-surface-variant: #bec8ca;
          --md-sys-color-outline: #899294;
          --md-sys-color-outline-variant: #3f484a;
          --md-sys-color-surface-container-low: #171d1e;
          --md-sys-color-surface-container-high: #252b2c;
          --bl-success-container: #005234;
          --bl-on-success-container: #8af8bf;
          --bl-alert-surface: #381f1c;
          --bl-alert-text: #f6cac5;
          --bl-alert-badge: #6d3731;
          --bl-alert-on-badge: #ffdad6;
          --bl-alert-outline: #613632;
          --bl-card-edge: #3f484a;
          color-scheme: dark;
        }
      }

      /* Roboto Flex, as installFont hands it to the page, then the Roboto a
         system may have, then whatever it does have. */
      .bumpline-card,
      .bumpline-modal__panel {
        font-family: "${FONT_FAMILY}", Roboto, ui-sans-serif, system-ui, sans-serif;
        font-size: 14px;
        font-weight: 400;
        line-height: 20px;
        letter-spacing: .25px;
        text-align: left;
        -webkit-font-smoothing: antialiased;
      }

      /* The panel's card: the low container tone, the large corner, and the
         icon in its own tonal circle. Raised to elevation 3, the level Material
         gives what floats over a page. */
      .bumpline-card {
        position: fixed;
        z-index: 2147483647;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 16px;
        max-width: 320px;
        padding: 16px;
        border-radius: 16px;
        background: var(--md-sys-color-surface-container-low);
        color: var(--md-sys-color-on-surface);
        box-shadow: 0 1px 3px 0 rgb(0 0 0 / .3), 0 4px 8px 3px rgb(0 0 0 / .15),
                    inset 0 0 0 1px var(--bl-card-edge);
        animation: bumpline-card-in 180ms cubic-bezier(.2,0,0,1);
      }
      .bumpline-card[data-leaving] {
        animation: bumpline-card-out 180ms ease forwards;
      }

      /* An alert fills the whole card rather than tinting a word in it. */
      .bumpline-card--bad {
        background: var(--bl-alert-surface);
        color: var(--bl-alert-text);
        box-shadow: 0 1px 3px 0 rgb(0 0 0 / .3), 0 4px 8px 3px rgb(0 0 0 / .15),
                    inset 0 0 0 1px var(--bl-alert-outline);
      }

      .bumpline-card__badge {
        display: grid;
        flex: none;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--md-sys-color-secondary-container);
        color: var(--md-sys-color-on-secondary-container);
      }
      .bumpline-card--ok .bumpline-card__badge {
        background: var(--bl-success-container);
        color: var(--bl-on-success-container);
      }
      .bumpline-card--bad .bumpline-card__badge {
        background: var(--bl-alert-badge);
        color: var(--bl-alert-on-badge);
      }
      .bumpline-card__icon {
        display: block;
        flex: none;
        width: 24px;
        height: 24px;
        fill: currentColor;
      }
      .bumpline-card__badge .bumpline-card__icon {
        width: 22px;
        height: 22px;
      }
      .bumpline-card__body { min-width: 0; }

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
      .${CLASS.banner} { right: 16px; top: 16px; max-width: 340px; align-items: flex-start; }
      .bumpline-card__why {
        margin-top: 2px;
        font-size: 12px;
        line-height: 16px;
        overflow-wrap: anywhere;
        opacity: .85;
      }
      .bumpline-banner__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      /* The panel's warning dialog, brought onto the page: md-dialog's high
         container tone and extra-large corner, the headline with its icon over
         the supporting text, the answers on the right, and the page behind
         under Material's scrim. Every property a button or a select can carry
         is set here, because Vinted's stylesheet reaches them too. */
      .bumpline-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgb(0 0 0 / .32);
        animation: bumpline-veil-in 200ms ease-out;
      }
      .bumpline-modal__panel {
        box-sizing: border-box;
        width: 100%;
        max-width: 440px;
        max-height: 100%;
        overflow: auto;
        padding: 24px;
        border-radius: 28px;
        background: var(--md-sys-color-surface-container-high);
        color: var(--md-sys-color-on-surface);
        box-shadow: 0 1px 3px 0 rgb(0 0 0 / .3), 0 4px 8px 3px rgb(0 0 0 / .15);
        animation: bumpline-card-in 200ms cubic-bezier(.2,0,0,1);
      }
      /* The panel's header in small: the mark and the name, in the variant
         ink, over the question, so a box on Vinted's page says whose it is. */
      .bumpline-modal__brand {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 12px;
        font-weight: 500;
        line-height: 16px;
        letter-spacing: .5px;
      }
      .bumpline-modal__logo {
        flex: none;
        width: 18px;
        height: 18px;
      }
      /* Headline small, with the icon md-dialog puts in the secondary colour,
         or in the error colour when the question is a warning. */
      .bumpline-modal__title {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        font-size: 24px;
        font-weight: 400;
        line-height: 32px;
        letter-spacing: 0;
      }
      .bumpline-modal__title .bumpline-card__icon {
        margin-top: 4px;
        color: var(--md-sys-color-secondary);
      }
      .bumpline-modal--alert .bumpline-modal__title .bumpline-card__icon {
        color: var(--md-sys-color-error);
      }
      .bumpline-modal__body {
        margin-top: 16px;
        color: var(--md-sys-color-on-surface-variant);
      }

      /* An outlined text field's frame around the browser's own select. */
      .bumpline-modal__picker {
        box-sizing: border-box;
        width: 100%;
        height: 56px;
        margin: 16px 0 0;
        padding: 0 12px 0 16px;
        border: 1px solid var(--md-sys-color-outline);
        border-radius: 4px;
        background: transparent;
        box-shadow: none;
        color: var(--md-sys-color-on-surface);
        font: inherit;
        font-size: 16px;
        line-height: 24px;
        letter-spacing: .5px;
      }
      .bumpline-modal__picker:hover { border-color: var(--md-sys-color-on-surface); }
      .bumpline-modal__picker:focus {
        outline: none;
        border-color: var(--md-sys-color-primary);
        box-shadow: inset 0 0 0 1px var(--md-sys-color-primary);
      }

      .bumpline-modal__actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 24px;
      }

      /* md-filled-tonal-button, and with quiet md-text-button. The state layer
         is the label's own colour, 8% on hover and 10% pressed. */
      .bumpline-modal__button {
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: auto;
        min-width: 0;
        height: 40px;
        margin: 0;
        padding: 0 24px;
        border: none;
        border-radius: 20px;
        background: var(--md-sys-color-secondary-container);
        box-shadow: none;
        color: var(--md-sys-color-on-secondary-container);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        line-height: 20px;
        letter-spacing: .1px;
        text-align: center;
        text-transform: none;
        white-space: nowrap;
        cursor: pointer;
        appearance: none;
        transition: background-color 150ms cubic-bezier(.2,0,0,1),
                    box-shadow 150ms cubic-bezier(.2,0,0,1);
      }
      .bumpline-modal__button:has(.bumpline-card__icon) { padding-left: 16px; }
      .bumpline-modal__button .bumpline-card__icon {
        width: 18px;
        height: 18px;
      }
      .bumpline-modal__button:hover {
        background: color-mix(in srgb, currentColor 8%, var(--md-sys-color-secondary-container));
        box-shadow: 0 1px 2px 0 rgb(0 0 0 / .3), 0 1px 3px 1px rgb(0 0 0 / .15);
      }
      .bumpline-modal__button:active {
        background: color-mix(in srgb, currentColor 10%, var(--md-sys-color-secondary-container));
        box-shadow: none;
      }
      .bumpline-modal__button--quiet {
        padding: 0 12px;
        background: transparent;
        color: var(--md-sys-color-primary);
      }
      .bumpline-modal__button--quiet:has(.bumpline-card__icon) { padding: 0 16px 0 12px; }
      .bumpline-modal__button--quiet:hover {
        background: color-mix(in srgb, currentColor 8%, transparent);
        box-shadow: none;
      }
      .bumpline-modal__button--quiet:active {
        background: color-mix(in srgb, currentColor 10%, transparent);
      }
      /* In a warning, going ahead is the quiet answer, in the error ink: the
         quieter of the two to look at, and still the only one that does
         anything. */
      .bumpline-modal--alert .bumpline-modal__button--quiet {
        color: var(--md-sys-color-error);
      }
      .bumpline-modal__button:disabled {
        background: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
        box-shadow: none;
        color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
        cursor: default;
        pointer-events: none;
      }
      .bumpline-modal__button--quiet:disabled { background: transparent; }

      /* md-focus-ring: three pixels of the secondary colour, two pixels out. */
      .bumpline-modal__button:focus-visible {
        outline: 3px solid var(--md-sys-color-secondary);
        outline-offset: 2px;
      }

      @keyframes bumpline-veil-in {
        from { opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .bumpline-modal,
        .bumpline-modal__panel { animation: none; }
        .bumpline-modal__button { transition: none; }
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

  // The panel's check and warning. The tone is in the glyph as well as in the
  // colour, so a card survives a greyscale screen.
  const CARD_GLYPH = {
    ok: 'check',
    bad: 'warning',
  };

  // Heart, coffee, ruler and lightbulb, for the titles and buttons of the
  // modals.
  const MODAL_GLYPH = {
    lightbulb: 'lightbulb',
    heart: 'favorite',
    coffee: 'coffee',
    ruler: 'straighten',
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // A Material Symbol, from the path data icons.js carries for the panel too,
  // drawn in the text's colour on Material's 960-unit box.
  function glyphIcon(glyph) {
    const icon = document.createElementNS(SVG_NS, 'svg');
    icon.setAttribute('viewBox', '0 -960 960 960');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('class', 'bumpline-card__icon');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', BumplineIcons[glyph] || '');
    icon.appendChild(path);
    return icon;
  }

  // Empties a card, gives it its icon on a tonal circle, and hands back the
  // body to fill. One builder, so the three cards cannot drift apart.
  function paintCard(node, place, tone, glyph) {
    node.className = `bumpline-card bumpline-card--${tone} ${place}`;
    node.textContent = '';

    const badge = document.createElement('span');
    badge.className = 'bumpline-card__badge';
    badge.appendChild(glyphIcon(glyph));

    const body = document.createElement('div');
    body.className = 'bumpline-card__body';
    node.append(badge, body);
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
  // Item id to a number of days, not to the line that number reads as. The
  // wardrobe is indexed once and the labels are painted many times — after
  // every mutation, and again after a language change, which repaints them for
  // the language that change was made to. A cached sentence would come back in
  // the language it was first written in and stay there until the page was
  // reloaded, so what is cached is the fact and the wording is made on the way
  // to the screen.
  const ageDays = new Map();
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

  // One day is its own sentence rather than the count's placeholder. "Created 1
  // days ago" was wrong in English long before there was an Italian to get
  // wrong; both are right now.
  const ageLabel = days => {
    if (days <= 0) return T('age.today');
    return days === 1 ? T('age.dayAgo') : T('age.daysAgo', days);
  };

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
        if (days != null) ageDays.set(key, days);
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

  // Called from attachButtons, so a language change repaints these along with
  // the buttons: applyLanguage takes the old lines off with removeOurUi and
  // this puts them back, worded afresh from the days held in ageDays.
  function paintAgeLabels() {
    for (const [id, days] of ageDays) {
      const slot = descriptionSlotFor(id);
      if (!slot || slot.querySelector(`.${CLASS.ageLine}`)) continue;
      const line = document.createElement('div');
      line.className = `new-item-box__description ${CLASS.ageLine}`;
      const text = document.createElement('p');
      text.className =
        'web_ui__Text__text web_ui__Text__caption web_ui__Text__left web_ui__Text__truncated';
      text.textContent = ageLabel(days);
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
    message.textContent = record.draft
      ? T('card.recovery.message.draft', name)
      : T('card.recovery.message.device', name);
    body.appendChild(message);

    // Vinted's own words for the refusal. They used to reach the console only,
    // which meant a stuck relist could not be reported by the person it
    // happened to: they could see that it failed, never why.
    if (record.lastError) {
      const reason = document.createElement('div');
      reason.className = 'bumpline-card__why';
      reason.textContent = T('card.recovery.reason', sayReason(record.lastError));
      body.appendChild(reason);
    }

    const actions = document.createElement('div');
    actions.className = 'bumpline-banner__actions';

    const retry = buildButton(T('card.recovery.retry'));
    retry.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      retry.disabled = true;
      const paused = await readBlock();
      if (paused) {
        retry.disabled = false;
        toast(T('toast.publishPausedUntil', clockOf(paused.until)), 'bad');
        return;
      }
      const done = await advancePending(itemId, await readPending(itemId), null, true);
      retry.disabled = false;
      if (done) await settle(itemId, T('toast.published'));
    });

    const save = buildButton(T('card.recovery.download'));
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
        // Written out rather than passed through: whoever reads the report is a
        // person, and a { code, args } pair would ask them to look the sentence
        // up in a file they do not have.
        lastError: record.lastError ? sayReason(record.lastError) : null,
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

    const forget = buildButton(T('card.recovery.discard'));
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

  // Vinted has refused the publish over the size. The listing had none and
  // nothing said beforehand that this category insists on one, so the size is
  // asked for now, with the original already gone: the copy is on this device
  // and the answer goes straight into it, so backing out loses nothing but
  // leaves the relist unfinished. Resolves to the chosen id, or null.
  async function askForMissingSize(record, csrf) {
    if (!record.item || !record.item.catalog_id) return null;
    let groups;
    try {
      groups = await loadSizeGroups(record.item.catalog_id, csrf);
    } catch (err) {
      trace('size lookup failed', err);
      return null;
    }
    if (!groups.length) return null;
    return askForSize(groups, record.item.title, T('size.why.required'), 'size.body.pending');
  }

  function refusedOverSize(err) {
    return ((err && err.fields) || []).some(field => field === 'size' || field === 'size_id');
  }

  // canAsk is what separates a relist the seller is watching from a resume that
  // ran on its own as a page loaded: only the first may put a window in front
  // of them. A resume that meets the refusal stores it and raises the banner,
  // and the retry button there asks.
  async function attemptPublish(itemId, record, onAttempt, canAsk) {
    let lastError = null;
    let sizeAsked = false;
    let allowed = PUBLISH_ATTEMPTS;
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

    for (let attempt = 1; attempt <= allowed; attempt++) {
      if (onAttempt) onAttempt(attempt, allowed);

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
          lastError = fail('relist.error.publishedNoId');
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
          } else if (canAsk && !sizeAsked && refusedOverSize(err)) {
            // Asked once. A second refusal naming the size means the answer was
            // not the problem, and asking again would only walk the seller
            // round the same window.
            sizeAsked = true;
            const chosen = await askForMissingSize(record, csrf);
            if (chosen == null) {
              // Vinted's own refusal is what stays on the record: the banner
              // reads it back as the reason, and "size: Fill in size to
              // continue" is both true and the thing to act on. Backing out of
              // the window is said here instead, where it is not mistaken for
              // something Vinted said.
              toast(T('size.cancelled.pending'), 'bad');
              break;
            }
            record.item = {
              ...record.item,
              size_id: chosen,
              item_attributes: withSize(record.item.item_attributes, chosen),
            };
            if (record.snapshot) record.snapshot.size_id = chosen;
            await savePending(itemId, record);
            // The refusal has been answered rather than waited out, so the
            // publish it needs is an extra attempt: on the last one otherwise,
            // the seller would pick a size and watch nothing happen.
            allowed = attempt + 1;
          }
        }
      }

      // One wait, and a long one. If the refusal was really a rate limit, the
      // second attempt has to land well clear of the first to be worth making.
      if (attempt < allowed) await pause(between(4000, 9000));
    }

    throw lastError || fail('relist.error.publishGaveUp');
  }

  // Safe to call as often as you like; it either finishes the job or records
  // why it could not.
  async function advancePending(itemId, record, onAttempt, canAsk) {
    if (!record) return false;
    try {
      const published = await attemptPublish(itemId, record, onAttempt, canAsk);
      const newId = published.id;
      await forgetPending(itemId);
      hideBanner(itemId);
      // Completion answers with the published item. Vinted attaches the photos
      // from the draft rather than from the request, so if the copy came out
      // without any, say so at once: the listing is live and the seller is the
      // only one who can fix it.
      const photos = published.photos;
      if (Array.isArray(photos) && !photos.length) {
        toast(T('toast.relistedNoPhotos'), 'bad');
      } else {
        toast(T('toast.relisted'));
      }
      return newId;
    } catch (err) {
      logError('relist still pending for item', itemId, err);
      record.attempts = (record.attempts || 0) + 1;
      // This is written to storage.local and read back on a later page load, so
      // what goes in is the code and its arguments rather than the finished
      // sentence: the seller may be reading it in a language they had not
      // chosen when it was thrown. A refusal that carries no code of ours is
      // Vinted's own words, and those are stored as they arrived.
      record.lastError = err && err.code
        ? { code: err.code, args: err.args || [] }
        : (err && err.message) || String(err);
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
      // Offered is not required. size_groups answers with the default group of
      // the branch the catalog sits in, not with the catalog's own rule:
      // earrings, necklaces, backpacks and sunglasses under Women all come back
      // holding the women's clothing sizes, the same single group a dress does.
      // So a listing without a size proves nothing here, and treating the group
      // as a demand stopped every accessory relist to ask for a clothing size
      // the category never wanted.
      //
      // The listing is the better witness: Vinted accepted it without a size.
      // Where the category has since made one mandatory, completion says so in
      // as many words, and that refusal — not a guess made beforehand — is
      // where the size is asked for. See attemptPublish.
      return { ok: true, required: false };
    }

    const accepted = new Set();
    for (const group of groups) {
      for (const size of group.sizes || []) accepted.add(size.id);
      for (const id of group.size_ids || []) accepted.add(id);
    }
    if (!accepted.has(current)) {
      return { ok: false, groups, why: T('size.why.invalid', current) };
    }
    return { ok: true, required: true };
  }

  // The logo, drawn rather than loaded: an image from the extension would have
  // to be listed in web_accessible_resources, which lets any page find out the
  // extension is installed. Same shapes as icons/logo.svg.
  function logoMark() {
    const mark = document.createElementNS(SVG_NS, 'svg');
    mark.setAttribute('viewBox', '0 0 128 128');
    mark.setAttribute('aria-hidden', 'true');
    mark.setAttribute('class', 'bumpline-modal__logo');
    const shapes = [
      { width: 128, height: 128, rx: 28, fill: '#007580' },
      { x: 72, y: 88, width: 32, height: 16, rx: 8, fill: '#FBFBFB', opacity: '.35' },
      { x: 48, y: 56, width: 56, height: 16, rx: 8, fill: '#FBFBFB', opacity: '.55' },
      { x: 24, y: 24, width: 80, height: 16, rx: 8, fill: '#FBFBFB' },
    ];
    for (const attributes of shapes) {
      const rect = document.createElementNS(SVG_NS, 'rect');
      for (const [name, value] of Object.entries(attributes)) rect.setAttribute(name, value);
      mark.appendChild(rect);
    }
    return mark;
  }

  let modalCount = 0;

  // The frame every question on the page is drawn in: the veil, the card, the
  // name it comes from, and a title with its icon over the note. tone 'alert'
  // turns it red. Escape answers with onCancel, as Escape closes the popup's
  // own dialog; every cancel here is the answer that changes nothing. Hands
  // back the panel, to add the rest to, and close, to call once answered.
  function buildModal({ tone, glyph, title, body, onCancel }) {
    const id = `bumpline-modal-${++modalCount}`;

    const overlay = document.createElement('div');
    overlay.className = tone ? `bumpline-modal bumpline-modal--${tone}` : 'bumpline-modal';

    const panel = document.createElement('div');
    panel.className = 'bumpline-modal__panel';
    panel.setAttribute('role', tone === 'alert' ? 'alertdialog' : 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', `${id}-title`);
    panel.setAttribute('aria-describedby', `${id}-body`);

    // On Vinted's page, the name is what says this box is not Vinted's.
    const brand = document.createElement('div');
    brand.className = 'bumpline-modal__brand';
    brand.append(logoMark(), 'Bumpline');

    const heading = document.createElement('div');
    heading.className = 'bumpline-modal__title';
    heading.id = `${id}-title`;
    const words = document.createElement('span');
    words.textContent = title;
    heading.append(glyphIcon(glyph), words);

    const text = document.createElement('div');
    text.className = 'bumpline-modal__body';
    text.id = `${id}-body`;
    text.textContent = body;

    panel.append(brand, heading, text);
    overlay.appendChild(panel);

    // Captured, and kept from Vinted's own handlers, so the Escape that closes
    // this does not also close something of Vinted's underneath it.
    const onKey = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    document.addEventListener('keydown', onKey, true);

    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
    };

    document.body.appendChild(overlay);
    return { panel, close };
  }

  // The panel's tonal button, and with quiet its text button. Its own markup
  // rather than Vinted's, which buildButton borrows for the buttons that sit
  // among Vinted's own: inside the dialog it would be the one thing not in the
  // panel's style.
  function modalButton(label, { quiet = false, glyph = null } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = quiet
      ? 'bumpline-modal__button bumpline-modal__button--quiet'
      : 'bumpline-modal__button';
    if (glyph) button.appendChild(glyphIcon(glyph));
    const text = document.createElement('span');
    text.textContent = label;
    button.appendChild(text);
    return button;
  }

  // The panel askForSize uses, reduced to a yes and a no. A warning about the
  // account cannot be got past by not reading it: carrying on is a separate,
  // deliberate click, and the cancel is the button holding focus.
  function askToContinue({ title, body, proceed, cancel, tone, glyph, proceedGlyph }) {
    return new Promise(resolve => {
      const answer = value => {
        close();
        resolve(value);
      };
      const { panel, close } = buildModal({
        tone, glyph, title, body,
        onCancel: () => answer(false),
      });

      const actions = document.createElement('div');
      actions.className = 'bumpline-modal__actions';

      // A warning hands the weight to the answer that changes nothing, as the
      // panel's own does: the safe answer is the tonal one, on the right, and
      // going ahead is the quiet one beside it. Anything else asks with the
      // going ahead on the right and the no-thanks quiet.
      const alert = tone === 'alert';

      const stop = modalButton(cancel, { quiet: !alert });
      stop.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        answer(false);
      });

      const go = modalButton(proceed, { quiet: alert, glyph: proceedGlyph });
      go.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        answer(true);
      });

      if (alert) actions.append(go, stop);
      else actions.append(stop, go);
      panel.appendChild(actions);
      stop.focus();
    });
  }

  // A modal with something to read and a single button to say it has been
  // read. Escape is the same answer, there being no other.
  function tell({ glyph, title, body, ok }) {
    return new Promise(resolve => {
      const answer = () => {
        close();
        resolve();
      };
      const { panel, close } = buildModal({ glyph, title, body, onCancel: answer });

      const actions = document.createElement('div');
      actions.className = 'bumpline-modal__actions';

      const done = modalButton(ok);
      done.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        answer();
      });

      actions.appendChild(done);
      panel.appendChild(actions);
      done.focus();
    });
  }

  // Once, on the first plain relist: the draft button leaves the publish to
  // the seller, on Vinted's own page, which is one automated write fewer for
  // an account Vinted has already restricted once. The relist goes ahead
  // either way; the advice is for next time. Closing it is the "don't show
  // again", so it is written down before the modal goes up, not after: a page
  // that reloads mid-relist would otherwise ask again.
  async function adviseDraftOnce(button) {
    try {
      const bag = await ext.storage.local.get(DRAFT_TIP_KEY);
      if (bag[DRAFT_TIP_KEY] === true) return;
      await ext.storage.local.set({ [DRAFT_TIP_KEY]: true });
    } catch (_) {
      return;
    }
    setButtonLabel(button, T('button.waiting'));
    await tell({
      glyph: MODAL_GLYPH.lightbulb,
      title: T('tip.draft.title'),
      // Named as the button is named now: with the original kept online it is
      // "Copy to drafts", and the advice holds for that one too.
      body: T('tip.draft.body', draftWords().label),
      ok: T('tip.draft.ok'),
    });
  }

  // Resolves to the chosen size id, or null if the person backs out. Shown
  // before anything is deleted when the size the listing carries has stopped
  // being valid, and after the deletion when Vinted refuses the publish over a
  // size the listing never had. The two moments differ in what backing out
  // costs, so the sentence explaining them is the caller's to choose.
  function askForSize(groups, title, why, bodyKey) {
    return new Promise(resolve => {
      const answer = value => {
        close();
        resolve(value);
      };
      const { panel, close } = buildModal({
        glyph: MODAL_GLYPH.ruler,
        title: T('size.title'),
        body: T(bodyKey || 'size.body', title, why),
        onCancel: () => answer(null),
      });

      const picker = document.createElement('select');
      picker.className = 'bumpline-modal__picker';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = T('size.blank');
      picker.appendChild(blank);

      for (const group of groups) {
        const section = document.createElement('optgroup');
        section.label = group.description || group.caption || T('size.group', group.id);
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

      const cancel = modalButton(T('size.cancel'), { quiet: true });
      cancel.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        answer(null);
      });

      // Greyed out until a size is picked, rather than live and doing nothing
      // when pressed.
      const accept = modalButton(T('size.accept'));
      accept.disabled = true;
      picker.addEventListener('change', () => {
        accept.disabled = !picker.value;
      });
      accept.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!picker.value) return;
        answer(Number(picker.value));
      });

      actions.append(cancel, accept);
      panel.append(picker, actions);
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
    await countRelist();
    if (await reloadWanted()) {
      toast(T('toast.reloading', message));
      setTimeout(() => location.reload(), 1200);
      // Asked on the page that comes back, by attachButtons: one drawn here
      // would be gone with the reload a second later.
      return;
    }
    dropCard(itemId);
    toast(T('toast.reloadToSee', message));
    // The same moment's wait as after a reload, so the toast is read before
    // the veil covers it.
    pause(DONATE_DELAY_MS).then(offerDonation);
  }

  // Every relist that ends in settle(), which is every one that deleted an
  // original and left its copy on Vinted. A copy saved with the original kept
  // online is not a relist and is not counted. The count is kept apart from
  // the relist log, which forgets anything older than a day. When it reaches
  // a number that asks, the asking is written down rather than done here,
  // because the page is usually about to reload.
  async function countRelist() {
    try {
      const bag = await ext.storage.local.get(RELIST_COUNT_KEY);
      const count = (Number(bag[RELIST_COUNT_KEY]) || 0) + 1;
      const due = count >= DONATE_FIRST_AT && (count - DONATE_FIRST_AT) % DONATE_EVERY === 0;
      await ext.storage.local.set({
        [RELIST_COUNT_KEY]: count,
        ...(due ? { [DONATE_DUE_KEY]: count } : {}),
      });
    } catch (err) {
      trace('could not count the relist', err);
    }
  }

  // Shows the request if one is waiting, and clears it before showing it, so
  // a second tab on the same wardrobe does not ask again. Saying no costs
  // nothing and is the button holding focus; saying yes opens Ko-fi in a tab
  // of its own and leaves this page where it was.
  async function offerDonation() {
    let count;
    try {
      const bag = await ext.storage.local.get(DONATE_DUE_KEY);
      count = bag[DONATE_DUE_KEY];
      if (!count) return;
      await ext.storage.local.remove(DONATE_DUE_KEY);
    } catch (_) {
      return;
    }
    const give = await askToContinue({
      glyph: MODAL_GLYPH.heart,
      title: T('donate.title', count),
      body: T('donate.body'),
      proceed: T('donate.proceed'),
      proceedGlyph: MODAL_GLYPH.coffee,
      cancel: T('donate.cancel'),
    });
    if (give) window.open(DONATE_URL, '_blank', 'noopener');
  }

  // ===========================================================================
  // The relist itself
  // ===========================================================================

  async function relist(button, mode) {
    const itemId = itemIdFor(button);
    if (!itemId) {
      toast(T('toast.cantFindItem'), 'bad');
      return;
    }

    // An unfinished relist means an original is already gone. Finish that
    // before starting anything new.
    const outstanding = await readPending(itemId);
    if (outstanding) {
      toast(T('toast.resumingUnfinished'), 'bad');
      await advancePending(itemId, outstanding, null, true);
      return;
    }

    const draftOnly = mode === 'draft';
    // Taken at the click, from the name the button carried when it was
    // pressed: a setting changed mid-relist does not change what this one does.
    const copyOnly = draftOnly && keepOriginal;

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
        toast(T('toast.pausedUntil', clockOf(paused.until)), 'bad');
        return;
      }

      if (!draftOnly) await adviseDraftOnce(button);

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
          tone: 'alert',
          glyph: CARD_GLYPH.bad,
          title: overDay ? T('budget.title.day') : T('budget.title.hour'),
          body: overDay
            ? T('budget.body.day', today)
            : T('budget.body.hour', thisHour),
          proceed: T('budget.proceed'),
          cancel: T('budget.cancel'),
        });
        if (!carryOn) {
          toast(T('toast.stopped'));
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
        throw new Error(T('relist.error.noPhoto'));
      }
      if (photoUrls.length && assigned.length < photoUrls.length) {
        throw new Error(T('relist.error.photosIncomplete', assigned.length, photoUrls.length, failures));
      }
      if (!item.title) {
        throw new Error(T('relist.error.noTitle'));
      }
      if (conditionId == null) {
        throw new Error(T('relist.error.noCondition'));
      }

      setButtonLabel(button, T('button.checkingSize'));
      const size = await inspectSize(source, csrf);
      if (!size.ok) {
        if (!size.groups || !size.groups.length) {
          // size.why is already translated by inspectSize; a bare English
          // tail glued onto it here would have produced a mixed-language
          // sentence, so the tail gets its own key (size.unavailable)
          // instead of being appended as a literal.
          throw new Error(T('size.unavailable', size.why));
        }
        setButtonLabel(button, T('button.waitingSize'));
        const chosen = await askForSize(size.groups, item.title, size.why);
        if (!chosen) throw new Error(T('size.cancelled'));
        item.size_id = chosen;
        item.item_attributes = withSize(item.item_attributes, chosen);
        snapshot.size_id = chosen;
      }

      // --- a copy and nothing else. The seller asked the draft button to leave
      // the original online, so from here nothing is deleted: there is no
      // pending record to keep, no copy of the photos to hold on this device,
      // no relist to count and nothing on the page to reload. The draft on
      // Vinted is the whole result, and the original is still there if
      // opening it fails. The last check before a deletion is skipped with
      // the deletion.
      if (copyOnly) {
        setButtonLabel(button, T('button.savingDraft'));
        await step(pace);
        await openDraft(csrf, item, sessionId);
        toast(T('toast.copiedToDrafts'));
        return;
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
          throw new Error(T('relist.error.copyNotSaved'));
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
        await settle(itemId, T('toast.originalDeletedDraft'));
        return;
      }

      setButtonLabel(button, T('button.publishing'));
      await step(pace);
      const newId = await advancePending(
        itemId,
        record,
        (attempt, total) => {
          setButtonLabel(button, attempt === 1 ? T('button.publishing') : T('button.retrying', attempt, total));
        },
        true,
      );
      if (newId) await settle(itemId, T('toast.relisted'));
      // On failure advancePending has already stored the record and raised the
      // banner, and the next page load will try again.
    } catch (err) {
      logError(err);
      toast(T('toast.relistStopped', (err && err.message) || err), 'bad');
    } finally {
      button.disabled = false;
      button.classList.remove('is-busy');
      // Named afresh rather than put back: the setting may have changed while
      // this button was busy, and applyKeepOriginal passed it over.
      if (draftOnly) {
        const words = draftWords();
        setButtonLabel(button, words.label);
        button.title = words.title;
      } else {
        setButtonLabel(button, T('button.relist'));
      }
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

      const words = draftWords();
      const draft = buildButton(words.label);
      draft.classList.add(CLASS.button, CLASS.draftButton);
      draft.title = words.title;
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
    if (added) {
      trace('added buttons to', added, 'item(s)');
      rememberSite();
      offerDonationOnce();
    }
  }

  let donationChecked = false;

  // The page that comes back from a relist's reload. A moment's wait first, so
  // the seller sees the listing back at the top before anything covers it.
  async function offerDonationOnce() {
    if (donationChecked) return;
    donationChecked = true;
    await pause(DONATE_DELAY_MS);
    offerDonation();
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
  // The uninstall address tells the goodbye page which Vinted site was used
  // last, after the # (see background.js). Written only when it changes.
  function rememberSite() {
    const site = BumplineLog.siteOf(location.hostname);
    if (!site) return;
    Promise.resolve(ext.storage.local.get(BumplineLog.LAST_SITE_KEY))
      .then(bag => {
        if (bag[BumplineLog.LAST_SITE_KEY] === site) return undefined;
        return ext.storage.local.set({ [BumplineLog.LAST_SITE_KEY]: site });
      })
      .catch(err => trace('could not remember the site', err));
  }

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
    if (LANG_KEY in changes) applyLanguage(changes[LANG_KEY].newValue || 'auto');
    if (BLOCK_KEY in changes) applyLock(changes[BLOCK_KEY].newValue);
    if (KEEP_ORIGINAL_KEY in changes) applyKeepOriginal(changes[KEEP_ORIGINAL_KEY].newValue === true);
  });

  readSetting(KEEP_ORIGINAL_KEY, false)
    .then(value => applyKeepOriginal(value === true))
    .catch(err => trace('could not read the draft setting', err));

  readBlock()
    .then(applyLock)
    .catch(err => trace('could not read the pause', err));

  new MutationObserver(() => attachButtons()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // The language has to be settled before anything is drawn, or the first
  // paint is in the wrong tongue and applyLanguage has to redo it a moment
  // later.
  readLanguage().then(applyLanguage);
  // The switch decides whether there is anything to draw at all, so it is read
  // before the first attempt rather than after it.
  readEnabled().then(applyEnabled);
})();
