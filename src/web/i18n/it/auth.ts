import type en from "../en/auth.js";

/** Translations (it): auth. Every key of ../en/auth.ts, the same placeholders and markup. */
export default {
  "auth.field.email": "E-mail",
  "auth.field.password": "Password",

  "auth.signIn.title": "Accedi",
  "auth.signIn.intro": "Usa l'account che hai creato su questo server. Non è il tuo account PADI.",
  "auth.signIn.button": "Accedi",
  "auth.signIn.noAccountRequest": "Non hai ancora un account? <a href=\"{url}\">Richiedi l'accesso</a>.",
  "auth.signIn.noAccountCreate": "Non hai ancora un account? <a href=\"{url}\">Creane uno</a>.",
  "auth.signIn.wrongCredentials": "L'e-mail o la password non sono corrette. Se hai richiesto l'accesso, la richiesta potrebbe essere ancora in attesa di approvazione.",
  "auth.signIn.disabled": "Questo account è disattivato.",

  "auth.signUp.closedTitle": "Registrazione",
  "auth.signUp.closedHeading": "Le registrazioni sono chiuse",
  "auth.signUp.closedText": "Chiedi un account all'amministratore di questo server.",

  "auth.signUp.requestTitle": "Richiedi l'accesso",
  "auth.signUp.createTitle": "Crea un account",
  "auth.signUp.introFirst": "Sei il primo utente, quindi questo account avrà il ruolo di amministratore.",
  "auth.signUp.introApproval": "Un amministratore esamina ogni richiesta. Potrai accedere quando la tua richiesta sarà approvata.",
  "auth.signUp.introOpen": "Crea un account su questo server. Subito dopo accederai a PADI.",
  "auth.signUp.emailHint": "Serve per accedere a questo server.",
  "auth.signUp.emailHintDomains": "Serve per accedere a questo server. Domini consentiti: {domains}.",
  "auth.signUp.passwordHint.one": "Almeno {n} carattere. Non usare qui la tua password PADI.",
  "auth.signUp.passwordHint.other": "Almeno {n} caratteri. Non usare qui la tua password PADI.",
  "auth.signUp.repeatPassword": "Ripeti la password",
  "auth.signUp.inviteCode": "Codice di invito",
  "auth.signUp.inviteHint": "Facoltativo. Con un codice valido il tuo account funziona subito.",
  "auth.signUp.note": "Messaggio per l'amministratore",
  "auth.signUp.noteHint": "Facoltativo. Chi sei e perché ti serve l'accesso.",
  "auth.signUp.consent": "Sono consapevole che questo server conserverà un token di accesso PADI (crittografato, mai la mia password PADI) e lo userà per agire a mio nome.",
  "auth.signUp.consentTerms": "Accetto le <a href=\"/terms\" target=\"_blank\" rel=\"noopener\">condizioni d'uso</a> e ho letto l'<a href=\"/privacy\" target=\"_blank\" rel=\"noopener\">informativa sulla privacy</a>.",
  "auth.signUp.sendRequest": "Invia richiesta",
  "auth.signUp.createAccount": "Crea account",
  "auth.signUp.alreadyRegistered": "Hai già un account? <a href=\"/login\">Accedi</a>.",

  "auth.requestSent.title": "Richiesta inviata",
  "auth.requestSent.thanks": "Grazie. Un amministratore esaminerà la tua richiesta.",
  "auth.requestSent.noEmail": "Non riceverai alcuna e-mail: ricontrolla più tardi o chiedi all'amministratore.",
  "auth.requestSent.signInLater": "Quando la richiesta sarà approvata, accedi con la tua e-mail e la tua password. Se avevi già inviato una richiesta per questo indirizzo, vale solo la prima: usa la password che avevi scelto allora.",
  "auth.requestSent.expiry": "Le richieste senza risposta vengono eliminate dopo 30 giorni. A quel punto potrai inviarne una nuova.",
  "auth.requestSent.goToSignIn": "Vai all'accesso",

  "auth.password.tooShort.one": "Usa almeno {n} carattere.",
  "auth.password.tooShort.other": "Usa almeno {n} caratteri.",
  "auth.password.tooLong": "La password è troppo lunga.",

  "auth.error.formExpired": "Il modulo è scaduto. Riprova.",
  "auth.error.invalidEmail": "Inserisci un indirizzo e-mail valido.",
  "auth.error.domainNotAllowed": "Possono registrarsi solo indirizzi e-mail di {domains}.",
  "auth.error.passwordsDiffer": "Le password non corrispondono.",
  "auth.error.consent": "Seleziona la casella per confermare.",
  "auth.error.inviteInvalid": "Questo codice di invito non è valido o è già stato usato.",
  "auth.error.tooManyOpenRequests": "Al momento ci sono troppe richieste aperte. Riprova più tardi.",
  "auth.error.accountExists": "Esiste già un account con questa e-mail.",

  "auth.error.tooManyAttempts": "Troppi tentativi. Riprova tra qualche minuto.",
  "auth.error.tooManyRequestsToday": "Oggi hai già inviato diverse richieste. Attendi una risposta dall'amministratore.",
} satisfies Record<keyof typeof en, string>;
