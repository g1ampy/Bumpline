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
      'card.recovery.discard': 'Scarta',

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
      'budget.body.day': '{0} articoli sono stati ripubblicati da questo browser nelle ultime 24 ore, il che equivale a far girare un intero armadio invece di rinfrescare qualche annuncio. Questo è ciò che Vinted interpreta come attività automatizzata, e la conseguenza è che blocca l\'account dalla modifica o dalla pubblicazione di qualsiasi cosa per circa un giorno. Non è stato ancora eliminato nulla.',
      'budget.body.hour': '{0} articoli sono stati ripubblicati da questo browser nell\'ultima ora. Questo è ciò che Vinted interpreta come attività automatizzata, e la conseguenza è che blocca l\'account dalla modifica o dalla pubblicazione di qualsiasi cosa per circa un giorno. Non è stato ancora eliminato nulla.',
      'budget.proceed': 'Ripubblica comunque',
      'budget.cancel': 'Interrompi per ora',
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
