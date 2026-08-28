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

  // Every request is derived from the page we are on, which is what makes the
  // extension work unchanged across all of Vinted's country domains.
  const SITE = location.origin;

  const SELECTOR = {
    card: '[data-testid^="product-item-id-"]',
    bump: 'button[data-testid="bump-button"]',
    ourButton: '.bumpline-btn',
    gap: '.bumpline-gap',
  };

  const CLASS = {
    button: 'bumpline-btn',
    draftButton: 'bumpline-btn--draft',
    gap: 'bumpline-gap',
    toast: 'bumpline-toast',
    banner: 'bumpline-banner',
    ageLine: 'bumpline-age',
  };

  const PUBLISH_ATTEMPTS = 5;
  const STORE_PREFIX = 'bumpline:pending:';
  const LAST_PROFILE_KEY = 'bumpline:lastProfile';
  const DB_NAME = 'bumpline';
  const DB_STORE = 'photos';

  const trace = (...parts) => console.debug('[Bumpline]', ...parts);
  const pause = ms => new Promise(done => setTimeout(done, ms));

  const randomUuid = () =>
    (crypto.randomUUID && crypto.randomUUID()) ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
      return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });

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

  function askWorker(message) {
    return new Promise(done => {
      try {
        chrome.runtime.sendMessage(message, reply => done(reply || {}));
      } catch (err) {
        trace('worker unreachable', err);
        done({});
      }
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

    const page = await fetch(`${SITE}/items/new`, { credentials: 'include' });
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
    const reply = await fetch(`${SITE}/api/v2/item_upload/items/${itemId}`, {
      credentials: 'include',
      headers: await readHeaders(csrf),
    });
    if (!reply.ok) {
      const body = await reply.text();
      if (reply.status === 404) {
        throw new Error(`Item ${itemId} cannot be edited — it is sold, reserved or already gone.`);
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
    const reply = await fetch(url, { credentials: 'include', headers: await readHeaders(csrf) });
    if (!reply.ok) throw new Error(`Size lookup failed with HTTP ${reply.status}`);
    const parsed = await reply.json();
    return parsed.size_groups || [];
  }

  async function sendPhoto(csrf, blob, sessionId) {
    const form = new FormData();
    form.append('photo[type]', 'item');
    form.append('photo[temp_uuid]', sessionId);
    form.append('photo[file]', blob, 'photo.jpg');

    const anon = await anonymousId();
    const reply = await fetch(`${SITE}/api/v2/photos`, {
      method: 'POST',
      credentials: 'include',
      body: form,
      headers: {
        'x-csrf-token': csrf,
        'x-enable-multiple-size-groups': 'true',
        ...(anon ? { 'x-anon-id': anon } : {}),
      },
    });
    if (!reply.ok) throw new Error(`Photo upload failed with HTTP ${reply.status}`);
    return reply.json();
  }

  // A draft is private and is not a listing, so it does not collide with the
  // original while that is still online.
  async function openDraft(csrf, item, sessionId) {
    const reply = await fetch(`${SITE}/api/v2/item_upload/drafts`, {
      method: 'POST',
      credentials: 'include',
      headers: await writeHeaders(csrf),
      body: JSON.stringify({ draft: item, parcel: null, upload_session_id: sessionId }),
    });
    const body = await reply.text();
    if (!reply.ok) {
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

  async function publishDraft(csrf, draft, sessionId) {
    const reply = await fetch(`${SITE}/api/v2/item_upload/drafts/${draft.id}/completion`, {
      method: 'POST',
      credentials: 'include',
      headers: await writeHeaders(csrf),
      body: JSON.stringify({
        draft,
        push_up: false,
        parcel: null,
        upload_session_id: sessionId,
      }),
    });
    const body = await reply.text();
    if (!reply.ok) {
      const failure = new Error(`Could not publish the draft: ${explainFailure(reply.status, body)}`);
      failure.status = reply.status;
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
      await fetch(`${SITE}/api/v2/item_upload/drafts/${draftId}`, {
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
    const reply = await fetch(`${SITE}/api/v2/items/${itemId}/delete`, {
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
      .${CLASS.draftButton} { margin-top: 6px !important; }

      .bumpline-note {
        box-sizing: border-box;
        max-width: 420px;
        padding: 12px 14px;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1.4;
      }
      .bumpline-note--ok  { background:#e6f7ee; color:#0f5132; border:1px solid #a3e4c4; }
      .bumpline-note--bad { background:#fdecea; color:#842029; border:1px solid #f5c2c7; }

      .${CLASS.toast} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        box-shadow: 0 6px 18px rgba(0,0,0,.15);
      }

      .${CLASS.banner} {
        position: fixed;
        right: 16px;
        top: 16px;
        z-index: 2147483647;
        max-width: 380px;
        box-shadow: 0 4px 16px rgba(0,0,0,.18);
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

  function toast(message, kind = 'ok') {
    let node = document.getElementById(TOAST_ID);
    if (!node) {
      node = document.createElement('div');
      node.id = TOAST_ID;
      document.body.appendChild(node);
    }
    node.className = `bumpline-note bumpline-note--${kind === 'bad' ? 'bad' : 'ok'} ${CLASS.toast}`;
    node.setAttribute('role', 'alert');
    node.setAttribute('aria-live', kind === 'bad' ? 'assertive' : 'polite');
    node.textContent = message;

    clearTimeout(Number(node.dataset.timer));
    if (kind !== 'bad') {
      // Failures stay on screen; confirmations do not need to.
      node.dataset.timer = String(setTimeout(() => node.remove(), 6000));
    }
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
  const pager = { started: false, lastPage: 0, totalPages: null };

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
      const reply = await fetch(`${SITE}/api/v2/wardrobe/${member}/items?${query}`, {
        credentials: 'include',
        headers: {
          accept: 'application/json, text/plain, */*',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
          ...(anon ? { 'x-anon-id': anon } : {}),
          referer: location.href,
        },
      });
      if (!reply.ok) return null;

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
    const items = await loadWardrobePage(1);
    if (!items) return;
    pager.lastPage = 1;
    paintAgeLabels();
    dropButtonsOnClosedItems();
  }

  // Infinite scroll reveals cards the first page never covered, so keep pulling
  // pages until the visible ids are all accounted for.
  async function indexRemainingPages() {
    const missing = itemIdsOnScreen().filter(id => !itemIndex.has(id));
    if (!missing.length) return;
    if (pager.totalPages !== null && pager.lastPage >= pager.totalPages) return;

    let page = pager.lastPage + 1;
    let budget = 10;

    while (budget-- > 0 && missing.some(id => !itemIndex.has(id))) {
      if (pager.totalPages !== null && page > pager.totalPages) break;
      const items = await loadWardrobePage(page);
      if (!items || !items.length) break;
      pager.lastPage = page;
      page += 1;
      await pause(100); // stay polite with the API
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

  const savePending = (itemId, record) =>
    chrome.storage.local.set({ [pendingKey(itemId)]: record });

  async function readPending(itemId) {
    const bag = await chrome.storage.local.get(pendingKey(itemId));
    return bag[pendingKey(itemId)] || null;
  }

  async function forgetPending(itemId) {
    try {
      await chrome.storage.local.remove(pendingKey(itemId));
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
    box.className = `bumpline-note bumpline-note--bad ${CLASS.banner}`;
    box.textContent = '';

    const name = (record.snapshot && record.snapshot.title) || itemId;
    const message = document.createElement('div');
    message.textContent =
      `"${name}" was deleted but is not published yet (${record.attempts || 0} failed attempt(s)). ` +
      (record.draft
        ? 'It is saved as a draft in your Vinted account, so you can also publish it by hand. '
        : 'Its details and photos are saved on this device. ') +
      'Publishing is retried every time you open a Vinted page.';
    box.appendChild(message);

    const actions = document.createElement('div');
    actions.className = 'bumpline-banner__actions';

    const retry = buildButton('Retry now');
    retry.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      retry.disabled = true;
      const done = await advancePending(itemId, await readPending(itemId));
      retry.disabled = false;
      if (done) setTimeout(() => location.reload(), 1200);
    });

    const save = buildButton('Download data');
    save.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const file = new Blob([JSON.stringify(record.snapshot, null, 2)], { type: 'application/json' });
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
    box.appendChild(actions);
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
          }
          const published = await publishDraft(csrf, record.draft, record.sessionId);
          if (published && published.id) return published.id;
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
                record.draft = null;
                await savePending(itemId, record);
              }
            } catch (retryErr) {
              trace('photo refresh failed', retryErr);
            }
          }
        }
      }

      if (attempt < PUBLISH_ATTEMPTS) await pause(1000 * 2 ** (attempt - 1));
    }

    throw lastError || new Error('Publishing failed after several attempts.');
  }

  // Safe to call as often as you like; it either finishes the job or records
  // why it could not.
  async function advancePending(itemId, record, onAttempt) {
    if (!record) return false;
    try {
      const newId = await attemptPublish(itemId, record, onAttempt);
      await forgetPending(itemId);
      hideBanner(itemId);
      toast(`Relisted. The new listing is ${newId}.`);
      return newId;
    } catch (err) {
      console.error('[Bumpline] relist still pending for item', itemId, err);
      record.attempts = (record.attempts || 0) + 1;
      record.lastError = (err && err.message) || String(err);
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
      bag = await chrome.storage.local.get(null);
    } catch (err) {
      trace('could not read pending records', err);
      return;
    }

    const prefix = `${STORE_PREFIX}${SITE}:`;
    for (const key of Object.keys(bag || {})) {
      if (!key.startsWith(prefix)) continue;
      const itemId = key.slice(prefix.length);
      showBanner(itemId, bag[key]);
      await advancePending(itemId, bag[key]);
    }
  }

  // ===========================================================================
  // Size handling
  // ===========================================================================

  // A catalog can offer several parallel size groups (S/M/L, EU, IT, UK, US,
  // FR). Every size id is unique across all of them, so a copied id is valid as
  // long as it appears somewhere in the union.
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

    if (item.size_id == null) {
      // Listings predating a catalog that has since made the size mandatory.
      // Publishing them unchanged fails with "Fill in size to continue".
      return { ok: false, groups, why: 'this category now requires a size and the listing has none' };
    }

    const accepted = new Set();
    for (const group of groups) {
      for (const size of group.sizes || []) accepted.add(size.id);
      for (const id of group.size_ids || []) accepted.add(id);
    }
    if (!accepted.has(item.size_id)) {
      return { ok: false, groups, why: `size ${item.size_id} is no longer valid for this category` };
    }
    return { ok: true, required: true };
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
      blank.textContent = '— select a size —';
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
      size_id: source.size_id || null,
      catalog_id: source.catalog_id || null,
      status_id: conditionId,
      is_unisex: Boolean(source.is_unisex),
      color_ids: colours || [],
      item_attributes: source.item_attributes || [],
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
      toast('An earlier relist of this item is unfinished. Resuming it first.', 'bad');
      await advancePending(itemId, outstanding);
      return;
    }

    const draftOnly = mode === 'draft';
    const restingLabel = draftOnly ? 'Relist as draft' : 'Relist';

    button.disabled = true;
    button.classList.add('is-busy');

    try {
      setButtonLabel(button, 'Relisting…');
      const csrf = await csrfToken();
      const source = await loadEditableItem(itemId, csrf);

      // --- photos: fetch, re-upload, and keep the bytes for recovery
      const sessionId = randomUuid();
      const photoUrls = photoUrlsOf(source);
      const assigned = [];
      const blobs = [];
      let failures = 0;

      for (const url of photoUrls) {
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
            `(${failures} failed). Nothing was deleted — try again in a moment.`
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

      setButtonLabel(button, 'Checking size…');
      const size = await inspectSize(source, csrf);
      if (!size.ok) {
        if (!size.groups || !size.groups.length) {
          throw new Error(`${size.why}. Nothing was deleted.`);
        }
        setButtonLabel(button, 'Waiting for size…');
        const chosen = await askForSize(size.groups, item.title, size.why);
        if (!chosen) throw new Error('Cancelled. Nothing was deleted.');
        item.size_id = chosen;
        snapshot.size_id = chosen;
      }

      setButtonLabel(button, 'Checking…');
      await assertItemReachable(itemId, csrf);

      // --- the copy is put somewhere safe before the original is touched
      setButtonLabel(button, 'Saving draft…');
      const draft = await openDraft(csrf, item, sessionId);

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
      try {
        await stashPhotos(itemId, blobs);
      } catch (err) {
        trace('could not cache photos', err);
      }
      await savePending(itemId, record);

      // --- from here the original goes; the copy already exists twice over
      setButtonLabel(button, 'Deleting…');
      try {
        await removeListing(csrf, itemId);
      } catch (err) {
        // Nothing was destroyed, so leave no draft or record behind.
        await discardDraft(csrf, draft.id);
        await forgetPending(itemId);
        throw err;
      }

      if (draftOnly) {
        // The draft is the finished result, not something still pending.
        await forgetPending(itemId);
        toast(
          'Original deleted. The copy is waiting in your Vinted drafts — publish it ' +
            'when you are ready. Reloading…'
        );
        setTimeout(() => location.reload(), 1800);
        return;
      }

      setButtonLabel(button, 'Publishing…');
      const newId = await advancePending(itemId, record, (attempt, total) => {
        setButtonLabel(button, attempt === 1 ? 'Publishing…' : `Retrying ${attempt}/${total}…`);
      });
      if (newId) {
        toast('Relisted. Reloading…');
        setTimeout(() => location.reload(), 1200);
      }
      // On failure advancePending has already stored the record and raised the
      // banner, and the next page load will try again.
    } catch (err) {
      console.error('[Bumpline]', err);
      toast(`Relist stopped: ${(err && err.message) || err}`, 'bad');
    } finally {
      button.disabled = false;
      button.classList.remove('is-busy');
      setButtonLabel(button, restingLabel);
    }
  }

  // ===========================================================================
  // Wiring the buttons into the page
  // ===========================================================================

  function attachButtons() {
    installStyles();
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

      const publish = buildButton('Relist');
      publish.classList.add(CLASS.button);
      publish.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        relist(publish, 'publish');
      });

      const draft = buildButton('Relist as draft');
      draft.classList.add(CLASS.button, CLASS.draftButton);
      draft.title = 'Delete the original and leave the copy unpublished in your Vinted drafts';
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
    if (added) trace('added buttons to', added, 'item(s)');
  }

  // The toolbar popup has no way of knowing which country site the seller uses,
  // or their member id. Leaving a note here means it can always offer to open
  // the right profile page, whatever tab it is opened from.
  chrome.storage.local
    .set({ [LAST_PROFILE_KEY]: `${SITE}${location.pathname}` })
    .catch(() => {
      // Only costs the popup a shortcut; nothing else depends on it.
    });

  new MutationObserver(() => attachButtons()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  attachButtons();
})();
