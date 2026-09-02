// Bumpline — the words, in every language the extension speaks.
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

// Chrome's own i18n reads the browser's UI language and nothing else, so an
// Italian seller running Chrome in English would have no way back. The words
// live here instead, every language at once, and the seller can overrule the
// browser from the panel.
//
// Held in memory rather than fetched, because the buttons are drawn the moment
// a wardrobe page settles: a catalogue that arrives after them would be a
// second, English paint that every seller sees. Loaded as a plain script before
// the page's own, the same way store.js is, which is all an extension page or a
// content script needs.

const BumplineText = (() => {
  const CATALOG = {
    en: {
      'button.relist': 'Relist',
      'button.draft': 'Relist as draft',
      'button.draft.title': 'Delete the original and leave the copy unpublished in your Vinted drafts',
      'button.cooldown': 'Cooling down {0}s…',
      'button.waiting': 'Waiting…',
      'button.relisting': 'Relisting…',
      'button.checkingSize': 'Checking size…',
      'button.waitingSize': 'Waiting for size…',
      'button.checking': 'Checking…',
      'button.savingDraft': 'Saving draft…',
      'button.savingCopy': 'Saving the copy…',
      'button.deleting': 'Deleting…',
      'button.publishing': 'Publishing…',
      'button.retrying': 'Retrying {0}/{1}…',

      // Toasts: the corner notice that reports what a relist just did.
      'toast.pausedUntil': 'Relisting is paused until {0}.',
      'toast.publishPausedUntil': 'Publishing is paused until {0}.',
      'toast.published': 'Published.',
      'toast.relisted': 'Relisted.',
      'toast.relistedNoPhotos': 'Relisted, but the copy has no photos. Add them on Vinted.',
      'toast.originalDeletedDraft': 'Original deleted. The copy is in your Vinted drafts.',
      'toast.reloading': '{0} Reloading…',
      'toast.reloadToSee': '{0} Reload to see it.',
      'toast.cantFindItem': 'Could not tell which item that button belongs to.',
      'toast.resumingUnfinished': 'An unfinished relist of this item. Resuming it.',
      'toast.stopped': 'Stopped. Nothing was deleted.',
      'toast.relistStopped': 'Relist stopped: {0}',

      // The recovery card: shown when an original was deleted but the copy
      // never made it back onto Vinted.
      'card.recovery.message.draft': '“{0}” was deleted and is not published yet. The copy is in your Vinted drafts. Publishing is retried on every Vinted page you open.',
      'card.recovery.message.device': '“{0}” was deleted and is not published yet. The copy is saved on this device. Publishing is retried on every Vinted page you open.',
      'card.recovery.reason': 'Vinted refused it: {0}',
      'card.recovery.retry': 'Retry now',
      'card.recovery.download': 'Download data',
      'card.recovery.discard': 'Discard',

      // The size dialog: shown when a listing cannot be relisted without a
      // size Vinted will still accept.
      'size.title': 'Pick a size to continue',
      'size.body': '"{0}" cannot be relisted as it is: {1}. Choose the size the new listing should carry. Nothing has been deleted yet.',
      'size.blank': 'Select a size',
      'size.cancel': 'Cancel relist',
      'size.accept': 'Use this size',
      'size.group': 'Group {0}',
      'size.why.required': 'this category now requires a size and the listing has none',
      'size.why.invalid': 'size {0} is no longer valid for this category',
      'size.unavailable': '{0}. Nothing was deleted.',

      // The budget-warning modal: shown before a relist that would push the
      // day's or hour's count high enough for Vinted to read as automation.
      'budget.title.day': 'You have relisted a lot of items today',
      'budget.title.hour': 'You are relisting a lot of items',
      'budget.body.day': '{0} items have been relisted from this browser in the last 24 hours, which is a whole wardrobe going round rather than a few listings being refreshed. That is what Vinted reads as automated activity, and what it does about it is stop the account editing or publishing anything for about a day. Nothing has been deleted yet.',
      'budget.body.hour': '{0} items have been relisted from this browser in the last hour. That is what Vinted reads as automated activity, and what it does about it is stop the account editing or publishing anything for about a day. Nothing has been deleted yet.',
      'budget.proceed': 'Relist anyway',
      'budget.cancel': 'Stop for now',

      // What stops a relist, in Bumpline's own words. Vinted's words are never
      // in here: a refusal it sent is quoted as it arrived, in whatever
      // language it arrived in, and only the sentence around it is ours.
      //
      // The first group are the pre-flight checks inside relist(). They are
      // raised before anything is written to storage.local and reach the seller
      // through the toast.relistStopped wrapper, so they are finished here and
      // now.
      'relist.error.noPhoto': 'No photo could be uploaded. Nothing was deleted.',
      'relist.error.photosIncomplete': 'Only {0} of {1} photos uploaded ({2} failed). Nothing was deleted, so try again in a moment.',
      'relist.error.noTitle': 'The listing has no title. Nothing was deleted.',
      'relist.error.noCondition': 'Could not read the item condition, and relisting it with the wrong one would be worse than stopping. Nothing was deleted.',
      'relist.error.copyNotSaved': 'The copy could not be saved on this device, and without it the original cannot be deleted safely. Nothing was deleted.',
      'relist.error.itemGone': 'Item {0} cannot be edited: it is sold, reserved or already gone.',
      'relist.error.itemNoData': 'Item {0} returned no data.',
      'relist.error.deleteFailed': 'Could not delete the original: {0}',
      //
      // The second group can end up in record.lastError, which is written to
      // storage.local and read back on a later page load — possibly by a seller
      // who has changed language in between. Those travel as a code and its
      // arguments and are written out at the moment they are read, which is why
      // content.js raises them through fail() rather than through T().
      'relist.error.noAnswer': 'Vinted did not answer in time. Nothing was sent twice, so try again.',
      'relist.error.noToken': 'Could not read the Vinted security token. Reload the page and try again.',
      'relist.error.automated': 'Vinted blocked the request as automated traffic. Log out, log back in, then retry.',
      'relist.error.draftNotSaved': 'Could not save the draft: {0}',
      'relist.error.draftNoId': 'Vinted accepted the draft but returned no id.',
      'relist.error.publishFailed': 'Could not publish the draft: {0}',
      'relist.error.publishedNoId': 'Vinted published the draft but returned no id.',
      'relist.error.publishGaveUp': 'Publishing failed after several attempts.',
      'size.cancelled': 'Cancelled. Nothing was deleted.',

      // The age line painted under every wardrobe item. One day gets its own
      // key rather than the count's placeholder: "1 days ago" was wrong in
      // English before it was ever wrong in Italian.
      'age.today': 'Created today',
      'age.dayAgo': 'Created 1 day ago',
      'age.daysAgo': 'Created {0} days ago',

      // Why a pause is standing, written by content.js as a code rather than a
      // sentence and translated here by popup.js — the record can outlive a
      // language switch, and a sentence saved in one language would not.
      'pause.why.rateLimit': 'Vinted answered "too many requests".',
      'pause.why.botCheck': 'Vinted answered with a bot challenge.',
      'pause.why.restricted': 'Vinted has restricted this account from listing or editing items.',

      // --- the toolbar popup -------------------------------------------
      // Everything below is read by popup.html's own paint() call and by
      // popup.js — the panel that lives in the toolbar, not on a Vinted page —
      // with the two exceptions immediately below, which belong to the button
      // the panel hangs off rather than to the panel.

      // The toolbar button's tooltip, set by background.js. It is the only
      // thing the extension says while no panel is open, and the welcome page
      // points at it by name, so it is functional text and not decoration.
      // Colour needs no tooltip beyond the product name, which is the same word
      // in every language and is therefore not a key.
      'popup.tooltip.off': 'Bumpline: off',
      'popup.tooltip.notVinted': 'Bumpline: not a Vinted page',

      // The switch at the top, and the word beside it that says the same
      // thing the knob position already shows.
      'popup.power.on': 'On',
      'popup.power.off': 'Off',
      // The switch's own name, read out to a screen reader rather than
      // shown; a product name, so it stays the same word in every language.
      'popup.power.label': 'Bumpline',

      // Shown in place of the whole panel while the switch is off: no card
      // below has anything to report on work that is not happening.
      'popup.offline.title': 'Bumpline is switched off',
      'popup.offline.hint': 'Turn it back on to relist your items.',

      // The status card: what this tab is, before the pending and paused
      // cards have had their say.
      'popup.status.checking.title': 'Checking this tab',
      'popup.status.checking.detail': 'One moment…',
      'popup.status.ready.title': 'Ready on this page',
      'popup.status.ready.detail.one': 'One item can be relisted, under its Bump button.',
      'popup.status.ready.detail': '{0} items can be relisted, under their Bump buttons.',
      'popup.status.empty.title': 'Nothing to relist here',
      'popup.status.empty.detail': 'Relist buttons appear on your own items that are still on sale.',
      'popup.status.notProfile.title': 'Not a profile page',
      'popup.status.notProfile.detail': 'Relist buttons only appear on your own wardrobe.',
      'popup.status.notVinted.title': 'Not on Vinted',
      'popup.status.notVinted.detail': 'Open your Vinted wardrobe to relist an item.',

      // The one button the status card can offer: somewhere to go that is
      // not where the seller already is.
      'popup.action.openProfilePage': 'Open the profile page',
      'popup.action.openProfile': 'Open your Vinted profile',

      // The volume card: the numbers Vinted is actually watching.
      'popup.volume.title': 'Relisting volume',
      'popup.volume.hour': 'this hour',
      'popup.volume.today': 'today',
      // Its own sentence rather than a suffix glued on in script, because it
      // is appended to three different sentences below and each language
      // gets to decide for itself where a fourth clause belongs.
      'popup.volume.wait': ' The next one waits {0}s.',
      'popup.volume.normal': 'The warning appears at {0} in an hour or {1} in a day.{2}',
      'popup.volume.dayAlarm': 'A whole wardrobe in a day looks like a bulk operation from where Vinted is standing, and Vinted answers those with a day-long block on editing and publishing, or a longer restriction. The next relist will ask you to confirm.{0}',
      'popup.volume.hourAlarm': 'That is the volume Vinted reads as automated activity, and Vinted answers it with a day-long block on editing and publishing, or a longer restriction. The next relist will ask you to confirm.{0}',

      // The settings drawer: its title, its two groups, and the count of
      // what is not at its default.
      'popup.settings.title': 'Settings',
      'popup.settings.group.pacing': 'Pacing',
      'popup.settings.group.afterRelist': 'After a relist',
      // '{0} changed' reads '1 changed' at one, which is fine in English but
      // wrong in a language that pluralises the word — Italian included — so
      // one gets its own key rather than sharing the count's placeholder.
      'popup.settings.changed.one': '1 changed',
      'popup.settings.changed': '{0} changed',
      'popup.settings.cooldown.label': 'Wait 10 seconds between relists',
      'popup.settings.cooldown.hint': 'Recommended. Off sends them back to back, the pattern Vinted blocks accounts for.',
      'popup.settings.pace.label': 'Pause 0.9 to 2.4s between requests',
      'popup.settings.pace.hint': 'Recommended. Off shortens it to 0.25 to 0.7s, fast enough to read as an automated script.',
      'popup.settings.reload.label': 'Reload the page',
      'popup.settings.reload.hint': 'Off keeps your place on the page; the relisted copy appears at your next reload.',
      // The browser is asked first and is right nearly always; this row is for
      // the seller it is wrong about. The language names in the list are
      // not translated — a person scanning for their own language wants to
      // see it written the way it is written, not the way English names it.
      'popup.lang.group': 'Language',
      'popup.lang.label': 'Language',
      'popup.lang.auto': 'Automatic (browser language)',
      'popup.settings.localDrafts.label': 'Keep the copy on this device',
      'popup.settings.localDrafts.hint': 'Relist button only. Off saves a draft to your Vinted account first, as in versions before 1.0.1.',

      // The warning dialog: a shared shell (popup.risk.keep and
      // popup.risk.change are its defaults, which no call site currently
      // leaves unset) and the three questions it is actually asked. These are
      // what stop a seller getting their account blocked, so each is written
      // to read as a warning worth heeding rather than a translated sentence.
      'popup.risk.keep': 'Keep this setting',
      'popup.risk.change': 'Change it anyway',
      'popup.risk.cooldown.title': 'This is the only hard stop',
      'popup.risk.cooldown.detail': 'Deleting and re-publishing back to back is the pattern Vinted matches on. Without the ten seconds, a run of relists goes out as fast as the network allows. A 24-hour block on editing and publishing is the mildest answer to that, and Vinted can restrict the account for longer.',
      'popup.risk.cooldown.accept': 'Turn it off',
      'popup.risk.cooldown.cancel': 'Keep the cooldown',
      'popup.risk.pace.title': 'This keeps a relist from arriving as one burst',
      'popup.risk.pace.detail': 'The random 0.9 to 2.4 seconds between requests spread a relist out over its twenty or so API calls. At 0.25 to 0.7 seconds the traffic looks far more like a script, and that is what Vinted blocks accounts for.',
      'popup.risk.pace.accept': 'Shorten it',
      'popup.risk.pace.cancel': 'Keep the pause',
      'popup.risk.liftPause.title': 'Vinted asked for this pause',
      'popup.risk.liftPause.detail': 'The pause is there because Vinted refused a request, and being refused again is what turns a rate limit into a block on the account. Lift it only if you are sure the refusal was something else, like a logged-out session or a one-off network failure.',
      'popup.risk.liftPause.accept': 'Lift it anyway',
      'popup.risk.liftPause.cancel': 'Keep the pause',

      // The paused card: Vinted's own restriction and the extension's own
      // stand-down share a card but say different things.
      'popup.paused.title': 'Relisting is paused',
      'popup.paused.titleRestricted': 'Vinted has restricted this account',
      // Two sentences for one fact, because a pause that ends today ends at a
      // time and one that ends later ends on a date, and Italian takes a
      // different preposition for each — "fino alle 14:05", but "fino al 02/09
      // alle 14:05". English happens to say "until" both times; that is not a
      // reason to make Italian share the sentence. The dated form's {1} is
      // popup.paused.until.dated, joined there rather than glued together in
      // popup.js, so no language is stuck with the English word order.
      'popup.paused.detail': '{0} Nothing is sent until {1}, on any tab. The buttons come back on their own.',
      'popup.paused.detail.dated': '{0} Nothing is sent until {1}, on any tab. The buttons come back on their own.',
      'popup.paused.until.dated': '{0} at {1}',
      'popup.paused.restrictionNote': 'The message Vinted sent you says why. You cannot relist until Vinted lifts the restriction. Vinted can lift one earlier than the date it published: the next wardrobe page you open will notice, or you can clear this here and let that page decide afresh.',
      'popup.paused.more': 'Show more',
      'popup.paused.less': 'Show less',
      'popup.paused.lift': 'Lift the pause early',
      'popup.paused.liftRestriction': 'Vinted has lifted it',

      // The pending card: a relist that started but never finished.
      'popup.pending.title.one': '1 relist has not finished',
      'popup.pending.title': '{0} relists have not finished',
      'popup.pending.itemFallback': 'Item {0}',
      'popup.pending.more': 'and {0} more',
      'popup.pending.note.enabled': 'Bumpline retries these each time you open a Vinted profile page. {0}',
      'popup.pending.note.disabled': 'Bumpline is off, so nothing is being retried. {0}',
      'popup.pending.note.draft': 'The copy is also in your Vinted drafts.',
      'popup.pending.note.device': 'The copy is saved on this device.',

      // The footer: two links that are always the same, and a rating link
      // that only appears once store.js has worked out where it goes.
      'footer.howItWorks': 'How it works',
      'footer.reportProblem': 'Report a problem',
      'footer.rate': 'Rate Bumpline',

      // --- the page after the install -----------------------------------
      // Read once, by welcome/script.js, right after the extension is
      // installed. It reuses button.relist, button.draft and the popup's
      // footer keys rather than repeating them, so the illustration and the
      // links always match what the panel itself says.

      'welcome.title': 'Welcome to Bumpline',
      'welcome.hero.title': 'Thanks for installing Bumpline',
      'welcome.hero.lead': 'Relisting an item used to mean retyping the title, the description and every last photo. From now on it is one button. Nothing to set up here either: two quick steps and you can close this tab for good.',

      'welcome.step1.title': 'Pin Bumpline to your toolbar',
      'welcome.step1.note': 'Click the puzzle piece next to the address bar, then the little pin beside Bumpline. One click now, and you never have to go looking for it again.',
      'welcome.step1.aside': 'After that the icon does the talking: in colour when there is something for Bumpline to do on the tab you are on, grey when there is not. You will not have to click it to find out.',
      'welcome.step1.artLabel': 'A Chrome window on a Vinted page. The puzzle piece to the right of the address bar is open, and the extensions menu lists Bumpline with a pin beside it.',
      // The three words drawn inside that picture. They are Chrome's own menu,
      // and Chrome translates its menu: an Italian reader looking for
      // "Extensions" in a browser that says "Estensioni" is being sent to find
      // something that is not there. The drawing has to show what the reader
      // will actually see.
      'welcome.step1.art.extensions': 'Extensions',
      'welcome.step1.art.access': 'Full access',
      'welcome.step1.art.manage': 'Manage extensions',

      'welcome.step2.title': 'Go to your own wardrobe',
      // Read through data-i18n-html, not data-i18n: these two carry their own
      // <b>/<i> emphasis, which plain textContent painting would strip.
      'welcome.step2.note': 'That is where the buttons turn up. Every item of yours still for sale gets a <b>Relist</b> and a <b>Relist as draft</b>, right beside it. Only on your things. Nobody else’s listings are touched.',
      'welcome.step2.aside': 'Nothing is thrown away first. The copy is made <i>before</i> the old listing goes, so your item is never in limbo. <b>Relist</b> puts it straight back up; <b>Relist as draft</b> stops one step short of publishing, in case you want to look it over first.',
      'welcome.step2.artLabel': 'A listing on your own wardrobe, with a Relist button and a Relist as draft button below it.',

      'welcome.rate.title': 'If it saves you time, say so',
      'welcome.rate.note': 'Bumpline is free, open source, and there is no account to sign up for. A rating is the only thing it asks for, and it is how the next seller finds it. No rush: come back once you have actually used the thing.',

      // Written by script.js next to the manifest's own version number, which
      // is never translated.
      'welcome.version': 'Version {0}',
    },
    it: {
      'button.relist': 'Ripubblica',
      'button.draft': 'Ripubblica come bozza',
      'button.draft.title': 'Elimina l\'originale e lascia la copia non pubblicata nelle tue bozze di Vinted',
      'button.cooldown': 'Attesa {0}s…',
      'button.waiting': 'Attesa…',
      'button.relisting': 'Ripubblicazione…',
      'button.checkingSize': 'Controllo taglia…',
      'button.waitingSize': 'In attesa della taglia…',
      'button.checking': 'Controllo…',
      'button.savingDraft': 'Salvataggio bozza…',
      'button.savingCopy': 'Salvataggio copia…',
      'button.deleting': 'Eliminazione…',
      'button.publishing': 'Pubblicazione…',
      'button.retrying': 'Nuovo tentativo {0}/{1}…',

      'toast.pausedUntil': 'La ripubblicazione è in pausa fino alle {0}.',
      'toast.publishPausedUntil': 'La pubblicazione è in pausa fino alle {0}.',
      'toast.published': 'Pubblicato.',
      'toast.relisted': 'Ripubblicato.',
      'toast.relistedNoPhotos': 'Ripubblicato, ma la copia non ha foto. Aggiungile su Vinted.',
      'toast.originalDeletedDraft': 'Originale eliminato. La copia si trova nelle tue bozze di Vinted.',
      'toast.reloading': '{0} Ricaricamento…',
      'toast.reloadToSee': '{0} Ricarica per vederlo.',
      'toast.cantFindItem': 'Impossibile capire a quale articolo appartiene questo pulsante.',
      'toast.resumingUnfinished': 'Una ripubblicazione di questo articolo non è stata completata. Ripresa in corso.',
      'toast.stopped': 'Interrotto. Non è stato eliminato nulla.',
      'toast.relistStopped': 'Ripubblicazione interrotta: {0}',

      'card.recovery.message.draft': '«{0}» è stato eliminato e non è ancora pubblicato. La copia si trova nelle tue bozze di Vinted. La pubblicazione viene ritentata a ogni pagina di Vinted che apri.',
      'card.recovery.message.device': '«{0}» è stato eliminato e non è ancora pubblicato. La copia è salvata su questo dispositivo. La pubblicazione viene ritentata a ogni pagina di Vinted che apri.',
      'card.recovery.reason': 'Vinted l\'ha rifiutata: {0}',
      'card.recovery.retry': 'Riprova ora',
      'card.recovery.download': 'Scarica i dati',
      'card.recovery.discard': 'Scarta la copia',

      'size.title': 'Scegli una taglia per continuare',
      'size.body': '«{0}» non può essere ripubblicato così com\'è: {1}. Scegli la taglia che dovrà avere il nuovo annuncio. Non è stato ancora eliminato nulla.',
      'size.blank': 'Seleziona una taglia',
      'size.cancel': 'Annulla la ripubblicazione',
      'size.accept': 'Usa questa taglia',
      'size.group': 'Gruppo {0}',
      'size.why.required': 'questa categoria ora richiede una taglia e l\'annuncio non ne ha una',
      'size.why.invalid': 'la taglia {0} non è più valida per questa categoria',
      'size.unavailable': '{0}. Non è stato eliminato nulla.',

      'budget.title.day': 'Oggi hai ripubblicato molti articoli',
      'budget.title.hour': 'Stai ripubblicando molti articoli',
      'budget.body.day': '{0} articoli sono stati ripubblicati da questo browser nelle ultime 24 ore, che equivale a ripubblicare un armadio intero invece di rinfrescare qualche annuncio. Questo è ciò che Vinted interpreta come attività automatizzata, e la conseguenza è che impedisce all\'account di modificare o pubblicare qualsiasi cosa per circa un giorno. Non è stato ancora eliminato nulla.',
      'budget.body.hour': '{0} articoli sono stati ripubblicati da questo browser nell\'ultima ora. Questo è ciò che Vinted interpreta come attività automatizzata, e la conseguenza è che impedisce all\'account di modificare o pubblicare qualsiasi cosa per circa un giorno. Non è stato ancora eliminato nulla.',
      'budget.proceed': 'Ripubblica comunque',
      'budget.cancel': 'Interrompi per ora',

      'relist.error.noPhoto': 'Nessuna foto è stata caricata. Non è stato eliminato nulla.',
      'relist.error.photosIncomplete': 'Caricate solo {0} foto su {1} ({2} non riuscite). Non è stato eliminato nulla, riprova tra un momento.',
      'relist.error.noTitle': 'L\'annuncio non ha un titolo. Non è stato eliminato nulla.',
      'relist.error.noCondition': 'Non è stato possibile leggere le condizioni dell\'articolo, e ripubblicarlo con quelle sbagliate sarebbe peggio che fermarsi. Non è stato eliminato nulla.',
      'relist.error.copyNotSaved': 'Non è stato possibile salvare la copia su questo dispositivo, e senza di essa l\'originale non può essere eliminato in sicurezza. Non è stato eliminato nulla.',
      'relist.error.itemGone': 'L\'articolo {0} non può essere modificato: è venduto, riservato o non esiste più.',
      'relist.error.itemNoData': 'L\'articolo {0} non ha restituito alcun dato.',
      'relist.error.deleteFailed': 'Non è stato possibile eliminare l\'originale: {0}',
      'relist.error.noAnswer': 'Vinted non ha risposto in tempo. Niente è stato inviato due volte, quindi riprova.',
      'relist.error.noToken': 'Non è stato possibile leggere il token di sicurezza di Vinted. Ricarica la pagina e riprova.',
      'relist.error.automated': 'Vinted ha bloccato la richiesta considerandola traffico automatizzato. Esci dall\'account, rientra e riprova.',
      'relist.error.draftNotSaved': 'Non è stato possibile salvare la bozza: {0}',
      'relist.error.draftNoId': 'Vinted ha accettato la bozza ma non ha restituito un id.',
      'relist.error.publishFailed': 'Non è stato possibile pubblicare la bozza: {0}',
      'relist.error.publishedNoId': 'Vinted ha pubblicato la bozza ma non ha restituito un id.',
      'relist.error.publishGaveUp': 'La pubblicazione non è riuscita dopo diversi tentativi.',
      'size.cancelled': 'Annullato. Non è stato eliminato nulla.',

      'age.today': 'Creato oggi',
      'age.dayAgo': 'Creato 1 giorno fa',
      'age.daysAgo': 'Creato {0} giorni fa',

      'pause.why.rateLimit': 'Vinted ha risposto «troppe richieste».',
      'pause.why.botCheck': 'Vinted ha risposto con una verifica anti-bot.',
      'pause.why.restricted': 'Vinted ha limitato questo account, impedendogli di pubblicare o modificare articoli.',

      'popup.tooltip.off': 'Bumpline: spento',
      'popup.tooltip.notVinted': 'Bumpline: questa non è una pagina Vinted',

      'popup.power.on': 'Attivo',
      'popup.power.off': 'Spento',
      'popup.power.label': 'Bumpline',

      'popup.offline.title': 'Bumpline è spento',
      'popup.offline.hint': 'Riattivalo per ripubblicare i tuoi articoli.',

      'popup.status.checking.title': 'Controllo di questa scheda',
      'popup.status.checking.detail': 'Un momento…',
      'popup.status.ready.title': 'Pronto su questa pagina',
      'popup.status.ready.detail.one': 'Un articolo può essere ripubblicato, sotto il suo pulsante «Metti in evidenza».',
      'popup.status.ready.detail': '{0} articoli possono essere ripubblicati, sotto i rispettivi pulsanti «Metti in evidenza».',
      'popup.status.empty.title': 'Niente da ripubblicare qui',
      'popup.status.empty.detail': 'I pulsanti Ripubblica compaiono sui tuoi articoli ancora in vendita.',
      'popup.status.notProfile.title': 'Non è una pagina di profilo',
      'popup.status.notProfile.detail': 'I pulsanti Ripubblica compaiono solo nel tuo armadio.',
      'popup.status.notVinted.title': 'Non sei su Vinted',
      'popup.status.notVinted.detail': 'Apri il tuo armadio Vinted per ripubblicare un articolo.',

      'popup.action.openProfilePage': 'Apri la pagina del profilo',
      'popup.action.openProfile': 'Apri il tuo profilo Vinted',

      'popup.volume.title': 'Volume di ripubblicazione',
      'popup.volume.hour': 'quest\'ora',
      'popup.volume.today': 'oggi',
      'popup.volume.wait': ' La prossima attende {0}s.',
      'popup.volume.normal': 'L\'avviso compare a {0} in un\'ora o a {1} in un giorno.{2}',
      'popup.volume.dayAlarm': 'Ripubblicare un intero armadio in un giorno assomiglia a un\'operazione massiva agli occhi di Vinted, che risponde con un blocco di un giorno su modifiche e pubblicazioni, o con una restrizione più lunga. La prossima ripubblicazione ti chiederà conferma.{0}',
      'popup.volume.hourAlarm': 'È il volume che Vinted legge come attività automatizzata, e la sua risposta è un blocco di un giorno su modifiche e pubblicazioni, o una restrizione più lunga. La prossima ripubblicazione ti chiederà conferma.{0}',

      'popup.settings.title': 'Impostazioni',
      'popup.settings.group.pacing': 'Ritmo',
      'popup.settings.group.afterRelist': 'Dopo una ripubblicazione',
      'popup.settings.changed.one': '1 modificata',
      'popup.settings.changed': '{0} modificate',
      'popup.settings.cooldown.label': 'Attendi 10 secondi tra una ripubblicazione e l\'altra',
      'popup.settings.cooldown.hint': 'Consigliato. Se la disattivi, le ripubblicazioni partono una dietro l\'altra: è lo schema per cui Vinted blocca gli account.',
      'popup.settings.pace.label': 'Pausa da 0,9 a 2,4 secondi tra le richieste',
      'popup.settings.pace.hint': 'Consigliato. Se lo disattivi, si riduce a 0,25-0,7 secondi: abbastanza veloce da sembrare uno script automatico.',
      'popup.settings.reload.label': 'Ricarica la pagina',
      'popup.settings.reload.hint': 'Se disattivato, resti dove sei sulla pagina; la copia ripubblicata appare al prossimo ricaricamento.',
      'popup.lang.group': 'Lingua',
      'popup.lang.label': 'Lingua',
      'popup.lang.auto': 'Automatica (lingua del browser)',
      'popup.settings.localDrafts.label': 'Tieni la copia su questo dispositivo',
      'popup.settings.localDrafts.hint': 'Solo per il pulsante Ripubblica. Se disattivato, salva prima una bozza sul tuo account Vinted, come nelle versioni precedenti alla 1.0.1.',

      'popup.risk.keep': 'Mantieni questa impostazione',
      'popup.risk.change': 'Modificala comunque',
      'popup.risk.cooldown.title': 'Questo è l\'unico limite fisso',
      'popup.risk.cooldown.detail': 'Eliminare e ripubblicare uno dopo l\'altro senza pause è lo schema che Vinted riconosce. Senza i dieci secondi, una serie di ripubblicazioni parte alla velocità massima consentita dalla rete. Un blocco di 24 ore su modifiche e pubblicazioni è la risposta più lieve che Vinted dà a questo comportamento, e può arrivare a limitare l\'account più a lungo.',
      'popup.risk.cooldown.accept': 'Disattivala',
      'popup.risk.cooldown.cancel': 'Mantieni l\'attesa',
      'popup.risk.pace.title': 'Questo evita che una ripubblicazione arrivi in un\'unica raffica',
      'popup.risk.pace.detail': 'L\'intervallo casuale di 0,9-2,4 secondi tra le richieste distribuisce una ripubblicazione sulle sue venti e più chiamate API. A 0,25-0,7 secondi il traffico assomiglia molto di più a uno script, ed è proprio per questo che Vinted blocca gli account.',
      'popup.risk.pace.accept': 'Accorcialo',
      'popup.risk.pace.cancel': 'Mantieni l\'intervallo',
      'popup.risk.liftPause.title': 'È stato Vinted a chiedere questa pausa',
      'popup.risk.liftPause.detail': 'La pausa esiste perché Vinted ha rifiutato una richiesta, ed è un nuovo rifiuto a trasformare un limite di frequenza in un blocco dell\'account. Terminala solo se sei sicuro che il rifiuto avesse un\'altra causa, come una sessione scaduta o un errore di rete isolato.',
      'popup.risk.liftPause.accept': 'Terminala comunque',
      'popup.risk.liftPause.cancel': 'Mantieni la pausa',

      'popup.paused.title': 'La ripubblicazione è in pausa',
      'popup.paused.titleRestricted': 'Vinted ha limitato questo account',
      'popup.paused.detail': '{0} Non viene inviata alcuna richiesta, da nessuna scheda, fino alle {1}. I pulsanti tornano da soli.',
      'popup.paused.detail.dated': '{0} Non viene inviata alcuna richiesta, da nessuna scheda, fino al {1}. I pulsanti tornano da soli.',
      'popup.paused.until.dated': '{0} alle {1}',
      'popup.paused.restrictionNote': 'Il messaggio che Vinted ti ha inviato ne spiega il motivo. Non puoi ripubblicare finché Vinted non revoca la restrizione. Vinted può revocarla prima della data indicata: la prossima pagina dell\'armadio che apri se ne accorgerà, oppure puoi cancellarla qui e lasciare che sia quella pagina a deciderlo di nuovo.',
      'popup.paused.more': 'Mostra altro',
      'popup.paused.less': 'Mostra meno',
      'popup.paused.lift': 'Termina la pausa in anticipo',
      'popup.paused.liftRestriction': 'Vinted l\'ha revocata',

      'popup.pending.title.one': '1 ripubblicazione non è stata completata',
      'popup.pending.title': '{0} ripubblicazioni non sono state completate',
      'popup.pending.itemFallback': 'Articolo {0}',
      'popup.pending.more': 'e altri {0}',
      'popup.pending.note.enabled': 'Bumpline li ritenta ogni volta che apri una pagina del profilo Vinted. {0}',
      'popup.pending.note.disabled': 'Bumpline è spento, quindi non viene ritentato nulla. {0}',
      'popup.pending.note.draft': 'La copia si trova anche nelle tue bozze di Vinted.',
      'popup.pending.note.device': 'La copia è salvata su questo dispositivo.',

      'footer.howItWorks': 'Come funziona',
      'footer.reportProblem': 'Segnala un problema',
      'footer.rate': 'Vota Bumpline',

      'welcome.title': 'Benvenuto in Bumpline',
      'welcome.hero.title': 'Grazie per aver installato Bumpline',
      'welcome.hero.lead': 'Ripubblicare un articolo voleva dire riscrivere da capo il titolo, la descrizione e ogni singola foto. Da ora basta un pulsante. Niente da configurare neanche qui: due passaggi rapidi e puoi chiudere questa scheda per sempre.',

      'welcome.step1.title': 'Fissa Bumpline nella barra degli strumenti',
      'welcome.step1.note': 'Clicca sul pezzo di puzzle accanto alla barra degli indirizzi, poi sulla piccola puntina accanto a Bumpline. Un clic adesso, e non dovrai più andarlo a cercare.',
      'welcome.step1.aside': 'Da quel momento parla l\'icona: a colori quando c\'è qualcosa da fare per Bumpline nella scheda che stai guardando, grigia quando non c\'è. Non dovrai cliccarci per saperlo.',
      'welcome.step1.artLabel': 'Una finestra di Chrome su una pagina Vinted. Il pezzo di puzzle a destra della barra degli indirizzi è aperto, e il menu delle estensioni mostra Bumpline con una puntina accanto.',
      // Chrome's own wording in Italian, which is what the reader will find in
      // the menu the picture is of.
      'welcome.step1.art.extensions': 'Estensioni',
      'welcome.step1.art.access': 'Accesso completo',
      'welcome.step1.art.manage': 'Gestisci estensioni',

      'welcome.step2.title': 'Vai al tuo armadio',
      'welcome.step2.note': 'È lì che compaiono i pulsanti. Ogni tuo articolo ancora in vendita riceve un pulsante <b>Ripubblica</b> e uno <b>Ripubblica come bozza</b>, proprio accanto. Solo sulle tue cose. Nessun annuncio altrui viene toccato.',
      'welcome.step2.aside': 'Niente viene buttato via prima. La copia viene creata <i>prima</i> che il vecchio annuncio venga eliminato, così il tuo articolo non resta mai in sospeso. <b>Ripubblica</b> lo rimette subito in vendita; <b>Ripubblica come bozza</b> si ferma un passo prima della pubblicazione, nel caso tu voglia ricontrollarlo prima.',
      'welcome.step2.artLabel': 'Un annuncio nel tuo armadio, con un pulsante Ripubblica e un pulsante Ripubblica come bozza sotto di esso.',

      'welcome.rate.title': 'Se ti ha fatto risparmiare tempo, dillo',
      'welcome.rate.note': 'Bumpline è gratuito, open source, e non serve nessun account per usarlo. Una valutazione è l\'unica cosa che chiede, ed è così che il prossimo venditore lo trova. Nessuna fretta: torna qui una volta che l\'hai davvero usato.',

      'welcome.version': 'Versione {0}',
    },
    fr: {
      'button.relist': 'Republier',
      'button.draft': 'Republier en brouillon',
      'button.draft.title': 'Supprime l\'original et laisse la copie non publiée dans tes brouillons Vinted',
      'button.cooldown': 'Pause {0} s…',
      'button.waiting': 'En attente…',
      'button.relisting': 'Republication…',
      'button.checkingSize': 'Vérification de la taille…',
      'button.waitingSize': 'En attente de la taille…',
      'button.checking': 'Vérification…',
      'button.savingDraft': 'Enregistrement du brouillon…',
      'button.savingCopy': 'Enregistrement de la copie…',
      'button.deleting': 'Suppression…',
      'button.publishing': 'Publication…',
      'button.retrying': 'Nouvelle tentative {0}/{1}…',

      'toast.pausedUntil': 'La republication est en pause jusqu\'à {0}.',
      'toast.publishPausedUntil': 'La publication est en pause jusqu\'à {0}.',
      'toast.published': 'Publié.',
      'toast.relisted': 'Republié.',
      'toast.relistedNoPhotos': 'Republié, mais la copie n\'a aucune photo. Ajoute-les sur Vinted.',
      'toast.originalDeletedDraft': 'Original supprimé. La copie se trouve dans tes brouillons Vinted.',
      'toast.reloading': '{0} Rechargement…',
      'toast.reloadToSee': '{0} Recharge la page pour le voir.',
      'toast.cantFindItem': 'Impossible de savoir à quel article ce bouton appartient.',
      'toast.resumingUnfinished': 'Une republication de cet article n\'a pas abouti. Reprise en cours.',
      'toast.stopped': 'Arrêté. Rien n\'a été supprimé.',
      'toast.relistStopped': 'Republication arrêtée : {0}',

      'card.recovery.message.draft': '« {0} » a été supprimé et n\'est pas encore publié. La copie se trouve dans tes brouillons Vinted. La publication est retentée à chaque page Vinted que tu ouvres.',
      'card.recovery.message.device': '« {0} » a été supprimé et n\'est pas encore publié. La copie est enregistrée sur cet appareil. La publication est retentée à chaque page Vinted que tu ouvres.',
      'card.recovery.reason': 'Vinted l\'a refusé : {0}',
      'card.recovery.retry': 'Réessayer maintenant',
      'card.recovery.download': 'Télécharger les données',
      'card.recovery.discard': 'Abandonner',

      'size.title': 'Choisis une taille pour continuer',
      'size.body': '« {0} » ne peut pas être republié tel quel : {1}. Choisis la taille que portera la nouvelle annonce. Rien n\'a encore été supprimé.',
      'size.blank': 'Sélectionne une taille',
      'size.cancel': 'Annuler la republication',
      'size.accept': 'Utiliser cette taille',
      'size.group': 'Groupe {0}',
      'size.why.required': 'cette catégorie exige désormais une taille et l\'annonce n\'en a aucune',
      'size.why.invalid': 'la taille {0} n\'est plus valable pour cette catégorie',
      'size.unavailable': '{0}. Rien n\'a été supprimé.',

      'budget.title.day': 'Tu as republié beaucoup d\'articles aujourd\'hui',
      'budget.title.hour': 'Tu republies beaucoup d\'articles',
      'budget.body.day': '{0} articles ont été republiés depuis ce navigateur au cours des dernières 24 heures : c\'est un dressing entier qui repasse, pas quelques annonces rafraîchies. C\'est ce que Vinted lit comme une activité automatisée, et ce qu\'il fait alors, c\'est empêcher le compte de modifier ou de publier quoi que ce soit pendant environ un jour. Rien n\'a encore été supprimé.',
      'budget.body.hour': '{0} articles ont été republiés depuis ce navigateur au cours de la dernière heure. C\'est ce que Vinted lit comme une activité automatisée, et ce qu\'il fait alors, c\'est empêcher le compte de modifier ou de publier quoi que ce soit pendant environ un jour. Rien n\'a encore été supprimé.',
      'budget.proceed': 'Republier quand même',
      'budget.cancel': 'Arrêter pour l\'instant',

      'relist.error.noPhoto': 'Aucune photo n\'a pu être envoyée. Rien n\'a été supprimé.',
      'relist.error.photosIncomplete': 'Seulement {0} photos sur {1} ont été envoyées ({2} en échec). Rien n\'a été supprimé, réessaie dans un instant.',
      'relist.error.noTitle': 'L\'annonce n\'a pas de titre. Rien n\'a été supprimé.',
      'relist.error.noCondition': 'Impossible de lire l\'état de l\'article, et le republier avec le mauvais état serait pire que de s\'arrêter. Rien n\'a été supprimé.',
      'relist.error.copyNotSaved': 'La copie n\'a pas pu être enregistrée sur cet appareil, et sans elle l\'original ne peut pas être supprimé sans risque. Rien n\'a été supprimé.',
      'relist.error.itemGone': 'L\'article {0} ne peut pas être modifié : il est vendu, réservé ou déjà parti.',
      'relist.error.itemNoData': 'L\'article {0} n\'a renvoyé aucune donnée.',
      'relist.error.deleteFailed': 'Impossible de supprimer l\'original : {0}',
      'relist.error.noAnswer': 'Vinted n\'a pas répondu à temps. Rien n\'a été envoyé deux fois, réessaie.',
      'relist.error.noToken': 'Impossible de lire le jeton de sécurité Vinted. Recharge la page et réessaie.',
      'relist.error.automated': 'Vinted a bloqué la requête comme trafic automatisé. Déconnecte-toi, reconnecte-toi, puis réessaie.',
      'relist.error.draftNotSaved': 'Impossible d\'enregistrer le brouillon : {0}',
      'relist.error.draftNoId': 'Vinted a accepté le brouillon mais n\'a renvoyé aucun identifiant.',
      'relist.error.publishFailed': 'Impossible de publier le brouillon : {0}',
      'relist.error.publishedNoId': 'Vinted a publié le brouillon mais n\'a renvoyé aucun identifiant.',
      'relist.error.publishGaveUp': 'La publication a échoué après plusieurs tentatives.',
      'size.cancelled': 'Annulé. Rien n\'a été supprimé.',

      'age.today': 'Créé aujourd\'hui',
      'age.dayAgo': 'Créé il y a 1 jour',
      'age.daysAgo': 'Créé il y a {0} jours',

      'pause.why.rateLimit': 'Vinted a répondu « trop de requêtes ».',
      'pause.why.botCheck': 'Vinted a répondu par un contrôle anti-robot.',
      'pause.why.restricted': 'Vinted a restreint ce compte : il ne peut plus publier ni modifier d\'articles.',

      'popup.tooltip.off': 'Bumpline : désactivé',
      'popup.tooltip.notVinted': 'Bumpline : ce n\'est pas une page Vinted',

      'popup.power.on': 'Activé',
      'popup.power.off': 'Désactivé',
      'popup.power.label': 'Bumpline',

      'popup.offline.title': 'Bumpline est désactivé',
      'popup.offline.hint': 'Réactive-le pour republier tes articles.',

      'popup.status.checking.title': 'Vérification de cet onglet',
      'popup.status.checking.detail': 'Un instant…',
      'popup.status.ready.title': 'Prêt sur cette page',
      'popup.status.ready.detail.one': 'Un article peut être republié, sous son bouton « Booster ».',
      'popup.status.ready.detail': '{0} articles peuvent être republiés, sous leurs boutons « Booster ».',
      'popup.status.empty.title': 'Rien à republier ici',
      'popup.status.empty.detail': 'Les boutons Republier apparaissent sur tes propres articles encore en vente.',
      'popup.status.notProfile.title': 'Ce n\'est pas une page de profil',
      'popup.status.notProfile.detail': 'Les boutons Republier n\'apparaissent que dans ton propre dressing.',
      'popup.status.notVinted.title': 'Tu n\'es pas sur Vinted',
      'popup.status.notVinted.detail': 'Ouvre ton dressing Vinted pour republier un article.',

      'popup.action.openProfilePage': 'Ouvrir la page de profil',
      'popup.action.openProfile': 'Ouvrir ton profil Vinted',

      'popup.volume.title': 'Volume de republication',
      'popup.volume.hour': 'cette heure',
      'popup.volume.today': 'aujourd\'hui',
      'popup.volume.wait': ' La prochaine attend {0} s.',
      'popup.volume.normal': 'L\'avertissement apparaît à {0} en une heure ou {1} en un jour.{2}',
      'popup.volume.dayAlarm': 'Un dressing entier en une journée ressemble à une opération de masse vue de là où Vinted se tient, et Vinted répond à cela par un blocage d\'une journée sur les modifications et les publications, voire une restriction plus longue. La prochaine republication te demandera de confirmer.{0}',
      'popup.volume.hourAlarm': 'C\'est le volume que Vinted lit comme une activité automatisée, et Vinted y répond par un blocage d\'une journée sur les modifications et les publications, voire une restriction plus longue. La prochaine republication te demandera de confirmer.{0}',

      'popup.settings.title': 'Paramètres',
      'popup.settings.group.pacing': 'Rythme',
      'popup.settings.group.afterRelist': 'Après une republication',
      'popup.settings.changed.one': '1 modifié',
      'popup.settings.changed': '{0} modifiés',
      'popup.settings.cooldown.label': 'Attendre 10 secondes entre deux republications',
      'popup.settings.cooldown.hint': 'Recommandé. Désactivé, elles partent l\'une après l\'autre sans pause : c\'est le schéma pour lequel Vinted bloque les comptes.',
      'popup.settings.pace.label': 'Pause de 0,9 à 2,4 s entre les requêtes',
      'popup.settings.pace.hint': 'Recommandé. Désactivé, la pause tombe à 0,25-0,7 s, assez rapide pour ressembler à un script automatisé.',
      'popup.settings.reload.label': 'Recharger la page',
      'popup.settings.reload.hint': 'Désactivé, tu gardes ta place sur la page ; la copie republiée apparaît au prochain rechargement.',
      'popup.lang.group': 'Langue',
      'popup.lang.label': 'Langue',
      'popup.lang.auto': 'Automatique (langue du navigateur)',
      'popup.settings.localDrafts.label': 'Garder la copie sur cet appareil',
      'popup.settings.localDrafts.hint': 'Bouton Republier uniquement. Désactivé, un brouillon est d\'abord enregistré sur ton compte Vinted, comme dans les versions antérieures à la 1.0.1.',

      'popup.risk.keep': 'Garder ce réglage',
      'popup.risk.change': 'Le modifier quand même',
      'popup.risk.cooldown.title': 'C\'est la seule limite stricte',
      'popup.risk.cooldown.detail': 'Supprimer et republier l\'un après l\'autre sans pause, c\'est le schéma que Vinted repère. Sans les dix secondes, une série de republications part aussi vite que le réseau le permet. Un blocage de 24 heures sur les modifications et les publications est la réponse la plus douce à cela, et Vinted peut restreindre le compte plus longtemps.',
      'popup.risk.cooldown.accept': 'Désactiver',
      'popup.risk.cooldown.cancel': 'Garder les dix secondes',
      'popup.risk.pace.title': 'Cela évite qu\'une republication arrive d\'un seul coup',
      'popup.risk.pace.detail': 'Les 0,9 à 2,4 secondes aléatoires entre les requêtes étalent une republication sur sa vingtaine d\'appels d\'API. À 0,25-0,7 seconde, le trafic ressemble bien davantage à un script, et c\'est pour cela que Vinted bloque des comptes.',
      'popup.risk.pace.accept': 'La raccourcir',
      'popup.risk.pace.cancel': 'Garder la pause',
      'popup.risk.liftPause.title': 'C\'est Vinted qui a demandé cette pause',
      'popup.risk.liftPause.detail': 'La pause est là parce que Vinted a refusé une requête, et se faire refuser une seconde fois est ce qui transforme une limite de débit en blocage du compte. Ne la lève que si tu es sûr que le refus venait d\'autre chose, comme une session déconnectée ou une panne réseau isolée.',
      'popup.risk.liftPause.accept': 'La lever quand même',
      'popup.risk.liftPause.cancel': 'Garder la pause',

      'popup.paused.title': 'La republication est en pause',
      'popup.paused.titleRestricted': 'Vinted a restreint ce compte',
      'popup.paused.detail': '{0} Aucune requête n\'est envoyée, depuis aucun onglet, jusqu\'à {1}. Les boutons reviennent d\'eux-mêmes.',
      'popup.paused.detail.dated': '{0} Aucune requête n\'est envoyée, depuis aucun onglet, jusqu\'au {1}. Les boutons reviennent d\'eux-mêmes.',
      'popup.paused.until.dated': '{0} à {1}',
      'popup.paused.restrictionNote': 'Le message que Vinted t\'a envoyé en dit la raison. Tu ne peux pas republier tant que Vinted ne lève pas la restriction. Vinted peut la lever avant la date qu\'il a annoncée : la prochaine page de dressing que tu ouvres s\'en apercevra, ou tu peux effacer ceci ici et laisser cette page trancher à nouveau.',
      'popup.paused.more': 'Afficher plus',
      'popup.paused.less': 'Afficher moins',
      'popup.paused.lift': 'Lever la pause maintenant',
      'popup.paused.liftRestriction': 'Vinted l\'a levée',

      'popup.pending.title.one': '1 republication n\'a pas abouti',
      'popup.pending.title': '{0} republications n\'ont pas abouti',
      'popup.pending.itemFallback': 'Article {0}',
      'popup.pending.more': 'et {0} de plus',
      'popup.pending.note.enabled': 'Bumpline les retente chaque fois que tu ouvres une page de profil Vinted. {0}',
      'popup.pending.note.disabled': 'Bumpline est désactivé, donc rien n\'est retenté. {0}',
      'popup.pending.note.draft': 'La copie se trouve aussi dans tes brouillons Vinted.',
      'popup.pending.note.device': 'La copie est enregistrée sur cet appareil.',

      'footer.howItWorks': 'Comment ça marche',
      'footer.reportProblem': 'Signaler un problème',
      'footer.rate': 'Noter Bumpline',

      'welcome.title': 'Bienvenue dans Bumpline',
      'welcome.hero.title': 'Merci d\'avoir installé Bumpline',
      'welcome.hero.lead': 'Republier un article, c\'était retaper le titre, la description et chaque photo. À partir de maintenant, c\'est un bouton. Rien à configurer ici non plus : deux étapes rapides et tu peux fermer cet onglet pour de bon.',

      'welcome.step1.title': 'Épingle Bumpline dans ta barre d\'outils',
      'welcome.step1.note': 'Clique sur la pièce de puzzle à côté de la barre d\'adresse, puis sur la petite épingle à côté de Bumpline. Un clic maintenant, et tu n\'auras plus jamais à le chercher.',
      'welcome.step1.aside': 'Ensuite, c\'est l\'icône qui parle : en couleur quand Bumpline a quelque chose à faire dans l\'onglet où tu es, grise quand ce n\'est pas le cas. Tu n\'auras pas besoin de cliquer pour le savoir.',
      'welcome.step1.artLabel': 'Une fenêtre Chrome sur une page Vinted. La pièce de puzzle à droite de la barre d\'adresse est ouverte, et le menu des extensions montre Bumpline avec une épingle à côté.',
      // Chrome's own wording in French, which is what the reader will find in
      // the menu the picture is of.
      'welcome.step1.art.extensions': 'Extensions',
      'welcome.step1.art.access': 'Accès complet',
      'welcome.step1.art.manage': 'Gérer les extensions',

      'welcome.step2.title': 'Va dans ton propre dressing',
      'welcome.step2.note': 'C\'est là que les boutons apparaissent. Chacun de tes articles encore en vente reçoit un <b>Republier</b> et un <b>Republier en brouillon</b>, juste à côté. Uniquement sur tes affaires. Aucune annonce de quelqu\'un d\'autre n\'est touchée.',
      'welcome.step2.aside': 'Rien n\'est jeté en premier. La copie est faite <i>avant</i> que l\'ancienne annonce disparaisse, donc ton article n\'est jamais dans le vide. <b>Republier</b> le remet directement en ligne ; <b>Republier en brouillon</b> s\'arrête un pas avant la publication, au cas où tu voudrais le relire.',
      'welcome.step2.artLabel': 'Une annonce dans ton propre dressing, avec un bouton Republier et un bouton Republier en brouillon en dessous.',

      'welcome.rate.title': 'Si ça t\'a fait gagner du temps, dis-le',
      'welcome.rate.note': 'Bumpline est gratuit, open source, et il n\'y a aucun compte à créer. Une note est la seule chose qu\'il demande, et c\'est comme ça que le prochain vendeur le trouve. Rien ne presse : reviens ici quand tu l\'auras vraiment utilisé.',

      'welcome.version': 'Version {0}',
    },
  };

  // The language the words are written in when nothing else can be worked out,
  // and the one every missing key falls back to.
  const BASE = 'en';

  // What the browser says, cut to the part that names a language: it-IT and
  // it-CH are both it, and a language with no catalogue is not a failure — it
  // is a seller who reads English.
  function fromBrowser() {
    const tag = (navigator.language || BASE).toLowerCase();
    const lang = tag.split('-')[0];
    return lang in CATALOG ? lang : BASE;
  }

  let active = fromBrowser();

  // 'auto' is a stored value, not a language: it means "ask the browser again".
  function use(lang) {
    active = lang && lang !== 'auto' && lang in CATALOG ? lang : fromBrowser();
  }

  // The tag the clock and the date are formatted with, which is not the same
  // question as which catalogue to read. 'en' is not 'en-GB': it resolves to US
  // conventions, so returning the bare subtag would turn a British seller's
  // 24-hour clock into a 12-hour one without them touching anything. The
  // browser's own tag is the right answer whenever it names the language being
  // read; only an override that disagrees with the browser falls back to the
  // bare subtag, which is the one case where there is nothing better to say.
  function locale() {
    const tag = navigator.language || BASE;
    return tag.toLowerCase().split('-')[0] === active ? tag : active;
  }

  // A key missing from the active language is a translation that has not been
  // written yet, and English is a better answer than a blank button. A key
  // missing from English too is a mistake in the code; returning the key makes
  // it loud in testing and leaves something readable on screen if it ever ships.
  function t(key, ...subs) {
    const line = CATALOG[active][key] ?? CATALOG[BASE][key] ?? key;
    return subs.length
      ? line.replace(/\{(\d+)\}/g, (whole, index) => {
          const sub = subs[Number(index)];
          return sub === undefined ? whole : String(sub);
        })
      : line;
  }

  // The two extension pages are HTML, so their words are attributes on the
  // markup rather than calls in a script: data-i18n for the text, and one
  // attribute each for the two places a string is read out but not shown.
  //
  // For the two extension pages, and only those. This file also loads into the
  // content-script world on every Vinted page, and Vinted is a translated site
  // that may well carry data-i18n attributes of its own — a paint(document)
  // there would walk Vinted's markup and overwrite whatever it found with
  // Bumpline's catalogue, or with the attribute's own name where no key
  // matched. content.js never calls this, and must not start: it writes its
  // words through T() into nodes it built itself. A content script that one day
  // does need it passes the root it owns, never the document.
  function paint(root = document) {
    for (const node of root.querySelectorAll('[data-i18n]')) {
      node.textContent = t(node.dataset.i18n);
    }
    // innerHTML is safe here because of what this loop does, not because of
    // where the strings came from: it calls t() with no substitutions, so the
    // only thing that can reach the DOM is a catalogue line exactly as it is
    // written in this file, with every {0} left standing as literal text. No
    // runtime value — a page's, a seller's, or Vinted's — has a path into it.
    // That is the property to keep: a paint() that ever passed subs through
    // here would break it, and the provenance argument alone would not have
    // caught that. It exists for the handful of sentences that carry their own
    // emphasis (a <b>, an <i>) that textContent would otherwise strip;
    // data-i18n stays the default for everything else.
    for (const node of root.querySelectorAll('[data-i18n-html]')) {
      node.innerHTML = t(node.dataset.i18nHtml);
    }
    for (const node of root.querySelectorAll('[data-i18n-title]')) {
      node.title = t(node.dataset.i18nTitle);
    }
    for (const node of root.querySelectorAll('[data-i18n-label]')) {
      node.setAttribute('aria-label', t(node.dataset.i18nLabel));
    }
    // Screen readers and spell-checkers both go by this, and it is wrong the
    // moment the seller overrules the browser.
    if (root === document) document.documentElement.lang = active;
  }

  return { CATALOG, t, use, locale, paint };
})();
