import type en from "../en/home.js";

/** Translations (it): home. Every key of ../en/home.ts, the same placeholders and markup. */
export default {
  // Page
  "home.title": "Il tuo logbook PADI nel tuo assistente IA",
  "home.description": "Collega Claude, ChatGPT e altre app di IA al tuo logbook delle immersioni PADI. Fai domande sulle tue immersioni, registrane di nuove e mantieni il controllo su ciò che le app possono fare.",

  // Buttons (hero and the end of the page)
  "home.signIn": "Accedi",
  "home.requestAccess": "Richiedi l'accesso",
  "home.createAccount": "Crea un account",

  // Hero
  "home.hero.title": "Il tuo logbook PADI, dentro il tuo assistente IA.",
  "home.hero.lead": "Fai domande sulle tue immersioni, registrane di nuove e guarda le tue statistiche nelle app di IA che usi già. Ti colleghi una volta sola, poi basta chiedere.",
  "home.hero.worksWith": "Funziona con Claude, ChatGPT, Gemini, Codex, Cursor, VS Code e altre app di IA",

  // Video (only shown when a video exists)
  "home.video.title": "Guardalo in azione",
  "home.video.text": "Un breve video su cosa può fare MCP for PADI e su come configurarlo.",
  "home.video.inEnglish": "Questo video è in inglese.",
  "home.video.unsupported": "Il tuo browser non può riprodurre questo video. In alternativa, <a href=\"{url}\">scaricalo</a>.",

  // What you can do
  "home.features.title": "Cosa puoi fare",
  "home.features.lead": "Chiedi con parole tue e la tua app di IA lavora per te nel tuo logbook PADI.",
  "home.logbook.name": "Logbook delle immersioni",
  "home.logbook.text": "Trova e leggi le tue immersioni, registra nuove immersioni con profondità, tempo, condizioni e attrezzatura, e correggi quelle che hai registrato. Esporta il tuo logbook in CSV o JSON.",
  "home.cards.name": "Brevetti",
  "home.cards.text": "Consulta i tuoi brevetti PADI (eCard) con date e numeri, e cerca un PADI Pro tramite il suo numero di membro.",
  "home.stats.title": "Statistiche in pochi secondi",
  "home.stats.text": "Numero totale di immersioni e tempo di fondo, le tue immersioni più profonde e più lunghe, e immersioni per anno, mese, sito o tipo di immersione, in unità metriche o imperiali.",
  "home.anyApp.title": "Funziona con ogni app di IA",
  "home.anyApp.text": "Si basa sul Model Context Protocol (MCP), lo standard aperto che le app di IA usano per collegarsi a strumenti e dati. Qualsiasi app compatibile può collegarsi e un solo account vale per tutte.",
  "home.control.title": "Hai sempre il controllo",
  "home.control.text": "Vedi tutte le app collegate e revocane l'accesso con un clic. Segui ogni richiesta nel registro delle attività in tempo reale, oppure attiva la modalità sola lettura. Le immersioni verificate restano bloccate.",

  // Try asking
  "home.examples.title": "Prova a chiedere",
  "home.examples.lead": "Qualche idea per iniziare. La tua app di IA sceglie da sola gli strumenti giusti.",
  "home.examples.countYear": "Quante immersioni ho registrato quest'anno?",
  "home.examples.logDive": "Registra l'immersione di ieri sull'house reef, 18 m, 45 min.",
  "home.examples.deepest": "Qual è stata la mia immersione più profonda, e dove?",
  "home.examples.yearReview": "Fai un riepilogo del mio anno di immersioni.",
  "home.examples.certifications": "Quali brevetti ho?",
  "home.examples.buddy": "Aggiungi il mio buddy Sam alla mia ultima immersione.",

  // How it works
  "home.how.title": "Come funziona",
  "home.how.lead": "La configurazione richiede pochi minuti e va fatta una sola volta.",
  "home.how.step1.titleRequest": "Richiedi l'accesso",
  "home.how.step1.titleCreate": "Crea un account",
  "home.how.step1.titleClosed": "Ottieni un account",
  "home.how.step1.request": "Invia una breve richiesta. Quando l'amministratore la approva, puoi accedere.",
  "home.how.step1.open": "Registrati su questo server con il tuo indirizzo e-mail e una nuova password. Questo account non è il tuo account PADI.",
  "home.how.step1.invite": "Registrati con il tuo indirizzo e-mail e il codice di invito che hai ricevuto dall'amministratore.",
  "home.how.step1.closed": "Le registrazioni su questo server sono chiuse. Chiedi un account all'amministratore.",
  "home.how.step2.title": "Collega il tuo account PADI",
  "home.how.step2.text": "Accedi con l'indirizzo e-mail e la password che usi su padi.com. La password viene usata una sola volta e non viene mai memorizzata. Se accedi a PADI con Google, Apple o Facebook, imposta prima una password su <a href=\"{url}\">account.padi.com</a>.",
  "home.how.step3.title": "Collega la tua app di IA",
  "home.how.step3.text": "Aggiungi questo server alla tua app di IA, poi accedi e consenti l'accesso quando l'app te lo chiede. Nella pagina del tuo account trovi link per il collegamento con un clic e istruzioni passo passo per le app più comuni.",
  "home.how.address": "L'indirizzo di questo server per la tua app di IA:",
  "home.how.copy": "Copia",

  // Privacy and security
  "home.privacy.title": "Privacy e sicurezza",
  "home.privacy.lead": "Progettato perché il tuo account PADI resti tuo e tu possa vedere cosa succede.",
  "home.privacy.noPassword.title": "La tua password PADI non viene memorizzata",
  "home.privacy.noPassword.text": "La digiti una sola volta per accedere. Questo server conserva solo il token di accesso che PADI restituisce. Puoi rimuovere il collegamento nella pagina del tuo account in qualsiasi momento.",
  "home.privacy.encrypted.title": "Memorizzato in forma crittografata",
  "home.privacy.encrypted.text": "Il token di accesso è crittografato con AES-256-GCM e viene usato solo per comunicare con PADI per tuo conto.",
  "home.privacy.passThrough.title": "Il tuo logbook non viene conservato qui",
  "home.privacy.passThrough.text": "Le tue immersioni passano tra PADI e la tua app di IA e non vengono memorizzate su questo server. Il registro delle attività conserva solo quale app ha usato quale strumento, quando, per quanto tempo e se ha funzionato.",
  "home.privacy.readOnly.title": "Modalità sola lettura",
  "home.privacy.readOnly.text": "Se la attivi, le app di IA possono leggere il tuo logbook, ma non possono mai aggiungere, modificare o eliminare un'immersione.",
  "home.privacy.approve.title": "Approvi tu ogni app",
  "home.privacy.approve.text": "Ogni app di IA deve essere approvata da te prima di potersi collegare, e puoi revocarne l'accesso in qualsiasi momento.",
  "home.privacy.more": "Tutti i dettagli sono nell'<a href=\"/privacy\">informativa sulla privacy</a> e nelle <a href=\"/terms\">condizioni d'uso</a>.",

  // Questions and answers
  "home.faq.title": "Domande e risposte",
  "home.faq.official.q": "È un servizio ufficiale di PADI?",
  "home.faq.official.a": "No. MCP for PADI è un progetto open source indipendente. Non è realizzato né approvato da PADI e non è affiliato a PADI. Accede con il tuo account PADI e usa il tuo logbook come fa il sito web di PADI, quindi può smettere di funzionare per un po' quando PADI modifica il suo sito.",
  "home.faq.password.q": "La mia password PADI viene memorizzata?",
  "home.faq.password.a": "No. La digiti una sola volta nella pagina del tuo account per accedere. Questo server conserva solo il token di accesso che PADI restituisce, in forma crittografata. Se accedi a PADI con Google, Apple o Facebook, imposta prima una password con \"Password dimenticata\" (Forgot password) su <a href=\"{url}\">account.padi.com</a>.",
  "home.faq.changes.q": "Cosa può modificare l'app di IA?",
  "home.faq.changes.a": "Può registrare nuove immersioni, modificare ed eliminare le immersioni che hai registrato, cambiare le unità di misura del tuo logbook e inviare un'immersione a un PADI Pro per la verifica. Per eliminare un'immersione serve il suo titolo come conferma, e per inviarla alla verifica serve il tuo consenso. Le immersioni verificate o in attesa di verifica sono bloccate: l'app non può modificarle né eliminarle. I tuoi brevetti vengono solo letti.",
  "home.faq.readOnly.q": "Che cos'è la modalità sola lettura?",
  "home.faq.readOnly.a": "Con la modalità sola lettura attiva, le app di IA ricevono solo gli strumenti di lettura: possono vedere le tue immersioni, le statistiche e i brevetti, ma non possono aggiungere, modificare o eliminare nulla. Puoi attivarla o disattivarla nella pagina del tuo account in qualsiasi momento.",
  "home.faq.apps.q": "Con quali app di IA funziona?",
  "home.faq.apps.a": "Qualsiasi app in grado di collegarsi a un server MCP remoto con accesso tramite OAuth, ad esempio Claude, ChatGPT, Gemini, Codex, Cursor, VS Code, Le Chat e Perplexity. Alcune app offrono i connettori personalizzati solo con determinati piani, in alcuni Paesi o attivando un'impostazione per sviluppatori. Nella pagina del tuo account trovi istruzioni passo passo per ogni app.",
  "home.faq.operator.q": "Chi gestisce questo server?",
  "home.faq.operator.a": "Questo server è gestito dal suo amministratore, che decide chi può avere un account. Il tuo logbook passa attraverso il server, quindi usane uno gestito da qualcuno di cui ti fidi, oppure installane uno tuo: il codice è open source.",

  // End of the page
  "home.cta.title": "Porta il tuo logbook nel tuo assistente IA",
  "home.cta.request": "Invia una richiesta oggi stesso. Una volta approvata, potrai collegare la tua prima app di IA in pochi minuti.",
  "home.cta.open": "Crea il tuo account e collega la tua prima app di IA in pochi minuti.",
  "home.cta.invite": "Hai un codice di invito? Crea il tuo account e collega la tua prima app di IA in pochi minuti.",
  "home.cta.closed": "Accedi con il tuo account per collegare la tua app di IA.",
} satisfies Record<keyof typeof en, string>;
