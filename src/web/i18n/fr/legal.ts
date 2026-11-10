import type en from "../en/legal.js";

/** Translations (fr): legal. Every key of ../en/legal.ts, the same placeholders and markup. */
export default {
  "legal.updated": "Dernière mise à jour : {date}",
  "legal.onThisPage": "Sur cette page",
  "legal.englishPrevails": "Cette page est aussi disponible dans d'autres langues. En cas de divergence entre une traduction et la version anglaise, la version anglaise fait foi.",
  "legal.seeTerms": "Voir aussi les <a href=\"/terms\">conditions d'utilisation</a>.",
  "legal.seePrivacy": "Voir aussi la <a href=\"/privacy\">politique de confidentialité</a>.",
  "legal.duration.minutes.one": "{n} minute",
  "legal.duration.minutes.other": "{n} minutes",
  "legal.duration.hours.one": "{n} heure",
  "legal.duration.hours.other": "{n} heures",
  "legal.duration.days.one": "{n} jour",
  "legal.duration.days.other": "{n} jours",

  "legal.privacy.title": "Politique de confidentialité",
  "legal.privacy.intro": "Cette politique explique ce que {app} conserve à votre sujet, pourquoi, pendant combien de temps et qui d'autre reçoit vos données. En bref : nous ne conservons que ce dont le service a besoin, votre mot de passe PADI n'est jamais stocké, votre jeton de connexion PADI est stocké de façon chiffrée, et votre carnet de plongée n'est pas stocké.",

  "legal.privacy.controller.title": "Qui est responsable",
  "legal.privacy.controller.text": "{app} sur {site} est exploité par {operator}, Lugano, Suisse. {operator} est responsable de vos données personnelles : c'est le responsable du traitement au sens de la loi fédérale suisse sur la protection des données (LPD) et, lorsqu'il s'applique, du règlement général sur la protection des données de l'UE (RGPD).",
  "legal.privacy.controller.contact": "Pour toute question sur vos données, ou pour exercer vos droits, écrivez à {email}.",

  "legal.privacy.data.title": "Ce que nous conservons et pourquoi",
  "legal.privacy.data.lead": "Nous ne conservons que ce dont le service a besoin pour fonctionner :",
  "legal.privacy.data.account": "<strong>Votre compte.</strong> Votre adresse e-mail et le mot de passe que vous avez choisi pour {app}. Le mot de passe n'est stocké que sous forme de hachage scrypt : nous ne pouvons donc pas le voir. Nous conservons aussi la date de création du compte, celle de votre dernière connexion, et si le compte est désactivé ou s'il s'agit d'un compte administrateur. Nous en avons besoin pour vous fournir un compte et le protéger.",
  "legal.privacy.data.request": "<strong>Votre demande d'accès.</strong> Si vous demandez l'accès, le message que vous écrivez à l'administrateur, pour qu'il puisse décider. Ce message est supprimé lorsque votre demande est approuvée. Si un serveur de messagerie est configuré pour ce service et que l'administrateur n'a pas désactivé les notifications par e-mail, votre adresse e-mail et ce message lui sont aussi envoyés par e-mail (voir « Qui reçoit vos données »).",
  "legal.privacy.data.invite": "<strong>Codes d'invitation.</strong> Si vous vous inscrivez avec un code d'invitation, l'invitation enregistre votre adresse e-mail et la date à laquelle vous l'avez utilisée.",
  "legal.privacy.data.padi": "<strong>Votre connexion PADI.</strong> Votre adresse e-mail PADI, le jeton de connexion (un jeton d'actualisation, ou refresh token) que PADI fournit lorsque vous vous connectez ici, votre identifiant de compte PADI (l'affiliate id), votre nom tel que PADI le connaît, et vos réglages : unités, mode lecture seule et fuseau horaire, avec l'heure de votre connexion. Ils sont stockés de façon chiffrée avec AES-256-GCM. Votre mot de passe PADI ne sert qu'une fois, pour la connexion, et n'est jamais stocké. Nous en avons besoin pour accéder à votre carnet de plongée PADI pour vous.",
  "legal.privacy.data.apps": "<strong>Apps d'IA connectées.</strong> Lorsque vous connectez une app d'IA, nous conservons l'enregistrement de l'app (le nom et les adresses web qu'elle indique elle-même) et les jetons qui lui permettent d'agir pour votre compte. Les jetons ne sont stockés que sous forme de hachages. Nous conservons aussi la date de chaque connexion et de sa dernière utilisation, pour que vous puissiez la voir et la révoquer.",
  "legal.privacy.data.activity": "<strong>Journal d'activité.</strong> Pour chaque action effectuée par une app d'IA (un appel d'outil, par exemple <code>logbook_list_dives</code>), nous enregistrons l'heure, l'app, l'outil, la durée et si l'action a réussi. Nous n'enregistrons pas ce qui a été lu ou écrit : ni plongées, ni sites de plongée, ni binômes, ni notes, ni certifications. Vous voyez les dernières entrées sur la page Apps connectées, et nous utilisons ce journal pour détecter les erreurs et les abus.",
  "legal.privacy.data.sessions": "<strong>Sessions de navigateur.</strong> Lorsque vous vous connectez, votre navigateur reçoit un code de session aléatoire dans un cookie. Nous n'en conservons qu'un hachage, avec sa date de création et sa date d'expiration.",
  "legal.privacy.data.ip": "<strong>Adresse IP.</strong> Comme tout site web, le serveur voit l'adresse IP de chaque requête. {app} ne la garde qu'en mémoire, pendant un jour au plus, pour limiter les tentatives répétées, par exemple un trop grand nombre de connexions. Il ne l'enregistre ni dans sa base de données ni dans son journal.",
  "legal.privacy.data.log": "<strong>Journal du serveur.</strong> Le serveur tient un court journal technique des événements tels qu'une connexion échouée, un nouveau compte ou une erreur. Il ne contient ni mots de passe, ni jetons de connexion, ni adresses IP, ni le contenu de votre carnet de plongée. Toutefois, lorsqu'une action échoue, le message d'erreur peut contenir un court détail, comme une valeur refusée par PADI.",

  "legal.privacy.content.title": "Votre carnet de plongée n'est pas stocké",
  "legal.privacy.content.text": "Lorsqu'une app d'IA demande vos plongées, {app} les récupère auprès de PADI et les transmet à l'app. Elles ne restent en mémoire que pendant le traitement de la requête et ne sont enregistrées ni dans la base de données ni sur disque. Cela vaut aussi pour les photos de plongée et les cartes de certification. Le journal du serveur ne contient que les courts détails d'erreur décrits ci-dessus. Le réglage des unités de votre carnet de plongée PADI est gardé en mémoire pendant quelques minutes, pour que les requêtes répétées soient plus rapides.",
  "legal.privacy.content.sent": "Les plongées que votre app d'IA ajoute, modifie ou supprime sont modifiées dans votre carnet de plongée chez PADI, comme si vous le faisiez sur le site web de PADI. Lorsque vous envoyez une plongée pour validation, PADI transmet la demande au PADI Pro que vous indiquez.",

  "legal.privacy.bases.title": "Bases juridiques",
  "legal.privacy.bases.lead": "Nous traitons vos données conformément à la LPD suisse. Lorsque le RGPD s'applique, nous nous appuyons sur les bases juridiques suivantes :",
  "legal.privacy.bases.contract": "<strong>Contrat</strong> (art. 6, par. 1, point b, RGPD) : pour vous fournir le service que vous utilisez, c'est-à-dire votre compte, votre connexion PADI, vos apps connectées et votre journal d'activité.",
  "legal.privacy.bases.interest": "<strong>Intérêt légitime</strong> (art. 6, par. 1, point f, RGPD) : pour assurer la sécurité et le bon fonctionnement du service, avec la limitation des tentatives répétées, le journal du serveur, les sauvegardes et la protection contre les abus.",
  "legal.privacy.bases.law": "<strong>Obligation légale</strong> (art. 6, par. 1, point c, RGPD) : lorsque la loi nous oblige à conserver ou à communiquer des données.",

  "legal.privacy.retention.title": "Durée de conservation",
  "legal.privacy.retention.account": "<strong>Compte :</strong> jusqu'à ce que vous le supprimiez, ou que l'administrateur le supprime.",
  "legal.privacy.retention.padi": "<strong>Connexion PADI :</strong> jusqu'à ce que vous la supprimiez sur la page Compte PADI ou que vous supprimiez votre compte. Le jeton de connexion est alors supprimé de ce serveur, et il expire de lui-même chez PADI.",
  "legal.privacy.retention.request": "<strong>Demandes d'accès :</strong> supprimées immédiatement en cas de refus, et après 30 jours si personne n'y répond. Le message à l'administrateur est supprimé lorsque la demande est approuvée. Un e-mail de notification concernant une demande reste dans la boîte aux lettres de l'administrateur jusqu'à ce qu'il le supprime.",
  "legal.privacy.retention.sessions": "<strong>Sessions de navigateur :</strong> jusqu'à ce que vous vous déconnectiez, pendant {lifetime} au plus.",
  "legal.privacy.retention.tokens": "<strong>Connexions d'apps :</strong> un jeton d'accès est valable {access}. Une connexion prend fin lorsque vous la révoquez, ou après {refresh} sans utilisation. Chaque jeton est supprimé un jour après son expiration.",
  "legal.privacy.retention.clients": "<strong>Enregistrements d'apps</strong> (non liés à votre compte) : supprimés après un jour si personne n'a approuvé l'app, sinon dès qu'aucune connexion ne les utilise, au plus tôt 90 jours après la première approbation de l'app.",
  "legal.privacy.retention.activity": "<strong>Journal d'activité :</strong> 90 jours.",
  "legal.privacy.retention.invites": "<strong>Invitations :</strong> jusqu'à ce que l'administrateur supprime l'invitation. La suppression de votre compte ne retire pas votre adresse e-mail d'une invitation que vous avez utilisée : écrivez-nous et nous la supprimerons.",
  "legal.privacy.retention.log": "<strong>Journal du serveur :</strong> conservé dans des fichiers de taille limitée (50 Mo au total). Les entrées les plus anciennes sont écrasées.",
  "legal.privacy.retention.backups": "<strong>Sauvegardes :</strong> une copie de la base de données est faite avant chaque mise à jour du logiciel ou retour à une version précédente, ou manuellement, et seules les 10 copies les plus récentes sont conservées. Elles sont gardées sur le même serveur. Les données que vous supprimez peuvent rester dans ces copies jusqu'à leur remplacement. Votre connexion PADI y reste chiffrée.",

  "legal.privacy.recipients.title": "Qui reçoit vos données",
  "legal.privacy.recipients.lead": "Nous ne vendons pas vos données, ne les partageons pas avec des annonceurs et ne les utilisons pas pour entraîner des modèles d'IA. Vos données ne sont transmises qu'à :",
  "legal.privacy.recipients.padi": "<strong>PADI.</strong> Pour accéder à votre carnet de plongée, {app} se connecte une fois aux serveurs de PADI avec l'adresse e-mail et le mot de passe que vous saisissez, puis envoie à PADI les requêtes que vous ou vos apps d'IA effectuez : lire, ajouter, modifier et supprimer des plongées, lire vos cartes de certification et vos photos de plongée, rechercher un PADI Pro et envoyer une plongée à un PADI Pro pour validation. PADI vous connecte via Amazon Web Services (AWS Cognito). PADI traite ces données selon sa propre politique de confidentialité.",
  "legal.privacy.recipients.apps": "<strong>Les apps d'IA que vous connectez.</strong> Chaque app que vous approuvez, par exemple Claude d'Anthropic ou ChatGPT d'OpenAI, reçoit les données de carnet de plongée et de certification qu'elle demande, ainsi que les résultats de ses actions. L'utilisation de ces données par l'app est régie par ses propres conditions et sa politique de confidentialité, ainsi que par vos réglages dans cette app. Nous n'avons aucun contrôle sur cette utilisation.",
  "legal.privacy.recipients.hosting": "<strong>Notre hébergeur.</strong> {app} fonctionne sur un serveur loué auprès d'un fournisseur d'hébergement cloud. Ce fournisseur stocke les données pour nous et n'a pas le droit de les utiliser à ses propres fins.",
  "legal.privacy.recipients.admin": "<strong>L'administrateur.</strong> L'administrateur de {app} voit une liste des comptes avec l'adresse e-mail, le statut, si PADI est connecté, la dernière connexion, le nombre d'appels d'outils des 7 derniers jours et les messages des demandes d'accès. Les pages d'administration n'affichent jamais votre connexion PADI ni votre jeton de connexion. Si un serveur de messagerie est configuré pour ce service et que l'administrateur n'a pas désactivé les notifications par e-mail concernant les demandes d'accès (elles sont activées par défaut), il reçoit aussi par e-mail l'adresse e-mail et le message de chaque nouvelle demande, envoyés via le serveur de messagerie de ce service.",
  "legal.privacy.recipients.authorities": "<strong>Les autorités</strong>, uniquement lorsque la loi l'exige.",
  "legal.privacy.recipients.noTracking": "Nous n'utilisons aucun service d'analyse, de publicité ou de suivi, et ces pages ne chargent rien depuis d'autres sites web.",

  "legal.privacy.transfers.title": "Données dans d'autres pays",
  "legal.privacy.transfers.text": "Les données que {app} conserve se trouvent sur son serveur et dans ses sauvegardes, chez l'hébergeur. PADI et les apps d'IA que vous connectez peuvent traiter vos données dans d'autres pays, notamment aux États-Unis, où fonctionne le service de connexion de PADI. Cela se produit parce que vous choisissez d'utiliser leurs services. Si vous demandez l'accès, votre adresse e-mail et votre message peuvent être envoyés par e-mail à l'administrateur : le fournisseur du serveur de messagerie peut donc aussi les traiter. Leurs politiques de confidentialité expliquent où ces données sont traitées et comment elles sont protégées.",

  "legal.privacy.security.title": "Comment nous protégeons vos données",
  "legal.privacy.security.encryption": "Votre connexion PADI, avec son jeton de connexion, est chiffrée avec AES-256-GCM. Les mots de passe de {app} sont hachés avec scrypt, et les codes de session, les jetons et les codes d'invitation ne sont stockés que sous forme de hachages.",
  "legal.privacy.security.transport": "Les connexions à {app} utilisent HTTPS, et les connexions à PADI aussi.",
  "legal.privacy.security.web": "Les formulaires sont protégés contre les requêtes falsifiées, les pages fonctionnent sous une politique de sécurité du contenu stricte, et les tentatives répétées sont limitées.",
  "legal.privacy.security.server": "Le service fonctionne dans un conteneur verrouillé, sans droits supplémentaires, et son système de fichiers est en lecture seule, à l'exception de son dossier de données.",
  "legal.privacy.security.token": "Comme {app} communique avec PADI pour vous, le serveur détient la clé de chiffrement et peut déchiffrer votre jeton de connexion. C'est pourquoi il ne stocke jamais votre mot de passe PADI, mais uniquement le jeton, que vous pouvez supprimer à tout moment sur la page <a href=\"/account\">Compte PADI</a>.",
  "legal.privacy.security.report": "Aucun système n'est parfaitement sûr. Si vous découvrez un problème de sécurité, veuillez le signaler à {email}. Nous vous répondrons dès que possible et corrigerons les problèmes confirmés.",

  "legal.privacy.rights.title": "Vos droits",
  "legal.privacy.rights.lead": "Vous avez le droit de savoir quelles données nous détenons à votre sujet, d'en obtenir une copie, de les faire rectifier ou supprimer, d'en limiter l'utilisation ou de vous y opposer, et de les transférer ailleurs. Vous pouvez faire une grande partie de cela vous-même :",
  "legal.privacy.rights.padi": "Modifiez ou supprimez votre connexion PADI sur la page <a href=\"/account\">Compte PADI</a>.",
  "legal.privacy.rights.apps": "Consultez vos apps connectées et le journal d'activité, et révoquez l'accès de n'importe quelle app, sur la page <a href=\"/account/connections\">Apps connectées</a>.",
  "legal.privacy.rights.delete": "Supprimez votre compte sur la page <a href=\"/account/security\">Sécurité</a>. Cela supprime immédiatement votre compte, votre connexion PADI, vos sessions, vos connexions d'apps et votre journal d'activité. Les copies dans les sauvegardes disparaissent au fur et à mesure que les sauvegardes sont remplacées. Votre carnet de plongée chez PADI reste intact.",
  "legal.privacy.rights.email": "Pour tout le reste, écrivez à {email}. Nous répondons dans un délai de 30 jours.",
  "legal.privacy.rights.complaint": "Vous pouvez aussi déposer une plainte auprès d'une autorité de protection des données : en Suisse, le Préposé fédéral à la protection des données et à la transparence (PFPDT) ; dans l'UE, l'autorité du pays où vous vivez ou travaillez.",

  "legal.privacy.cookies.title": "Cookies",
  "legal.privacy.cookies.lead": "{app} n'utilise que les cookies nécessaires à son fonctionnement. Il n'y a aucun cookie de suivi ou de publicité. Les cookies ne sont envoyés qu'à ce site, ne peuvent pas être lus par les scripts de la page et ne sont partagés avec personne.",
  "legal.privacy.cookies.session": "{name} maintient votre connexion. Il est supprimé lorsque vous vous déconnectez et expire au plus tard après {lifetime}.",
  "legal.privacy.cookies.pre": "{name} protège les formulaires de connexion et d'inscription contre les requêtes falsifiées. Il expire après {lifetime}.",
  "legal.privacy.cookies.lang": "{name} mémorise la langue que vous avez choisie dans le menu des langues. Il expire après {lifetime}.",

  "legal.privacy.children.title": "Enfants",
  "legal.privacy.children.text": "{app} n'est pas destiné aux enfants. Vous devez avoir au moins 16 ans pour l'utiliser. Si vous pensez qu'un enfant a créé un compte, écrivez-nous et nous le supprimerons.",

  "legal.privacy.changes.title": "Modifications de cette politique",
  "legal.privacy.changes.text": "Nous mettons à jour cette politique lorsque le service ou la loi change. La date en haut de la page indique la dernière modification. Si une modification touche la façon dont vos données sont utilisées, nous la signalerons sur ce site.",

  "legal.terms.title": "Conditions d'utilisation",
  "legal.terms.intro": "Ces conditions s'appliquent à {app} sur {site}. Veuillez les lire avant de créer un compte. En utilisant le service, vous les acceptez.",

  "legal.terms.service.title": "Le service",
  "legal.terms.service.text": "{app} connecte les apps d'IA à votre carnet de plongée PADI. C'est un projet open source gratuit et indépendant, exploité par {operator}, Lugano, Suisse. Il n'y a ni offre payante ni publicité.",

  "legal.terms.affiliation.title": "Aucun lien avec PADI ni avec les fournisseurs d'IA",
  "legal.terms.affiliation.text": "{app} est un projet open source indépendant. Il n'est ni conçu ni approuvé par PADI (Professional Association of Diving Instructors), Anthropic, OpenAI, Google ou tout autre fournisseur d'IA, et n'est affilié à aucun d'entre eux. PADI est une marque déposée de PADI Worldwide Corp. {app} n'utilise aucun visuel ni logo de PADI. Les autres noms de produits appartiennent à leurs propriétaires respectifs.",

  "legal.terms.account.title": "Votre compte",
  "legal.terms.account.age": "Vous devez avoir au moins 16 ans.",
  "legal.terms.account.secret": "Utilisez une adresse e-mail qui vous appartient et gardez secret votre mot de passe pour {app}. Ne partagez pas votre compte. Vous êtes responsable de l'utilisation qui en est faite.",
  "legal.terms.account.approval": "Les nouveaux comptes peuvent nécessiter l'approbation de l'administrateur ou un code d'invitation. Personne n'a droit à un compte.",

  "legal.terms.padi.title": "Votre compte PADI",
  "legal.terms.padi.text": "Vous reliez votre propre compte PADI en vous connectant avec son adresse e-mail et son mot de passe. Ne reliez qu'un compte PADI qui vous appartient. Les conditions de <a href=\"{url}\">PADI</a> continuent de s'appliquer à vous. PADI ne propose aucune interface publique pour cela : {app} utilise la même interface que le site web de PADI. Il peut donc cesser de fonctionner, ou fonctionner différemment, lorsque PADI la modifie.",

  "legal.terms.ai.title": "Ce que font vos apps d'IA",
  "legal.terms.ai.access": "Les apps d'IA que vous connectez agissent pour vous. Elles peuvent lire votre carnet de plongée et vos certifications et, sauf si vous activez le mode lecture seule, ajouter, modifier et supprimer des plongées, changer les unités de votre carnet et envoyer des plongées à un PADI Pro pour validation. Les apps d'IA font des erreurs, par exemple dans une profondeur, une date ou une unité.",
  "legal.terms.ai.responsible": "Vous décidez quelles apps vous connectez et ce que vous leur demandez de faire, et vous êtes responsable du résultat. Vérifiez les actions importantes avant de les confirmer, et vérifiez votre carnet de plongée sur le site web de PADI. Si vos apps ne doivent que lire, activez le mode lecture seule sur la page <a href=\"/account\">Compte PADI</a>. Vous pouvez révoquer l'accès d'une app à tout moment sur la page <a href=\"/account/connections\">Apps connectées</a>.",

  "legal.terms.use.title": "Utilisation acceptable",
  "legal.terms.use.lead": "Lorsque vous utilisez {app}, il est interdit de :",
  "legal.terms.use.spam": "enregistrer des plongées que vous n'avez pas faites, ou envoyer à des PADI Pro des demandes de validation fausses ou non sollicitées",
  "legal.terms.use.law": "enfreindre la loi, les conditions de PADI ou les droits d'autrui",
  "legal.terms.use.others": "accéder à des comptes ou à des données que vous n'avez pas le droit d'utiliser",
  "legal.terms.use.harm": "surcharger ou attaquer le service, ou contourner ses limites ou sa sécurité",
  "legal.terms.use.report": "Si vous découvrez un problème de sécurité, veuillez le signaler à {email} au lieu de l'exploiter.",

  "legal.terms.availability.title": "Gratuit et sans garantie",
  "legal.terms.availability.text": "Le service est gratuit et fourni tel quel. Nous faisons de notre mieux pour qu'il fonctionne et reste sûr, mais nous ne pouvons pas garantir qu'il soit toujours disponible, exempt d'erreurs ou adapté à votre usage. Nous pouvons modifier, limiter ou arrêter le service, ou certaines de ses parties, à tout moment. Si nous l'arrêtons, nous essaierons de l'annoncer à l'avance sur ce site.",

  "legal.terms.admin.title": "Ce que peut faire l'administrateur",
  "legal.terms.admin.text": "L'administrateur peut approuver ou refuser les demandes d'accès, désactiver, réactiver et supprimer des comptes, réinitialiser des mots de passe, mettre fin à des connexions d'apps et modifier les réglages du serveur, par exemple activer le mode lecture seule pour tout le monde. L'administrateur le fait, par exemple, lorsque ces conditions ne sont pas respectées, lorsqu'un compte semble être entre de mauvaises mains, ou pour protéger le service et ses utilisateurs.",

  "legal.terms.end.title": "Fin de l'utilisation",
  "legal.terms.end.text": "Vous pouvez arrêter à tout moment : supprimez votre compte sur la page <a href=\"/account/security\">Sécurité</a>, et vos données seront supprimées comme décrit dans la <a href=\"/privacy\">politique de confidentialité</a>. Nous pouvons suspendre ou supprimer votre compte si vous ne respectez pas ces conditions, ou lorsque le service prend fin.",

  "legal.terms.liability.title": "Responsabilité",
  "legal.terms.liability.text": "Dans la mesure permise par la loi, {operator} n'est pas responsable des dommages causés par l'utilisation de {app} ou par l'impossibilité de l'utiliser. Cela inclut les plongées perdues, modifiées ou supprimées, les valeurs erronées dans votre carnet de plongée, les demandes de validation envoyées par vos apps d'IA et les pertes de données. Cela ne limite pas la responsabilité en cas de faute intentionnelle ou de négligence grave, ni toute autre responsabilité que la loi ne permet pas d'exclure.",

  "legal.terms.privacy.title": "Confidentialité",
  "legal.terms.privacy.text": "La <a href=\"/privacy\">politique de confidentialité</a> explique quelles données {app} conserve, pourquoi et pendant combien de temps.",

  "legal.terms.changes.title": "Modifications de ces conditions",
  "legal.terms.changes.text": "Nous pouvons modifier ces conditions, par exemple lorsque le service change. La date en haut de la page indique la dernière modification. Si vous continuez à utiliser {app} après une modification, les nouvelles conditions s'appliquent. Si vous ne les acceptez pas, vous pouvez supprimer votre compte.",

  "legal.terms.law.title": "Droit applicable",
  "legal.terms.law.text": "Ces conditions sont régies par le droit suisse. Les tribunaux suisses sont compétents, sauf disposition légale impérative contraire. Si vous agissez en tant que consommateur, vous conservez la protection des dispositions impératives du droit du pays où vous vivez.",

  "legal.terms.contact.title": "Contact",
  "legal.terms.contact.text": "Des questions sur ces conditions ? Écrivez à {operator} à l'adresse {email}.",
} satisfies Record<keyof typeof en, string>;
