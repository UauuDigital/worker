// Lectura i validació de l'entorn. Mai es mostra el VALOR d'una variable,
// només el seu nom i què en falla.

const os = require('node:os');

const OBLIGATORIES = [
  'DATABASE_URL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS',
  'CORREU_REMITENT_EMAIL', 'PANELL_USUARI', 'PANELL_CONTRASENYA',
];

// Treu paràmetres propis de Prisma (pgbouncer, connection_limit...) que `pg` no entén.
function netejaUrlBd(url) {
  const u = new URL(url);
  for (const p of ['pgbouncer', 'connection_limit', 'pool_timeout', 'schema']) u.searchParams.delete(p);
  return u.toString();
}

function enter(valor, defecte) {
  if (valor === undefined || valor === '') return defecte;
  return Number(valor);
}

// Retorna { config } o { errors: [missatges en català] }.
function carregaConfig(env) {
  const errors = [];
  for (const nom of OBLIGATORIES) {
    if (!env[nom]) errors.push(`Falta la variable d'entorn ${nom}.`);
  }

  const mode = (env.MODE_WORKER || 'bucle').toLowerCase();
  if (!['bucle', 'tick'].includes(mode)) errors.push('MODE_WORKER ha de ser «bucle» o «tick».');
  if (mode === 'tick' && !env.TICK_SECRET) errors.push('Falta TICK_SECRET (obligatori en mode tick).');
  if (env.TICK_SECRET && env.TICK_SECRET.length < 16) errors.push('TICK_SECRET és massa curt (mínim 16 caràcters).');

  const port = enter(env.PORT, 3000);
  const smtpPort = enter(env.SMTP_PORT, 587);
  const tickMax = enter(env.TICK_MAX_SEGONS, 25);
  for (const [nom, v] of [['PORT', port], ['SMTP_PORT', smtpPort], ['TICK_MAX_SEGONS', tickMax]]) {
    if (!Number.isInteger(v) || v <= 0) errors.push(`${nom} ha de ser un nombre enter positiu.`);
  }

  let urlBd = null;
  if (env.DATABASE_URL) {
    try { urlBd = netejaUrlBd(env.DATABASE_URL); } catch { errors.push('DATABASE_URL no té un format de URL vàlid.'); }
  }
  if (env.PANELL_CONTRASENYA && env.PANELL_CONTRASENYA.length < 12) errors.push('PANELL_CONTRASENYA és massa curta (mínim 12 caràcters).');

  if (errors.length) return { errors };

  return {
    config: {
      urlBd,
      smtp: { host: env.SMTP_HOST, port: smtpPort, user: env.SMTP_USER, pass: env.SMTP_PASS },
      remitent: { email: env.CORREU_REMITENT_EMAIL, nom: env.CORREU_REMITENT_NOM || 'UAUU weddings & events' },
      llistaBlanca: (env.CORREU_LLISTA_BLANCA || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      mode,
      tickSecret: env.TICK_SECRET || null,
      tickMaxSegons: tickMax,
      panell: { usuari: env.PANELL_USUARI, contrasenya: env.PANELL_CONTRASENYA },
      // Identificador d'aquest worker: apareix a l'auditoria, al Message-ID i al panell.
      workerId: (env.WORKER_ID || os.hostname() || 'worker').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32),
      port,
      trustProxy: enter(env.TRUST_PROXY, 1),
      // Per defecte s'exigeix HTTPS; en local es pot desactivar amb EXIGEIX_HTTPS=false.
      exigeixHttps: env.EXIGEIX_HTTPS !== 'false',
      fitxerEstat: env.FITXER_ESTAT || 'data/estat.json',
    },
  };
}

// Valors que no han d'aparèixer mai en cap log ni resposta.
function secrets(env) {
  return ['SMTP_PASS', 'DATABASE_URL', 'PANELL_CONTRASENYA', 'TICK_SECRET']
    .map((n) => env[n]).filter((v) => v && v.length >= 4);
}

module.exports = { carregaConfig, netejaUrlBd, secrets };
