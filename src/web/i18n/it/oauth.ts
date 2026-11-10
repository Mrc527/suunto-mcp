import type en from "../en/oauth.js";

/** Translations (it): oauth. Every key of ../en/oauth.ts, the same placeholders and markup. */
export default {
  "oauth.consent.title": "Consenti l'accesso",
  "oauth.consent.heading": "Consentire l'accesso al tuo logbook PADI?",
  "oauth.consent.intro": "Un'app che si presenta come <strong>{name}</strong> vuole usare il tuo logbook PADI tramite questo server. Hai eseguito l'accesso come <strong>{email}</strong>.",
  "oauth.consent.unknownApp": "Un'applicazione",
  "oauth.consent.known": "App riconosciuta: la tua risposta va a <strong>{app}</strong> su <code>{host}</code>.",
  "oauth.consent.device": "La tua risposta resta su questo dispositivo (<code>{host}</code>), dove la attendono le app desktop e a riga di comando come Claude Code, Codex o Cursor. Consenti l'accesso solo se hai appena iniziato a collegare un'app qui, e non copiare mai l'indirizzo della pagina su cui arrivi in un sito web, in una chat o in un'e-mail.",
  "oauth.consent.unknown.title": "Non riconosciamo questa app",
  "oauth.consent.unknown.claims": "Usa il nome di {app}, ma {app} non ti manda mai a <code>{host}</code>.",
  "oauth.consent.unknown.text": "Se consenti l'accesso, <code>{host}</code> potrà accedere al tuo logbook PADI. Consentilo solo se hai iniziato tu a collegare questa app e ti fidi di questo indirizzo. Se qualcuno ti ha inviato questo link, scegli Non consentire.",
  "oauth.consent.unknown.confirm": "Ho iniziato io a collegare questa app e mi fido di <code>{host}</code>.",
  "oauth.consent.unknown.confirmMissing": "Per consentire l'accesso a questa app, seleziona prima la casella per confermare che ti fidi.",
  "oauth.consent.logbook": "Logbook delle immersioni",
  "oauth.consent.logbookRead": "Vedere le tue immersioni e statistiche, senza modificare nulla",
  "oauth.consent.logbookWrite": "Vedere le tue immersioni e statistiche, registrare nuove immersioni, modificare ed eliminare immersioni e inviare un'immersione a un PADI Pro per la verifica",
  "oauth.consent.cards": "Brevetti",
  "oauth.consent.cardsRead": "Vedere i tuoi brevetti PADI",
  "oauth.consent.noPadi": "Non hai ancora collegato il tuo account PADI. <a href=\"{url}\">Collegalo ora</a> e tornerai qui, oppure consenti l'accesso ora e collegalo più tardi.",
  "oauth.consent.demo": "Questo è un account demo: l'app vede un logbook di esempio integrato in questo server. Non viene inviato nulla a PADI.",
  "oauth.consent.allow": "Consenti",
  "oauth.consent.deny": "Non consentire",
  "oauth.consent.disconnectHint": "Puoi scollegarla in qualsiasi momento da App collegate.",

  "oauth.expired.title": "Richiesta scaduta",
  "oauth.expired.heading": "Questa richiesta è scaduta",
  "oauth.expired.text": "Torna alla tua app di IA e ripeti il collegamento.",
  "oauth.formExpired.title": "Modulo scaduto",
  "oauth.formExpired.heading": "Questo modulo è scaduto",
  "oauth.formExpired.text": "Torna alla tua app di IA e ripeti il collegamento.",

  "oauth.returning.title": "Ritorno all'app",
  "oauth.returning.heading": "Ritorno all'app",
  "oauth.returning.text": "Se non succede nulla, continua da qui.",
  "oauth.returning.continue": "Continua",
} satisfies Record<keyof typeof en, string>;
