// Tots els missatges d'error que veu l'usuari, en català i en un sol lloc.
// L'error tècnic original només va als logs del servidor.

const MISSATGES = {
  NO_AUTENTICAT: "La sessió ha caducat. Torna a iniciar sessió.",
  CREDENCIALS: "Usuari o contrasenya incorrectes.",
  MASSA_INTENTS: "Massa intents d'accés. Espera uns minuts i torna-ho a provar.",
  TICK_NO_AUTORITZAT: "No tens permís per fer aquesta acció.",
  TICK_MODE_BUCLE: "El worker està en mode bucle: no cal cridar aquest punt.",
  HTTPS_OBLIGATORI: "Aquest panell només es pot obrir per una connexió segura (HTTPS).",
  ORIGEN_NO_VALID: "La petició s'ha rebutjat perquè no ve del propi panell.",
  PETICIO_NO_VALIDA: "La petició no és vàlida.",
  BD_INACCESSIBLE: "No s'ha pogut connectar amb la base de dades. Torna-ho a provar d'aquí a una estona.",
  SMTP_INACCESSIBLE: "No s'ha pogut connectar amb el servidor de correu.",
  ERROR_INTERN: "Ha passat un error inesperat al servidor. Ja s'ha registrat; torna-ho a provar.",
  NO_TROBAT: "Aquesta adreça no existeix.",
};

const e = (codi) => ({ codi, missatge: MISSATGES[codi] || MISSATGES.ERROR_INTERN });

// Tradueix l'error tècnic desat a `darrerError` (text de nodemailer/SMTP).
// L'ordre importa: la primera regla que coincideix guanya.
const REGLES_SMTP = [
  [/EAUTH|Invalid login|\b535\b|authentication (unsuccessful|failed)/i, "El servidor de correu ha rebutjat l'usuari o la contrasenya."],
  [/ETIMEDOUT|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|Connection timeout|Greeting never received/i, "No s'ha pogut connectar amb el servidor de correu (sense resposta o bloquejat)."],
  [/ENOTFOUND|EDNS|getaddrinfo/i, "No s'ha trobat l'adreça del servidor de correu."],
  [/STARTTLS|\bTLS\b|\bSSL\b|certificate/i, "Ha fallat la connexió segura amb el servidor de correu."],
  [/5\.1\.1|User unknown|mailbox unavailable|does not exist|no such user|Recipient address rejected/i, "L'adreça del destinatari no existeix o ha rebutjat el correu."],
  [/5\.2\.2|\b552\b|quota|too large/i, "El destinatari té la bústia plena o el missatge és massa gran."],
  [/5\.7\.\d|relay|not allowed|Access denied|blocked|spam/i, "El servidor de correu ha rebutjat l'enviament per política de seguretat o sospita de brossa."],
  [/4\.7\.\d|\b421\b|\b450\b|\b451\b|\b452\b|throttl|too many|rate/i, "El servidor de correu ha limitat temporalment els enviaments. Es reintentarà."],
];

function tradueixErrorSmtp(textTecnic) {
  if (!textTecnic) return null;
  for (const [patro, msg] of REGLES_SMTP) if (patro.test(textTecnic)) return msg;
  return "L'enviament ha fallat per un motiu que el servidor de correu no ha detallat. Consulta els logs del servidor.";
}

// Per a un error capturat a l'API (no per al text desat a la cua).
function classificaErrorApi(err) {
  const c = err && err.code;
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', '57P01', '08006', '08001', '28P01'].includes(c)) return e('BD_INACCESSIBLE');
  return e('ERROR_INTERN');
}

module.exports = { MISSATGES, error: e, tradueixErrorSmtp, classificaErrorApi };
