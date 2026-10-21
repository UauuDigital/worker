// Funcions pures del worker: sense BD, sense xarxa, fàcils de provar.

const MINUTS_BACKOFF = [1, 5, 30, 120, 360];
const MS_ENTRE_ENVIAMENTS = 2100; // Microsoft 365: 30/min per bústia
const MAX_INTENTS = 5;
const BLOQUEIG_MINUTS = 5;

// Llista buida = tot permès. Accepta emails exactes o dominis amb @.
function permesPerLlistaBlanca(email, llista) {
  if (!llista || llista.length === 0) return true;
  const e = String(email).trim().toLowerCase();
  return llista.some((entrada) => (entrada.startsWith('@') ? e.endsWith(entrada) : e === entrada));
}

// Permanent només amb 5xx; EAUTH i la xarxa són temporals.
function esErrorPermanent(err) {
  const e = err || {};
  if (e.code === 'EAUTH') return false;
  return typeof e.responseCode === 'number' && e.responseCode >= 500 && e.responseCode < 600;
}

// Minuts d'espera abans del reintent, segons el nombre d'intents ja fets.
function minutsBackoff(intents) {
  const i = Math.max(0, Math.min(intents - 1, MINUTS_BACKOFF.length - 1));
  return MINUTS_BACKOFF[i];
}

function decideixFallit(err, intents) {
  return esErrorPermanent(err) || intents >= MAX_INTENTS;
}

// Si l'automatització limita estats i el lead no hi és, no s'envia.
function estatLeadPermet(estatsPermesos, estatLead) {
  if (!Array.isArray(estatsPermesos) || estatsPermesos.length === 0) return true;
  if (!estatLead) return true;
  return estatsPermesos.includes(estatLead);
}

// Semàfor global. Entrada: dades ja calculades; sortida: nivell + motius.
// Vermell: SMTP caigut, fallits recents, motor mut, o cua encallada (>30 min).
// Taronja: pendents amb retard (>10 min), reintents en curs o llista blanca activa.
function calculaSemafor(d) {
  const vermell = [];
  const taronja = [];
  const limitBatecMin = d.mode === 'tick' ? 15 : 2;

  if (d.verifyOk === false) vermell.push('La darrera comprovació del servidor de correu ha fallat.');
  if (d.fallits24h > 0) vermell.push(`Hi ha ${d.fallits24h} correu(s) fallit(s) en les últimes 24 hores.`);
  if (d.minutsDesDelBatec === null) vermell.push('El motor encara no ha donat cap senyal de vida.');
  else if (d.minutsDesDelBatec > limitBatecMin) vermell.push(`El motor no dona senyals de vida des de fa ${Math.floor(d.minutsDesDelBatec)} minuts.`);
  if (d.minutsPendentMesAntic !== null && d.minutsPendentMesAntic > 30) vermell.push(`Hi ha un correu esperant des de fa ${Math.floor(d.minutsPendentMesAntic)} minuts.`);

  if (d.minutsPendentMesAntic !== null && d.minutsPendentMesAntic > 10 && d.minutsPendentMesAntic <= 30) taronja.push(`Hi ha un correu esperant des de fa ${Math.floor(d.minutsPendentMesAntic)} minuts.`);
  if (d.reintentant > 0) taronja.push(`${d.reintentant} correu(s) s'estan reintentant després d'un error temporal.`);
  if (d.llistaBlancaActiva) taronja.push("La llista blanca és activa: només s'envia als destinataris permesos.");
  if (d.verifyOk === null) taronja.push("Encara no s'ha comprovat el servidor de correu.");

  if (vermell.length) return { nivell: 'vermell', motius: vermell.concat(taronja) };
  if (taronja.length) return { nivell: 'taronja', motius: taronja };
  return { nivell: 'verd', motius: [] };
}

module.exports = {
  MINUTS_BACKOFF, MS_ENTRE_ENVIAMENTS, MAX_INTENTS, BLOQUEIG_MINUTS,
  permesPerLlistaBlanca, esErrorPermanent, minutsBackoff, decideixFallit, estatLeadPermet, calculaSemafor,
};
