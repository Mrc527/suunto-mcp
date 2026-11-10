import type en from "../en/common.js";

/** Translations (de): common. Every key of ../en/common.ts, the same placeholders and markup. */
export default {
  "common.appName": "MCP for PADI",

  "common.nav.main": "Hauptnavigation",
  "common.nav.account": "PADI-Account",
  "common.nav.accountShort": "PADI",
  "common.nav.connections": "Verbundene Apps",
  "common.nav.connectionsShort": "Apps",
  "common.nav.security": "Sicherheit",
  "common.nav.admin": "Admin",
  "common.nav.requestsWaiting": "Offene Zugangsanfragen",
  "common.nav.signedInAs": "Angemeldet als {email}",
  "common.nav.signOut": "Abmelden",
  "common.nav.signIn": "Anmelden",

  "common.footer.author": "Autor: <a href=\"https://marco.visin.ch\" target=\"_blank\" rel=\"noopener noreferrer\">Marco Visin</a>",
  "common.footer.about": "MCP for PADI verbindet deinen KI-Assistenten (Claude, ChatGPT, Gemini, Cursor, VS Code und andere) mit deinem PADI-Tauchlogbuch.",
  "common.footer.disclaimer": "MCP for PADI ist ein unabhängiges Open-Source-Projekt. Es stammt nicht von PADI (Professional Association of Diving Instructors), ist nicht mit PADI verbunden und wird von PADI nicht unterstützt. PADI ist eine eingetragene Marke der PADI Worldwide Corp.",
  "common.footer.language": "Sprache",
  "common.footer.legal": "Rechtliches und Kontakt",
  "common.footer.privacy": "Datenschutz",
  "common.footer.terms": "Nutzungsbedingungen",
  "common.footer.contact": "Kontakt",

  "common.never": "nie",

  "common.flash.saved": "Gespeichert.",
  "common.flash.removed": "Deine PADI-Verbindung wurde entfernt.",
  "common.flash.revoked": "Zugriff widerrufen.",
  "common.flash.password": "Passwort geändert.",
  "common.flash.sessions": "Von allen anderen Browsern abgemeldet.",
  "common.flash.settings": "Servereinstellungen gespeichert.",
  "common.flash.user": "Benutzer aktualisiert.",
  "common.flash.approved": "Anfrage genehmigt. Die Person wird nicht automatisch benachrichtigt: Sag ihr, dass sie sich jetzt anmelden kann.",
  "common.flash.rejected": "Anfrage abgelehnt und gelöscht.",
  "common.flash.deleted": "Gelöscht.",
  "common.flash.welcome": "Willkommen! Melde dich unten bei PADI an und verbinde dann deine KI-App.",
  "common.flash.denied": "Der Zugriff wurde verweigert.",
  "common.flash.csrf": "Das Formular ist abgelaufen. Bitte versuche es erneut.",
  "common.flash.lastadmin": "Du kannst den letzten Administrator nicht entfernen.",

  "common.error.tooManyAttempts": "Zu viele Versuche. Warte ein paar Minuten und versuche es dann erneut.",
  "common.error.forbidden": "Du hast keinen Zugriff auf diese Seite.",
  "common.error.notFoundTitle": "Seite nicht gefunden",
  "common.error.notFoundText": "Diese Adresse gibt es auf diesem Server nicht.",
  "common.error.goHome": "Zur Startseite",
  "common.error.title": "Fehler",
  "common.error.somethingWrong": "Etwas ist schiefgelaufen",
  "common.error.tryAgain": "Bitte versuche es gleich noch einmal.",

  "common.copy": "Kopieren",

  "common.js.copied": "Kopiert",
  "common.js.live": "Live",
  "common.js.paused": "Pausiert",
  "common.js.reconnecting": "Wird neu verbunden",
  "common.js.signedOut": "Abgemeldet, lade die Seite neu",
  "common.js.ok": "OK",
  "common.js.error": "Fehler",
} satisfies Record<keyof typeof en, string>;
