import type en from "../en/oauth.js";

/** Translations (de): oauth. Every key of ../en/oauth.ts, the same placeholders and markup. */
export default {
  "oauth.consent.title": "Zugriff erlauben",
  "oauth.consent.heading": "Zugriff auf dein PADI-Logbuch erlauben?",
  "oauth.consent.intro": "Eine App, die sich <strong>{name}</strong> nennt, möchte über diesen Server auf dein PADI-Logbuch zugreifen. Du bist als <strong>{email}</strong> angemeldet.",
  "oauth.consent.unknownApp": "Unbekannte App",
  "oauth.consent.known": "Bekannte App: Deine Antwort geht an <strong>{app}</strong> unter <code>{host}</code>.",
  "oauth.consent.device": "Deine Antwort bleibt auf diesem Gerät (<code>{host}</code>), wo Desktop- und Kommandozeilen-Apps wie Claude Code, Codex oder Cursor darauf warten. Erlaube den Zugriff nur, wenn du gerade hier eine App verbindest, und kopiere die Adresse der Seite, auf der du danach landest, nie in eine Website, einen Chat oder eine E-Mail.",
  "oauth.consent.unknown.title": "Wir kennen diese App nicht",
  "oauth.consent.unknown.claims": "Sie verwendet den Namen von {app}, aber {app} leitet dich nie zu <code>{host}</code> weiter.",
  "oauth.consent.unknown.text": "Wenn du es erlaubst, kann <code>{host}</code> auf dein PADI-Logbuch zugreifen. Erlaube es nur, wenn du selbst begonnen hast, diese App zu verbinden, und dieser Adresse vertraust. Wenn dir jemand diesen Link geschickt hat, wähle „Nicht erlauben“.",
  "oauth.consent.unknown.confirm": "Ich habe selbst begonnen, diese App zu verbinden, und ich vertraue <code>{host}</code>.",
  "oauth.consent.unknown.confirmMissing": "Um den Zugriff zu erlauben, bestätige zuerst mit dem Häkchen, dass du dieser App vertraust.",
  "oauth.consent.logbook": "Tauchlogbuch",
  "oauth.consent.logbookRead": "Deine Tauchgänge und Statistiken ansehen, ohne etwas zu ändern",
  "oauth.consent.logbookWrite": "Deine Tauchgänge und Statistiken ansehen, neue Tauchgänge eintragen, Tauchgänge ändern und löschen und einen Tauchgang zur Verifizierung an einen PADI Pro senden",
  "oauth.consent.cards": "Brevets",
  "oauth.consent.cardsRead": "Deine PADI-Brevetkarten ansehen",
  "oauth.consent.noPadi": "Du hast deinen PADI-Account noch nicht verbunden. <a href=\"{url}\">Verbinde ihn jetzt</a>, danach kommst du hierher zurück. Oder erlaube den Zugriff jetzt und verbinde ihn später.",
  "oauth.consent.demo": "Das ist ein Demo-Account: Die App sieht ein Beispiel-Logbuch, das in diesen Server eingebaut ist. Es wird nichts an PADI gesendet.",
  "oauth.consent.allow": "Erlauben",
  "oauth.consent.deny": "Nicht erlauben",
  "oauth.consent.disconnectHint": "Du kannst die Verbindung jederzeit unter „Verbundene Apps“ trennen.",

  "oauth.expired.title": "Anfrage abgelaufen",
  "oauth.expired.heading": "Diese Anfrage ist abgelaufen",
  "oauth.expired.text": "Kehre zu deiner KI-App zurück und stelle die Verbindung erneut her.",
  "oauth.formExpired.title": "Formular abgelaufen",
  "oauth.formExpired.heading": "Dieses Formular ist abgelaufen",
  "oauth.formExpired.text": "Kehre zu deiner KI-App zurück und stelle die Verbindung erneut her.",

  "oauth.returning.title": "Weiterleitung zur App",
  "oauth.returning.heading": "Weiterleitung zur App",
  "oauth.returning.text": "Falls nichts passiert, geht es hier weiter.",
  "oauth.returning.continue": "Weiter",
} satisfies Record<keyof typeof en, string>;
