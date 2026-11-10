import type en from "../en/auth.js";

/** Translations (de): auth. Every key of ../en/auth.ts, the same placeholders and markup. */
export default {
  "auth.field.email": "E-Mail",
  "auth.field.password": "Passwort",

  "auth.signIn.title": "Anmelden",
  "auth.signIn.intro": "Verwende den Account, den du auf diesem Server erstellt hast. Das ist nicht dein PADI-Account.",
  "auth.signIn.button": "Anmelden",
  "auth.signIn.noAccountRequest": "Noch keinen Account? <a href=\"{url}\">Zugang anfragen</a>.",
  "auth.signIn.noAccountCreate": "Noch keinen Account? <a href=\"{url}\">Jetzt erstellen</a>.",
  "auth.signIn.wrongCredentials": "E-Mail oder Passwort ist falsch. Wenn du Zugang angefragt hast, wartet deine Anfrage vielleicht noch auf die Genehmigung.",
  "auth.signIn.disabled": "Dieser Account ist deaktiviert.",

  "auth.signUp.closedTitle": "Registrieren",
  "auth.signUp.closedHeading": "Die Registrierung ist geschlossen",
  "auth.signUp.closedText": "Frag den Administrator dieses Servers nach einem Account.",

  "auth.signUp.requestTitle": "Zugang anfragen",
  "auth.signUp.createTitle": "Account erstellen",
  "auth.signUp.introFirst": "Du bist der erste Benutzer, daher erhält dieser Account Administratorrechte.",
  "auth.signUp.introApproval": "Ein Administrator prüft jede Anfrage. Sobald deine Anfrage genehmigt ist, kannst du dich anmelden.",
  "auth.signUp.introOpen": "Erstelle einen Account auf diesem Server. Danach meldest du dich bei PADI an.",
  "auth.signUp.emailHint": "Für die Anmeldung bei diesem Server.",
  "auth.signUp.emailHintDomains": "Für die Anmeldung bei diesem Server. Erlaubte Domains: {domains}.",
  "auth.signUp.passwordHint.one": "Mindestens {n} Zeichen. Verwende hier nicht dein PADI-Passwort.",
  "auth.signUp.passwordHint.other": "Mindestens {n} Zeichen. Verwende hier nicht dein PADI-Passwort.",
  "auth.signUp.repeatPassword": "Passwort wiederholen",
  "auth.signUp.inviteCode": "Einladungscode",
  "auth.signUp.inviteHint": "Optional. Mit einem gültigen Code kannst du deinen Account sofort nutzen.",
  "auth.signUp.note": "Nachricht an den Administrator",
  "auth.signUp.noteHint": "Optional. Wer du bist und wofür du Zugang brauchst.",
  "auth.signUp.consent": "Mir ist bewusst, dass dieser Server ein Anmeldetoken von PADI (verschlüsselt, nie mein PADI-Passwort) speichert, um in meinem Auftrag zu handeln.",
  "auth.signUp.consentTerms": "Ich akzeptiere die <a href=\"/terms\" target=\"_blank\" rel=\"noopener\">Nutzungsbedingungen</a> und habe die <a href=\"/privacy\" target=\"_blank\" rel=\"noopener\">Datenschutzerklärung</a> gelesen.",
  "auth.signUp.sendRequest": "Anfrage senden",
  "auth.signUp.createAccount": "Account erstellen",
  "auth.signUp.alreadyRegistered": "Bereits registriert? <a href=\"/login\">Anmelden</a>.",

  "auth.requestSent.title": "Anfrage gesendet",
  "auth.requestSent.thanks": "Danke. Ein Administrator prüft deine Anfrage.",
  "auth.requestSent.noEmail": "Du bekommst keine E-Mail. Schau also später wieder vorbei oder frag den Administrator.",
  "auth.requestSent.signInLater": "Sobald sie genehmigt ist, meldest du dich mit deiner E-Mail-Adresse und deinem Passwort an. Falls du für diese Adresse schon eine Anfrage gesendet hattest, zählt nur die erste: Verwende das Passwort, das du damals gewählt hast.",
  "auth.requestSent.expiry": "Anfragen, die nicht innerhalb von 30 Tagen beantwortet werden, werden gelöscht. Danach kannst du eine neue senden.",
  "auth.requestSent.goToSignIn": "Zur Anmeldung",

  "auth.password.tooShort.one": "Verwende mindestens {n} Zeichen.",
  "auth.password.tooShort.other": "Verwende mindestens {n} Zeichen.",
  "auth.password.tooLong": "Dieses Passwort ist zu lang.",

  "auth.error.formExpired": "Das Formular ist abgelaufen. Bitte versuche es erneut.",
  "auth.error.invalidEmail": "Gib eine gültige E-Mail-Adresse ein.",
  "auth.error.domainNotAllowed": "Registrieren kannst du dich nur mit einer Adresse von {domains}.",
  "auth.error.passwordsDiffer": "Die Passwörter stimmen nicht überein.",
  "auth.error.consent": "Bitte setze zur Bestätigung das Häkchen.",
  "auth.error.inviteInvalid": "Dieser Einladungscode ist ungültig oder wurde bereits verwendet.",
  "auth.error.tooManyOpenRequests": "Zurzeit gibt es zu viele offene Anfragen. Bitte versuche es später erneut.",
  "auth.error.accountExists": "Es gibt bereits einen Account mit dieser E-Mail-Adresse.",

  "auth.error.tooManyAttempts": "Zu viele Versuche. Versuche es in ein paar Minuten erneut.",
  "auth.error.tooManyRequestsToday": "Du hast heute bereits mehrere Anfragen gesendet. Bitte warte auf eine Antwort des Administrators.",
} satisfies Record<keyof typeof en, string>;
