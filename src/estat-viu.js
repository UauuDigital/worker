// Estat viu del procés: en memòria i, amb millor esforç, en un fitxer JSON local.
// Si el sistema de fitxers no és escrivible, s'ignora sense petar.
const fs = require('node:fs');
const path = require('node:path');

const MAX_ERRORS = 20;
const MS_ENTRE_DESATS = 10_000;

function creaEstat({ fitxer, ara = Date.now } = {}) {
  const s = {
    arrencatAt: ara(),
    ultimBatec: null,
    ultimVerify: { ok: null, at: null, missatge: null },
    ultimResultat: null, // { tipus, at }
    errorsRecents: [], // { at, missatge } (ja traduïts)
  };
  let ultimDesat = 0;

  // Recupera el que sobrevisqui a un reinici (el temps en marxa NO es recupera).
  if (fitxer) {
    try {
      const d = JSON.parse(fs.readFileSync(fitxer, 'utf8'));
      if (d.ultimBatec) s.ultimBatec = d.ultimBatec;
      if (d.ultimVerify) s.ultimVerify = d.ultimVerify;
      if (d.ultimResultat) s.ultimResultat = d.ultimResultat;
      if (Array.isArray(d.errorsRecents)) s.errorsRecents = d.errorsRecents.slice(0, MAX_ERRORS);
    } catch { /* fitxer inexistent o il·legible: es comença net */ }
  }

  function desa(forca = false) {
    if (!fitxer) return;
    if (!forca && ara() - ultimDesat < MS_ENTRE_DESATS) return;
    ultimDesat = ara();
    try {
      fs.mkdirSync(path.dirname(fitxer), { recursive: true });
      fs.writeFileSync(fitxer, JSON.stringify({
        ultimBatec: s.ultimBatec, ultimVerify: s.ultimVerify, ultimResultat: s.ultimResultat, errorsRecents: s.errorsRecents,
      }));
    } catch { /* sistema de fitxers de només lectura: es treballa només en memòria */ }
  }

  return {
    batec() { s.ultimBatec = ara(); desa(); },
    posaVerify(ok, missatge = null) { s.ultimVerify = { ok, at: ara(), missatge }; desa(true); },
    resultat(tipus) { s.ultimResultat = { tipus, at: ara() }; desa(); },
    afegeixError(missatge) {
      s.errorsRecents.unshift({ at: ara(), missatge });
      s.errorsRecents.length = Math.min(s.errorsRecents.length, MAX_ERRORS);
      desa(true);
    },
    instantani: () => JSON.parse(JSON.stringify(s)),
    ara,
  };
}

module.exports = { creaEstat };
