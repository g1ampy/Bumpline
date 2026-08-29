// Bumpline — main-world fetch bridge.
//
// Copyright (C) 2026 g1ampy
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation, either version 3 of the License, or (at your option)
// any later version.
//
// The content script's isolated world has its own window.fetch that bypasses
// every patch the page's scripts apply. DataDome and similar SDKs patch
// fetch in the main world, adding tracking headers that mark the request as
// part of a real browser session. This bridge runs in the main world so
// every API call Bumpline makes goes through that patched fetch, carrying
// the headers a real user's requests would carry.
//
// Communication is by postMessage on the shared window. The channel name
// is random per injection so the messages are not trivially addressable by
// the page's own scripts.

(() => {
  'use strict';

  const script = document.currentScript;
  const ch = script && script.dataset.ch;
  if (!ch) return;

  const REQ = 'bl:' + ch + ':q';
  const RES = 'bl:' + ch + ':r';

  window.addEventListener('message', async event => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.t !== REQ) return;

    try {
      let body;
      const headers = d.headers ? { ...d.headers } : {};

      if (d.fields) {
        body = new FormData();
        for (const f of d.fields) {
          if (f.buffer) {
            const blob = new Blob([f.buffer], { type: f.type || 'application/octet-stream' });
            body.append(f.name, blob, f.filename || 'file');
          } else {
            body.append(f.name, f.value);
          }
        }
        delete headers['content-type'];
      } else if (d.body !== undefined) {
        body = d.body;
      }

      const response = await fetch(d.url, {
        method: d.method || 'GET',
        credentials: 'include',
        headers,
        body,
      });

      const text = await response.text();
      const rh = {};
      response.headers.forEach((v, k) => { rh[k] = v; });

      window.postMessage({ t: RES, id: d.id, s: response.status, h: rh, b: text }, '*');
    } catch (err) {
      window.postMessage({ t: RES, id: d.id, e: String(err) }, '*');
    }
  });

  window.postMessage({ t: 'bl:' + ch + ':ok' }, '*');
  if (script.parentNode) script.parentNode.removeChild(script);
})();
