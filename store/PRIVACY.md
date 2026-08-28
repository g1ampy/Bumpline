# Bumpline — Privacy Policy

Last updated: 27 August 2026

Bumpline is a browser extension that relists your own Vinted listings. This
policy explains exactly what it touches.

## The short version

Bumpline sends nothing anywhere. It talks to Vinted, which you are already
logged into, and to no one else. There is no server, no account, no analytics
and no telemetry. The developer receives no data about you and cannot see what
you do with the extension.

## What the extension reads

Bumpline only runs on Vinted member pages. On those pages it reads:

- **Your own listings** — title, description, price, brand, size, category,
  condition, colours and photos. This is needed to make the copy.
- **Vinted's CSRF token and anonymous id** — short-lived security values that
  Vinted requires on every request. Without them Vinted rejects the calls the
  extension makes on your behalf.

It does not read other users' listings, messages, payment details, addresses or
any part of your Vinted account beyond the listings you act on.

## What the extension stores, and where

Everything is stored locally in your own browser.

| What | Where | Why | How long |
| --- | --- | --- | --- |
| CSRF token and anonymous id | Extension storage | So requests are accepted without re-reading them on every page load | Until overwritten by a newer one |
| An unfinished relist: the item's fields | Extension storage | So the listing can be recreated if publishing fails | Deleted as soon as it succeeds, or when you press Discard |
| An unfinished relist: the photo files | IndexedDB, on the Vinted domain | Same reason. Photos are too large for extension storage | Deleted at the same time |

Uninstalling the extension removes all of it.

## What the extension sends, and to whom

Only to Vinted, and only the requests needed to do what you clicked:

- read the listing you chose,
- upload its photos again,
- create a draft copy,
- delete the original listing,
- publish the draft.

There are no other network destinations. The extension contacts no third-party
service of any kind.

## Data sharing and sale

None. No data is shared with, sold to, or transferred to any third party. No
data is used for advertising, profiling, creditworthiness or any purpose beyond
performing the relist you asked for.

## Permissions

- **`webRequest`** — reads request headers to obtain Vinted's CSRF token. It
  observes only; it never blocks, redirects or modifies requests.
- **`storage`** — holds the items in the table above.
- **Host permissions for Vinted's country domains** — your wardrobe may be on
  any of them, and the extension only ever calls the one you are browsing.

## A word about deletion

Relisting deletes your original listing. That is what relisting is. The
extension is built so the copy always exists before the original is removed, and
so an unfinished relist can be recovered, but the deletion itself is real and
permanent on Vinted's side.

## Not affiliated with Vinted

Bumpline is an independent open-source project. It is not affiliated with,
endorsed by or connected to Vinted. "Vinted" is used only to identify the
website the extension works on.

## Source code

Bumpline is free software under the GNU General Public License v3. You can read
every line of what is described above.

## Contact

Open an issue on the project's repository.
