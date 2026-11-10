import type en from "../en/legal.js";

/** Translations (it): legal. Every key of ../en/legal.ts, the same placeholders and markup. */
export default {
  // Shared by both pages
  "legal.updated": "Ultimo aggiornamento: {date}",
  "legal.onThisPage": "In questa pagina",
  "legal.englishPrevails": "Questa pagina è disponibile anche in altre lingue. Se una traduzione differisce dalla versione inglese, fa fede la versione inglese.",
  "legal.seeTerms": "Vedi anche le <a href=\"/terms\">condizioni d'uso</a>.",
  "legal.seePrivacy": "Vedi anche l'<a href=\"/privacy\">informativa sulla privacy</a>.",
  "legal.duration.minutes.one": "{n} minuto",
  "legal.duration.minutes.other": "{n} minuti",
  "legal.duration.hours.one": "{n} ora",
  "legal.duration.hours.other": "{n} ore",
  "legal.duration.days.one": "{n} giorno",
  "legal.duration.days.other": "{n} giorni",

  // Privacy policy
  "legal.privacy.title": "Informativa sulla privacy",
  "legal.privacy.intro": "Questa informativa spiega quali dati {app} memorizza su di te, perché, per quanto tempo e chi altro li riceve. In breve: conserviamo solo ciò che serve al servizio, la tua password PADI non viene mai memorizzata, il tuo token di accesso PADI è memorizzato in forma crittografata e il tuo logbook non viene memorizzato.",

  "legal.privacy.controller.title": "Chi è responsabile",
  "legal.privacy.controller.text": "{app} su {site} è gestito da {operator}, Lugano, Svizzera. {operator} è responsabile dei tuoi dati personali: è il titolare del trattamento ai sensi della legge federale svizzera sulla protezione dei dati (LPD) e, ove applicabile, del regolamento generale dell'UE sulla protezione dei dati (GDPR).",
  "legal.privacy.controller.contact": "Per qualsiasi domanda sui tuoi dati, o per esercitare i tuoi diritti, scrivi a {email}.",

  "legal.privacy.data.title": "Cosa memorizziamo e perché",
  "legal.privacy.data.lead": "Memorizziamo solo ciò che serve al funzionamento del servizio:",
  "legal.privacy.data.account": "<strong>Il tuo account.</strong> Il tuo indirizzo e-mail e la password che hai scelto per {app}. La password viene memorizzata solo come hash scrypt, quindi non possiamo vederla. Memorizziamo anche quando hai creato l'account e quando hai eseguito l'ultimo accesso, e se l'account è disattivato o è un account amministratore. Questi dati ci servono per fornirti un account e proteggerlo.",
  "legal.privacy.data.request": "<strong>La tua richiesta di accesso.</strong> Se richiedi l'accesso, il messaggio che scrivi all'amministratore, così che possa decidere. Viene eliminato quando la tua richiesta viene approvata. Se per questo servizio è configurato un server di posta e l'amministratore non ha disattivato le notifiche via e-mail, riceve anche per e-mail il tuo indirizzo e-mail e questo messaggio (vedi \"Chi riceve i tuoi dati\").",
  "legal.privacy.data.invite": "<strong>Codici di invito.</strong> Se ti registri con un codice di invito, l'invito conserva il tuo indirizzo e-mail e il momento in cui l'hai usato.",
  "legal.privacy.data.padi": "<strong>Il tuo collegamento con PADI.</strong> Il tuo indirizzo e-mail PADI, il token di accesso (un refresh token) che PADI rilascia quando accedi qui, l'ID del tuo account PADI (l'affiliate id), il tuo nome come risulta a PADI e le tue impostazioni: unità di misura, modalità sola lettura e fuso orario, insieme al momento in cui hai eseguito l'accesso. Sono memorizzati in forma crittografata con AES-256-GCM. La tua password PADI viene usata una sola volta per accedere e non viene mai memorizzata. Questi dati ci servono per raggiungere il tuo logbook PADI per tuo conto.",
  "legal.privacy.data.apps": "<strong>App di IA collegate.</strong> Quando colleghi un'app di IA, memorizziamo la registrazione dell'app (il nome e gli indirizzi web che l'app indica per sé) e i token che le permettono di agire per il tuo account. I token sono memorizzati solo come hash. Memorizziamo anche quando è stato creato ogni collegamento e quando è stato usato l'ultima volta, così puoi vederlo e revocarlo.",
  "legal.privacy.data.activity": "<strong>Registro delle attività.</strong> Per ogni azione di un'app di IA (una chiamata a uno strumento, ad esempio <code>logbook_list_dives</code>), registriamo l'ora, l'app, lo strumento, la durata e se ha funzionato. Non registriamo cosa è stato letto o scritto: niente immersioni, siti di immersione, compagni di immersione, note o brevetti. Le voci più recenti le vedi nella pagina App collegate. Noi usiamo il registro per individuare errori e abusi.",
  "legal.privacy.data.sessions": "<strong>Sessioni del browser.</strong> Quando accedi, il tuo browser riceve in un cookie un codice di sessione casuale. Ne memorizziamo solo un hash, insieme al momento in cui è stato creato e alla sua scadenza.",
  "legal.privacy.data.ip": "<strong>Indirizzo IP.</strong> Come ogni sito web, il server vede l'indirizzo IP di ogni richiesta. {app} lo conserva solo in memoria, al massimo per un giorno, per limitare i tentativi ripetuti, ad esempio troppi accessi. Non lo salva nel suo database né nel suo registro.",
  "legal.privacy.data.log": "<strong>Registro del server.</strong> Il server scrive un breve registro tecnico di eventi come un accesso non riuscito, un nuovo account o un errore. Non contiene password, token di accesso, indirizzi IP né contenuti del tuo logbook. Tuttavia, quando un'azione non riesce, il messaggio di errore può includere un breve dettaglio, come un valore rifiutato da PADI.",

  "legal.privacy.content.title": "Il tuo logbook non viene memorizzato",
  "legal.privacy.content.text": "Quando un'app di IA chiede le tue immersioni, {app} le prende da PADI e le passa all'app. Restano in memoria solo finché la richiesta è in corso e non vengono salvate nel database né su disco. Questo vale anche per le foto delle immersioni e per i brevetti. Il registro del server contiene solo i brevi dettagli sugli errori descritti sopra. L'impostazione delle unità di misura del tuo logbook PADI resta in memoria per qualche minuto, così le richieste ripetute sono più veloci.",
  "legal.privacy.content.sent": "Le immersioni che la tua app di IA aggiunge, modifica o elimina vengono modificate nel tuo logbook su PADI, come se lo facessi tu sul sito web di PADI. Quando invii un'immersione per la verifica, PADI inoltra la richiesta al PADI Pro che indichi.",

  "legal.privacy.bases.title": "Basi giuridiche",
  "legal.privacy.bases.lead": "Trattiamo i tuoi dati in conformità con la LPD svizzera. Dove si applica il GDPR, il trattamento si fonda su queste basi giuridiche:",
  "legal.privacy.bases.contract": "<strong>Contratto</strong> (art. 6 par. 1 lett. b GDPR): per fornirti il servizio per cui hai creato un account, cioè il tuo account, il tuo collegamento con PADI, le tue app collegate e il tuo registro delle attività.",
  "legal.privacy.bases.interest": "<strong>Legittimo interesse</strong> (art. 6 par. 1 lett. f GDPR): per mantenere il servizio sicuro e funzionante, con limiti ai tentativi ripetuti, il registro del server, i backup e la protezione dagli abusi.",
  "legal.privacy.bases.law": "<strong>Obbligo legale</strong> (art. 6 par. 1 lett. c GDPR): quando la legge ci obbliga a conservare o a consegnare dei dati.",

  "legal.privacy.retention.title": "Per quanto tempo conserviamo i dati",
  "legal.privacy.retention.account": "<strong>Account:</strong> finché non lo elimini tu o l'amministratore.",
  "legal.privacy.retention.padi": "<strong>Collegamento con PADI:</strong> finché non lo rimuovi nella pagina Account PADI o elimini il tuo account. A quel punto il token di accesso viene eliminato da questo server e scade da solo presso PADI.",
  "legal.privacy.retention.request": "<strong>Richieste di accesso:</strong> eliminate subito se rifiutate, e dopo 30 giorni se nessuno risponde. Il messaggio all'amministratore viene eliminato quando la richiesta viene approvata. Un'e-mail di notifica su una richiesta resta nella casella di posta dell'amministratore finché non la elimina.",
  "legal.privacy.retention.sessions": "<strong>Sessioni del browser:</strong> finché non esci, al massimo {lifetime}.",
  "legal.privacy.retention.tokens": "<strong>Collegamenti delle app:</strong> un token di accesso è valido per {access}. Un collegamento termina quando lo revochi, oppure dopo {refresh} senza utilizzo. Ogni token viene eliminato un giorno dopo la sua scadenza.",
  "legal.privacy.retention.clients": "<strong>Registrazioni delle app</strong> (non collegate al tuo account): eliminate dopo un giorno se nessuno ha approvato l'app, altrimenti quando nessun collegamento la usa più, ma non prima di 90 giorni dalla prima approvazione.",
  "legal.privacy.retention.activity": "<strong>Registro delle attività:</strong> 90 giorni.",
  "legal.privacy.retention.invites": "<strong>Inviti:</strong> finché l'amministratore non elimina l'invito. L'eliminazione del tuo account non rimuove il tuo indirizzo e-mail da un invito che hai usato: scrivici e lo elimineremo.",
  "legal.privacy.retention.log": "<strong>Registro del server:</strong> conservato in file di dimensione limitata (50 MB in totale). Le voci più vecchie vengono sovrascritte.",
  "legal.privacy.retention.backups": "<strong>Backup:</strong> viene fatta una copia del database prima di ogni aggiornamento del software o ritorno a una versione precedente, oppure manualmente, e vengono conservate solo le 10 copie più recenti. Le copie si trovano sullo stesso server. I dati che elimini possono restare in queste copie finché non vengono sostituite. Il tuo collegamento con PADI vi resta crittografato.",

  "legal.privacy.recipients.title": "Chi riceve i tuoi dati",
  "legal.privacy.recipients.lead": "Non vendiamo i tuoi dati, non li condividiamo con inserzionisti e non li usiamo per addestrare modelli di IA. I tuoi dati vanno solo a:",
  "legal.privacy.recipients.padi": "<strong>PADI.</strong> Per raggiungere il tuo logbook, {app} accede una volta ai server di PADI con l'indirizzo e-mail e la password che inserisci, e poi invia a PADI le richieste che fai tu o le tue app di IA: leggere, aggiungere, modificare ed eliminare immersioni, leggere i tuoi brevetti e le foto delle immersioni, cercare un PADI Pro e inviare un'immersione a un PADI Pro per la verifica. PADI gestisce l'accesso tramite Amazon Web Services (AWS Cognito). PADI tratta questi dati secondo la propria informativa sulla privacy.",
  "legal.privacy.recipients.apps": "<strong>Le app di IA che colleghi.</strong> Ogni app che approvi, ad esempio Claude di Anthropic o ChatGPT di OpenAI, riceve i dati del logbook e dei brevetti che chiede e i risultati delle sue azioni. Ciò che l'app fa con questi dati è regolato dalle sue condizioni, dalla sua informativa sulla privacy e dalle tue impostazioni in quell'app. Non abbiamo alcun controllo su questo.",
  "legal.privacy.recipients.hosting": "<strong>Il nostro fornitore di hosting.</strong> {app} funziona su un server noleggiato da un fornitore di cloud hosting. Il fornitore conserva i dati per nostro conto e non può usarli per scopi propri.",
  "legal.privacy.recipients.admin": "<strong>L'amministratore.</strong> L'amministratore di {app} vede un elenco degli account con l'indirizzo e-mail, lo stato, se PADI è collegato, l'ultimo accesso, il numero di chiamate a strumenti negli ultimi 7 giorni e i messaggi delle richieste di accesso. Le pagine di amministrazione non mostrano mai il tuo collegamento con PADI né il tuo token di accesso. Se per questo servizio è configurato un server di posta e l'amministratore non ha disattivato le notifiche via e-mail sulle richieste di accesso (sono attive per impostazione predefinita), riceve anche per e-mail l'indirizzo e-mail e il messaggio di ogni nuova richiesta, inviati tramite il server di posta di questo servizio.",
  "legal.privacy.recipients.authorities": "<strong>Autorità</strong>, solo quando la legge lo richiede.",
  "legal.privacy.recipients.noTracking": "Non usiamo servizi di analisi, pubblicità o tracciamento, e queste pagine non caricano nulla da altri siti web.",

  "legal.privacy.transfers.title": "Dati in altri Paesi",
  "legal.privacy.transfers.text": "I dati che {app} memorizza sono conservati sul suo server e nei suoi backup, presso il fornitore di hosting. PADI e le app di IA che colleghi possono trattare i tuoi dati in altri Paesi, tra cui gli Stati Uniti, dove funziona il servizio di accesso di PADI. Questo avviene perché scegli di usare i loro servizi. Se richiedi l'accesso, il tuo indirizzo e-mail e il tuo messaggio possono essere inviati per e-mail all'amministratore, quindi anche il fornitore del server di posta può trattarli. Le loro informative sulla privacy spiegano dove trattano i dati e come li proteggono.",

  "legal.privacy.security.title": "Come proteggiamo i tuoi dati",
  "legal.privacy.security.encryption": "Il tuo collegamento con PADI, con il relativo token di accesso, è crittografato con AES-256-GCM. Le password di {app} sono memorizzate come hash scrypt, e codici di sessione, token e codici di invito sono memorizzati solo come hash.",
  "legal.privacy.security.transport": "Le connessioni a {app} usano HTTPS, e anche le connessioni a PADI usano HTTPS.",
  "legal.privacy.security.web": "I moduli sono protetti contro le richieste falsificate, le pagine usano una rigorosa politica di sicurezza dei contenuti (Content Security Policy) e i tentativi ripetuti sono limitati.",
  "legal.privacy.security.server": "Il servizio funziona in un container isolato senza privilegi aggiuntivi, e il suo file system è di sola lettura, tranne la cartella dei dati.",
  "legal.privacy.security.token": "Poiché {app} comunica con PADI per tuo conto, il server detiene la chiave di crittografia e può decrittografare il tuo token di accesso. Per questo non memorizza mai la tua password PADI, ma solo il token, che puoi rimuovere in qualsiasi momento nella pagina <a href=\"/account\">Account PADI</a>.",
  "legal.privacy.security.report": "Nessun sistema è perfettamente sicuro. Se trovi un problema di sicurezza, segnalalo a {email}. Ti risponderemo il prima possibile e correggeremo i problemi confermati.",

  "legal.privacy.rights.title": "I tuoi diritti",
  "legal.privacy.rights.lead": "Hai il diritto di sapere quali dati conserviamo su di te, di riceverne una copia, di farli correggere o cancellare, di limitarne l'uso o di opporti a esso, e di trasferirli altrove. Molte di queste cose puoi farle direttamente tu:",
  "legal.privacy.rights.padi": "Modifica o rimuovi il tuo collegamento con PADI nella pagina <a href=\"/account\">Account PADI</a>.",
  "legal.privacy.rights.apps": "Consulta le tue app collegate e il registro delle attività, e revoca l'accesso di qualsiasi app, nella pagina <a href=\"/account/connections\">App collegate</a>.",
  "legal.privacy.rights.delete": "Elimina il tuo account nella pagina <a href=\"/account/security\">Sicurezza</a>. In questo modo vengono eliminati subito il tuo account, il tuo collegamento con PADI, le tue sessioni, i collegamenti delle tue app e il tuo registro delle attività. Le copie nei backup scompaiono man mano che i backup vengono sostituiti. Il tuo logbook su PADI resta intatto.",
  "legal.privacy.rights.email": "Per qualsiasi altra richiesta, scrivi a {email}. Rispondiamo entro 30 giorni.",
  "legal.privacy.rights.complaint": "Puoi anche presentare un reclamo a un'autorità per la protezione dei dati: in Svizzera l'Incaricato federale della protezione dei dati e della trasparenza (IFPDT), nell'UE l'autorità del Paese in cui vivi o lavori.",

  "legal.privacy.cookies.title": "Cookie",
  "legal.privacy.cookies.lead": "{app} usa solo i cookie necessari al suo funzionamento. Non ci sono cookie di tracciamento o pubblicitari. I cookie vengono inviati solo a questo sito, non possono essere letti dagli script della pagina e non vengono condivisi con nessuno.",
  "legal.privacy.cookies.session": "{name} mantiene attivo il tuo accesso. Viene eliminato quando esci e dura al massimo {lifetime}.",
  "legal.privacy.cookies.pre": "{name} protegge i moduli di accesso e di registrazione contro le richieste falsificate. Dura {lifetime}.",
  "legal.privacy.cookies.lang": "{name} ricorda la lingua che hai scelto nel menu delle lingue. Dura {lifetime}.",

  "legal.privacy.children.title": "Minori",
  "legal.privacy.children.text": "{app} non è pensato per i minori. Per usarlo devi avere almeno 16 anni. Se pensi che un minore abbia creato un account, scrivici e lo elimineremo.",

  "legal.privacy.changes.title": "Modifiche a questa informativa",
  "legal.privacy.changes.text": "Aggiorniamo questa informativa quando cambiano il servizio o la legge. La data in alto indica l'ultima modifica. Se una modifica riguarda il modo in cui vengono usati i tuoi dati, lo segnaleremo su questo sito.",

  // Terms of use
  "legal.terms.title": "Condizioni d'uso",
  "legal.terms.intro": "Queste condizioni si applicano a {app} su {site}. Leggile prima di creare un account. Usando il servizio, le accetti.",

  "legal.terms.service.title": "Il servizio",
  "legal.terms.service.text": "{app} collega le app di IA al tuo logbook delle immersioni PADI. È un progetto open source gratuito e indipendente, gestito da {operator}, Lugano, Svizzera. Non ci sono piani a pagamento né pubblicità.",

  "legal.terms.affiliation.title": "Nessun legame con PADI o con i fornitori di IA",
  "legal.terms.affiliation.text": "{app} è un progetto open source indipendente. Non è realizzato né approvato da PADI (Professional Association of Diving Instructors), Anthropic, OpenAI, Google o altri fornitori di IA, e non è affiliato a nessuno di loro. PADI è un marchio registrato di PADI Worldwide Corp. {app} non usa grafiche né loghi di PADI. Gli altri nomi di prodotti appartengono ai rispettivi proprietari.",

  "legal.terms.account.title": "Il tuo account",
  "legal.terms.account.age": "Devi avere almeno 16 anni.",
  "legal.terms.account.secret": "Usa un indirizzo e-mail che sia tuo e mantieni segreta la tua password di {app}. Non condividere il tuo account. Sei responsabile di ciò che accade con esso.",
  "legal.terms.account.approval": "I nuovi account possono richiedere l'approvazione dell'amministratore o un codice di invito. Nessuno ha diritto a un account.",

  "legal.terms.padi.title": "Il tuo account PADI",
  "legal.terms.padi.text": "Colleghi il tuo account PADI accedendo con il suo indirizzo e-mail e la sua password. Collega solo un account PADI che sia tuo. Le condizioni di <a href=\"{url}\">PADI</a> continuano a valere per te. PADI non offre un'interfaccia pubblica per questo: {app} usa la stessa interfaccia del sito web di PADI, quindi può smettere di funzionare, o funzionare in modo diverso, quando PADI la modifica.",

  "legal.terms.ai.title": "Cosa fanno le tue app di IA",
  "legal.terms.ai.access": "Le app di IA che colleghi agiscono per tuo conto. Possono leggere il tuo logbook e i tuoi brevetti e, a meno che tu non attivi la modalità sola lettura, aggiungere, modificare ed eliminare immersioni, cambiare le unità di misura del tuo logbook e inviare immersioni a un PADI Pro per la verifica. Le app di IA commettono errori, ad esempio in una profondità, in una data o in un'unità di misura.",
  "legal.terms.ai.responsible": "Sei tu a decidere quali app collegare e cosa chiedere loro, e sei responsabile del risultato. Controlla le azioni importanti prima di confermarle e controlla il tuo logbook sul sito web di PADI. Se le tue app devono solo leggere, attiva la modalità sola lettura nella pagina <a href=\"/account\">Account PADI</a>. Puoi revocare l'accesso di un'app in qualsiasi momento nella pagina <a href=\"/account/connections\">App collegate</a>.",

  "legal.terms.use.title": "Uso consentito",
  "legal.terms.use.lead": "Quando usi {app}, non devi:",
  "legal.terms.use.spam": "registrare immersioni che non hai fatto, o inviare richieste di verifica false o indesiderate ai PADI Pro",
  "legal.terms.use.law": "violare la legge, le condizioni di PADI o i diritti altrui",
  "legal.terms.use.others": "accedere ad account o dati che non hai il diritto di usare",
  "legal.terms.use.harm": "sovraccaricare o attaccare il servizio, o aggirarne i limiti o la sicurezza",
  "legal.terms.use.report": "Se trovi un problema di sicurezza, segnalalo a {email} invece di sfruttarlo.",

  "legal.terms.availability.title": "Gratuito e senza garanzie",
  "legal.terms.availability.text": "Il servizio è gratuito e fornito così com'è. Facciamo del nostro meglio per mantenerlo attivo e sicuro, ma non possiamo garantire che sia sempre disponibile, privo di errori o adatto al tuo scopo. Possiamo modificare, limitare o interrompere il servizio, o parti di esso, in qualsiasi momento. Se lo interrompiamo, cercheremo di annunciarlo in anticipo su questo sito.",

  "legal.terms.admin.title": "Cosa può fare l'amministratore",
  "legal.terms.admin.text": "L'amministratore può approvare o rifiutare le richieste di accesso, disattivare, riattivare ed eliminare account, reimpostare password, terminare i collegamenti delle app e modificare le impostazioni del server, ad esempio attivare la modalità sola lettura per tutti. L'amministratore lo fa, ad esempio, quando queste condizioni vengono violate, quando un account sembra finito nelle mani sbagliate, o per proteggere il servizio e i suoi utenti.",

  "legal.terms.end.title": "Smettere di usare il servizio",
  "legal.terms.end.text": "Puoi smettere in qualsiasi momento: elimina il tuo account nella pagina <a href=\"/account/security\">Sicurezza</a> e i tuoi dati verranno eliminati come descritto nell'<a href=\"/privacy\">informativa sulla privacy</a>. Possiamo sospendere o eliminare il tuo account se violi queste condizioni, o quando il servizio termina.",

  "legal.terms.liability.title": "Responsabilità",
  "legal.terms.liability.text": "Nei limiti consentiti dalla legge, {operator} non è responsabile di alcun danno causato dall'uso di {app} o dall'impossibilità di usarlo. Ciò include immersioni perse, modificate o eliminate, valori errati nel tuo logbook, richieste di verifica inviate dalle tue app di IA e dati persi. Questo non limita la responsabilità per dolo o colpa grave, né qualsiasi altra responsabilità che la legge non consente di escludere.",

  "legal.terms.privacy.title": "Privacy",
  "legal.terms.privacy.text": "L'<a href=\"/privacy\">informativa sulla privacy</a> spiega quali dati {app} memorizza, perché e per quanto tempo.",

  "legal.terms.changes.title": "Modifiche a queste condizioni",
  "legal.terms.changes.text": "Possiamo modificare queste condizioni, ad esempio quando cambia il servizio. La data in alto indica l'ultima modifica. Se continui a usare {app} dopo una modifica, si applicano le nuove condizioni. Se non le accetti, puoi eliminare il tuo account.",

  "legal.terms.law.title": "Diritto applicabile",
  "legal.terms.law.text": "Queste condizioni sono regolate dal diritto svizzero. Sono competenti i tribunali svizzeri, salvo diversa disposizione di legge imperativa. Se sei un consumatore, mantieni la protezione delle norme imperative del Paese in cui vivi.",

  "legal.terms.contact.title": "Contatti",
  "legal.terms.contact.text": "Domande su queste condizioni? Scrivi a {operator} all'indirizzo {email}.",
} satisfies Record<keyof typeof en, string>;
