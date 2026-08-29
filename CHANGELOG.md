# Changelog

All notable changes to Bumpline are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-08-29

Vinted answers traffic that looks automated with a temporary block on editing
and publishing. Nothing a relist produced was wrong; the shape of its traffic
was. Every request went out the instant the one before it came back, a stuck
publish was retried five times in fifteen seconds, and nothing anywhere counted
how many relists had gone through in a row. This release slows the extension
down, gives it somewhere to stop, and drops the writes it was making against
Vinted that it did not need to make.

The relist itself is unchanged: the same fields, the same photos, the same two
buttons, and the same rule that nothing is deleted until the copy exists.

### Added

- **Requests are spaced out.** A random pause of roughly 0.9 to 2.4 seconds now
  sits between every call a relist makes. A full photo set was up to twenty
  uploads fired back to back, which is the densest run of writes the extension
  produced and the one least like a person using the site. The pause is random
  rather than fixed so that a relist is not simply a slower metronome.
- **Ten seconds between one relist and the next.** Measured from the deletion,
  which is the moment Vinted counts, and kept on disk — the page reloads after
  every relist, so a counter in memory would reset each time. The button counts
  the wait down instead of ignoring the click.
- **A warning past eight relists in an hour.** The ninth stops before it sends
  anything and asks whether you mean it, saying what the volume looks like from
  Vinted's side and what it does about it. Nothing has been deleted at that
  point, so stopping costs nothing. Eight is not Vinted's number — Vinted does
  not publish one — it is a deliberately cautious guess.
- **A daily budget as well as an hourly one.** Forty in twenty-four hours, next
  to the eight in an hour. An hourly limit on its own has an obvious hole —
  seven an hour, all day, never trips it and is unmistakably a bulk operation —
  and the day window closes it. Both numbers are guesses, and cautious ones;
  Vinted publishes neither.
- **Vinted saying stop is now acted on.** A `429`, or a `403` carrying a bot
  challenge, used to reach the seller as a failed relist and an enabled button,
  and pressing that button again is how a rate limit that would have passed in
  fifteen minutes becomes a day-long block on the account. The refusal is
  written down instead: every open Vinted tab greys out its buttons and says
  until when, the pending relists stop retrying themselves, and everything comes
  back on its own. Fifteen minutes for a `429`, thirty for a challenge, doubling
  for each further refusal that day up to six hours, and Vinted's own
  `Retry-After` wins whenever it asks for longer. Nothing is lost in the
  meantime — an unfinished relist keeps its copy and resumes afterwards — and
  the popup can lift the pause early behind the same confirmation as the risky
  settings, for the times it was really a logged-out session or one bad network
  moment.
- **A restriction is read, not walked into.** A refusal can only be learned by
  being refused, and the request that earns it is one the account did not need
  to make. An account restricted from listing or editing carries the date the
  restriction runs to in its own profile payload, beside the ban fields, and
  the banner Vinted shows you is drawn from it. Bumpline now reads the same
  field as the wardrobe opens — no request of its own — and the buttons are off
  from the first moment rather than from the first refusal. They look it, too:
  dimmed and drained of colour, so a stopped button says so before anyone
  presses it instead of looking pressable and doing nothing. The note and the
  popup name the day as well as the hour, since a restriction is counted in
  days where a refusal is counted in minutes, and the popup drops its **Lift
  the pause early** button for one: there is nothing to lift when the refusal
  would come from Vinted either way.
- **The popup reports the hour and the day.** How many items have been relisted
  in the last sixty minutes and the last twenty-four, how long the next one has
  to wait, and any pause that is standing. These are the numbers the ban turns
  on and the only ones a seller could not see from the page.
- **Three new settings, two of which ask first.** The cooldown and the pacing
  can both be turned towards *faster*, and both make a block more likely, so the
  checkbox springs back and the change is only made by a second, deliberate
  click in a panel that says what the risk is. Cancelling leaves the setting
  exactly as it was.
- **API calls go through the page's own fetch.** Every request Bumpline makes
  now runs through the main-world `window.fetch`, which is the fetch DataDome
  and similar SDKs have instrumented. The content script's isolated-world fetch
  bypassed all of that, so every call left without the tracking headers a real
  user's requests carry — an invisible but consistent tell. A small bridge
  script (`bridge.js`) runs in the main world and proxies each call; the
  content script falls back to direct fetch when the bridge cannot load.
- **A page visit before any API call.** Before touching the Vinted API, the
  extension visits the item's own page through the bridge, creating a page-view
  event in Vinted's analytics. A real user would navigate to the item before
  editing or deleting it; a script that goes straight to the API without ever
  viewing the page is a different session shape.
- **The item card is scrolled into view.** Before the relist starts, the card
  is scrolled to the centre of the viewport with a smooth scroll — the same
  `scrollIntoView` the browser uses for anchor navigation. Scroll events have
  no `isTrusted` flag, so they are indistinguishable from a person scrolling.
- **Pauses between logical phases, not just between requests.** On top of the
  per-request spacing, the relist now waits after reading the item (2–5 s,
  simulating a person looking at the listing), after the page visit (1.5–4 s),
  and before deleting (1–2.5 s, simulating the moment of deciding). The delays
  are random and non-uniform, so the session fingerprint is that of someone
  stepping through a form rather than a script walking a list.

### Changed

- **Publishing retries twice, not five times.** The old ladder — five attempts
  with a doubling wait — spent fifteen seconds pressing a server that had
  already refused. When the refusal is really an unstated rate limit, which is
  the common case, every extra attempt makes it worse. Two attempts, with one
  long random wait between them, and then the job waits for the next page load
  as it always did. The lost retries protected against a listing stranded
  between the delete and the publish; the copy held on the device covers that,
  and covers it for days rather than fifteen seconds.
- **A plain relist no longer parks a draft on Vinted before deleting.** The
  draft was a staging post: one write to create it, another on every retry, and
  a delete for each one superseded, all for a listing about to exist anyway. The
  payload and the photo bytes are kept on this device instead — they already
  were, as the second safety net — and the draft is opened at the moment of
  publishing, which is the one point Vinted's API requires one. **Relist as
  draft** is untouched, because there the draft on Vinted *is* the result. The
  old order is a setting away for anyone who wants the copy sitting in their
  Vinted account before the delete.
- **The recovery banner and the popup say where the copy actually is.** Telling
  someone to publish it by hand from their Vinted drafts is useless advice when
  the copy is on their disk, so both now read the record and say which it is.

## [1.0.0] - 2026-08-28

Bumpline leaves `0.x`. Nothing about the relist changed — the version number
says the tool is finished and tested, not experimental. The toolbar popup closes
the last gap between installing it and finding it, and the extension now runs on
Firefox as well as Chrome.

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
- **Firefox support.** The extension now builds for Firefox 140 and newer.
  Firefox runs the background as an event page rather than a service worker and
  requires an add-on id, so `node build.mjs` writes a manifest per browser and
  packages both from the same source.

### Changed

- Pending relists now record the profile page they were started from, and the
  content script remembers the last profile page it ran on, so the popup can
  link straight back to it from any tab. Records written by earlier versions
  fall back to the country domain.
- **The browser APIs are reached through one alias.** Firefox returns promises
  only from the `browser` namespace, and the code was written against Chrome's
  `chrome`. Both are now taken from a single alias per file, and the one
  callback-style call left — the content script asking the background for
  Vinted's tokens — was rewritten as a promise, which is the only shape Firefox
  offers.
- **The description says what the extension does.** It used to spend its second
  half on the draft-first safety, which is the reason Bumpline is safe to use
  rather than the reason anyone installs it. Only about 45 characters survive
  truncation in store search, so the action now takes the visible half and the
  rest carries the two reasons to install: nothing is retyped, and the item
  moves back to the top.

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
