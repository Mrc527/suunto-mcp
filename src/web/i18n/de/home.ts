import type en from "../en/home.js";

/** Translations (de): home. Every key of ../en/home.ts, the same placeholders and markup. */
export default {
  // Page
  "home.title": "Deine Suunto-Daten in deinem KI-Assistenten",
  "home.description": "Verbinde Claude, ChatGPT und andere KI-Apps mit deinem Suunto-Account. Frag nach deinen Trainings, deinem Schlaf und deiner Erholung, und sende Routen an deine Uhr.",

  // Buttons (hero and the end of the page)
  "home.signIn": "Anmelden",
  "home.requestAccess": "Zugang anfragen",
  "home.createAccount": "Account erstellen",

  // Hero
  "home.hero.title": "Dein Suunto-Training, direkt in deinem KI-Assistenten.",
  "home.hero.lead": "Frag in den KI-Apps, die du schon verwendest, nach deinen Trainings, deiner Trainingsbelastung, deinem Schlaf, deiner Erholung und deinen Schritten. Plane eine Route und sende sie an deine Uhr. Einmal verbinden, dann einfach fragen.",
  "home.hero.worksWith": "Funktioniert mit Claude, ChatGPT, Gemini, Codex, Cursor, VS Code und anderen KI-Apps",

  // Video (only shown when a video exists; there is none yet)
  "home.video.title": "Sieh es dir in Aktion an",
  "home.video.text": "Ein kurzes Video darüber, was MCP for Suunto kann und wie du es einrichtest.",
  "home.video.inEnglish": "Dieses Video ist auf Englisch.",
  "home.video.unsupported": "Dein Browser kann dieses Video nicht abspielen. <a href=\"{url}\">Lade es stattdessen herunter</a>.",

  // What you can do
  "home.features.title": "Was du tun kannst",
  "home.features.lead": "Du fragst mit deinen eigenen Worten, und deine KI-App findet die Antwort in deinen Suunto-Daten.",
  "home.workouts.name": "Trainings",
  "home.workouts.text": "Deine Trainings finden und lesen, mit Zeit, Distanz, Pace, Herzfrequenz, Aufstieg und Runden. Herzfrequenz oder Höhe entlang der Strecke ansehen und ein Training als FIT-Datei herunterladen.",
  "home.health.name": "Schlaf, Erholung und Schritte",
  "home.health.text": "Sehen, wie lange und wie gut du geschlafen hast. Dazu deine Erholung und deinen Stress im Lauf des Tages, deine Schritte und deinen Energieverbrauch pro Tag und deine Herzfrequenz rund um die Uhr.",
  "home.routes.name": "Routen und Orte",
  "home.routes.text": "Eine Route mit deiner KI-App planen und zur Suunto App hinzufügen, bereit für die Synchronisierung mit deiner Uhr. Interessante Orte speichern, zum Beispiel eine Hütte, eine Quelle oder einen Parkplatz.",
  "home.stats.title": "Trainingsbelastung auf einen Blick",
  "home.stats.text": "Zeit, Distanz, Aufstieg und Energie pro Woche, Monat, Jahr oder Sportart, deine längsten und weitesten Trainings und die Erholungszeit, die deine Uhr vorgeschlagen hat, in metrischen oder imperialen Einheiten.",
  "home.anyApp.title": "Funktioniert mit jeder KI-App",
  "home.anyApp.text": "Basiert auf dem Model Context Protocol (MCP), dem offenen Standard, über den sich KI-Apps mit Tools und Daten verbinden. Jede App, die MCP unterstützt, kann sich verbinden, und ein Account reicht für alle.",
  "home.control.title": "Du behältst die Kontrolle",
  "home.control.text": "Du siehst alle verbundenen Apps und kannst ihren Zugriff mit einem Klick widerrufen. Verfolge jede Anfrage live im Aktivitätsprotokoll oder aktiviere den schreibgeschützten Modus, damit nichts zu deiner Suunto App hinzugefügt wird.",
  "home.features.note": "Werte zu Herzfrequenz, Schlaf und Erholung stammen von deiner Uhr. Sie sind keine medizinische Beratung.",

  // Try asking
  "home.examples.title": "Frag zum Beispiel",
  "home.examples.lead": "Ein paar Ideen für den Anfang. Die passenden Tools wählt deine KI-App selbst aus.",
  "home.examples.month": "Wie viel habe ich diesen Monat trainiert, im Vergleich zum letzten Monat?",
  "home.examples.sleep": "Wie habe ich diese Woche geschlafen, und wie steht es um meine Erholung?",
  "home.examples.longest": "Was war dieses Jahr meine längste Radtour?",
  "home.examples.steps": "Wie viele Schritte habe ich letzte Woche an jedem Tag gemacht?",
  "home.examples.route": "Plane eine 12 km lange Laufrunde um den See und sende sie an meine Uhr.",
  "home.examples.poi": "Speichere die Berghütte von meiner letzten Wanderung als interessanten Ort.",

  // How it works
  "home.how.title": "So funktioniert es",
  "home.how.lead": "Die Einrichtung dauert ein paar Minuten und ist nur einmal nötig.",
  "home.how.step1.titleRequest": "Zugang anfragen",
  "home.how.step1.titleCreate": "Account erstellen",
  "home.how.step1.titleClosed": "Account erhalten",
  "home.how.step1.request": "Sende eine kurze Anfrage. Sobald der Administrator sie genehmigt hat, kannst du dich anmelden.",
  "home.how.step1.open": "Registriere dich auf diesem Server mit deiner E-Mail-Adresse und einem neuen Passwort. Das ist nicht dein Suunto-Account.",
  "home.how.step1.invite": "Registriere dich mit deiner E-Mail-Adresse und dem Einladungscode, den du vom Administrator bekommen hast.",
  "home.how.step1.closed": "Die Registrierung auf diesem Server ist geschlossen. Frag den Administrator nach einem Account.",
  "home.how.step2.title": "Suunto-Account verbinden",
  "home.how.step2.connect": "Klicke auf deiner Account-Seite auf „Suunto verbinden“. Die Anmeldeseite von Suunto öffnet sich: Melde dich dort an und erlaube den Zugriff. Diese Website sieht dein Suunto-Passwort nie.",
  "home.how.step3.title": "KI-App verbinden",
  "home.how.step3.text": "Füge diesen Server zu deiner KI-App hinzu, melde dich dann an und erlaube den Zugriff, wenn die App danach fragt. Auf deiner Account-Seite findest du Links zum Einrichten mit einem Klick und Schritt-für-Schritt-Anleitungen für die gängigen Apps.",
  "home.how.address": "Die Adresse dieses Servers für deine KI-App:",
  "home.how.copy": "Kopieren",

  // Privacy and security
  "home.privacy.title": "Datenschutz und Sicherheit",
  "home.privacy.lead": "So entwickelt, dass dein Suunto-Account in deiner Hand bleibt und du siehst, was passiert.",
  "home.privacy.noPassword.title": "Dein Suunto-Passwort bleibt bei Suunto",
  "home.privacy.noPassword.text": "Du meldest dich auf der Seite von Suunto selbst an. Dieser Server erhält nur die Zugriffstokens, die Suunto zurückgibt. Du kannst die Verbindung jederzeit auf deiner Account-Seite entfernen.",
  "home.privacy.encrypted.title": "Verschlüsselt gespeichert",
  "home.privacy.encrypted.text": "Die Suunto-Tokens werden mit AES-256-GCM verschlüsselt und nur verwendet, um in deinem Auftrag mit Suunto zu kommunizieren.",
  "home.privacy.passThrough.title": "Deine Trainingsdaten werden hier nicht gespeichert",
  "home.privacy.passThrough.text": "Deine Trainings, dein Schlaf und andere Gesundheitsdaten werden zwischen Suunto und deiner KI-App übertragen und nicht auf diesem Server gespeichert. Das Aktivitätsprotokoll hält nur fest, welche App wann welches Tool verwendet hat, wie lange das gedauert hat und ob es erfolgreich war.",
  "home.privacy.readOnly.title": "Schreibgeschützter Modus",
  "home.privacy.readOnly.text": "Ist er aktiviert, können KI-Apps deine Daten lesen, aber nie eine Route oder einen interessanten Ort zu deiner Suunto App hinzufügen.",
  "home.privacy.approve.title": "Du gibst jede App frei",
  "home.privacy.approve.text": "Jede KI-App braucht deine Freigabe, bevor sie sich verbinden kann, und du kannst ihren Zugriff jederzeit widerrufen.",
  "home.privacy.more": "Alle Einzelheiten stehen in der <a href=\"/privacy\">Datenschutzerklärung</a> und in den <a href=\"/terms\">Nutzungsbedingungen</a>.",

  // Questions and answers
  "home.faq.title": "Fragen und Antworten",
  "home.faq.official.q": "Ist das ein offizieller Dienst von Suunto?",
  "home.faq.official.a": "Nein. MCP for Suunto ist ein unabhängiges Open-Source-Projekt. Es nutzt die offizielle Suunto Cloud API, stammt aber nicht von Suunto, ist nicht mit Suunto verbunden und wird von Suunto nicht unterstützt.",
  "home.faq.sync.q": "Warum fehlt mein neuestes Training?",
  "home.faq.sync.a": "Deine KI-App sieht, was in deinem Suunto-Account ist. Synchronisiere deine Uhr zuerst mit der Suunto App: Neue Trainings, Schlaf und Tagesaktivität erscheinen nach der Synchronisierung.",
  "home.faq.watches.q": "Welche Uhren funktionieren?",
  "home.faq.watches.a": "Uhren, die sich mit der Suunto App synchronisieren. Was du fragen kannst, hängt davon ab, was deine Uhr aufzeichnet: Für Schlaf, Erholung und Herzfrequenz rund um die Uhr brauchst du zum Beispiel eine Uhr, die diese Werte misst.",
  "home.faq.suuntoPassword.q": "Sieht diese Website mein Suunto-Passwort?",
  "home.faq.suuntoPassword.a": "Nein. Du meldest dich auf der Seite von Suunto selbst an, und Suunto sendet diesem Server nur Zugriffstokens, die verschlüsselt gespeichert werden. Du kannst die Verbindung jederzeit auf deiner Account-Seite und in der Suunto App entfernen.",
  "home.faq.changes.q": "Was kann die KI-App ändern?",
  "home.faq.changes.a": "Sie kann Routen und interessante Orte zu deiner Suunto App hinzufügen, damit du sie mit deiner Uhr synchronisieren kannst. Sie kann weder deine Trainings noch andere Daten ändern oder löschen, und sie kann keine Routen oder interessanten Orte löschen: Das machst du in der Suunto App. Wenn der schreibgeschützte Modus aktiviert ist (auf deiner Account-Seite), kann sie nur lesen.",
  "home.faq.medical.q": "Ist das medizinische Beratung?",
  "home.faq.medical.a": "Nein. Herzfrequenz, Schlaf, Erholung und andere Werte stammen von deiner Uhr, und deine KI-App erklärt sie mit eigenen Worten. Sie sind keine medizinische Beratung. Frag bei Fragen zu deiner Gesundheit eine Ärztin oder einen Arzt.",
  "home.faq.data.q": "Was speichert diese Website über mich?",
  "home.faq.data.a": "Nur, was sie zum Funktionieren braucht: deine E-Mail-Adresse, einen Hash deines Passworts, deinen Suunto-Benutzernamen, deine verschlüsselten Suunto-Tokens und ein Protokoll darüber, welche Tools wann verwendet wurden. Deine Trainings und Gesundheitsdaten werden bei Suunto abgerufen, wenn deine KI-App danach fragt, und nicht gespeichert. Alle Einzelheiten stehen in der <a href=\"/privacy\">Datenschutzerklärung</a>.",
  "home.faq.apps.q": "Welche KI-Apps funktionieren?",
  "home.faq.apps.a": "Jede App, die Remote-MCP-Server mit Anmeldung (OAuth) unterstützt, zum Beispiel Claude, ChatGPT, Gemini, Codex, Cursor, VS Code, Le Chat und Perplexity. Manche Apps bieten eigene Connectors nur in bestimmten Plänen oder Ländern an oder erst, wenn eine Entwickleroption aktiviert ist. Auf deiner Account-Seite findest du Schritt-für-Schritt-Anleitungen für jede App.",
  "home.faq.operator.q": "Wer betreibt diesen Server?",
  "home.faq.operator.a": "Dieser Server wird von seinem Administrator betrieben, der entscheidet, wer einen Account bekommt. Deine Suunto-Daten laufen über den Server. Nutze also nur einen Server von jemandem, dem du vertraust. Der Code ist Open Source, also kann jeder prüfen, was er tut.",

  // End of the page
  "home.cta.title": "Bring deine Suunto-Daten in deinen KI-Assistenten",
  "home.cta.request": "Sende noch heute eine Anfrage. Sobald sie genehmigt ist, kannst du deine erste KI-App in wenigen Minuten verbinden.",
  "home.cta.open": "Erstelle deinen Account und verbinde deine erste KI-App in wenigen Minuten.",
  "home.cta.invite": "Hast du einen Einladungscode? Erstelle deinen Account und verbinde deine erste KI-App in wenigen Minuten.",
  "home.cta.closed": "Melde dich mit deinem Account an, um deine KI-App zu verbinden.",
} satisfies Record<keyof typeof en, string>;
