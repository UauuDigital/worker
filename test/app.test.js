// Prova del servidor Express (seguretat, rutes, filtració de secrets) amb BD i cua falses.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregaConfig, secrets } = require('../src/config');
const registre = require('../src/registre');
const { creaSeguretat } = require('../src/seguretat');
const { creaEstadistiques } = require('../src/estadistiques');
const { creaApp } = require('../src/app');
const { creaMotor } = require('../src/motor-cua');
const { creaEstat } = require('../src/estat-viu');
const { creaBdFalsa } = require('./bd-falsa');
const { creaCuaFalsa } = require('./cua-falsa');

const ENTORN = {
  DATABASE_URL: 'postgresql://postgres.abc:CLAU-BD-ultra-secreta@aws-0.pooler.supabase.com:6543/postgres?pgbouncer=true',
  SMTP_HOST: 'smtp.office365.com', SMTP_PORT: '587', SMTP_USER: 'planner@uauu.cat', SMTP_PASS: 'SMTP-pass-ultra-secret',
  CORREU_REMITENT_EMAIL: 'planner@uauu.cat', PANELL_USUARI: 'admin', PANELL_CONTRASENYA: 'Contrasenya-del-panell-1',
  TICK_SECRET: 'secret-del-tick-0123456789',
};

async function arrenca({ entorn = {}, bd = creaBdFalsa(), exigeixHttps = true } = {}) {
  const env = { ...ENTORN, ...entorn };
  registre.configuraSecrets(secrets(env));
  const { config } = carregaConfig({ ...env, EXIGEIX_HTTPS: String(exigeixHttps) });
  const estat = creaEstat();
  estat.batec();
  estat.posaVerify(true);
  const logs = [];
  const log = {
    info: (t) => logs.push(registre.neteja(t)),
    avis: (t, e) => logs.push(registre.neteja(`${t} ${e ? e.message : ''}`)),
    error: (t, e) => logs.push(registre.neteja(`${t} ${e ? e.message : ''}`)),
  };
  const enviador = { verifica: async () => {}, envia: async () => 'id', tanca() {} };
  const motor = creaMotor({ cua: creaCuaFalsa(), enviador, estat, log, config, msEntre: 0 });
  const app = creaApp({ config, log, motor, seguretat: creaSeguretat(config, log), estadistiques: creaEstadistiques(bd, estat, config) });
  const servidor = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const url = `http://127.0.0.1:${servidor.address().port}`;
  const demana = (ruta, opcions = {}) => fetch(url + ruta, {
    redirect: 'manual',
    ...opcions,
    headers: { 'X-Forwarded-Proto': 'https', ...(opcions.headers || {}) },
  });
  const login = async (usuari = 'admin', contrasenya = ENTORN.PANELL_CONTRASENYA) => demana('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuari, contrasenya }),
  });
  return { url, demana, login, logs, env, atura: () => new Promise((r) => servidor.close(r)) };
}

const galeta = (resp) => (resp.headers.get('set-cookie') || '').split(';')[0];

test('/salut és públic i mínim; capçaleres de seguretat a totes les respostes', async () => {
  const s = await arrenca();
  try {
    const r = await s.demana('/salut', { headers: { 'X-Forwarded-Proto': 'http' } });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    assert.match(r.headers.get('x-robots-tag'), /noindex/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(r.headers.get('x-powered-by'), null);
  } finally { await s.atura(); }
});

test('HTTPS obligatori: sense HTTPS, 403 a la pàgina i a l’API; amb proxy HTTPS, passa', async () => {
  const s = await arrenca();
  try {
    const plana = await s.demana('/', { headers: { 'X-Forwarded-Proto': 'http' } });
    assert.equal(plana.status, 403);
    const api = await s.demana('/api/estat', { headers: { 'X-Forwarded-Proto': 'http' } });
    assert.equal(api.status, 403);
    assert.match((await api.json()).missatge, /HTTPS/);
    assert.equal((await s.demana('/')).status, 200);
  } finally { await s.atura(); }
});

test('API sense sessió: 401 amb missatge en català; no revela dades', async () => {
  const s = await arrenca();
  try {
    for (const ruta of ['/api/estat', '/api/historial', '/api/sessio']) {
      const r = await s.demana(ruta);
      assert.equal(r.status, 401, ruta);
      assert.match((await r.json()).missatge, /sessió ha caducat/);
    }
    assert.equal((await s.demana('/api/smtp/comprova', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  } finally { await s.atura(); }
});

test('login: credencials errònies no donen galeta; correctes donen galeta HttpOnly, Secure i SameSite=Strict', async () => {
  const s = await arrenca();
  try {
    const dolent = await s.login('admin', 'no-es-aquesta');
    assert.equal(dolent.status, 401);
    assert.equal(dolent.headers.get('set-cookie'), null);
    assert.match((await dolent.json()).missatge, /incorrectes/);

    const bo = await s.login();
    assert.equal(bo.status, 200);
    const sc = bo.headers.get('set-cookie');
    assert.match(sc, /HttpOnly/);
    assert.match(sc, /SameSite=Strict/);
    assert.match(sc, /Secure/);

    const estat = await s.demana('/api/estat', { headers: { Cookie: galeta(bo) } });
    assert.equal(estat.status, 200);
    const d = await estat.json();
    assert.equal(d.semafor.nivell, 'verd');
    assert.equal(d.targetes.enviatsAvui, 12);
    assert.equal(d.perHora.length, 24);
  } finally { await s.atura(); }
});

test('una galeta manipulada o caducada no val', async () => {
  const s = await arrenca();
  try {
    const bo = await s.login();
    const [exp, sig] = galeta(bo).split('=')[1].split('.');
    const falsa = `uauu_sessio=${Buffer.from('99999999999999').toString('base64url')}.${sig}`;
    assert.equal((await s.demana('/api/estat', { headers: { Cookie: falsa } })).status, 401);
    const { creaSeguretat: crea } = require('../src/seguretat');
    const { config } = carregaConfig({ ...ENTORN });
    const seg = crea(config, {});
    assert.equal(seg.tokenValid(seg.creaToken(Date.now() - 13 * 3_600_000)), false);
    assert.equal(seg.tokenValid(seg.creaToken()), true);
    assert.ok(exp);
  } finally { await s.atura(); }
});

test('límit d’intents al login: bloqueig amb missatge en català', async () => {
  const s = await arrenca();
  try {
    let ultima;
    for (let i = 0; i < 9; i++) ultima = await s.login('admin', 'mala');
    assert.equal(ultima.status, 429);
    assert.match((await ultima.json()).missatge, /Massa intents/);
    assert.equal((await s.login()).status, 429, 'ni amb la contrasenya bona mentre dura el bloqueig');
  } finally { await s.atura(); }
});

test('CSRF: un POST amb Origin d’un altre lloc o sense JSON es rebutja', async () => {
  const s = await arrenca();
  try {
    const bo = await s.login();
    const c = galeta(bo);
    const altreOrigen = await s.demana('/api/smtp/comprova', { method: 'POST', headers: { Cookie: c, Origin: 'https://atacant.exemple', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(altreOrigen.status, 403);
    const senseJson = await s.demana('/api/smtp/comprova', { method: 'POST', headers: { Cookie: c, 'Content-Type': 'text/plain' }, body: 'x' });
    assert.equal(senseJson.status, 400);
  } finally { await s.atura(); }
});

test('«Comprovar SMTP» només fa verify(); no envia ni toca la cua', async () => {
  const s = await arrenca();
  try {
    const c = galeta(await s.login());
    const r = await s.demana('/api/smtp/comprova', { method: 'POST', headers: { Cookie: c, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ok, true);
  } finally { await s.atura(); }
});

test('tick: secret per capçalera en temps constant; mode bucle respon 409; mode tick processa', async () => {
  const bucle = await arrenca();
  try {
    assert.equal((await bucle.demana('/api/tick', { method: 'POST' })).status, 403);
    assert.equal((await bucle.demana('/api/tick', { method: 'POST', headers: { 'X-Tick-Secret': 'incorrecte' } })).status, 403);
    assert.equal((await bucle.demana(`/api/tick?secret=${ENTORN.TICK_SECRET}`, { method: 'POST' })).status, 403, 'el secret a la URL no val');
    assert.equal((await bucle.demana('/api/tick', { method: 'POST', headers: { 'X-Tick-Secret': ENTORN.TICK_SECRET } })).status, 409);
  } finally { await bucle.atura(); }

  const tick = await arrenca({ entorn: { MODE_WORKER: 'tick', TICK_MAX_SEGONS: '5' } });
  try {
    const r = await tick.demana('/api/tick', { method: 'POST', headers: { 'X-Tick-Secret': ENTORN.TICK_SECRET } });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, ocupat: false, processats: 0 });
  } finally { await tick.atura(); }
});

test('el panell indica el mode actiu', async () => {
  const s = await arrenca({ entorn: { MODE_WORKER: 'tick' } });
  try {
    const d = await (await s.demana('/api/estat', { headers: { Cookie: galeta(await s.login()) } })).json();
    assert.equal(d.mode, 'tick');
  } finally { await s.atura(); }
});

test('llista blanca activa: el semàfor passa a taronja i el panell ho indica', async () => {
  const s = await arrenca({ entorn: { CORREU_LLISTA_BLANCA: 'jo@uauu.cat' } });
  try {
    const d = await (await s.demana('/api/estat', { headers: { Cookie: galeta(await s.login()) } })).json();
    assert.equal(d.semafor.nivell, 'taronja');
    assert.equal(d.llistaBlanca.activa, true);
    assert.doesNotMatch(JSON.stringify(d), /jo@uauu\.cat/, 'no es retornen les adreces de la llista');
  } finally { await s.atura(); }
});

test('historial: errors tècnics traduïts, sense cos del correu ni camps interns', async () => {
  const s = await arrenca();
  try {
    const c = galeta(await s.login());
    const r = await s.demana('/api/historial?pagina=1', { headers: { Cookie: c } });
    const text = await r.text();
    assert.match(text, /no existeix o ha rebutjat/);
    assert.doesNotMatch(text, /User unknown|5\.1\.1|cosHtml|cosText|darrerError/);
    assert.match(text, /El lead no accepta rebre correus/);
  } finally { await s.atura(); }
});

test('historial: el filtre i la cerca van com a paràmetres, mai concatenats al SQL', async () => {
  const bd = creaBdFalsa();
  const s = await arrenca({ bd });
  try {
    const c = galeta(await s.login());
    await s.demana(`/api/historial?estat=FALLIT&cerca=${encodeURIComponent("x'; DROP TABLE correus_cua;--%_")}&pagina=3`, { headers: { Cookie: c } });
    const q = bd.consultes.find((x) => x.text.includes('OVER()'));
    assert.doesNotMatch(q.text, /DROP/);
    assert.equal(q.params[0], 'FALLIT');
    assert.match(q.params[1], /\\%\\_/);
    assert.equal(q.params[2], 100);
    await s.demana('/api/historial?estat=HACK', { headers: { Cookie: c } });
    assert.equal(bd.consultes.filter((x) => x.text.includes('OVER()')).pop().params[0], null);
  } finally { await s.atura(); }
});

test('cap resposta ni log conté SMTP_PASS, DATABASE_URL ni contrasenyes, ni quan la BD falla amb secrets al missatge', async () => {
  const error = Object.assign(new Error(`connection to ${ENTORN.DATABASE_URL} failed, password ${ENTORN.SMTP_PASS}`), { code: 'ECONNREFUSED' });
  const bd = creaBdFalsa({ error });
  const s = await arrenca({ bd });
  try {
    const c = galeta(await s.login());
    const recollit = [];
    for (const ruta of ['/api/estat', '/api/historial', '/salut', '/', '/api/inexistent']) {
      const r = await s.demana(ruta, { headers: { Cookie: c } });
      recollit.push(await r.text(), JSON.stringify([...r.headers]));
    }
    const mala = await s.login('admin', ENTORN.PANELL_CONTRASENYA + 'x');
    recollit.push(await mala.text());
    const estat = await s.demana('/api/estat', { headers: { Cookie: c } });
    assert.equal(estat.status, 503);
    assert.match((await estat.json()).missatge, /base de dades/);

    const tot = recollit.join('\n') + s.logs.join('\n');
    for (const secret of secrets(s.env)) assert.equal(tot.includes(secret), false, 'filtració d’un secret');
    assert.ok(s.logs.length > 0);
  } finally { await s.atura(); }
});

test('pàgina i fitxers estàtics: versió injectada, HTML sense caché llarga, imatges amb caché', async () => {
  const s = await arrenca();
  try {
    const p = await s.demana('/');
    const html = await p.text();
    assert.doesNotMatch(html, /__VERSIO__/);
    assert.match(html, /css\/panell\.css\?v=[0-9a-f]{12}/);
    assert.match(p.headers.get('cache-control'), /no-cache/);
    assert.match((await s.demana('/css/panell.css')).headers.get('cache-control'), /no-cache/);
    assert.match((await s.demana('/assets/favicon.ico')).headers.get('cache-control'), /max-age=604800/);
    assert.equal((await s.demana('/api/estat')).headers.get('cache-control'), 'no-store');
  } finally { await s.atura(); }
});

test('historial: un correu «enviant» porta des de quan i quan es reprendrà; el resum en dona el temps', async () => {
  const ara = Date.now();
  const bd = creaBdFalsa({
    resum: { enviant: 1, segonsEnviantMesAntic: 95 },
    historial: [{ createdAt: new Date(ara - 120_000), destinatariEmail: 'a@exemple.com', assumpte: 'X', estat: 'ENVIANT', intents: 2, enviatAt: null,
      properIntentAt: new Date(ara - 100_000), bloquejatFins: new Date(ara + 205_000), darrerError: 'Connection timeout', motiuCancelacio: null }],
  });
  const s = await arrenca({ bd });
  try {
    const c = galeta(await s.login());
    const h = await (await s.demana('/api/historial', { headers: { Cookie: c } })).json();
    const f = h.files[0];
    assert.equal(f.estat, 'ENVIANT');
    assert.equal(Math.round((ara - new Date(f.enviantDesAt).getTime()) / 1000), 95);
    assert.ok(new Date(f.reprenAt).getTime() > ara);
    const e = await (await s.demana('/api/estat', { headers: { Cookie: c } })).json();
    assert.equal(e.targetes.segonsEnviantMesAntic, 95);
    assert.equal(e.semafor.nivell, 'taronja');
    assert.match(e.semafor.motius.join(' '), /«enviant» des de fa 95 segons/);
  } finally { await s.atura(); }
});
