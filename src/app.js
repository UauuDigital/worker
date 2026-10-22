// Aplicació Express: rutes públiques mínimes, API protegida i fitxers del panell.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cacheHeaders = require('./cache-headers');
const { classificaErrorApi } = require('./missatges-error');

const PUBLIC = path.join(__dirname, '..', 'public');

function creaApp({ config, seguretat, estadistiques, motor, log }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(seguretat.capcaleres);

  // Públic i mínim, per a monitors externs.
  app.get('/salut', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ ok: true }); });

  app.use(seguretat.exigeixHttps);

  // Pàgina única: la versió (empremta dels fitxers de public/) s'injecta als enllaços
  // de CSS/JS perquè cada desplegament els faci nous (cache-busting).
  // Es recalcula com a màxim cada 5 s: així un Pull a Plesk és visible sense reiniciar l'aplicació
  // (si l'HTML quedés en memòria, serviria una pàgina vella amb JS nou).
  let html = '';
  let calculatA = 0;
  const paginaActual = () => {
    if (!html || Date.now() - calculatA > 5000) {
      const versio = process.env.APP_VERSION || cacheHeaders.fingerprint(PUBLIC);
      html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8').replaceAll('__VERSIO__', versio);
      calculatA = Date.now();
    }
    return html;
  };
  const serveixPagina = (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.type('html').send(paginaActual());
  };
  app.get(['/', '/index.html'], serveixPagina);
  app.get('/version.json', cacheHeaders.versionHandler(PUBLIC));
  app.use(express.static(PUBLIC, cacheHeaders.staticOptions({ index: false })));

  // ── API ───────────────────────────────────────────────────────────────────
  const api = express.Router();
  api.use(cacheHeaders.noStore);
  api.use(express.json({ limit: '2kb' }));

  api.post('/login', seguretat.limitLogin, seguretat.comprovaOrigen, (req, res) => {
    const { usuari, contrasenya } = req.body || {};
    if (typeof usuari !== 'string' || typeof contrasenya !== 'string' || !seguretat.credencialsValides(usuari, contrasenya)) {
      log.avis(`Intent d'accés fallit al panell des de ${req.ip}`);
      return seguretat.resposta(res, 401, 'CREDENCIALS');
    }
    seguretat.iniciaSessio(req, res);
    return res.json({ ok: true });
  });

  api.post('/logout', seguretat.comprovaOrigen, (req, res) => {
    seguretat.tancaSessio(req, res);
    res.json({ ok: true });
  });

  // Tick per a cron extern: el secret va en capçalera, no a la URL.
  api.post('/tick', seguretat.limitTick, async (req, res, next) => {
    try {
      const rebut = req.get('x-tick-secret') || '';
      if (!config.tickSecret || !seguretat.iguals(rebut, config.tickSecret)) {
        log.avis(`Tick rebutjat (secret incorrecte) des de ${req.ip}`);
        return seguretat.resposta(res, 403, 'TICK_NO_AUTORITZAT');
      }
      if (config.mode !== 'tick') return seguretat.resposta(res, 409, 'TICK_MODE_BUCLE');
      const r = await motor.tick(config.tickMaxSegons);
      return res.json({ ok: true, ...r });
    } catch (err) { return next(err); }
  });

  // Tot el que hi ha a partir d'aquí requereix sessió.
  api.use(seguretat.requereixSessio, seguretat.limitApi);

  api.get('/sessio', (req, res) => res.json({ ok: true }));
  api.get('/estat', async (req, res, next) => {
    try { res.json({ ok: true, ...(await estadistiques.resum()) }); } catch (err) { next(err); }
  });
  api.get('/historial', async (req, res, next) => {
    try {
      const { pagina, estat, cerca, finestra } = req.query;
      res.json({ ok: true, ...(await estadistiques.historial({ pagina, estat, cerca, finestra: String(finestra || '') })) });
    } catch (err) { next(err); }
  });
  // Només verify(): no envia res ni toca la cua.
  api.post('/smtp/comprova', seguretat.comprovaOrigen, seguretat.limitComprovaSmtp, async (req, res, next) => {
    try { res.json({ ok: true, ...(await motor.comprovaSmtp()), at: new Date().toISOString() }); } catch (err) { next(err); }
  });

  api.use((req, res) => seguretat.resposta(res, 404, 'NO_TROBAT'));
  app.use('/api', api);

  app.use((req, res) => {
    if (req.accepts('html')) return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>No trobat</title><p>Aquesta adreça no existeix.</p>');
    return seguretat.resposta(res, 404, 'NO_TROBAT');
  });

  // Gestor d'errors: el detall tècnic només al log; l'usuari rep un missatge en català.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    log.error(`Error a ${req.method} ${req.path}`, err);
    if (err && err.type === 'entity.parse.failed') return seguretat.resposta(res, 400, 'PETICIO_NO_VALIDA');
    const e = classificaErrorApi(err);
    return res.status(e.codi === 'BD_INACCESSIBLE' ? 503 : 500).json({ ok: false, ...e });
  });

  return app;
}

module.exports = { creaApp };
