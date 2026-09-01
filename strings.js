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
// live here instead, both languages at once, and the seller can overrule the
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

      // Pre-flight guard checks inside relist(): none of these are Vinted's
      // text (contrast record.lastError), so they reach the seller through
      // the toast.relistStopped wrapper same as any other Bumpline copy.
      'relist.error.noPhoto': 'No photo could be uploaded. Nothing was deleted.',
      'relist.error.photosIncomplete': 'Only {0} of {1} photos uploaded ({2} failed). Nothing was deleted, so try again in a moment.',
      'relist.error.noTitle': 'The listing has no title. Nothing was deleted.',
      'relist.error.noCondition': 'Could not read the item condition, and relisting it with the wrong one would be worse than stopping. Nothing was deleted.',
      'relist.error.copyNotSaved': 'The copy could not be saved on this device, and without it the original cannot be deleted safely. Nothing was deleted.',
      'size.cancelled': 'Cancelled. Nothing was deleted.',

      // The age line painted under every wardrobe item.
      'age.today': 'Created today',
      'age.daysAgo': 'Created {0} days ago',

      // Why a pause is standing, written by content.js as a code rather than a
      // sentence and translated here by popup.js — the record can outlive a
      // language switch, and a sentence saved in one language would not.
      'pause.why.rateLimit': 'Vinted answered "too many requests".',
      'pause.why.botCheck': 'Vinted answered with a bot challenge.',
      'pause.why.restricted': 'Vinted has restricted this account from listing or editing items.',

      // --- the toolbar popup -------------------------------------------
      // Everything below is read by popup.html's own paint() call and by
      // popup.js: the panel that lives in the toolbar, not on a Vinted page.

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
      'popup.paused.detail': '{0} Nothing is sent until {1}, on any tab. The buttons come back on their own.',
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
      'popup.footer.howItWorks': 'How it works',
      'popup.footer.reportProblem': 'Report a problem',
      'popup.footer.rate': 'Rate Bumpline',
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
      'size.cancelled': 'Annullato. Non è stato eliminato nulla.',

      'age.today': 'Creato oggi',
      'age.daysAgo': 'Creato {0} giorni fa',

      'pause.why.rateLimit': 'Vinted ha risposto «troppe richieste».',
      'pause.why.botCheck': 'Vinted ha risposto con una verifica anti-bot.',
      'pause.why.restricted': 'Vinted ha limitato questo account, impedendogli di pubblicare o modificare articoli.',

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

      'popup.footer.howItWorks': 'Come funziona',
      'popup.footer.reportProblem': 'Segnala un problema',
      'popup.footer.rate': 'Vota Bumpline',
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

  function locale() {
    return active;
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
  function paint(root = document) {
    for (const node of root.querySelectorAll('[data-i18n]')) {
      node.textContent = t(node.dataset.i18n);
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
