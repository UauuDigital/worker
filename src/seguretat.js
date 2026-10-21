// Seguretat del panell: HTTPS, capçaleres, sessió amb cookie signada i límits de peticions.
const crypto = require('node:crypto');
const rateLimit = require('express-rate-limit');
const { error } = require('./missatges-error');

const DURADA_SESSIO_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'uauu_sessio';

// Comparació en temps constant (es comparen els hashes perquè tinguin la mateixa mida).
function iguals(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const base64url = (b) => Buffer.from(b).toString('base64url');

function creaSeguretat(config, log) {
  // Clau derivada de les credencials: canviar la contrasenya invalida totes les sessions.
  const clau = crypto.createHash('sha256').update(`sessio|${config.panell.usuari}|${config.panell.contrasenya}`).digest();
  const signa = (text) => crypto.createHmac('sha256', clau).update(text).digest('base64url');

  function creaToken(ara = Date.now()) {
    const exp = String(ara + DURADA_SESSIO_MS);
    return `${base64url(exp)}.${signa(exp)}`;
  }

  function tokenValid(token, ara = Date.now()) {
    if (typeof token !== 'string') return false;
    const [e, sig] = token.split('.');
    if (!e || !sig) return false;
    const exp = Buffer.from(e, 'base64url').toString('utf8');
    if (!/^\d+$/.test(exp)) return false;
    return iguals(sig, signa(exp)) && Number(exp) > ara;
  }

  function llegeixCookie(req) {
    const brut = req.headers.cookie || '';
    for (const part of brut.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === COOKIE) return v.join('=');
    }
    return null;
  }

  const resposta = (res, status, codi) => res.status(status).json({ ok: false, ...error(codi) });

  const capcaleres = (req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
      + "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  };

  const exigeixHttps = (req, res, next) => {
    if (!config.exigeixHttps || req.secure) return next();
    return resposta(res, 403, 'HTTPS_OBLIGATORI');
  };

  const requereixSessio = (req, res, next) => {
    if (tokenValid(llegeixCookie(req))) return next();
    return resposta(res, 401, 'NO_AUTENTICAT');
  };

  // Defensa en profunditat contra CSRF (la cookie ja és SameSite=Strict).
  const comprovaOrigen = (req, res, next) => {
    const origen = req.headers.origin;
    if (origen) {
      let hostOrigen;
      try { hostOrigen = new URL(origen).host; } catch { return resposta(res, 403, 'ORIGEN_NO_VALID'); }
      if (hostOrigen !== req.headers.host) return resposta(res, 403, 'ORIGEN_NO_VALID');
    }
    if (!req.is('application/json')) return resposta(res, 400, 'PETICIO_NO_VALIDA');
    next();
  };

  const creaLimitador = (opcions, codi) => rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => resposta(res, 429, codi),
    ...opcions,
  });

  // Només compten els intents fallits.
  const limitLogin = creaLimitador({ windowMs: 15 * 60_000, limit: 8, skipSuccessfulRequests: true }, 'MASSA_INTENTS');
  const limitTick = creaLimitador({ windowMs: 15 * 60_000, limit: 20, skipSuccessfulRequests: true }, 'MASSA_INTENTS');
  const limitApi = creaLimitador({ windowMs: 60_000, limit: 120 }, 'MASSA_INTENTS');
  const limitComprovaSmtp = creaLimitador({ windowMs: 15_000, limit: 1 }, 'MASSA_INTENTS');

  function iniciaSessio(req, res) {
    const maxAge = Math.floor(DURADA_SESSIO_MS / 1000);
    const secure = req.secure ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE}=${creaToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`);
  }

  function tancaSessio(req, res) {
    const secure = req.secure ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
  }

  const credencialsValides = (usuari, contrasenya) => {
    // Es comproven sempre les dues per no revelar quina falla.
    const a = iguals(usuari, config.panell.usuari);
    const b = iguals(contrasenya, config.panell.contrasenya);
    return a && b;
  };

  return {
    iguals, creaToken, tokenValid, capcaleres, exigeixHttps, requereixSessio, comprovaOrigen, resposta,
    limitLogin, limitTick, limitApi, limitComprovaSmtp, iniciaSessio, tancaSessio, credencialsValides,
  };
}

module.exports = { creaSeguretat, iguals };
