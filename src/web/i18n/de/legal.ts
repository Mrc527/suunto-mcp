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
  "legal.privacy.intro": "Diese Datenschutzerklärung erklärt, was {app} über dich speichert, warum, wie lange und wer deine Daten außerdem erhält. Kurz gesagt: Wir speichern nur, was der Dienst braucht, dein PADI-Passwort wird nie gespeichert, dein Anmeldetoken von PADI wird verschlüsselt gespeichert, und dein Logbuch wird nicht gespeichert.",

  "legal.privacy.controller.title": "Wer verantwortlich ist",
  "legal.privacy.controller.text": "{app} unter {site} wird von {operator}, Lugano, Schweiz, betrieben. {operator} ist für deine personenbezogenen Daten verantwortlich: als Verantwortlicher im Sinne des Schweizer Bundesgesetzes über den Datenschutz (DSG) und, soweit sie anwendbar ist, der Datenschutz-Grundverordnung der EU (DSGVO).",
  "legal.privacy.controller.contact": "Wenn du Fragen zu deinen Daten hast oder deine Rechte ausüben möchtest, schreib an {email}.",

  "legal.privacy.data.title": "Was wir speichern und warum",
  "legal.privacy.data.lead": "Wir speichern nur, was der Dienst zum Funktionieren braucht:",
  "legal.privacy.data.account": "<strong>Dein Account.</strong> Deine E-Mail-Adresse und das Passwort, das du für {app} gewählt hast. Das Passwort wird nur als scrypt-Hash gespeichert, wir können es also nicht sehen. Außerdem speichern wir, wann du den Account erstellt und dich zuletzt angemeldet hast und ob er deaktiviert oder ein Administrator-Account ist. Das brauchen wir, um dir einen Account zu geben und ihn zu schützen.",
  "legal.privacy.data.request": "<strong>Deine Zugangsanfrage.</strong> Wenn du Zugang anfragst, speichern wir die Nachricht, die du an den Administrator schreibst, damit er entscheiden kann. Sie wird gelöscht, wenn deine Anfrage genehmigt wird. Wenn für diesen Dienst ein Mailserver eingerichtet ist und der Administrator die E-Mail-Benachrichtigungen nicht ausgeschaltet hat, werden ihm deine E-Mail-Adresse und diese Nachricht zusätzlich per E-Mail gesendet (siehe „Wer deine Daten erhält“).",
  "legal.privacy.data.invite": "<strong>Einladungscodes.</strong> Wenn du dich mit einem Einladungscode registrierst, speichert die Einladung deine E-Mail-Adresse und den Zeitpunkt, zu dem du den Code verwendet hast.",
  "legal.privacy.data.padi": "<strong>Deine PADI-Verbindung.</strong> Deine E-Mail-Adresse bei PADI, das Anmeldetoken (ein Refresh-Token), das PADI ausgibt, wenn du dich hier anmeldest, deine PADI-Account-ID (die Affiliate-ID), dein Name, wie PADI ihn gespeichert hat, und deine Einstellungen: Einheiten, Schreibschutz und Zeitzone, zusammen mit dem Zeitpunkt deiner Anmeldung. Diese Angaben werden mit AES-256-GCM verschlüsselt gespeichert. Dein PADI-Passwort wird nur einmal für die Anmeldung verwendet und nie gespeichert. Wir brauchen diese Angaben, um für dich auf dein PADI-Logbuch zuzugreifen.",
  "legal.privacy.data.apps": "<strong>Verbundene KI-Apps.</strong> Wenn du eine KI-App verbindest, speichern wir die Registrierung der App (den Namen und die Webadressen, die sie selbst angibt) und die Tokens, mit denen sie für deinen Account handeln kann. Tokens werden nur als Hashes gespeichert. Außerdem speichern wir, wann jede Verbindung hergestellt und zuletzt genutzt wurde, damit du sie sehen und widerrufen kannst.",
  "legal.privacy.data.activity": "<strong>Aktivitätsprotokoll.</strong> Für jede Aktion einer KI-App (einen Tool-Aufruf, zum Beispiel <code>logbook_list_dives</code>) speichern wir den Zeitpunkt, die App, das Tool, wie lange es gedauert hat und ob es funktioniert hat. Wir speichern nicht, was gelesen oder geschrieben wurde: keine Tauchgänge, Tauchplätze, Buddys, Notizen oder Brevets. Die neuesten Einträge siehst du auf der Seite „Verbundene Apps“, und wir nutzen das Protokoll, um Fehler und Missbrauch zu erkennen.",
  "legal.privacy.data.sessions": "<strong>Browser-Sitzungen.</strong> Wenn du dich anmeldest, erhält dein Browser einen zufälligen Sitzungscode in einem Cookie. Wir speichern davon nur einen Hash, zusammen mit dem Zeitpunkt, zu dem er erstellt wurde, und wann er abläuft.",
  "legal.privacy.data.ip": "<strong>IP-Adresse.</strong> Wie jede Website sieht der Server die IP-Adresse jeder Anfrage. {app} behält sie nur im Arbeitsspeicher, höchstens einen Tag lang, um wiederholte Versuche zu begrenzen, zum Beispiel zu viele Anmeldeversuche. Sie wird weder in der Datenbank noch im Protokoll gespeichert.",
  "legal.privacy.data.log": "<strong>Serverprotokoll.</strong> Der Server schreibt ein kurzes technisches Protokoll über Vorgänge wie eine fehlgeschlagene Anmeldung, einen neuen Account oder einen Fehler. Es enthält keine Passwörter, keine Anmeldetokens, keine IP-Adressen und keine Inhalte deines Logbuchs. Wenn aber eine Aktion fehlschlägt, kann die Fehlermeldung eine kurze Angabe enthalten, zum Beispiel einen Wert, den PADI abgelehnt hat.",

  "legal.privacy.content.title": "Dein Logbuch wird nicht gespeichert",
  "legal.privacy.content.text": "Wenn eine KI-App nach deinen Tauchgängen fragt, holt {app} sie von PADI und gibt sie an die App weiter. Sie liegen nur während der Anfrage im Arbeitsspeicher und werden weder in der Datenbank noch auf der Festplatte gespeichert. Das gilt auch für Tauchfotos und Brevetkarten. Das Serverprotokoll enthält nur die oben beschriebenen kurzen Fehlerangaben. Die Einstellung der Einheiten deines PADI-Logbuchs bleibt einige Minuten lang im Arbeitsspeicher, damit wiederholte Anfragen schneller sind.",
  "legal.privacy.content.sent": "Tauchgänge, die deine KI-App hinzufügt, ändert oder löscht, werden in deinem Logbuch bei PADI geändert, so als hättest du es selbst auf der PADI-Website getan. Wenn du einen Tauchgang zur Verifizierung sendest, leitet PADI die Anfrage an den PADI Pro weiter, den du angibst.",

  "legal.privacy.bases.title": "Rechtsgrundlagen",
  "legal.privacy.bases.lead": "Wir verarbeiten deine Daten gemäß dem Schweizer DSG. Soweit die DSGVO gilt, stützen wir uns auf diese Rechtsgrundlagen:",
  "legal.privacy.bases.contract": "<strong>Vertrag</strong> (Art. 6 Abs. 1 lit. b DSGVO): um den Dienst zu erbringen, für den du dich registriert hast, also deinen Account, deine PADI-Verbindung, deine verbundenen Apps und dein Aktivitätsprotokoll.",
  "legal.privacy.bases.interest": "<strong>Berechtigtes Interesse</strong> (Art. 6 Abs. 1 lit. f DSGVO): um den Dienst sicher und am Laufen zu halten, mit Grenzen für wiederholte Versuche, dem Serverprotokoll, Backups und Schutz vor Missbrauch.",
  "legal.privacy.bases.law": "<strong>Rechtliche Verpflichtung</strong> (Art. 6 Abs. 1 lit. c DSGVO): wenn uns das Gesetz verpflichtet, Daten aufzubewahren oder herauszugeben.",

  "legal.privacy.retention.title": "Wie lange wir Daten aufbewahren",
  "legal.privacy.retention.account": "<strong>Account:</strong> bis du ihn löschst oder der Administrator ihn löscht.",
  "legal.privacy.retention.padi": "<strong>PADI-Verbindung:</strong> bis du sie auf der Seite „PADI-Account“ entfernst oder deinen Account löschst. Das Anmeldetoken wird dann von diesem Server gelöscht, und bei PADI läuft es von selbst ab.",
  "legal.privacy.retention.request": "<strong>Zugangsanfragen:</strong> werden sofort gelöscht, wenn sie abgelehnt werden, und nach 30 Tagen, wenn niemand antwortet. Die Nachricht an den Administrator wird gelöscht, wenn die Anfrage genehmigt wird. Eine E-Mail-Benachrichtigung zu einer Anfrage bleibt im Postfach des Administrators, bis er sie löscht.",
  "legal.privacy.retention.sessions": "<strong>Browser-Sitzungen:</strong> bis du dich abmeldest, höchstens {lifetime}.",
  "legal.privacy.retention.tokens": "<strong>App-Verbindungen:</strong> Ein Zugriffstoken ist {access} lang gültig. Eine Verbindung endet, wenn du sie widerrufst oder wenn sie {refresh} lang nicht genutzt wurde. Jedes Token wird einen Tag nach seinem Ablauf gelöscht.",
  "legal.privacy.retention.clients": "<strong>App-Registrierungen</strong> (nicht mit deinem Account verknüpft): werden nach einem Tag gelöscht, wenn niemand die App genehmigt hat, sonst sobald keine Verbindung sie mehr nutzt, frühestens 90 Tage nach der ersten Genehmigung.",
  "legal.privacy.retention.activity": "<strong>Aktivitätsprotokoll:</strong> 90 Tage.",
  "legal.privacy.retention.invites": "<strong>Einladungen:</strong> bis der Administrator die Einladung löscht. Wenn du deinen Account löschst, bleibt deine E-Mail-Adresse in einer Einladung, die du verwendet hast, gespeichert. Schreib uns, dann löschen wir sie.",
  "legal.privacy.retention.log": "<strong>Serverprotokoll:</strong> wird in Dateien begrenzter Größe gespeichert (insgesamt 50 MB). Die ältesten Einträge werden überschrieben.",
  "legal.privacy.retention.backups": "<strong>Backups:</strong> Eine Kopie der Datenbank entsteht vor jedem Update oder Rollback der Software oder wenn sie manuell erstellt wird. Nur die 10 neuesten Kopien werden aufbewahrt. Sie liegen auf demselben Server. Daten, die du löschst, können in diesen Kopien bleiben, bis sie ersetzt werden. Deine PADI-Verbindung bleibt darin verschlüsselt.",

  "legal.privacy.recipients.title": "Wer deine Daten erhält",
  "legal.privacy.recipients.lead": "Wir verkaufen deine Daten nicht, geben sie nicht an Werbetreibende weiter und verwenden sie nicht zum Trainieren von KI-Modellen. Deine Daten gehen nur an:",
  "legal.privacy.recipients.padi": "<strong>PADI.</strong> Um auf dein Logbuch zuzugreifen, meldet sich {app} einmal mit der E-Mail-Adresse und dem Passwort, die du eingibst, bei den Servern von PADI an. Danach sendet der Dienst PADI die Anfragen, die du oder deine KI-Apps stellen: Tauchgänge lesen, hinzufügen, ändern und löschen, deine Brevetkarten und Tauchfotos lesen, einen PADI Pro suchen und einen Tauchgang zur Verifizierung an einen PADI Pro senden. PADI meldet dich über Amazon Web Services (AWS Cognito) an. PADI verarbeitet diese Daten gemäß seiner eigenen Datenschutzrichtlinie.",
  "legal.privacy.recipients.apps": "<strong>Die KI-Apps, die du verbindest.</strong> Jede App, die du genehmigst, zum Beispiel Claude von Anthropic oder ChatGPT von OpenAI, erhält die Logbuch- und Brevetdaten, die sie anfragt, und die Ergebnisse ihrer Aktionen. Was die App mit diesen Daten macht, richtet sich nach ihren eigenen Bedingungen und ihrer Datenschutzerklärung sowie nach deinen Einstellungen in dieser App. Darauf haben wir keinen Einfluss.",
  "legal.privacy.recipients.hosting": "<strong>Unser Hosting-Anbieter.</strong> {app} läuft auf einem Server, der bei einem Cloud-Hosting-Anbieter gemietet ist. Der Anbieter speichert die Daten für uns und darf sie nicht für eigene Zwecke verwenden.",
  "legal.privacy.recipients.admin": "<strong>Der Administrator.</strong> Der Administrator von {app} sieht eine Liste der Accounts mit E-Mail-Adresse, Status, ob PADI verbunden ist, letzter Anmeldung, Anzahl der Tool-Aufrufe in den letzten 7 Tagen und den Nachrichten in Zugangsanfragen. Die Admin-Seiten zeigen nie deine PADI-Verbindung oder dein Anmeldetoken. Wenn für diesen Dienst ein Mailserver eingerichtet ist und der Administrator die E-Mail-Benachrichtigungen zu Zugangsanfragen nicht ausgeschaltet hat (sie sind standardmäßig eingeschaltet), erhält er die E-Mail-Adresse und die Nachricht jeder neuen Anfrage außerdem per E-Mail. Diese E-Mails werden über den Mailserver dieses Dienstes gesendet.",
  "legal.privacy.recipients.authorities": "<strong>Behörden</strong>, nur wenn das Gesetz es verlangt.",
  "legal.privacy.recipients.noTracking": "Wir verwenden keine Analyse-, Werbe- oder Tracking-Dienste, und diese Seiten laden nichts von anderen Websites.",

  "legal.privacy.transfers.title": "Daten in anderen Ländern",
  "legal.privacy.transfers.text": "Die Daten, die {app} speichert, liegen auf dem Server des Dienstes und in seinen Backups beim Hosting-Anbieter. PADI und die KI-Apps, die du verbindest, können deine Daten in anderen Ländern verarbeiten, auch in den USA, wo der Anmeldedienst von PADI läuft. Das geschieht, weil du dich entscheidest, ihre Dienste zu nutzen. Wenn du Zugang anfragst, können deine E-Mail-Adresse und deine Nachricht per E-Mail an den Administrator gesendet werden, sodass auch der Anbieter des Mailservers sie verarbeiten kann. Ihre Datenschutzrichtlinien erklären, wo sie Daten verarbeiten und wie sie sie schützen.",

  "legal.privacy.security.title": "Wie wir deine Daten schützen",
  "legal.privacy.security.encryption": "Deine PADI-Verbindung wird samt Anmeldetoken mit AES-256-GCM verschlüsselt. Passwörter für {app} werden mit scrypt gehasht, und Sitzungscodes, Tokens und Einladungscodes werden nur als Hashes gespeichert.",
  "legal.privacy.security.transport": "Verbindungen zu {app} nutzen HTTPS, und Verbindungen zu PADI nutzen ebenfalls HTTPS.",
  "legal.privacy.security.web": "Formulare sind gegen gefälschte Anfragen geschützt, die Seiten laufen unter einer strengen Content Security Policy, und wiederholte Versuche werden begrenzt.",
  "legal.privacy.security.server": "Der Dienst läuft in einem abgeschotteten Container ohne zusätzliche Rechte, und sein Dateisystem ist bis auf seinen Datenordner schreibgeschützt.",
  "legal.privacy.security.token": "Weil {app} für dich mit PADI kommuniziert, hat der Server den Verschlüsselungsschlüssel und kann dein Anmeldetoken entschlüsseln. Deshalb speichert er nie dein PADI-Passwort, sondern nur das Token. Du kannst es jederzeit auf der Seite <a href=\"/account\">PADI-Account</a> entfernen.",
  "legal.privacy.security.report": "Kein System ist vollkommen sicher. Wenn du ein Sicherheitsproblem findest, melde es bitte an {email}. Wir antworten so schnell wie möglich und beheben bestätigte Probleme.",

  "legal.privacy.rights.title": "Deine Rechte",
  "legal.privacy.rights.lead": "Du hast das Recht zu erfahren, welche Daten wir über dich haben, eine Kopie davon zu erhalten, sie berichtigen oder löschen zu lassen, ihre Verwendung einzuschränken oder ihr zu widersprechen und sie zu einem anderen Anbieter mitzunehmen. Vieles davon kannst du selbst erledigen:",
  "legal.privacy.rights.padi": "Ändere oder entferne deine PADI-Verbindung auf der Seite <a href=\"/account\">PADI-Account</a>.",
  "legal.privacy.rights.apps": "Sieh dir deine verbundenen Apps und das Aktivitätsprotokoll an und widerrufe den Zugriff einer App auf der Seite <a href=\"/account/connections\">Verbundene Apps</a>.",
  "legal.privacy.rights.delete": "Lösche deinen Account auf der Seite <a href=\"/account/security\">Sicherheit</a>. Damit werden dein Account, deine PADI-Verbindung, deine Sitzungen, deine App-Verbindungen und dein Aktivitätsprotokoll sofort gelöscht. Kopien in den Backups verschwinden, wenn die Backups ersetzt werden. Dein Logbuch bei PADI bleibt unberührt.",
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
  "legal.terms.service.text": "{app} verbindet KI-Apps mit deinem PADI-Tauchlogbuch. Es ist ein kostenloses, unabhängiges Open-Source-Projekt, das von {operator}, Lugano, Schweiz, betrieben wird. Es gibt kein kostenpflichtiges Abo und keine Werbung.",

  "legal.terms.affiliation.title": "Keine Verbindung zu PADI oder KI-Anbietern",
  "legal.terms.affiliation.text": "{app} ist ein unabhängiges Open-Source-Projekt. Es stammt nicht von PADI (Professional Association of Diving Instructors), Anthropic, OpenAI, Google oder einem anderen KI-Anbieter, ist mit keinem von ihnen verbunden und wird von keinem von ihnen unterstützt. PADI ist eine eingetragene Marke der PADI Worldwide Corp. {app} verwendet keine Grafiken oder Logos von PADI. Andere Produktnamen gehören ihren jeweiligen Inhabern.",

  "legal.terms.account.title": "Dein Account",
  "legal.terms.account.age": "Du musst mindestens 16 Jahre alt sein.",
  "legal.terms.account.secret": "Verwende eine E-Mail-Adresse, die dir gehört, und halte dein Passwort für {app} geheim. Teile deinen Account nicht mit anderen. Du bist für alles verantwortlich, was damit geschieht.",
  "legal.terms.account.approval": "Neue Accounts brauchen eventuell die Genehmigung des Administrators oder einen Einladungscode. Niemand hat Anspruch auf einen Account.",

  "legal.terms.padi.title": "Dein PADI-Account",
  "legal.terms.padi.text": "Du verbindest deinen eigenen PADI-Account, indem du dich mit seiner E-Mail-Adresse und seinem Passwort anmeldest. Verbinde nur einen PADI-Account, der dir gehört. Die Bedingungen von <a href=\"{url}\">PADI</a> gelten für dich weiterhin. PADI bietet dafür keine öffentliche Schnittstelle an: {app} verwendet dieselbe Schnittstelle wie die PADI-Website. Deshalb kann der Dienst aufhören zu funktionieren oder anders funktionieren, wenn PADI diese Schnittstelle ändert.",

  "legal.terms.ai.title": "Was deine KI-Apps tun",
  "legal.terms.ai.access": "Die KI-Apps, die du verbindest, handeln in deinem Auftrag. Sie können dein Logbuch und deine Brevets lesen und, sofern du den Schreibschutz nicht einschaltest, Tauchgänge hinzufügen, ändern und löschen, die Einheiten deines Logbuchs ändern und Tauchgänge zur Verifizierung an einen PADI Pro senden. KI-Apps machen Fehler, zum Beispiel bei einer Tiefe, einem Datum oder einer Einheit.",
  "legal.terms.ai.responsible": "Du entscheidest, welche Apps du verbindest und worum du sie bittest, und du bist für das Ergebnis verantwortlich. Prüfe wichtige Aktionen, bevor du sie bestätigst, und prüfe dein Logbuch auf der PADI-Website. Wenn deine Apps nur lesen sollen, schalte auf der Seite <a href=\"/account\">PADI-Account</a> die Option „Schreibgeschützt“ ein. Du kannst den Zugriff einer App jederzeit auf der Seite <a href=\"/account/connections\">Verbundene Apps</a> widerrufen.",

  "legal.terms.use.title": "Zulässige Nutzung",
  "legal.terms.use.lead": "Wenn du {app} nutzt, darfst du nicht:",
  "legal.terms.use.spam": "Tauchgänge eintragen, die du nicht gemacht hast, oder falsche oder unerwünschte Anfragen zur Verifizierung an PADI Pros senden",
  "legal.terms.use.law": "gegen das Gesetz oder die Bedingungen von PADI verstoßen oder die Rechte anderer verletzen",
  "legal.terms.use.others": "auf Accounts oder Daten zugreifen, die du nicht verwenden darfst",
  "legal.terms.use.harm": "den Dienst überlasten oder angreifen oder seine Grenzen oder Sicherheitsmaßnahmen umgehen",
  "legal.terms.use.report": "Wenn du ein Sicherheitsproblem findest, melde es bitte an {email}, statt es auszunutzen.",

  "legal.terms.availability.title": "Kostenlos und ohne Garantie",
  "legal.terms.availability.text": "Der Dienst ist kostenlos und wird so bereitgestellt, wie er ist. Wir tun unser Bestes, damit er läuft und sicher ist, können aber nicht versprechen, dass er immer verfügbar, fehlerfrei oder für deinen Zweck geeignet ist. Wir können den Dienst oder Teile davon jederzeit ändern, einschränken oder einstellen. Wenn wir ihn einstellen, versuchen wir, das vorher auf dieser Website anzukündigen.",

  "legal.terms.admin.title": "Was der Administrator tun kann",
  "legal.terms.admin.text": "Der Administrator kann Zugangsanfragen genehmigen oder ablehnen, Accounts deaktivieren, aktivieren und löschen, Passwörter zurücksetzen, App-Verbindungen beenden und die Servereinstellungen ändern, zum Beispiel den Schreibschutz für alle einschalten. Das tut der Administrator zum Beispiel, wenn gegen diese Bedingungen verstoßen wird, wenn ein Account in falsche Hände geraten zu sein scheint oder um den Dienst und alle, die ihn nutzen, zu schützen.",

  "legal.terms.end.title": "Beenden der Nutzung",
  "legal.terms.end.text": "Du kannst jederzeit aufhören: Lösche deinen Account auf der Seite <a href=\"/account/security\">Sicherheit</a>, und deine Daten werden gelöscht, wie in der <a href=\"/privacy\">Datenschutzerklärung</a> beschrieben. Wir können deinen Account sperren oder löschen, wenn du gegen diese Bedingungen verstößt oder wenn der Dienst eingestellt wird.",

  "legal.terms.liability.title": "Haftung",
  "legal.terms.liability.text": "Soweit gesetzlich zulässig, haftet {operator} nicht für Schäden, die durch die Nutzung von {app} entstehen oder dadurch, dass der Dienst nicht genutzt werden kann. Dazu gehören verlorene, geänderte oder gelöschte Tauchgänge, falsche Werte in deinem Logbuch, Anfragen zur Verifizierung, die deine KI-Apps senden, und verlorene Daten. Die Haftung für Vorsatz oder grobe Fahrlässigkeit und jede andere Haftung, die nach dem Gesetz nicht ausgeschlossen werden darf, bleibt unberührt.",

  "legal.terms.privacy.title": "Datenschutz",
  "legal.terms.privacy.text": "Die <a href=\"/privacy\">Datenschutzerklärung</a> erklärt, welche Daten {app} speichert, warum und wie lange.",

  "legal.terms.changes.title": "Änderungen dieser Bedingungen",
  "legal.terms.changes.text": "Wir können diese Bedingungen ändern, zum Beispiel wenn sich der Dienst ändert. Das Datum oben zeigt die letzte Änderung. Wenn du {app} nach einer Änderung weiter nutzt, gelten die neuen Bedingungen. Wenn du mit ihnen nicht einverstanden bist, kannst du deinen Account löschen.",

  "legal.terms.law.title": "Anwendbares Recht",
  "legal.terms.law.text": "Diese Bedingungen unterliegen Schweizer Recht. Zuständig sind die Gerichte der Schweiz, sofern zwingendes Recht nichts anderes vorsieht. Wenn du als Verbraucher handelst, behältst du den Schutz der zwingenden Gesetze des Landes, in dem du wohnst.",

  "legal.terms.contact.title": "Kontakt",
  "legal.terms.contact.text": "Fragen zu diesen Bedingungen? Schreib an {operator} unter {email}.",
} satisfies Record<keyof typeof en, string>;
