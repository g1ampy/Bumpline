# Bumpline — Privacy Policy

Last updated: 23 October 2026

Bumpline is a browser extension that relists your own Vinted listings. This
policy explains exactly what it touches.

## The short version

Bumpline sends nothing about you anywhere. It talks to Vinted, which you are
already logged into, and apart from that it only downloads a short public file
of notices from its own website, about once an hour. There is no server that
collects anything, no account, no analytics and no telemetry. The developer
receives no data about you and cannot see what you do with the extension. The
only other place it takes you is its own website, twice: once after you install
it and once after you remove it.

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
| The website's notices, the ones you closed, and when the file was last checked | Extension storage | So the panel can show them without waiting for the website, and a closed notice stays closed | Replaced at each check; a closed notice is forgotten once the website drops it |
| How many items you have relisted, as a single number | Extension storage | So the request to support Bumpline on Ko-fi comes after the 5th relist and every 25th after it | Until you uninstall |

Uninstalling the extension removes all of it.

## What the extension sends, and to whom

To Vinted, only the requests needed to do what you clicked:

- read the listing you chose,
- upload its photos again,
- create a draft copy,
- delete the original listing,
- publish the draft.

The one other request it makes is the download of the notices file from its own
website, described below. It contacts no third-party service of any kind.

## The website

### The notices file

When something on Vinted's side breaks the extension, a new version takes days
to get through store review. So the extension reads one public file from its
website, <https://bumpline.giampy.tech/broadcast.json>, at most about once an
hour while your browser is in use, and when you open its panel. The file holds
short notices; one that applies to your browser, your version of the extension
and the panel's language is shown at the top of the panel, and the important
ones also put a "!" on the toolbar icon until you close them.

The request is a plain download. It carries no cookies, no identifier and
nothing about you, your listings or your use of the extension, and the file is
the same for everyone: which notices apply is worked out in your browser. As
with any website, Cloudflare sees the IP address and browser the request comes
from (see below).

### The pages it opens

The extension opens two pages on its website, <https://bumpline.giampy.tech>,
and no others:

- **A welcome page, once, right after you install it.** It shows how to pin the
  icon to your toolbar and where the buttons appear.
- **A goodbye page, after you remove it.** Your browser opens it by itself,
  because by then the extension is gone.

The toolbar panel also links to the site's explanation of how Bumpline works,
from the name at the top and from "How it works" at the bottom. That page opens
only when you click one of the two.

Neither address carries anything about you, your listings or the extension.
Opening them is an ordinary visit to a website. The site is static: it runs no
analytics, sets no cookies of its own and loads nothing from anyone else. Your
choice of language and theme on the site is remembered in your own browser and
nowhere else.

The site is served by Cloudflare, which sees your IP address and browser when a
page is requested, as any web host does. Cloudflare also screens visits for
automated traffic: its bot protection runs a short check script in the page,
served from the site's own address, and keeps the result in a cookie named
`cf_clearance` for up to a year. That cookie belongs to Cloudflare and serves
only to tell people from bots. Cloudflare's own handling of it is described in
its [privacy policy](https://www.cloudflare.com/privacypolicy/).

The goodbye page asks why you left. Nothing you type is sent from the page:
its button opens a GitHub issue with your answers filled in, which you can
read, change or abandon before posting. A posted issue is public.

The toolbar panel also has a "Support Bumpline on Ko-fi" button, and after the
5th relist and every 25th after it a box on the Vinted page asks the same.
Either one opens <https://ko-fi.com/bumpline> only when you click it. The
address carries nothing about you, your listings or the extension. A donation
there is made to Ko-fi, not through Bumpline, and is covered by Ko-fi's own
[privacy policy](https://more.ko-fi.com/privacy).

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
