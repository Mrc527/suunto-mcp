import type en from "../en/legal.js";

/** Translations (es): legal. Every key of ../en/legal.ts, the same placeholders and markup. */
export default {
  "legal.updated": "Última actualización: {date}",
  "legal.onThisPage": "En esta página",
  "legal.englishPrevails": "Esta página también está disponible en otros idiomas. Si una traducción difiere de la versión en inglés, prevalece la versión en inglés.",
  "legal.seeTerms": "Consulta también las <a href=\"/terms\">condiciones de uso</a>.",
  "legal.seePrivacy": "Consulta también la <a href=\"/privacy\">política de privacidad</a>.",
  "legal.duration.minutes.one": "{n} minuto",
  "legal.duration.minutes.other": "{n} minutos",
  "legal.duration.hours.one": "{n} hora",
  "legal.duration.hours.other": "{n} horas",
  "legal.duration.days.one": "{n} día",
  "legal.duration.days.other": "{n} días",

  "legal.privacy.title": "Política de privacidad",
  "legal.privacy.intro": "Esta política explica qué datos guarda {app} sobre ti, por qué, durante cuánto tiempo y quién más los recibe. En resumen: solo guardamos lo que el servicio necesita, tu contraseña de Suunto nunca llega a este servidor, tus tokens de Suunto se guardan cifrados y tus entrenamientos y datos de salud no se guardan.",

  "legal.privacy.controller.title": "Quién es el responsable",
  "legal.privacy.controller.text": "{app}, en {site}, está gestionado por {operator}, Lugano, Suiza. {operator} responde de tus datos personales: es el responsable del tratamiento según la Ley Federal suiza de Protección de Datos (LPD) y, cuando sea aplicable, según el Reglamento General de Protección de Datos de la UE (RGPD).",
  "legal.privacy.controller.contact": "Para cualquier pregunta sobre tus datos, o para ejercer tus derechos, escribe a {email}.",

  "legal.privacy.data.title": "Qué guardamos y por qué",
  "legal.privacy.data.lead": "Solo guardamos lo que el servicio necesita para funcionar:",
  "legal.privacy.data.account": "<strong>Tu cuenta.</strong> Tu dirección de correo electrónico y la contraseña que elegiste para {app}. La contraseña se guarda solo como un hash scrypt, así que no podemos verla. También guardamos cuándo creaste la cuenta y cuándo iniciaste sesión por última vez, y si está desactivada o es una cuenta de administrador. Lo necesitamos para darte una cuenta y mantenerla segura.",
  "legal.privacy.data.request": "<strong>Tu solicitud de acceso.</strong> Si solicitas acceso, el mensaje que escribes al administrador, para que pueda decidir. Se elimina cuando se aprueba tu solicitud. Si este servicio tiene configurado un servidor de correo y el administrador no ha desactivado las notificaciones por correo electrónico, también se le envían por correo tu dirección de correo electrónico y este mensaje (consulta \"Quién recibe tus datos\").",
  "legal.privacy.data.invite": "<strong>Códigos de invitación.</strong> Si te registras con un código de invitación, en la invitación quedan registrados tu dirección de correo electrónico y el momento en que la usaste.",
  "legal.privacy.data.suunto": "<strong>Tu conexión con Suunto.</strong> Tu nombre de usuario de Suunto, el token de acceso y el token de actualización que entrega Suunto cuando conectas tu cuenta aquí, cuándo caduca el token de acceso, si hay que renovar la conexión y tus ajustes: unidades, modo de solo lectura y zona horaria, con la hora en que te conectaste y el resultado de la solicitud de prueba que se hizo entonces (cuántos entrenamientos tuviste en los últimos 30 días, o por qué falló la solicitud). Se guardan cifrados con AES-256-GCM. Inicias sesión en la propia página de Suunto, así que tu contraseña de Suunto nunca llega a este servidor. Mientras te conectas, guardamos un hash de un código de un solo uso que caduca a los 10 minutos, para comprobar que la respuesta de Suunto es para ti. Los necesitamos para acceder a tus datos de Suunto en tu nombre.",
  "legal.privacy.data.apps": "<strong>Apps de IA conectadas.</strong> Cuando conectas una app de IA, guardamos el registro de la app (el nombre y las direcciones web que indica ella misma) y los tokens que le permiten actuar en nombre de tu cuenta. Los tokens se guardan solo como hashes. También guardamos cuándo se creó cada conexión y cuándo se usó por última vez, para que puedas verla y revocarla.",
  "legal.privacy.data.activity": "<strong>Registro de actividad.</strong> Por cada acción que realiza una app de IA (una llamada a herramienta, por ejemplo <code>suunto_list_workouts</code>), registramos la hora, la app, la herramienta, cuánto tardó y si funcionó. No registramos lo que se leyó o se escribió: ni entrenamientos, ni frecuencia cardíaca, ni sueño, ni ubicaciones, ni rutas, ni puntos de interés. Ves las últimas entradas en la página Apps conectadas, y usamos el registro para detectar errores y abusos.",
  "legal.privacy.data.sessions": "<strong>Sesiones del navegador.</strong> Cuando inicias sesión, tu navegador recibe un código de sesión aleatorio en una cookie. Solo guardamos un hash de ese código, con la hora en que se creó y cuándo caduca.",
  "legal.privacy.data.ip": "<strong>Dirección IP.</strong> Como cualquier sitio web, el servidor ve la dirección IP de cada solicitud. {app} solo la conserva en memoria, durante un día como máximo, para limitar los intentos repetidos, como demasiados inicios de sesión. No la guarda en su base de datos ni en su registro.",
  "legal.privacy.data.log": "<strong>Registro del servidor.</strong> El servidor escribe un breve registro técnico de sucesos como un inicio de sesión fallido, una cuenta nueva o un error. No contiene contraseñas, tokens, direcciones IP ni contenidos de tus datos de Suunto. Pero cuando una acción falla, el mensaje de error puede incluir un breve detalle, como un valor que Suunto rechazó.",

  "legal.privacy.content.title": "Tus entrenamientos y datos de salud no se guardan",
  "legal.privacy.content.text": "Cuando una app de IA pide tus entrenamientos, tu actividad diaria, tu frecuencia cardíaca, tu sueño, tu recuperación, tus rutas o tus puntos de interés, {app} los obtiene de Suunto y se los pasa a la app. No se guardan en la base de datos ni en el disco. Esto incluye los archivos FIT y las ubicaciones de tus entrenamientos y rutas. Para ahorrar llamadas a Suunto, las respuestas recientes se mantienen en la memoria del servidor entre 2 y 30 minutos (como máximo 20 MB por usuario) y desaparecen cuando el servidor se reinicia. El registro del servidor solo contiene los breves datos de error descritos arriba. La página de tu cuenta muestra el resultado de la solicitud de prueba hecha cuando te conectaste, y nunca consulta a Suunto solo para mostrar la página.",
  "legal.privacy.content.sent": "Las rutas y los puntos de interés que añade tu app de IA se guardan en tu cuenta de Suunto, como si los añadieras en la Suunto App, y pueden sincronizarse con tu reloj. {app} no los modifica ni los elimina después: puedes eliminarlos en la Suunto App.",

  "legal.privacy.bases.title": "Bases jurídicas",
  "legal.privacy.bases.lead": "Tratamos tus datos conforme a la LPD suiza. Cuando se aplica el RGPD, nos basamos en estas bases jurídicas:",
  "legal.privacy.bases.contract": "<strong>Contrato</strong> (art. 6, apdo. 1, letra b, del RGPD): para prestarte el servicio en el que te registraste, es decir, tu cuenta, tu conexión con Suunto, tus apps conectadas y tu registro de actividad.",
  "legal.privacy.bases.health": "<strong>Tu consentimiento explícito</strong> (art. 9, apdo. 2, letra a, del RGPD) para los datos de salud, como la frecuencia cardíaca, el sueño y la recuperación: lo das cuando conectas tu cuenta de Suunto y pides estos datos a tu app de IA. Puedes retirarlo en cualquier momento eliminando la conexión con Suunto.",
  "legal.privacy.bases.interest": "<strong>Interés legítimo</strong> (art. 6, apdo. 1, letra f, del RGPD): para mantener el servicio seguro y en funcionamiento, con límites a los intentos repetidos, el registro del servidor, copias de seguridad y protección contra abusos.",
  "legal.privacy.bases.law": "<strong>Obligación legal</strong> (art. 6, apdo. 1, letra c, del RGPD): cuando la ley nos obliga a conservar o entregar datos.",

  "legal.privacy.retention.title": "Cuánto tiempo conservamos los datos",
  "legal.privacy.retention.account": "<strong>Cuenta:</strong> hasta que la elimines tú o la elimine el administrador.",
  "legal.privacy.retention.suunto": "<strong>Conexión con Suunto:</strong> hasta que la elimines en la página Cuenta de Suunto o elimines tu cuenta. Entonces los tokens se eliminan de este servidor, y {app} pide a Suunto que ponga fin a la conexión. Un código de un solo uso que se usa al conectarse se elimina cuando se usa, y los códigos caducados se eliminan con regularidad.",
  "legal.privacy.retention.request": "<strong>Solicitudes de acceso:</strong> se eliminan de inmediato si se rechazan, y a los 30 días si nadie responde. El mensaje al administrador se elimina cuando se aprueba la solicitud. Un correo de notificación sobre una solicitud se queda en el buzón del administrador hasta que este lo elimine.",
  "legal.privacy.retention.sessions": "<strong>Sesiones del navegador:</strong> hasta que cierres sesión, como máximo {lifetime}.",
  "legal.privacy.retention.tokens": "<strong>Conexiones de apps:</strong> un token de acceso es válido durante {access}. Una conexión termina cuando la revocas, o tras {refresh} sin usarse. Cada token se elimina un día después de caducar.",
  "legal.privacy.retention.clients": "<strong>Registros de apps</strong> (no vinculados a tu cuenta): se eliminan al cabo de un día si nadie ha aprobado la app; si no, cuando ya ninguna conexión los usa, y como pronto 90 días después de la primera aprobación.",
  "legal.privacy.retention.activity": "<strong>Registro de actividad:</strong> 90 días.",
  "legal.privacy.retention.invites": "<strong>Invitaciones:</strong> hasta que el administrador elimine la invitación. Eliminar tu cuenta no borra tu dirección de correo electrónico de una invitación que hayas usado, así que escríbenos y la eliminaremos.",
  "legal.privacy.retention.log": "<strong>Registro del servidor:</strong> se guarda en archivos de tamaño limitado (50 MB en total). Las entradas más antiguas se sobrescriben.",
  "legal.privacy.retention.backups": "<strong>Copias de seguridad:</strong> se hace una copia de la base de datos antes de cada actualización o reversión del software, o de forma manual, y solo se conservan las 10 copias más recientes. Se guardan en el mismo servidor. Los datos que eliminas pueden permanecer en estas copias hasta que se reemplacen. Tu conexión con Suunto sigue cifrada en ellas.",

  "legal.privacy.recipients.title": "Quién recibe tus datos",
  "legal.privacy.recipients.lead": "No vendemos tus datos, no los compartimos con anunciantes y no los usamos para entrenar modelos de IA. Tus datos solo llegan a:",
  "legal.privacy.recipients.suunto": "<strong>Suunto.</strong> Para acceder a tus datos, {app} envía a Suunto las solicitudes que haces tú o tus apps de IA, con tu token de acceso y la clave de este servicio: leer entrenamientos, archivos FIT, actividad diaria, frecuencia cardíaca, sueño, recuperación, rutas y puntos de interés, y añadir rutas y puntos de interés. Suunto Oy es responsable independiente de los datos de tu cuenta de Suunto y los trata según su propia política de privacidad.",
  "legal.privacy.recipients.apps": "<strong>Las apps de IA que conectas.</strong> Cada app que apruebas, por ejemplo Claude de Anthropic o ChatGPT de OpenAI, recibe los datos de entrenamientos, salud, rutas y puntos de interés que pide y los resultados de sus acciones. Lo que la app hace con estos datos se rige por sus propias condiciones y su política de privacidad, y por tus ajustes en esa app. No tenemos ningún control sobre ello.",
  "legal.privacy.recipients.hosting": "<strong>Nuestro proveedor de alojamiento.</strong> {app} funciona en un servidor alquilado a un proveedor de alojamiento en la nube. El proveedor guarda los datos por encargo nuestro y no puede usarlos para sus propios fines.",
  "legal.privacy.recipients.admin": "<strong>El administrador.</strong> El administrador de {app} ve una lista de cuentas con la dirección de correo electrónico, el estado, si Suunto está conectado, el último inicio de sesión, el número de llamadas a herramientas de los últimos 7 días y los mensajes de las solicitudes de acceso. Las páginas de administración nunca muestran tus tokens de Suunto ni tus datos de Suunto. Si este servicio tiene configurado un servidor de correo y el administrador no ha desactivado las notificaciones por correo electrónico sobre las solicitudes de acceso (están activadas de forma predeterminada), también recibe por correo la dirección de correo electrónico y el mensaje de cada solicitud nueva, enviados a través del servidor de correo de este servicio.",
  "legal.privacy.recipients.authorities": "<strong>Autoridades</strong>, solo cuando la ley lo exige.",
  "legal.privacy.recipients.noTracking": "No usamos servicios de análisis, publicidad ni seguimiento, y estas páginas no cargan nada de otros sitios web.",

  "legal.privacy.transfers.title": "Datos en otros países",
  "legal.privacy.transfers.text": "Los datos que guarda {app} se conservan en su servidor y en sus copias de seguridad, en el proveedor de alojamiento. Suunto y las apps de IA que conectas pueden tratar tus datos en otros países, entre ellos Estados Unidos. Esto ocurre porque eliges usar sus servicios. Si solicitas acceso, es posible que tu dirección de correo electrónico y tu mensaje se envíen por correo al administrador, así que el proveedor del servidor de correo también puede tratarlos. Sus políticas de privacidad explican dónde tratan los datos y cómo los protegen.",

  "legal.privacy.security.title": "Cómo protegemos tus datos",
  "legal.privacy.security.encryption": "Tu conexión con Suunto, con sus tokens, se cifra con AES-256-GCM. Las contraseñas de {app} se guardan como hash con scrypt, y los códigos de sesión, los tokens y los códigos de invitación solo se guardan como hashes.",
  "legal.privacy.security.transport": "Las conexiones con {app} usan HTTPS, y las conexiones con Suunto también usan HTTPS.",
  "legal.privacy.security.web": "Los formularios están protegidos contra solicitudes falsificadas, las páginas funcionan con una política de seguridad de contenido estricta y los intentos repetidos están limitados.",
  "legal.privacy.security.server": "El servicio funciona en un contenedor aislado y sin permisos adicionales, y su sistema de archivos es de solo lectura, salvo su carpeta de datos.",
  "legal.privacy.security.token": "Como {app} se comunica con Suunto en tu nombre, el servidor tiene la clave de cifrado y puede descifrar tus tokens de Suunto. Por eso nunca te pide tu contraseña de Suunto, solo los tokens, que puedes eliminar en cualquier momento en la página <a href=\"/account\">Cuenta de Suunto</a>.",
  "legal.privacy.security.report": "Ningún sistema es totalmente seguro. Si encuentras un problema de seguridad, comunícalo a {email}. Te responderemos lo antes posible y corregiremos los problemas confirmados.",

  "legal.privacy.rights.title": "Tus derechos",
  "legal.privacy.rights.lead": "Tienes derecho a saber qué datos tenemos sobre ti, a obtener una copia, a que se corrijan o se eliminen, a limitar su uso u oponerte a él, y a llevártelos a otro servicio. Buena parte de esto puedes hacerlo por tu cuenta:",
  "legal.privacy.rights.suunto": "Cambia tu conexión con Suunto, o elimínala, en la página <a href=\"/account\">Cuenta de Suunto</a>. Para los datos que hay en tu cuenta de Suunto, usa la Suunto App o dirígete a Suunto.",
  "legal.privacy.rights.apps": "Consulta tus apps conectadas y el registro de actividad, y revoca el acceso de cualquier app, en la página <a href=\"/account/connections\">Apps conectadas</a>.",
  "legal.privacy.rights.delete": "Elimina tu cuenta en la página <a href=\"/account/security\">Seguridad</a>. Así se eliminan a la vez tu cuenta, tu conexión con Suunto, tus sesiones, tus conexiones de apps y tu registro de actividad. Lo que quede en las copias de seguridad desaparece a medida que estas se reemplazan. Tus datos en Suunto no se modifican.",
  "legal.privacy.rights.email": "Para todo lo demás, escribe a {email}. Respondemos en un plazo de 30 días.",
  "legal.privacy.rights.complaint": "También puedes presentar una reclamación ante una autoridad de protección de datos: en Suiza, el Comisionado Federal de Protección de Datos y de Información (FDPIC); en la UE, la autoridad del país donde vives o trabajas.",

  "legal.privacy.cookies.title": "Cookies",
  "legal.privacy.cookies.lead": "{app} solo usa las cookies que necesita para funcionar. No hay cookies de seguimiento ni de publicidad. Las cookies solo se envían a este sitio, los scripts de la página no pueden leerlas y no se comparten con nadie.",
  "legal.privacy.cookies.session": "{name} mantiene tu sesión iniciada. Se elimina cuando cierras sesión y dura como máximo {lifetime}.",
  "legal.privacy.cookies.pre": "{name} protege los formularios de inicio de sesión y de registro contra solicitudes falsificadas. Dura {lifetime}.",
  "legal.privacy.cookies.lang": "{name} recuerda el idioma que elegiste en el menú de idiomas. Dura {lifetime}.",

  "legal.privacy.children.title": "Menores",
  "legal.privacy.children.text": "{app} no está pensado para menores. Debes tener al menos 16 años para usarlo. Si crees que un menor ha creado una cuenta, escríbenos y la eliminaremos.",

  "legal.privacy.changes.title": "Cambios en esta política",
  "legal.privacy.changes.text": "Actualizamos esta política cuando cambian el servicio o la ley. La fecha de arriba indica el último cambio. Si un cambio afecta a cómo se usan tus datos, lo indicaremos en este sitio.",

  "legal.terms.title": "Condiciones de uso",
  "legal.terms.intro": "Estas condiciones se aplican a {app} en {site}. Léelas antes de crear una cuenta. Al usar el servicio, las aceptas.",

  "legal.terms.service.title": "El servicio",
  "legal.terms.service.text": "{app} conecta las apps de IA con tu cuenta de Suunto a través de la Suunto Cloud API oficial. Es un proyecto de código abierto gratuito e independiente, gestionado por {operator}, Lugano, Suiza. No hay ningún plan de pago ni publicidad.",

  "legal.terms.affiliation.title": "Sin vínculo con Suunto ni con proveedores de IA",
  "legal.terms.affiliation.text": "{app} es un proyecto de código abierto independiente. Usa la Suunto Cloud API oficial, pero no ha sido creado por Suunto, Anthropic, OpenAI, Google ni ningún otro proveedor de IA, ni está vinculado a ellos ni cuenta con su respaldo. Suunto es una marca registrada de Suunto Oy. {app} no usa ningún logotipo ni material gráfico de Suunto. Los demás nombres de productos pertenecen a sus respectivos propietarios.",

  "legal.terms.account.title": "Tu cuenta",
  "legal.terms.account.age": "Debes tener al menos 16 años.",
  "legal.terms.account.secret": "Usa una dirección de correo electrónico que sea tuya y mantén en secreto tu contraseña de {app}. No compartas tu cuenta. Eres responsable de lo que ocurra con ella.",
  "legal.terms.account.approval": "Puede que las cuentas nuevas necesiten la aprobación del administrador o un código de invitación. Nadie tiene derecho a obtener una cuenta.",

  "legal.terms.suunto.title": "Tu cuenta de Suunto",
  "legal.terms.suunto.text": "Conectas tu propia cuenta de Suunto en la página de inicio de sesión de Suunto. Conecta solo una cuenta de Suunto que sea tuya. Las condiciones de <a href=\"{url}\">Suunto</a> te siguen siendo aplicables. {app} depende de la Suunto Cloud API: si Suunto la cambia o la limita, o pone fin al acceso de este servicio, {app} puede dejar de funcionar o funcionar de otra manera.",

  "legal.terms.health.title": "No es consejo médico",
  "legal.terms.health.text": "La frecuencia cardíaca, el sueño, la recuperación, el entrenamiento y otros valores vienen de tu reloj y de la Suunto App. {app} y tus apps de IA solo los transmiten y los explican, y las apps de IA pueden equivocarse. No son consejo médico y no sustituyen a un médico. No tomes decisiones sobre tu salud basándote solo en ellos.",

  "legal.terms.safety.title": "No sirve para la navegación ni para decisiones de seguridad",
  "legal.terms.safety.text": "Las rutas, los puntos de interés y las ubicaciones pueden ser incorrectos, estar desactualizados o no ser seguros, sobre todo cuando los ha creado una app de IA. No confíes en {app} ni en tus apps de IA para la navegación ni para decisiones de seguridad. Comprueba cada ruta en un mapa antes de seguirla y ten en cuenta las condiciones sobre el terreno.",

  "legal.terms.ai.title": "Lo que hacen tus apps de IA",
  "legal.terms.ai.access": "Las apps de IA que conectas actúan en tu nombre. Pueden leer tus entrenamientos, tu actividad diaria, tu frecuencia cardíaca, tu sueño, tu recuperación, tus rutas y tus puntos de interés y, a menos que actives el modo de solo lectura, añadir rutas y puntos de interés a tu Suunto App. Las apps de IA cometen errores, por ejemplo en una distancia, una fecha, una unidad o un lugar.",
  "legal.terms.ai.responsible": "Tú decides qué apps conectas y qué les pides que hagan, y eres responsable del resultado. Las rutas y los puntos de interés que tus apps de IA añaden a la Suunto App son responsabilidad tuya: revísalos en la Suunto App antes de sincronizarlos con tu reloj o de usarlos, y elimina los que no quieras. Si quieres que tus apps solo lean, activa el modo de solo lectura en la página <a href=\"/account\">Cuenta de Suunto</a>. Puedes revocar el acceso de una app en cualquier momento en la página <a href=\"/account/connections\">Apps conectadas</a>.",

  "legal.terms.use.title": "Uso aceptable",
  "legal.terms.use.lead": "Cuando uses {app}, no debes:",
  "legal.terms.use.content": "añadir rutas o puntos de interés que infrinjan la ley o los derechos de otras personas",
  "legal.terms.use.law": "infringir la ley, las condiciones de Suunto o los derechos de otras personas",
  "legal.terms.use.others": "acceder a cuentas o datos que no tienes permiso para usar",
  "legal.terms.use.harm": "sobrecargar o atacar el servicio o la Suunto Cloud API, ni eludir sus límites o su seguridad",
  "legal.terms.use.report": "Si encuentras un problema de seguridad, comunícalo a {email} en lugar de aprovecharlo.",

  "legal.terms.availability.title": "Gratuito y sin garantías",
  "legal.terms.availability.text": "El servicio es gratuito y se ofrece tal cual. Hacemos todo lo posible para que siga funcionando y sea seguro, pero no podemos prometer que esté siempre disponible, que no tenga errores ni que sea adecuado para lo que necesitas. Podemos modificar, limitar o dejar de ofrecer el servicio, o partes de él, en cualquier momento. Si dejamos de ofrecerlo, intentaremos anunciarlo con antelación en este sitio.",

  "legal.terms.admin.title": "Qué puede hacer el administrador",
  "legal.terms.admin.text": "El administrador puede aprobar o rechazar solicitudes de acceso, desactivar, activar y eliminar cuentas, restablecer contraseñas, terminar conexiones de apps y cambiar los ajustes del servidor, por ejemplo, activar el modo de solo lectura para todos. El administrador lo hace, por ejemplo, cuando se incumplen estas condiciones, cuando parece que una cuenta está en manos equivocadas o para proteger el servicio y a sus usuarios.",

  "legal.terms.end.title": "Dejar de usar el servicio",
  "legal.terms.end.text": "Puedes dejarlo en cualquier momento: elimina tu cuenta en la página <a href=\"/account/security\">Seguridad</a> y tus datos se eliminarán como se describe en la <a href=\"/privacy\">política de privacidad</a>. Podemos suspender o eliminar tu cuenta si incumples estas condiciones, o cuando el servicio termine.",

  "legal.terms.liability.title": "Responsabilidad",
  "legal.terms.liability.text": "En la medida en que lo permita la ley, {operator} no es responsable de ningún daño causado por el uso de {app} o por no poder usarlo. Esto incluye los valores erróneos o que faltan, las rutas o los puntos de interés incorrectos o peligrosos, las decisiones sobre tu salud, tu entrenamiento o tu seguridad, y la pérdida de datos. Esto no limita la responsabilidad por dolo o negligencia grave, ni ninguna otra responsabilidad que la ley no permita excluir.",

  "legal.terms.privacy.title": "Privacidad",
  "legal.terms.privacy.text": "La <a href=\"/privacy\">política de privacidad</a> explica qué datos guarda {app}, por qué y durante cuánto tiempo.",

  "legal.terms.changes.title": "Cambios en estas condiciones",
  "legal.terms.changes.text": "Podemos cambiar estas condiciones, por ejemplo, cuando cambie el servicio. La fecha de arriba indica el último cambio. Si sigues usando {app} después de un cambio, se aplican las nuevas condiciones. Si no estás de acuerdo con ellas, puedes eliminar tu cuenta.",

  "legal.terms.law.title": "Ley aplicable",
  "legal.terms.law.text": "Estas condiciones se rigen por el derecho suizo. Son competentes los tribunales de Suiza, salvo que una norma imperativa disponga otra cosa. Si eres consumidor, conservas la protección de las normas imperativas del país donde vives.",

  "legal.terms.contact.title": "Contacto",
  "legal.terms.contact.text": "¿Tienes preguntas sobre estas condiciones? Escribe a {operator} a la dirección {email}.",
} satisfies Record<keyof typeof en, string>;
