import type en from "../en/legal.js";

/** Translations (de): legal. Every key of ../en/legal.ts, the same placeholders and markup. */
export default {
  "legal.updated": "Zuletzt aktualisiert: {date}",
  "legal.onThisPage": "Auf dieser Seite",
  "legal.englishPrevails": "Diese Seite gibt es auch in anderen Sprachen. Weicht eine Übersetzung von der englischen Fassung ab, gilt die englische Fassung.",
  "legal.seeTerms": "Siehe auch die <a href=\"/terms\">Nutzungsbedingungen</a>.",
  "legal.seePrivacy": "Siehe auch die <a href=\"/privacy\">Datenschutzerklärung</a>.",
  "legal.duration.minutes.one": "{n} Minute",
  "legal.duration.minutes.other": "{n} Minuten",
  "legal.duration.hours.one": "{n} Stunde",
  "legal.duration.hours.other": "{n} Stunden",
  "legal.duration.days.one": "{n} Tag",
  "legal.duration.days.other": "{n} Tage",

  "legal.privacy.title": "Datenschutzerklärung",
  "legal.privacy.intro": "Diese Datenschutzerklärung erklärt, was {app} über dich speichert, warum, wie lange und wer deine Daten außerdem erhält. Kurz gesagt: Wir speichern nur, was der Dienst braucht, dein Suunto-Passwort erreicht diesen Server nie, deine Suunto-Tokens werden verschlüsselt gespeichert, und deine Trainings und Gesundheitsdaten werden nicht gespeichert.",

  "legal.privacy.controller.title": "Wer verantwortlich ist",
  "legal.privacy.controller.text": "{app} unter {site} wird von {operator}, Lugano, Schweiz, betrieben. {operator} ist für deine personenbezogenen Daten verantwortlich: als Verantwortlicher im Sinne des Schweizer Bundesgesetzes über den Datenschutz (DSG) und, soweit sie anwendbar ist, der Datenschutz-Grundverordnung der EU (DSGVO).",
  "legal.privacy.controller.contact": "Wenn du Fragen zu deinen Daten hast oder deine Rechte ausüben möchtest, schreib an {email}.",

  "legal.privacy.data.title": "Was wir speichern und warum",
  "legal.privacy.data.lead": "Wir speichern nur, was der Dienst zum Funktionieren braucht:",
  "legal.privacy.data.account": "<strong>Dein Account.</strong> Deine E-Mail-Adresse und das Passwort, das du für {app} gewählt hast. Das Passwort wird nur als scrypt-Hash gespeichert, wir können es also nicht sehen. Außerdem speichern wir, wann du den Account erstellt und dich zuletzt angemeldet hast und ob er deaktiviert oder ein Administrator-Account ist. Das brauchen wir, um dir einen Account zu geben und ihn zu schützen.",
  "legal.privacy.data.request": "<strong>Deine Zugangsanfrage.</strong> Wenn du Zugang anfragst, speichern wir die Nachricht, die du an den Administrator schreibst, damit er entscheiden kann. Sie wird gelöscht, wenn deine Anfrage genehmigt wird. Wenn für diesen Dienst ein Mailserver eingerichtet ist und der Administrator die E-Mail-Benachrichtigungen nicht ausgeschaltet hat, werden ihm deine E-Mail-Adresse und diese Nachricht zusätzlich per E-Mail gesendet (siehe „Wer deine Daten erhält“).",
  "legal.privacy.data.invite": "<strong>Einladungscodes.</strong> Wenn du dich mit einem Einladungscode registrierst, speichert die Einladung deine E-Mail-Adresse und den Zeitpunkt, zu dem du den Code verwendet hast.",
  "legal.privacy.data.suunto": "<strong>Deine Suunto-Verbindung.</strong> Dein Suunto-Benutzername, das Zugriffstoken und das Refresh-Token, die Suunto ausgibt, wenn du deinen Account hier verbindest, wann das Zugriffstoken abläuft, ob die Verbindung erneuert werden muss, und deine Einstellungen: Einheiten, Schreibschutz und Zeitzone, zusammen mit dem Zeitpunkt der Verbindung und dem Ergebnis der Testanfrage, die dabei gemacht wurde (wie viele Trainings du in den letzten 30 Tagen hattest, oder warum die Anfrage fehlgeschlagen ist). Diese Angaben werden mit AES-256-GCM verschlüsselt gespeichert. Du meldest dich auf der Seite von Suunto selbst an, deshalb erreicht dein Suunto-Passwort diesen Server nie. Während du die Verbindung herstellst, speichern wir einen Hash eines Einmalcodes, der nach 10 Minuten abläuft. So prüfen wir, dass die Antwort von Suunto zu dir gehört. Wir brauchen diese Angaben, um für dich auf deine Suunto-Daten zuzugreifen.",
  "legal.privacy.data.apps": "<strong>Verbundene KI-Apps.</strong> Wenn du eine KI-App verbindest, speichern wir die Registrierung der App (den Namen und die Webadressen, die sie selbst angibt) und die Tokens, mit denen sie für deinen Account handeln kann. Tokens werden nur als Hashes gespeichert. Außerdem speichern wir, wann jede Verbindung hergestellt und zuletzt genutzt wurde, damit du sie sehen und widerrufen kannst.",
  "legal.privacy.data.activity": "<strong>Aktivitätsprotokoll.</strong> Für jede Aktion einer KI-App (einen Tool-Aufruf, zum Beispiel <code>suunto_list_workouts</code>) speichern wir den Zeitpunkt, die App, das Tool, wie lange es gedauert hat und ob es funktioniert hat. Wir speichern nicht, was gelesen oder geschrieben wurde: keine Trainings, keine Herzfrequenz, keinen Schlaf, keine Standorte, keine Routen und keine interessanten Orte. Die neuesten Einträge siehst du auf der Seite „Verbundene Apps“, und wir nutzen das Protokoll, um Fehler und Missbrauch zu erkennen.",
  "legal.privacy.data.sessions": "<strong>Browser-Sitzungen.</strong> Wenn du dich anmeldest, erhält dein Browser einen zufälligen Sitzungscode in einem Cookie. Wir speichern davon nur einen Hash, zusammen mit dem Zeitpunkt, zu dem er erstellt wurde, und wann er abläuft.",
  "legal.privacy.data.ip": "<strong>IP-Adresse.</strong> Wie jede Website sieht der Server die IP-Adresse jeder Anfrage. {app} behält sie nur im Arbeitsspeicher, höchstens einen Tag lang, um wiederholte Versuche zu begrenzen, zum Beispiel zu viele Anmeldeversuche. Sie wird weder in der Datenbank noch im Protokoll gespeichert.",
  "legal.privacy.data.log": "<strong>Serverprotokoll.</strong> Der Server schreibt ein kurzes technisches Protokoll über Vorgänge wie eine fehlgeschlagene Anmeldung, einen neuen Account oder einen Fehler. Es enthält keine Passwörter, keine Tokens, keine IP-Adressen und keine Inhalte deiner Suunto-Daten. Wenn aber eine Aktion fehlschlägt, kann die Fehlermeldung eine kurze Angabe enthalten, zum Beispiel einen Wert, den Suunto abgelehnt hat.",

  "legal.privacy.content.title": "Deine Trainings und Gesundheitsdaten werden nicht gespeichert",
  "legal.privacy.content.text": "Wenn eine KI-App nach deinen Trainings, deiner Tagesaktivität, deiner Herzfrequenz, deinem Schlaf, deiner Erholung, deinen Routen oder deinen interessanten Orten fragt, holt {app} sie von Suunto und gibt sie an die App weiter. Sie werden weder in der Datenbank noch auf der Festplatte gespeichert. Das gilt auch für FIT-Dateien und die Standorte in deinen Trainings und Routen. Um Anfragen an Suunto zu sparen, bleiben kürzlich erhaltene Antworten 2 bis 30 Minuten im Arbeitsspeicher des Servers (höchstens 20 MB pro Benutzer) und sind nach einem Neustart des Servers weg. Das Serverprotokoll enthält nur die oben beschriebenen kurzen Fehlerangaben. Deine Account-Seite zeigt das Ergebnis der Testanfrage beim Verbinden und fragt Suunto nie an, nur um die Seite anzuzeigen.",
  "legal.privacy.content.sent": "Routen und interessante Orte, die deine KI-App hinzufügt, werden in deinem Suunto-Account gespeichert, so als hättest du sie in der Suunto App hinzugefügt, und können mit deiner Uhr synchronisiert werden. {app} ändert oder löscht sie später nicht: Du kannst sie in der Suunto App löschen.",

  "legal.privacy.bases.title": "Rechtsgrundlagen",
  "legal.privacy.bases.lead": "Wir verarbeiten deine Daten gemäß dem Schweizer DSG. Soweit die DSGVO gilt, stützen wir uns auf diese Rechtsgrundlagen:",
  "legal.privacy.bases.contract": "<strong>Vertrag</strong> (Art. 6 Abs. 1 lit. b DSGVO): um den Dienst zu erbringen, für den du dich registriert hast, also deinen Account, deine Suunto-Verbindung, deine verbundenen Apps und dein Aktivitätsprotokoll.",
  "legal.privacy.bases.health": "<strong>Deine ausdrückliche Einwilligung</strong> (Art. 9 Abs. 2 lit. a DSGVO) für Gesundheitsdaten wie Herzfrequenz, Schlaf und Erholung: Du gibst sie, wenn du deinen Suunto-Account verbindest und deine KI-App nach diesen Daten fragst. Du kannst sie jederzeit widerrufen, indem du die Suunto-Verbindung entfernst.",
  "legal.privacy.bases.interest": "<strong>Berechtigtes Interesse</strong> (Art. 6 Abs. 1 lit. f DSGVO): um den Dienst sicher und am Laufen zu halten, mit Grenzen für wiederholte Versuche, dem Serverprotokoll, Backups und Schutz vor Missbrauch.",
  "legal.privacy.bases.law": "<strong>Rechtliche Verpflichtung</strong> (Art. 6 Abs. 1 lit. c DSGVO): wenn uns das Gesetz verpflichtet, Daten aufzubewahren oder herauszugeben.",

  "legal.privacy.retention.title": "Wie lange wir Daten aufbewahren",
  "legal.privacy.retention.account": "<strong>Account:</strong> bis du ihn löschst oder der Administrator ihn löscht.",
  "legal.privacy.retention.suunto": "<strong>Suunto-Verbindung:</strong> bis du sie auf der Seite „Suunto-Account“ entfernst oder deinen Account löschst. Die Tokens werden dann von diesem Server gelöscht, und {app} bittet Suunto, die Verbindung zu beenden. Ein Einmalcode, der beim Verbinden verwendet wird, wird gelöscht, sobald er verwendet wurde, und abgelaufene Codes werden regelmäßig gelöscht.",
  "legal.privacy.retention.request": "<strong>Zugangsanfragen:</strong> werden sofort gelöscht, wenn sie abgelehnt werden, und nach 30 Tagen, wenn niemand antwortet. Die Nachricht an den Administrator wird gelöscht, wenn die Anfrage genehmigt wird. Eine E-Mail-Benachrichtigung zu einer Anfrage bleibt im Postfach des Administrators, bis er sie löscht.",
  "legal.privacy.retention.sessions": "<strong>Browser-Sitzungen:</strong> bis du dich abmeldest, höchstens {lifetime}.",
  "legal.privacy.retention.tokens": "<strong>App-Verbindungen:</strong> Ein Zugriffstoken ist {access} lang gültig. Eine Verbindung endet, wenn du sie widerrufst oder wenn sie {refresh} lang nicht genutzt wurde. Jedes Token wird einen Tag nach seinem Ablauf gelöscht.",
  "legal.privacy.retention.clients": "<strong>App-Registrierungen</strong> (nicht mit deinem Account verknüpft): werden nach einem Tag gelöscht, wenn niemand die App genehmigt hat, sonst sobald keine Verbindung sie mehr nutzt, frühestens 90 Tage nach der ersten Genehmigung.",
  "legal.privacy.retention.activity": "<strong>Aktivitätsprotokoll:</strong> 90 Tage.",
  "legal.privacy.retention.invites": "<strong>Einladungen:</strong> bis der Administrator die Einladung löscht. Wenn du deinen Account löschst, bleibt deine E-Mail-Adresse in einer Einladung, die du verwendet hast, gespeichert. Schreib uns, dann löschen wir sie.",
  "legal.privacy.retention.log": "<strong>Serverprotokoll:</strong> wird in Dateien begrenzter Größe gespeichert (insgesamt 50 MB). Die ältesten Einträge werden überschrieben.",
  "legal.privacy.retention.backups": "<strong>Backups:</strong> Eine Kopie der Datenbank entsteht vor jedem Update oder Rollback der Software oder wenn sie manuell erstellt wird. Nur die 10 neuesten Kopien werden aufbewahrt. Sie liegen auf demselben Server. Daten, die du löschst, können in diesen Kopien bleiben, bis sie ersetzt werden. Deine Suunto-Verbindung bleibt darin verschlüsselt.",

  "legal.privacy.recipients.title": "Wer deine Daten erhält",
  "legal.privacy.recipients.lead": "Wir verkaufen deine Daten nicht, geben sie nicht an Werbetreibende weiter und verwenden sie nicht zum Trainieren von KI-Modellen. Deine Daten gehen nur an:",
  "legal.privacy.recipients.suunto": "<strong>Suunto.</strong> Um auf deine Daten zuzugreifen, sendet {app} Suunto die Anfragen, die du oder deine KI-Apps stellen, zusammen mit deinem Zugriffstoken und dem Schlüssel dieses Dienstes: Trainings, FIT-Dateien, Tagesaktivität, Herzfrequenz, Schlaf, Erholung, Routen und interessante Orte lesen sowie Routen und interessante Orte hinzufügen. Die Suunto Oy ist für die Daten in deinem Suunto-Account eigenständig verantwortlich und verarbeitet sie gemäß ihrer eigenen Datenschutzrichtlinie.",
  "legal.privacy.recipients.apps": "<strong>Die KI-Apps, die du verbindest.</strong> Jede App, die du genehmigst, zum Beispiel Claude von Anthropic oder ChatGPT von OpenAI, erhält die Daten zu Trainings, Gesundheit, Routen und interessanten Orten, die sie anfragt, und die Ergebnisse ihrer Aktionen. Was die App mit diesen Daten macht, richtet sich nach ihren eigenen Bedingungen und ihrer Datenschutzerklärung sowie nach deinen Einstellungen in dieser App. Darauf haben wir keinen Einfluss.",
  "legal.privacy.recipients.hosting": "<strong>Unser Hosting-Anbieter.</strong> {app} läuft auf einem Server, der bei einem Cloud-Hosting-Anbieter gemietet ist. Der Anbieter speichert die Daten für uns und darf sie nicht für eigene Zwecke verwenden.",
  "legal.privacy.recipients.admin": "<strong>Der Administrator.</strong> Der Administrator von {app} sieht eine Liste der Accounts mit E-Mail-Adresse, Status, ob Suunto verbunden ist, letzter Anmeldung, Anzahl der Tool-Aufrufe in den letzten 7 Tagen und den Nachrichten in Zugangsanfragen. Die Admin-Seiten zeigen nie deine Suunto-Tokens oder deine Suunto-Daten. Wenn für diesen Dienst ein Mailserver eingerichtet ist und der Administrator die E-Mail-Benachrichtigungen zu Zugangsanfragen nicht ausgeschaltet hat (sie sind standardmäßig eingeschaltet), erhält er die E-Mail-Adresse und die Nachricht jeder neuen Anfrage außerdem per E-Mail. Diese E-Mails werden über den Mailserver dieses Dienstes gesendet.",
  "legal.privacy.recipients.authorities": "<strong>Behörden</strong>, nur wenn das Gesetz es verlangt.",
  "legal.privacy.recipients.noTracking": "Wir verwenden keine Analyse-, Werbe- oder Tracking-Dienste, und diese Seiten laden nichts von anderen Websites.",

  "legal.privacy.transfers.title": "Daten in anderen Ländern",
  "legal.privacy.transfers.text": "Die Daten, die {app} speichert, liegen auf dem Server des Dienstes und in seinen Backups beim Hosting-Anbieter. Suunto und die KI-Apps, die du verbindest, können deine Daten in anderen Ländern verarbeiten, auch in den USA. Das geschieht, weil du dich entscheidest, ihre Dienste zu nutzen. Wenn du Zugang anfragst, können deine E-Mail-Adresse und deine Nachricht per E-Mail an den Administrator gesendet werden, sodass auch der Anbieter des Mailservers sie verarbeiten kann. Ihre Datenschutzrichtlinien erklären, wo sie Daten verarbeiten und wie sie sie schützen.",

  "legal.privacy.security.title": "Wie wir deine Daten schützen",
  "legal.privacy.security.encryption": "Deine Suunto-Verbindung wird samt ihren Tokens mit AES-256-GCM verschlüsselt. Passwörter für {app} werden mit scrypt gehasht, und Sitzungscodes, Tokens und Einladungscodes werden nur als Hashes gespeichert.",
  "legal.privacy.security.transport": "Verbindungen zu {app} nutzen HTTPS, und Verbindungen zu Suunto nutzen ebenfalls HTTPS.",
  "legal.privacy.security.web": "Formulare sind gegen gefälschte Anfragen geschützt, die Seiten laufen unter einer strengen Content Security Policy, und wiederholte Versuche werden begrenzt.",
  "legal.privacy.security.server": "Der Dienst läuft in einem abgeschotteten Container ohne zusätzliche Rechte, und sein Dateisystem ist bis auf seinen Datenordner schreibgeschützt.",
  "legal.privacy.security.token": "Weil {app} für dich mit Suunto kommuniziert, hat der Server den Verschlüsselungsschlüssel und kann deine Suunto-Tokens entschlüsseln. Deshalb fragt er nie nach deinem Suunto-Passwort, sondern nur nach den Tokens. Du kannst sie jederzeit auf der Seite <a href=\"/account\">Suunto-Account</a> entfernen.",
  "legal.privacy.security.report": "Kein System ist vollkommen sicher. Wenn du ein Sicherheitsproblem findest, melde es bitte an {email}. Wir antworten so schnell wie möglich und beheben bestätigte Probleme.",

  "legal.privacy.rights.title": "Deine Rechte",
  "legal.privacy.rights.lead": "Du hast das Recht zu erfahren, welche Daten wir über dich haben, eine Kopie davon zu erhalten, sie berichtigen oder löschen zu lassen, ihre Verwendung einzuschränken oder ihr zu widersprechen und sie zu einem anderen Anbieter mitzunehmen. Vieles davon kannst du selbst erledigen:",
  "legal.privacy.rights.suunto": "Ändere oder entferne deine Suunto-Verbindung auf der Seite <a href=\"/account\">Suunto-Account</a>. Für die Daten in deinem Suunto-Account selbst verwende die Suunto App oder wende dich an Suunto.",
  "legal.privacy.rights.apps": "Sieh dir deine verbundenen Apps und das Aktivitätsprotokoll an und widerrufe den Zugriff einer App auf der Seite <a href=\"/account/connections\">Verbundene Apps</a>.",
  "legal.privacy.rights.delete": "Lösche deinen Account auf der Seite <a href=\"/account/security\">Sicherheit</a>. Damit werden dein Account, deine Suunto-Verbindung, deine Sitzungen, deine App-Verbindungen und dein Aktivitätsprotokoll sofort gelöscht. Kopien in den Backups verschwinden, wenn die Backups ersetzt werden. Deine Daten bei Suunto bleiben unberührt.",
  "legal.privacy.rights.email": "Für alles andere schreib an {email}. Wir antworten innerhalb von 30 Tagen.",
  "legal.privacy.rights.complaint": "Du kannst dich auch bei einer Datenschutzbehörde beschweren: in der Schweiz beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB), in der EU bei der Behörde des Landes, in dem du wohnst oder arbeitest.",

  "legal.privacy.cookies.title": "Cookies",
  "legal.privacy.cookies.lead": "{app} verwendet nur die Cookies, die für den Betrieb nötig sind. Es gibt keine Tracking- oder Werbe-Cookies. Die Cookies werden nur an diese Website gesendet, können von Skripten auf der Seite nicht gelesen werden und werden mit niemandem geteilt.",
  "legal.privacy.cookies.session": "{name} hält dich angemeldet. Es wird gelöscht, wenn du dich abmeldest, und gilt höchstens {lifetime}.",
  "legal.privacy.cookies.pre": "{name} schützt die Formulare für Anmeldung und Registrierung vor gefälschten Anfragen. Es gilt {lifetime} lang.",
  "legal.privacy.cookies.lang": "{name} merkt sich die Sprache, die du im Sprachmenü gewählt hast. Es gilt {lifetime} lang.",

  "legal.privacy.children.title": "Kinder",
  "legal.privacy.children.text": "{app} ist nicht für Kinder gedacht. Du musst mindestens 16 Jahre alt sein, um den Dienst zu nutzen. Wenn du glaubst, dass ein Kind einen Account erstellt hat, schreib uns, dann löschen wir ihn.",

  "legal.privacy.changes.title": "Änderungen dieser Datenschutzerklärung",
  "legal.privacy.changes.text": "Wir aktualisieren diese Datenschutzerklärung, wenn sich der Dienst oder das Gesetz ändert. Das Datum oben zeigt die letzte Änderung. Wenn eine Änderung betrifft, wie deine Daten verwendet werden, weisen wir auf dieser Website darauf hin.",

  "legal.terms.title": "Nutzungsbedingungen",
  "legal.terms.intro": "Diese Bedingungen gelten für {app} unter {site}. Bitte lies sie, bevor du einen Account erstellst. Indem du den Dienst nutzt, stimmst du ihnen zu.",

  "legal.terms.service.title": "Der Dienst",
  "legal.terms.service.text": "{app} verbindet KI-Apps über die offizielle Suunto Cloud API mit deinem Suunto-Account. Es ist ein kostenloses, unabhängiges Open-Source-Projekt, das von {operator}, Lugano, Schweiz, betrieben wird. Es gibt kein kostenpflichtiges Abo und keine Werbung.",

  "legal.terms.affiliation.title": "Keine Verbindung zu Suunto oder KI-Anbietern",
  "legal.terms.affiliation.text": "{app} ist ein unabhängiges Open-Source-Projekt. Es nutzt die offizielle Suunto Cloud API, stammt aber nicht von Suunto, Anthropic, OpenAI, Google oder einem anderen KI-Anbieter, ist mit keinem von ihnen verbunden und wird von keinem von ihnen unterstützt. Suunto ist eine eingetragene Marke der Suunto Oy. {app} verwendet keine Grafiken oder Logos von Suunto. Andere Produktnamen gehören ihren jeweiligen Inhabern.",

  "legal.terms.account.title": "Dein Account",
  "legal.terms.account.age": "Du musst mindestens 16 Jahre alt sein.",
  "legal.terms.account.secret": "Verwende eine E-Mail-Adresse, die dir gehört, und halte dein Passwort für {app} geheim. Teile deinen Account nicht mit anderen. Du bist für alles verantwortlich, was damit geschieht.",
  "legal.terms.account.approval": "Neue Accounts brauchen eventuell die Genehmigung des Administrators oder einen Einladungscode. Niemand hat Anspruch auf einen Account.",

  "legal.terms.suunto.title": "Dein Suunto-Account",
  "legal.terms.suunto.text": "Du verbindest deinen eigenen Suunto-Account auf der Anmeldeseite von Suunto. Verbinde nur einen Suunto-Account, der dir gehört. Die Bedingungen von <a href=\"{url}\">Suunto</a> gelten für dich weiterhin. {app} hängt von der Suunto Cloud API ab: Wenn Suunto sie ändert oder einschränkt oder den Zugang dieses Dienstes beendet, kann {app} aufhören zu funktionieren oder anders funktionieren.",

  "legal.terms.health.title": "Keine medizinische Beratung",
  "legal.terms.health.text": "Herzfrequenz, Schlaf, Erholung, Training und andere Werte stammen von deiner Uhr und der Suunto App. {app} und deine KI-Apps geben sie nur weiter und erklären sie, und KI-Apps können sich dabei irren. Sie sind keine medizinische Beratung und ersetzen keinen Arzt. Triff Entscheidungen über deine Gesundheit nicht allein auf ihrer Grundlage.",

  "legal.terms.safety.title": "Nicht für Navigation oder Sicherheitsentscheidungen",
  "legal.terms.safety.text": "Routen, interessante Orte und Standorte können falsch, veraltet oder unsicher sein, besonders wenn eine KI-App sie erstellt hat. Verlass dich bei Navigation oder Sicherheitsentscheidungen nicht auf {app} oder deine KI-Apps. Prüfe jede Route auf einer Karte, bevor du ihr folgst, und richte dich nach den Bedingungen vor Ort.",

  "legal.terms.ai.title": "Was deine KI-Apps tun",
  "legal.terms.ai.access": "Die KI-Apps, die du verbindest, handeln in deinem Auftrag. Sie können deine Trainings, deine Tagesaktivität, deine Herzfrequenz, deinen Schlaf, deine Erholung, deine Routen und deine interessanten Orte lesen und, sofern du den Schreibschutz nicht einschaltest, Routen und interessante Orte zu deiner Suunto App hinzufügen. KI-Apps machen Fehler, zum Beispiel bei einer Distanz, einem Datum, einer Einheit oder einem Ort.",
  "legal.terms.ai.responsible": "Du entscheidest, welche Apps du verbindest und worum du sie bittest, und du bist für das Ergebnis verantwortlich. Für Routen und interessante Orte, die deine KI-Apps zur Suunto App hinzufügen, bist du verantwortlich: Prüfe sie in der Suunto App, bevor du sie mit deiner Uhr synchronisierst oder verwendest, und lösche die, die du nicht willst. Wenn deine Apps nur lesen sollen, schalte auf der Seite <a href=\"/account\">Suunto-Account</a> die Option „Schreibgeschützt“ ein. Du kannst den Zugriff einer App jederzeit auf der Seite <a href=\"/account/connections\">Verbundene Apps</a> widerrufen.",

  "legal.terms.use.title": "Zulässige Nutzung",
  "legal.terms.use.lead": "Wenn du {app} nutzt, darfst du nicht:",
  "legal.terms.use.content": "Routen oder interessante Orte hinzufügen, die gegen das Gesetz verstoßen oder die Rechte anderer verletzen",
  "legal.terms.use.law": "gegen das Gesetz oder die Bedingungen von Suunto verstoßen oder die Rechte anderer verletzen",
  "legal.terms.use.others": "auf Accounts oder Daten zugreifen, die du nicht verwenden darfst",
  "legal.terms.use.harm": "den Dienst oder die Suunto Cloud API überlasten oder angreifen oder ihre Grenzen oder Sicherheitsmaßnahmen umgehen",
  "legal.terms.use.report": "Wenn du ein Sicherheitsproblem findest, melde es bitte an {email}, statt es auszunutzen.",

  "legal.terms.availability.title": "Kostenlos und ohne Garantie",
  "legal.terms.availability.text": "Der Dienst ist kostenlos und wird so bereitgestellt, wie er ist. Wir tun unser Bestes, damit er läuft und sicher ist, können aber nicht versprechen, dass er immer verfügbar, fehlerfrei oder für deinen Zweck geeignet ist. Wir können den Dienst oder Teile davon jederzeit ändern, einschränken oder einstellen. Wenn wir ihn einstellen, versuchen wir, das vorher auf dieser Website anzukündigen.",

  "legal.terms.admin.title": "Was der Administrator tun kann",
  "legal.terms.admin.text": "Der Administrator kann Zugangsanfragen genehmigen oder ablehnen, Accounts deaktivieren, aktivieren und löschen, Passwörter zurücksetzen, App-Verbindungen beenden und die Servereinstellungen ändern, zum Beispiel den Schreibschutz für alle einschalten. Das tut der Administrator zum Beispiel, wenn gegen diese Bedingungen verstoßen wird, wenn ein Account in falsche Hände geraten zu sein scheint oder um den Dienst und alle, die ihn nutzen, zu schützen.",

  "legal.terms.end.title": "Beenden der Nutzung",
  "legal.terms.end.text": "Du kannst jederzeit aufhören: Lösche deinen Account auf der Seite <a href=\"/account/security\">Sicherheit</a>, und deine Daten werden gelöscht, wie in der <a href=\"/privacy\">Datenschutzerklärung</a> beschrieben. Wir können deinen Account sperren oder löschen, wenn du gegen diese Bedingungen verstößt oder wenn der Dienst eingestellt wird.",

  "legal.terms.liability.title": "Haftung",
  "legal.terms.liability.text": "Soweit gesetzlich zulässig, haftet {operator} nicht für Schäden, die durch die Nutzung von {app} entstehen oder dadurch, dass der Dienst nicht genutzt werden kann. Dazu gehören falsche oder fehlende Werte, falsche oder unsichere Routen oder interessante Orte, Entscheidungen über deine Gesundheit, dein Training oder deine Sicherheit und verlorene Daten. Die Haftung für Vorsatz oder grobe Fahrlässigkeit und jede andere Haftung, die nach dem Gesetz nicht ausgeschlossen werden darf, bleibt unberührt.",

  "legal.terms.privacy.title": "Datenschutz",
  "legal.terms.privacy.text": "Die <a href=\"/privacy\">Datenschutzerklärung</a> erklärt, welche Daten {app} speichert, warum und wie lange.",

  "legal.terms.changes.title": "Änderungen dieser Bedingungen",
  "legal.terms.changes.text": "Wir können diese Bedingungen ändern, zum Beispiel wenn sich der Dienst ändert. Das Datum oben zeigt die letzte Änderung. Wenn du {app} nach einer Änderung weiter nutzt, gelten die neuen Bedingungen. Wenn du mit ihnen nicht einverstanden bist, kannst du deinen Account löschen.",

  "legal.terms.law.title": "Anwendbares Recht",
  "legal.terms.law.text": "Diese Bedingungen unterliegen Schweizer Recht. Zuständig sind die Gerichte der Schweiz, sofern zwingendes Recht nichts anderes vorsieht. Wenn du als Verbraucher handelst, behältst du den Schutz der zwingenden Gesetze des Landes, in dem du wohnst.",

  "legal.terms.contact.title": "Kontakt",
  "legal.terms.contact.text": "Fragen zu diesen Bedingungen? Schreib an {operator} unter {email}.",
} satisfies Record<keyof typeof en, string>;
