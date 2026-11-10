import type en from "../en/common.js";

/** Translations (it): common. Every key of ../en/common.ts, the same placeholders and markup. */
export default {
  "common.appName": "MCP for PADI",

  "common.nav.main": "Navigazione principale",
  "common.nav.account": "Account PADI",
  "common.nav.accountShort": "PADI",
  "common.nav.connections": "App collegate",
  "common.nav.connectionsShort": "App",
  "common.nav.security": "Sicurezza",
  "common.nav.admin": "Admin",
  "common.nav.requestsWaiting": "Richieste di accesso in attesa",
  "common.nav.signedInAs": "Accesso eseguito come {email}",
  "common.nav.signOut": "Esci",
  "common.nav.signIn": "Accedi",

  "common.footer.author": "Autore: <a href=\"https://marco.visin.ch\" target=\"_blank\" rel=\"noopener noreferrer\">Marco Visin</a>",
  "common.footer.about": "MCP for PADI collega il tuo assistente IA (Claude, ChatGPT, Gemini, Cursor, VS Code e altri) al tuo logbook delle immersioni PADI.",
  "common.footer.disclaimer": "MCP for PADI è un progetto open source indipendente. Non è realizzato né approvato da PADI (Professional Association of Diving Instructors) e non è affiliato a PADI. PADI è un marchio registrato di PADI Worldwide Corp.",
  "common.footer.language": "Lingua",
  "common.footer.legal": "Informazioni legali e contatti",
  "common.footer.privacy": "Privacy",
  "common.footer.terms": "Condizioni",
  "common.footer.contact": "Contatti",

  "common.never": "mai",

  "common.flash.saved": "Modifiche salvate.",
  "common.flash.removed": "Il collegamento con PADI è stato rimosso.",
  "common.flash.revoked": "Accesso revocato.",
  "common.flash.password": "Password modificata.",
  "common.flash.sessions": "Uscita eseguita da tutti gli altri browser.",
  "common.flash.settings": "Impostazioni del server salvate.",
  "common.flash.user": "Utente aggiornato.",
  "common.flash.approved": "Richiesta approvata. La persona non riceve alcuna notifica automatica: falle sapere che ora può accedere.",
  "common.flash.rejected": "Richiesta rifiutata ed eliminata.",
  "common.flash.deleted": "Eliminato.",
  "common.flash.welcome": "Ti diamo il benvenuto! Accedi a PADI qui sotto, poi collega la tua app di IA.",
  "common.flash.denied": "Accesso negato.",
  "common.flash.csrf": "Il modulo è scaduto. Riprova.",
  "common.flash.lastadmin": "Non puoi rimuovere l'ultimo amministratore.",

  "common.error.tooManyAttempts": "Troppi tentativi. Attendi qualche minuto e riprova.",
  "common.error.forbidden": "Non hai accesso a questa pagina.",
  "common.error.notFoundTitle": "Pagina non trovata",
  "common.error.notFoundText": "Questo indirizzo non esiste su questo server.",
  "common.error.goHome": "Vai alla pagina iniziale",
  "common.error.title": "Errore",
  "common.error.somethingWrong": "Si è verificato un problema",
  "common.error.tryAgain": "Riprova tra qualche istante.",

  "common.copy": "Copia",

  "common.js.copied": "Copiato",
  "common.js.live": "In tempo reale",
  "common.js.paused": "In pausa",
  "common.js.reconnecting": "Riconnessione in corso",
  "common.js.signedOut": "Uscita eseguita, ricarica la pagina",
  "common.js.ok": "ok",
  "common.js.error": "errore",
} satisfies Record<keyof typeof en, string>;
