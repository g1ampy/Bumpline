# Changelog

All notable changes to Bumpline are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.3] - 2026-09-04

Nothing a seller clicks behaves differently. What changed is what they see
before they click: a new mark, and a name that leads with the word they searched
for.

The old icon was a pair of chevrons — the bump, drawn as an arrow. It said the
direction but not the thing being moved. The new one draws the list instead:
three rows aligned to the right, the top one full width and lit while the two
below it fade back. That is the whole product in one picture, an item that was
buried sitting at the top again, and unlike an arrow it survives the size the
icon is actually seen at.

Sixteen pixels is that size. The drawing is built on a sixteen-unit grid scaled
by eight, so every edge in the 128-unit file lands on a whole pixel when Chrome
renders the toolbar icon: the rows come out two pixels tall and solid rather
than one and seven eighths, blurred across three. The teal moved for the same
reason. It was `#00ADB8`, which reads 2.65:1 against the white it carries; it is
now `#007580` — the value `--primary` already held in the popup — which reads
5.26:1. One teal in the product now rather than two, and the colour note at the
top of `popup.css` says so instead of saying what it used to be true of.

### Changed

- **The icon is new, everywhere it appears.** `icons/logo.svg` and every PNG
  rendered from it, the copy drawn inline on the welcome page, and the Chrome
  Web Store marquee and promo tile. The store art now shows the icon with its
  tile rather than the bare mark on the background: three rows without the tile
  read as a menu button, not as a logo.
- **The disabled icon keeps its grey.** `#7B7B7B`, unchanged. The same drawing
  with the colour taken out is still what "there is nothing to do on this tab"
  looks like, and that grey was picked to hold against light and dark toolbars
  rather than to sit a fixed distance from the teal.
- **The extension is named "Bumpline - Vinted Relister".** The same string in
  every language, as before, and four characters shorter than
  "Bumpline - Relister for Vinted". The brand still leads; what follows it is
  now in the order a seller types it.

## [1.1.2] - 2026-09-02

Relisting an accessory no longer stops to ask for a clothing size it never had.
A seller reported it of earrings: every relist asked for a size as if the item
were a garment, and the copy that came out was in the right category all along.

The check that asked was reading an answer that does not say what it was taken
to say. `GET /api/v2/item_upload/size_groups?catalog_ids[]=<id>` replies with the
default size group of the branch the catalog sits in, not with the catalog's own
rule: earrings, necklaces, backpacks and sunglasses under Women all come back
holding the same women's clothing sizes a dress does. So "the catalog offers
sizes" was read as "the catalog demands one", and every accessory without a size
— which is every accessory — was stopped at a window offering S, M and L.

Nothing readable before the publish tells the two apart. What does is the
publish: where a category really requires a size, completion answers
`size: Fill in size to continue`. That refusal is now what asks.

### Fixed

- **No size prompt for categories that do not want a size.** A listing with no
  size is taken at its word — Vinted accepted it without one — and the relist
  goes through. The prompt still appears before anything is deleted when the
  size the listing carries has stopped being valid for its category, which is
  the case it was written for.
- **The prompt moved to where it can be true.** If completion refuses over the
  size, the size list opens then, the answer goes into the copy held on this
  device, and the publish is tried again with an extra attempt so that the
  answer is never given to nothing. It is asked once per relist: a second
  refusal naming the size means the answer was not the problem. A resume that
  ran on its own as a page loaded never opens the window — it records the
  refusal and raises the recovery card, and **Retry now** is what asks.
- **Backing out of that window keeps Vinted's words on the card.** The reason
  the card reads back is the refusal itself, not Bumpline's note that no size
  was chosen; the note is said in a toast, where it cannot be mistaken for
  something Vinted said.

## [1.1.1] - 2026-09-02

One thing a seller sees is different, and only on Firefox: the rating link now
goes to the add-on's listing rather than to a page that does not exist. The rest
of the release removes the one place the extension wrote markup into a page
instead of building it, and moves the rule that made it safe out of a comment
and into the code.

Mozilla's add-on linter flags an assignment to `innerHTML`, and it was right to.
Two sentences on the page shown after install carry their own emphasis, a `<b>`
or an `<i>` around a button's name, and the loop that drew them handed the line
to `innerHTML`. The comment above it argued the line could only ever be a
catalogue string written in the repo, because it is fetched with no
substitutions, and said in as many words that a version of that loop passing
substitutions through would break the argument. All of it true, and all of it
kept nowhere but in the comment.

### Changed

- **Emphasis is built rather than assigned.** `paint()` now walks a catalogue
  line itself: a `<b>` or an `<i>` becomes an element carrying its text, and
  everything else becomes text. An unknown tag, a half-open one, a `{0}` that
  was never substituted, an angle bracket a translator typed — each reaches the
  page as the characters it is written with, because there is no longer a path
  by which it could arrive as anything else. The welcome page draws the same
  nodes it drew before, in all three languages.
- **The build refuses markup `paint()` cannot draw.** A catalogue line carrying
  any tag but `<b>` or `<i>`, or leaving one of those unclosed, now fails
  `node build.mjs`. The drawing code would have shown a stray `<span>` as its
  own angle brackets mid-paragraph, in one language only, which is the kind of
  mistake that reaches a seller rather than a test.
- **`data-i18n-html` is now `data-i18n-em`.** The attribute was named after the
  mechanism it used, and it no longer uses it. The scan that proves every
  `data-i18n` attribute names a real key learned the new name in the same
  commit: had it not, it would have gone on passing while checking two keys
  fewer.

### Fixed

- **The Firefox rating link went to a 404.** The slug the link is built from
  held the add-on's name in the order the name is written,
  `bumpline-relist-for-vinted`, which is not the slug AMO gave the listing. It
  is `bumpline-vinted-relister`, and both were checked against the site: the
  old one answers 404 on the listing and on the reviews tab, the new one
  answers 200 on both. Chrome was never affected — its id is the one in the
  listing URL and has been right since 1.0.0. The comment beside the value
  claimed it was empty until there was a listing to point at, which stopped
  being true the moment something was typed there; it now says what the three
  states are worth, and that a wrong slug is the only one of them that fails in
  front of a seller.

## [1.1.0] - 2026-09-02

Bumpline now speaks Italian and French. Every string a seller reads on the page
or in the panel — the two relist buttons and their progress labels, the toasts
in the corner, the recovery card, the size dialog, the budget-warning modal,
the age line under each item, the whole toolbar panel including both of its
warning dialogs, and the page shown once after install — exists in all three
languages now, one catalogue loaded by each page before it draws. Nothing about
the relist changed: the same fields, the same photos, the same two buttons,
and the same rule that nothing is deleted before the copy exists.

Which language opens is decided by the browser's own language, the same
signal Chrome and Firefox already hand every extension, and it can be
overruled from a globe beside the name at the top of the panel, for the
seller whose browser and whose Vinted are not set to the same language.
Switching it repaints an open wardrobe page in every open tab on the spot;
nothing needs a reload to catch up.

The same release carries the Australian site. Vinted opened `vinted.com.au` on
a domain of its own, after every list of country domains in the extension was
written, and the catch-all patterns do not stretch to it: `*.vinted.com`
matches a subdomain of `vinted.com`, which `vinted.com.au` is not. On the
Australian site the buttons simply never appeared.

### Added

- **Italian and French.** The extension speaks whichever of them the browser
  reports, and can be told to regardless from the panel. `strings.js` is one
  catalogue holding all three languages, loaded as a plain script before every
  page that reads from it — the two extension pages read it through
  `data-i18n` attributes on their own markup, and the content script through
  direct calls. The manifest's name and description are translated too,
  through `_locales/it` and `_locales/fr`; the name itself is not — "Bumpline
  - Relister for Vinted" stays the same in every language, the way a product
  name does. The words Vinted owns are quoted the way a seller reads them on
  the site rather than translated out of English: the site's own button is
  «Metti in evidenza» to an Italian seller and « Booster » to a French one.
- **A language picker in the header.** A globe and a two-letter code sit
  beside the name at the top of the panel, and picking from them stores
  `bumpline:lang`. It is a real `<select>` laid over the two at zero
  opacity, so the menu that opens is the browser's own and a screen reader
  still hears the language written out in full; only the closed state is
  abbreviated. The list builds itself from the catalogue, each language
  under its own name, so a language added to `strings.js` turns up there
  without an edit of its own. Left on **Automatic** the browser keeps
  deciding, and the code shows the language it resolved to, muted rather
  than at full strength to say it was reported and not chosen.
- **A build that refuses to ship a half-finished translation.** `node
  build.mjs` now fails the build outright if the catalogues disagree — a key
  present in one language and missing from another — or if a page asks for a
  key that exists in none of them. It also expects one `_locales` folder per
  language the catalogue carries, so a language the panel offers cannot ship
  with an untranslated store listing. A silent gap would have reached a seller
  as English words sitting inside an otherwise translated page, or as the raw
  key left on screen; the build stops it before it ships instead.
- **Australia (`www.vinted.com.au`).** The domain is now named in all four
  places a country site has to be named for a relist to work: the host
  permissions, the pages `bridge.js` may be loaded into, the wardrobe pages
  `content.js` runs on, and the request filter the service worker reads the
  Vinted tokens from. Everything a relist does on the Australian site is what it
  does everywhere else; nothing about the relist itself changed.

### Changed

- **A pause's reason is now a code, not a sentence.** `content.js` used to
  write the reason a relist was paused — a rate limit, a bot check, a
  restriction — into storage as a finished English sentence, which the panel
  could only ever show back in English. It now writes one of three short
  codes, and the panel translates whichever one it finds. A pause recorded by
  1.0.1 or earlier, if it is still standing, carries the old English sentence
  rather than a code, and is shown exactly as written until it expires — the
  panel reads what is actually in storage rather than guessing at a
  translation for words that were never coded in the first place.
- **The extension is a relister, and says so.** The store name reads
  "Bumpline - Relister for Vinted" rather than "Bumpline - Relist for Vinted",
  and the description leads with what one click does before it explains why
  nothing can be lost. The word on the button is unchanged; this is the name
  above the listing, which was reading as an instruction rather than a thing.

## [1.0.1] - 2026-08-30

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
- **A warning past four relists in an hour.** The fifth stops before it sends
  anything and asks whether you mean it, saying what the volume looks like from
  Vinted's side and what it does about it. Nothing has been deleted at that
  point, so stopping costs nothing. Four is not Vinted's number — Vinted does
  not publish one — it is a deliberately cautious guess.
- **A daily budget as well as an hourly one.** Fifteen in twenty-four hours,
  next to the four in an hour. An hourly limit on its own has an obvious hole —
  three an hour, all day, never trips it and is unmistakably a bulk operation —
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
  days where a refusal is counted in minutes. The field is read in both
  directions. Vinted lifts a restriction whenever it likes, and the date in the
  payload was only ever the latest it would have run to, so a wardrobe that
  draws its bump buttons and states no restriction clears the record — a record
  that is only ever written is a record nothing can clear, and the buttons stay
  off until a date that has stopped meaning anything. A restriction Vinted
  shortens replaces the one read before it for the same reason: an earlier
  reading is not a second opinion, it is the same statement out of date. The
  popup swaps its **Lift the pause early** button for **Vinted has lifted it**,
  because the two are cleared for opposite reasons. The extension's own pause is
  still standing and is being overridden, which is what the confirmation is for;
  Vinted's is only mirrored here, so clearing it overrides nothing and the next
  wardrobe page writes the restriction straight back if it still stands.
- **The popup reports the hour and the day.** How many items have been relisted
  in the last sixty minutes and the last twenty-four, how long the next one has
  to wait, and any pause that is standing. These are the numbers the ban turns
  on and the only ones a seller could not see from the page.
- **A rating is one click from the panel.** The footer carries a **Rate
  Bumpline** link on a line of its own, beneath the two that are there for when
  something is unclear or broken. Which store it opens is decided as the popup
  is drawn, from the origin the extension's own pages are served from —
  `moz-extension://` is Firefox, `chrome-extension://` is every Chromium browser
  — rather than from a user agent string, which Edge and Opera both write
  "Chrome" into. One package goes to both stores, so the address cannot be baked
  into it at build time, and the answer lives in `store.js` rather than in the
  popup: the page shown after install asks the same question, and a store id
  kept in two files is one that will eventually be corrected in only one of
  them. Where a store has no listing yet, nothing asks — a link to a page that
  does not exist is worse than no link.
- **The page shown after install asks for a rating too.** Last on the page and
  after the two things there are to do, because at that moment nobody has
  relisted anything yet: it is put where it can be found later rather than in
  the way now. It hides itself entirely, heading and all, when this browser's
  store has no listing to point at.
- **Three new settings, two of which ask first.** The cooldown and the pause
  between requests are both on out of the box, and turning either of them off
  makes a block more likely, so the switch springs back and the change is only
  made by a second, deliberate click in a panel that says what the risk is.
  Cancelling leaves the setting exactly as it was.
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
- **An on/off switch in the popup.** Uninstalling was the only way to stop the
  extension touching Vinted, and reinstalling loses every copy held on the
  device. The switch in the top right of the popup stops it instead: no buttons
  are drawn, no unfinished relist is retried, and nothing is sent to Vinted at
  all. It reaches every open tab through storage, so tabs drop their buttons as
  it is flipped rather than at the next reload, and turning it back on puts them
  back. A relist already in flight is left to finish — by then it may already
  have deleted the original. Nothing is deleted by the switch: items, settings,
  counts and saved copies survive it, which is the point of having it.

### Changed

- **Everything the extension puts on the page is one card now.** The toast, the
  note that says relisting is paused, and the banner over a stuck relist were
  three wide coloured blocks; they are one card in three corners — a tick, a
  pause or a warning triangle carrying the tone, capped at 320px, sliding up as
  it arrives. They carry the toolbar popup's own theme, down to the 26px corner
  and the two colour schemes, so the two halves of the extension are one thing;
  the tokens are declared on the card rather than on `:root`, because Vinted has
  custom properties of its own and this must not reach them. One builder draws
  all three, so they cannot drift apart.
- **The corner clears itself.** A confirmation used to be dropped after six
  seconds and a refusal never at all, so a failed relist left a red slab in the
  corner until the page was reloaded; the note about a standing pause never left
  at all. Four seconds for a confirmation now, ten for a refusal, ten for the
  pause, with a fade rather than a disappearance — and the pause is said once
  rather than redrawn every time the page changes under it. Nothing is lost by
  that: the greyed-out buttons are the standing signal, and both the banner and
  the toolbar popup still say why. The volume card says nothing at all when
  nothing has been relisted: two noughts and an empty bar are the whole answer,
  and the sentence about limits nobody was near was being read every time the
  panel opened.
- **The three of them say less.** "Relisted." rather than "Relisted. The new
  listing is 1234567." The pause was five lines explaining that waiting is the
  point; it is two, and the only thing it still distinguishes is the one thing
  that matters — Vinted restricting the account, which nothing can lift, against
  this extension standing down, which the popup can. The banner dropped its
  attempt count, which the banner's own presence already implies.
- **The pause says nothing in the page any more.** It greyed the buttons out
  and wrote a note in the corner saying why, which is the one thing the toolbar
  popup was already saying in full, one click away and without a countdown to
  read it by. The buttons still grey out in every open tab the moment the pause
  is set; the explanation lives in one place now.
- **A restricted account is told where the reason is.** Vinted says why in a
  message to the account, and that message is the only place the reason exists —
  the API says nothing past the refusal itself. The popup says so, and says
  plainly that the extension is unusable until the restriction lifts; that
  sentence is the whole card, because the title already names the restriction
  and when it lifts is Vinted’s to say rather than this extension’s to guess
  at. The note in the page is the other half of the same answer and stays one
  sentence: it names the day the restriction lifts, which is what somebody
  standing on the page wanted to know.
- **Switched off, the panel is one line.** It used to answer the switch with a
  card — that no buttons were drawn, that nothing was sent, that nothing had
  been deleted — under a title saying what the word beside the switch already
  said, and then went on to show the counts, the settings and an offer to open a
  wardrobe that would have no buttons on it. Off, all of that is gone and one
  line stands in its place: *Bumpline is offline*. The header stays, because the
  switch is the way back, and so does the footer, because the version number is
  what a bug report is built on.
- **The toolbar icon says whether pressing it would get you anything.** With no
  panel open the icon is the only part of the extension you can see, so it
  carries the one thing worth knowing from outside. Colour means the switch is
  on *and* this tab is a Vinted page; grey means neither is worth pressing, and
  the tooltip says which: *Bumpline: off* or *Bumpline: not a Vinted page*.
  It is the same drawing with the colour taken out of it by luma, so the disc
  and the chevrons keep exactly the contrast they had. Grey is the default every
  tab starts from and colour is painted over it per tab, which is the right way
  round: most tabs are not Vinted, and a tab the worker has heard nothing about
  should not claim to be one. The page half of that costs no permission —
  `tabs.onActivated` and `tabs.onUpdated` fire without the `tabs` permission and
  it is the url that is withheld without one, and a withheld url is a tab the
  extension cannot work on, which is the same grey as a tab it will not work on.
  The switch half is repainted from `storage.onChanged`, the signal the content
  scripts already follow, and read again on the way up: a worker is torn down
  between events and a browser forgets a set icon at the end of a session, so
  the state is looked up rather than remembered. The mark in the panel's own
  header greys with the switch at the same moment. A failure to repaint now says
  so in the worker's console rather than being swallowed — an icon that never
  changes and no way to find out why is the worse of the two outcomes.
- **Two things that used to jump now move.** The settings section grows and
  shrinks its own height rather than appearing whole — `<details>` has no
  animation of its own, so the click is taken over and the open attribute is set
  at the moment each direction becomes true, at the start of an opening and the
  end of a closing. The folded restriction does the same on its way open, and
  its fade travels with it: the mask's stop is a registered custom property, so
  it can be transitioned rather than switched. Both last 200ms on base-luma's
  own accordion curve, both survive being interrupted halfway by a second click,
  and both ask `prefers-reduced-motion` first — where it is set, the section
  falls back to the browser's own instant open and nothing else moves.
- **The settings are two groups, and every switch means the same thing.**
  *Pacing* — the cooldown and the pause between requests — decides what the
  traffic looks like from Vinted's side. *After a relist* — the reload, and
  where the copy is kept — decides what happens on your own page, and neither
  setting there can cost you an account. All of them are on by default, so on
  is the cautious position in every row and the guarded ones guard the same
  direction; the setting that used to be called *Relist faster*, alone in being
  off by default and risky to switch on, is now *Pause 0.9–2.4s between
  requests* and stores exactly what it stored before. Each label carries its own
  number and each description says what off costs, in that order, in all three
  rows. The section header carries a count of how many are off their default,
  which is the one thing about the settings worth knowing without opening
  them.
- **The popup was rebuilt around the switch.** The four settings — each with a
  paragraph explaining what it costs — pushed the answer to "does this work
  here?" below the fold, so they are folded into a **Settings** section that
  opens in place. Every on/off is now a switch rather than a checkbox, with the
  control on the right of the row it belongs to, and the hourly and daily counts
  are two figures and a bar showing how close the nearer of the two budgets is
  to the warning, instead of a sentence to be parsed. Each setting says one
  line about itself rather than a paragraph: the two that raise the odds of a
  block used to argue their case in the panel, where everyone read it and
  nobody acted on it, and that argument now appears in the warning at the
  moment the setting is changed — the only moment it can change a mind. The
  same pass went through the cards, which said in four sentences what two
  say.
- **The panel is shadcn/ui preset `b1tepwVzU`.** Style base-luma, base colour
  neutral, Lucide icons, Inter — rebuilt in plain CSS, because
  shadcn is React, Tailwind and Base UI and a popup with no build step is going
  to carry none of those, and because the markup is already accessible without
  them: the switches are real checkboxes and the settings section is a real
  `<details>`. Every measurement was read off the components the preset actually
  writes rather than off the documentation, which describes a different style
  and would have been wrong in five places: base-luma scales its radius instead
  of adding to it, so cards and buttons are pills; cards carry a one-pixel ring
  of the foreground at 5% and a medium shadow instead of a border; the switch is
  44×20 with a rounded rectangle for a thumb; the progress track is `--muted`
  rather than the fill at a fifth; and the destructive button is a tint carrying
  red ink rather than a filled red block. The panel is 360px wide at a 14px
  base, cards hold 24px of padding, and the destructive card turns its ink red
  and leaves the shape alone, exactly as `alert.tsx` does. The theme keeps the
  preset's shape — every token name, every slot — and takes its colours from
  the logo, which is two of them: `#00ADB8` on `#FBFBFB`. The teal cannot
  simply be pasted into `--primary`, because at its own lightness it is 2.7:1
  against white and 2.7:1 against its own white label, and so can carry neither
  text nor a filled button; `--primary` holds the hue and moves the lightness
  instead, darker for the light scheme and lighter for the dark one, while the
  logo keeps its own value in `icons/logo.svg` and `#FBFBFB` becomes the label
  the filled button writes in. Every neutral borrows a little of that hue,
  because a grey at chroma 0 beside a saturated teal looks dead; the page is a
  tinted off-white and the cards are pure white, rather than both being `#fff`
  and the cards relying on a shadow to exist; `--success` moves to hue 148,
  where it stops reading as a second version of the accent; and `--ring`
  follows the accent rather than the preset's neutral. Two rules are applied to
  the block itself: `.dark` becomes a `prefers-color-scheme` query, a popup
  having no app shell to put the class on, and `@theme inline` becomes plain
  custom properties. Every pair is measured off a rendered screenshot rather
  than derived, and one the preset does not clear now does — the destructive
  button's label on its own tint, 3.7:1 there and 4.7:1 here. Two are still
  deliberately short of 4.5:1: the switch's off track, where the thumb's
  position says the same thing again, and `--ring`, which at 30% is a focus
  ring you have to look for. The one colour added is `--success`, because no
  shadcn theme carries one and "Ready on this page" is the whole reason the
  panel is worth opening.
- **Inter ships with the extension.** Manifest v3 will not load a remote font —
  `font-src` is `'self'` — so the Latin and Latin Extended subsets sit in
  `fonts/` with their SIL Open Font Licence, and the package goes from 76 kB to
  210 kB. Latin Extended is the one thing here the preset does not ask for: it
  loads the Latin subset alone, and Vinted runs in twenty-eight countries whose
  sellers name their own items. The oklch colours and the `color-mix()` the
  faded variants are built from need Chrome 111, which the manifest now asks
  for; Firefox has wanted 140 since before this release.
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
- **Switched off, the panel says what to do about it.** One line reading
  "Bumpline is offline" named the state and left the reader looking for the
  switch it was already sitting under. Two lines now: the state, and the way
  back under it in the quieter ink.
- **The settings say which way is the recommended one.** Every hint led with
  what turning the switch off would cost, which is the right argument in the
  wrong order: the row has to be skimmable by the seller who is not changing
  anything, and that is almost every seller almost every time. Each hint now
  opens with **Recommended** and says the cost after it. The warning's own
  cancel stopped scolding while it was there — **Leave it alone** is **Keep
  this setting** — and the panel calls them relist buttons, since "buttons
  appear on your own items" is as true of Vinted's own buttons as of these.
- **Switching off answers a warning left open.** A confirmation on screen when
  the switch went off was carried away still holding its question, and the
  setting behind it would have committed on a click of a button nobody could
  see any more. Off answers it as a no, and the setting stays where it was.
- **The footer is two rows.** Three links and a version number do not fit
  across the panel's 328 points, and a rating is not the same kind of errand as
  the two links it would have sat beside, so it takes a line of its own beneath
  them.
- **The page shown after install is drawn with the panel's own stylesheet.** It
  had a palette of its own — its own greys, its own teal, its own type scale —
  written to match the panel and slowly drifting from it, which is what two
  palettes meant to match always do. It imports `popup.css` now and says only
  where it is not a 360-point panel: a column width, the drawings set beside the
  words once there is room for them, and a footer that fits on one row. Every
  step is one of the panel's cards, the rating is one of its buttons, and the
  flat drawings are rebuilt on its tokens, so the first thing a new user sees is
  the thing they will recognise when they later click the icon.
- **The install page reads like it is talking to somebody.** It was written as a
  specification: every sentence true, none of them addressed to anyone. It opens
  by naming the chore it takes away rather than announcing itself, and each step
  says what the reader gets out of doing it — the pin means never hunting for
  the icon again, the wardrobe is where the buttons turn up, nothing is thrown
  away before the copy exists. It still refuses to grow past the two questions
  that stand between the install and the first relist, and the rating still asks
  last and says out loud that there is no rush: nobody has relisted anything yet
  at the moment this page opens.
- **The warning a guarded setting raises is a modal.** It was a card in the
  flow, opening below the switch that raised it, which made it something the eye
  could move past: on a panel tall enough to scroll it could be answered without
  having been read, and a warning nobody reads is a confirmation step and
  nothing more. It is a `<dialog>` now — the focus moves into it, the tab key
  cannot leave it, Escape answers it as a no, and the panel behind is blurred
  through the backdrop rather than covered, so what raised the question is still
  legible while it is being answered.
- **The two answers are stacked and say what they do.** Side by side inside
  296 points each label had to be short enough to fit rather than clear enough
  to read, and the longest of them ran out of its own button and over the edge.
  A line each now. The action names the thing rather than repeating the setting
  — **Turn it off**, **Shorten it** — and the cancel names what staying put
  means, which is not the same sentence for a setting as for a pause Vinted
  asked for: **Keep the cooldown**, **Keep the pause**.

### Fixed

- **Reloading the extension no longer leaves an error on the page.** A browser
  takes the extension's half of a content script away the moment the extension
  is reloaded, updated or switched off, and leaves the page's half running on
  every tab that was already open. Every call into extension storage from that
  point throws, and it throws where it is called rather than rejecting the
  promise it would have returned, so the `.catch()` written to absorb it was
  hung off a promise that never existed and the failure surfaced in the seller's
  console as an uncaught error. Both of the calls that were not already inside a
  `try` now make the call from inside a `then`, which is where the rest of the
  file has always made them: the note of which wardrobe is yours, which only
  costs the popup a shortcut, and the record a half-finished relist is recovered
  from, where the failure now reaches the caller in the shape it is waiting for.
  Nothing about a relist changes; a page left open across an extension reload
  simply stops writing instead of complaining about it.

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

[1.1.3]: https://github.com/g1ampy/Bumpline/releases/tag/v1.1.3
[1.1.2]: https://github.com/g1ampy/Bumpline/releases/tag/v1.1.2
[1.1.1]: https://github.com/g1ampy/Bumpline/releases/tag/v1.1.1
[1.1.0]: https://github.com/g1ampy/Bumpline/releases/tag/v1.1.0
[1.0.1]: https://github.com/g1ampy/Bumpline/releases/tag/v1.0.1
[1.0.0]: https://github.com/g1ampy/Bumpline/releases/tag/v1.0.0
[0.3.0]: https://github.com/g1ampy/Bumpline/releases/tag/v0.3.0
