# Changelog

All notable changes to Bumpline are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Firefox support.** The extension now builds for Firefox 140 and newer.
  Firefox runs the background as an event page rather than a service worker and
  requires an add-on id, so `node build.mjs` writes a manifest per browser and
  packages both from the same source. Nothing about the relist changed.

### Changed

- **The browser APIs are reached through one alias.** Firefox returns promises
  only from the `browser` namespace, and the code was written against Chrome's
  `chrome`. Both are now taken from a single alias per file, and the one
  callback-style call left — the content script asking the background for
  Vinted's tokens — was rewritten as a promise, which is the only shape Firefox
  offers.

[Unreleased]: https://github.com/g1ampy/Bumpline/compare/v1.0.0...HEAD

## [1.0.0] - 2026-08-28

Bumpline leaves `0.x`. Nothing about the relist changed — the version number
says the tool is finished and tested, not experimental, and the toolbar popup
closes the last gap between installing it and finding it.

### Added

- **Toolbar popup.** Until now the extension gave no sign of itself outside the
  Vinted page: installing it from the store showed nothing anywhere, and the
  obvious conclusion was that it did not work. Clicking the toolbar icon now
  says whether the buttons are on the page you are looking at, and how many
  items they are on. It asks the page rather than reading the address bar,
  because somebody else's wardrobe has the same URL shape as your own.
- **Unfinished relists are visible from the toolbar.** If publishing failed, the
  popup names the items still waiting and opens the exact profile page the
  retry runs on. Previously this was only discoverable by returning to that page
  by chance.

- **A switch for the reload after a relist.** The page reloads when a relist
  finishes, because it is otherwise showing an item that no longer exists and
  hiding the copy that replaced it. That costs you your scroll position and any
  filter you had set, so the popup can now turn it off. With it off the card of
  the deleted listing is removed on the spot and the toast says the rest of the
  page is stale. On by default, as before.
- **One action, and only when it leads somewhere.** The popup offers a single
  button — reopen the stuck relist's profile page, or open your profile when you
  are somewhere else entirely — and shows none at all when the current tab is
  already the right one.
- **A welcome page after the install.** Installed from the store the extension
  draws nothing anywhere until you are on your own wardrobe, so the toolbar
  looks empty and the obvious conclusion is that nothing happened. A page now
  opens once, on the install only, and answers the two questions that stand
  between the install and the first relist: how to pin the icon so it stops
  hiding behind the puzzle piece, and where the Relist buttons appear. It
  carries the popup's palette and drawings instead of screenshots, so it needs
  no assets and follows the browser's light or dark setting.
- **A stuck relist now says why.** Vinted's refusal was written to the console
  and nowhere else, so the person it happened to could see that publishing
  failed but never the reason, and could not report it. The banner and the
  toolbar popup now show Vinted's own words, and **Download data** saves the
  whole case — the refusal, the number of attempts, the payload that was sent
  and the listing snapshot — instead of the snapshot alone.

### Changed

- Pending relists now record the profile page they were started from, and the
  content script remembers the last profile page it ran on, so the popup can
  link straight back to it from any tab. Records written by earlier versions
  fall back to the country domain.

### Fixed

- **Publishing failed for every relist, on every item.** Vinted answers
  `POST /item_upload/drafts` with a stub — an id and little else — and the
  publish step handed that stub straight back to the completion endpoint, which
  validates the draft in the request body rather than the one already stored.
  Vinted therefore refused every publish with all nine required fields reported
  empty (`title: Compila il campo "titolo"…`, category, price, package size,
  condition, size, brand, colour), even though the draft sitting in the seller's
  account was complete and published fine by hand from Vinted's own form. The
  full payload is now sent again at completion, wearing the id the draft was
  given. There is no reading the draft back to check — `GET` and `PUT` on
  `/item_upload/drafts/<id>` both answer with the same 62-byte stub — so the
  payload that built it is the only full copy there is. The original was already
  deleted by then, so the item survived only because it was saved as a draft
  first.
- **The photos were named for the wrong endpoint.** `assigned_photos` is what
  creates a draft; completion refuses it with `photos: Error uploading photo`.
  Measured against a scratch draft: the creation spelling drew that error every
  time, the completion spelling drew none. Vinted attaches the photos held by
  the draft rather than the ones named in the request, so if a published copy
  ever comes back with none, the toast now says so instead of reporting success.
- **A failed publish left a pile of drafts behind.** When a retry replaced the
  draft it abandoned the previous one, so five attempts on one item left six
  copies in the seller's drafts. The superseded draft is now deleted — but only
  once its replacement exists, never before: after the original listing is gone
  the draft is the single remaining copy, and removing it first would leave the
  item nowhere at all.
- **Every relist stopped to ask for a size the item already had, and refused to
  publish once one was given.** Vinted has moved the size the way it once moved
  the condition — out of the top-level `size_id`, which no longer comes back at
  all, and into `item_attributes` as `{ code: 'size', ids: [n] }` — but it still
  takes the size back in `size_id` alone. Reading only the old field made every
  listing in a sized category look sizeless; sending only the new one had
  completion answer `size: Fill in size to continue`. Measured against a scratch
  draft: `size_id` alone passes, the attribute alone does not, both together
  pass. Both are now read and both are sent, and a relist left stuck by the
  earlier shape repairs its own stored payload on the next retry instead of
  asking the seller to start over.

[1.0.0]: https://github.com/g1ampy/Bumpline/releases/tag/v1.0.0

## [0.3.0] - 2026-08-28

First public release, on the Chrome Web Store and here.

Bumpline adds a **Relist** button to your own Vinted wardrobe. Relisting means
deleting a listing and posting it again so it returns to the top of search
results — the only way to make an old item visible again. Done by hand it costs
three to five minutes an item, and one distraction can lose the item entirely.

### Added

- **Relist** — deletes the old listing and publishes the copy immediately. One
  click and the item is back at the top.
- **Relist as draft** — deletes the old listing and leaves the copy unpublished
  in your Vinted drafts, so you can change the price, drop a photo or fix the
  description before it goes live. Note that this is *not* a dry run: it also
  deletes the original.
- **Draft-first ordering.** The copy is saved as a private draft on Vinted
  *before* the original is deleted. A draft does not count as a duplicate
  listing, so from the delete onwards the item exists in two places at once.
  There is no moment at which it exists in none.
- **Pre-flight checks that stop the run before anything is deleted.** Every
  photo must have uploaded — not just some — and the title, the condition, the
  size for the category, your login state and the absence of a bot challenge are
  all verified first. Any failure aborts and deletes nothing.
- **Local backup.** The item text and the raw photo bytes are stored in the
  browser (IndexedDB on the Vinted domain) before the delete, as a second copy
  independent of Vinted's servers.
- **Automatic recovery if publishing fails.** Publishing is retried 5 times with
  an exponential backoff, then retried again on every Vinted page load. A
  recovery box offers **Retry now**, **Download data** (the item as a file) and
  **Discard**. In the worst case the item is still sitting in your Vinted drafts,
  ready to publish by hand.
- **Size prompt for re-categorised items.** If Vinted has since made a size
  mandatory for the category, a window shows the real size list pulled from the
  API and asks you to pick one. Nothing is deleted until you choose.
- **Progress labels on the button** — `Relisting…`, `Checking size…`,
  `Waiting for size…`, `Checking…`, `Saving draft…`, `Deleting…`, `Publishing…`,
  `Retrying 3/5…` — so you always know whether you can still back out. Closing
  the tab at any point before `Deleting…` leaves the listing untouched.
- **Full copy fidelity.** Title, description, price, brand, size, category,
  condition, colours and every photo, in order.
- **All 28 Vinted country domains.** Endpoints are built from the page's own
  `location.origin`, so no per-country configuration is needed.
- **Sold and reserved items get no buttons**, since Vinted will not let you copy
  them and the attempt could only fail.
- Manifest V3, two permissions (`storage`, `webRequest`), zero dependencies, and
  no network calls to anything except Vinted itself.

[0.3.0]: https://github.com/g1ampy/Bumpline/releases/tag/v0.3.0
