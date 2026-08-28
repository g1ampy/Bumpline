# Changelog

All notable changes to Bumpline are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
