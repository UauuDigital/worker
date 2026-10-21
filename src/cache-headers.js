/*
 * cache-headers.js — Política de caché comuna per als servidors Express de UAUU.
 *
 *  - HTML, JS, CSS, JSON, webmanifest: "no-cache, must-revalidate"
 *      El navegador guarda el fitxer però pregunta SEMPRE al servidor si ha
 *      canviat (resposta 304 si no). Així un deploy es veu en fer F5, sense
 *      Ctrl+Shift+R.
 *  - Imatges, fonts, vídeos: "public, max-age=604800" (7 dies).
 *  - API: "no-store" (no es guarda mai).
 *  - /version.json: empremta del contingut de public/, per a l'avís de versió
 *    nova (uauu-update-check.js).
 *
 * La còpia mestra és a Uauu/_shared-assets/cache/.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REVALIDA = /\.(html?|js|mjs|css|json|webmanifest|map|txt|xml)$/i;
const LLARG = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mp3|pdf)$/i;

const REVALIDA_VALOR = 'no-cache, must-revalidate';
const LLARG_VALOR = 'public, max-age=604800';

/** Per a l'opció `setHeaders` d'express.static. */
function setStaticHeaders(res, filePath) {
  if (LLARG.test(filePath)) res.setHeader('Cache-Control', LLARG_VALOR);
  else res.setHeader('Cache-Control', REVALIDA_VALOR); // html/js/css/json i qualsevol altre
}

/** Opcions recomanades per a express.static (es poden combinar amb altres). */
function staticOptions(extra) {
  return Object.assign({ etag: true, lastModified: true, setHeaders: setStaticHeaders }, extra || {});
}

/** Middleware: respostes que no s'han de guardar mai (API, webhooks...). */
function noStore(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/** Middleware: resposta dinàmica que es pot guardar però cal revalidar sempre. */
function revalidate(_req, res, next) {
  res.setHeader('Cache-Control', REVALIDA_VALOR);
  next();
}

/** Empremta (hash) de tots els fitxers d'una carpeta, calculada un sol cop. */
function fingerprint(dir) {
  const hash = crypto.createHash('sha256');
  (function recorre(actual) {
    let entrades;
    try { entrades = fs.readdirSync(actual, { withFileTypes: true }); } catch { return; }
    entrades.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entrades) {
      const ple = path.join(actual, e.name);
      if (e.isDirectory()) recorre(ple);
      else if (e.isFile()) {
        hash.update(path.relative(dir, ple).split(path.sep).join('/'));
        hash.update(fs.readFileSync(ple));
      }
    }
  })(dir);
  return hash.digest('hex').slice(0, 12);
}

/**
 * Handler per a GET /version.json. L'empremta es calcula en arrencar: només
 * canvia si canvien els fitxers de public/ (un reinici sense canvis no fa
 * saltar l'avís). Si hi ha la variable d'entorn APP_VERSION, té prioritat.
 */
function versionHandler(publicDir) {
  const version = process.env.APP_VERSION || fingerprint(publicDir);
  return (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ version });
  };
}

module.exports = { setStaticHeaders, staticOptions, noStore, revalidate, fingerprint, versionHandler };
