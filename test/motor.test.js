// Integració del motor amb un SERVIDOR SMTP FALS (net.createServer) i una cua en memòria.
// No toca cap BD real ni envia res a Internet.
const test = require('node:test');
const assert = require('node:assert/strict');
const { creaMotor } = require('../src/motor-cua');
const { creaEnviador } = require('../src/enviament');
const { creaEstat } = require('../src/estat-viu');
const { creaSmtpFals } = require('./smtp-fals');
const { creaCuaFalsa } = require('./cua-falsa');

const silenci = { info() {}, avis() {}, error() {} };

async function muntatge({ smtp = {}, cua = {}, llistaBlanca = [], msEntre = 0 } = {}) {
  const servidor = creaSmtpFals(smtp);
  const port = await servidor.arrenca();
  const config = {
    smtp: { host: '127.0.0.1', port, user: 'u', pass: 'p' },
    remitent: { email: 'planner@uauu.cat', nom: 'UAUU' },
    llistaBlanca,
  };
  const enviador = creaEnviador(config, { requireTLS: false, ignoreTLS: true });
  const estat = creaEstat();
  const cuaFalsa = creaCuaFalsa(cua);
  const motor = creaMotor({ cua: cuaFalsa, enviador, estat, log: silenci, config, msEntre, msSenseFeina: 10 });
  const neteja = async () => { enviador.tanca(); await servidor.atura(); };
  return { servidor, cua: cuaFalsa, motor, estat, neteja };
}

test('enviament correcte: ENVIAT, messageId desat, auditoria i un sol missatge al SMTP', async () => {
  const m = await muntatge({ cua: { correus: [{ destinatariEmail: 'client@exemple.com', assumpte: 'Benvinguda' }] } });
  try {
    const r = await m.motor.tick(10);
    assert.equal(r.processats, 1);
    const c = m.cua.files[0];
    assert.equal(c.estat, 'ENVIAT');
    assert.ok(c.messageId);
    assert.equal(c.intents, 1);
    assert.deepEqual(m.cua.auditoria, [{ id: 'c1', action: 'CORREU_ENVIAT' }]);
    assert.equal(m.servidor.rebuts.length, 1);
    assert.deepEqual(m.servidor.rebuts[0].to, ['client@exemple.com']);
    assert.match(m.servidor.rebuts[0].dades, /Subject: Benvinguda/);
    assert.equal(m.estat.instantani().ultimResultat.tipus, 'enviat');
  } finally { await m.neteja(); }
});

test('error temporal (451): torna a PENDENT amb backoff d’1 min i després de 5 min', async () => {
  const m = await muntatge({
    smtp: { rcpt: () => '451 4.3.0 Temporalment no disponible' },
    cua: { correus: [{ destinatariEmail: 'a@exemple.com' }] },
  });
  try {
    await m.motor.tick(10);
    const c = m.cua.files[0];
    assert.equal(c.estat, 'PENDENT');
    assert.equal(c.intents, 1);
    assert.equal(c.backoffMinuts, 1);
    assert.match(c.darrerError, /451/);
    assert.equal(m.servidor.rebuts.length, 0);

    c.properIntentAt = 0; // fem que ja toqui reintentar
    await m.motor.tick(10);
    assert.equal(c.intents, 2);
    assert.equal(c.backoffMinuts, 5);
    assert.equal(m.estat.instantani().ultimResultat.tipus, 'reintent');
  } finally { await m.neteja(); }
});

test('error permanent (550): FALLIT directe, sense reintents, amb auditoria', async () => {
  const m = await muntatge({
    smtp: { rcpt: () => '550 5.1.1 User unknown' },
    cua: { correus: [{ destinatariEmail: 'no-existeix@exemple.com' }] },
  });
  try {
    await m.motor.tick(10);
    assert.equal(m.cua.files[0].estat, 'FALLIT');
    assert.deepEqual(m.cua.auditoria, [{ id: 'c1', action: 'CORREU_FALLIT' }]);
  } finally { await m.neteja(); }
});

test('EAUTH (535) és temporal: es reintenta, no falla', async () => {
  const m = await muntatge({ smtp: { auth: false }, cua: { correus: [{ destinatariEmail: 'a@exemple.com' }] } });
  try {
    await m.motor.tick(10);
    assert.equal(m.cua.files[0].estat, 'PENDENT');
    assert.equal(m.cua.files[0].backoffMinuts, 1);
  } finally { await m.neteja(); }
});

test('al cinquè intent un error temporal passa a FALLIT', async () => {
  const m = await muntatge({
    smtp: { rcpt: () => '451 4.3.0 no' },
    cua: { correus: [{ destinatariEmail: 'a@exemple.com', intents: 4 }] },
  });
  try {
    await m.motor.tick(10);
    assert.equal(m.cua.files[0].estat, 'FALLIT');
  } finally { await m.neteja(); }
});

test('llista blanca: destinatari fora de la llista queda CANCELAT i no arriba al SMTP', async () => {
  const m = await muntatge({
    llistaBlanca: ['jo@uauu.cat'],
    cua: { correus: [{ destinatariEmail: 'client@exemple.com' }, { destinatariEmail: 'JO@uauu.cat' }] },
  });
  try {
    await m.motor.tick(10);
    const [fora, dins] = m.cua.files;
    assert.equal(fora.estat, 'CANCELAT');
    assert.match(fora.motiuCancelacio, /llista blanca/);
    assert.equal(dins.estat, 'ENVIAT');
    assert.equal(m.servidor.rebuts.length, 1);
    assert.deepEqual(m.servidor.rebuts[0].to, ['JO@uauu.cat']);
  } finally { await m.neteja(); }
});

test('cancel·la si el lead no accepta correus o si el seu estat ja no és el permès', async () => {
  const m = await muntatge({
    cua: {
      leads: { l1: { acceptaCorreus: false, estat: 'NURTURING' }, l2: { estat: 'CONVERTIT' } },
      automatitzacions: { a1: { estatsLead: ['NURTURING'] } },
      correus: [
        { destinatariEmail: 'a@exemple.com', leadId: 'l1' },
        { destinatariEmail: 'b@exemple.com', leadId: 'l2', automatitzacioId: 'a1' },
      ],
    },
  });
  try {
    await m.motor.tick(10);
    assert.equal(m.cua.files[0].motiuCancelacio, 'El lead no accepta rebre correus');
    assert.equal(m.cua.files[1].estat, 'CANCELAT');
    assert.equal(m.servidor.rebuts.length, 0);
  } finally { await m.neteja(); }
});

test('tick: dues crides alhora no processen el mateix; la segona torna «ocupat»', async () => {
  const m = await muntatge({
    smtp: { lent: 150 },
    cua: { correus: [{ destinatariEmail: 'a@exemple.com' }, { destinatariEmail: 'b@exemple.com' }] },
  });
  try {
    const [r1, r2] = await Promise.all([m.motor.tick(10), m.motor.tick(10)]);
    assert.equal(r2.ocupat, true);
    assert.equal(r1.processats, 2);
    assert.equal(m.servidor.rebuts.length, 2, 'cada correu s’envia una sola vegada');
  } finally { await m.neteja(); }
});

test('ritme: entre dos enviaments hi ha com a mínim msEntre', async () => {
  const m = await muntatge({
    msEntre: 300,
    cua: { correus: [{ destinatariEmail: 'a@exemple.com' }, { destinatariEmail: 'b@exemple.com' }, { destinatariEmail: 'c@exemple.com' }] },
  });
  try {
    const t0 = Date.now();
    await m.motor.tick(10);
    assert.ok(Date.now() - t0 >= 600, `han passat ${Date.now() - t0} ms`);
    assert.equal(m.servidor.rebuts.length, 3);
  } finally { await m.neteja(); }
});

test('tick: no comença un enviament que no pot acabar dins el temps màxim', async () => {
  const m = await muntatge({
    msEntre: 5000,
    cua: { correus: [{ destinatariEmail: 'a@exemple.com' }, { destinatariEmail: 'b@exemple.com' }] },
  });
  try {
    const t0 = Date.now();
    const r = await m.motor.tick(1);
    assert.ok(Date.now() - t0 < 3000);
    assert.equal(r.processats, 1);
    assert.equal(m.cua.files[1].estat, 'PENDENT', 'el segon queda intacte a la cua');
  } finally { await m.neteja(); }
});

test('comprovaSmtp: ok i error traduït, sense enviar res', async () => {
  const ok = await muntatge();
  try {
    assert.deepEqual(await ok.motor.comprovaSmtp(), { ok: true });
    assert.equal(ok.estat.instantani().ultimVerify.ok, true);
    assert.equal(ok.servidor.rebuts.length, 0);
  } finally { await ok.neteja(); }

  const malament = await muntatge({ smtp: { auth: false } });
  try {
    const r = await malament.motor.comprovaSmtp();
    assert.equal(r.ok, false);
    assert.match(r.missatge, /usuari o la contrasenya/);
    assert.equal(malament.estat.instantani().ultimVerify.ok, false);
  } finally { await malament.neteja(); }
});

test('bucle: processa la feina i s’atura amb atura()', async () => {
  const m = await muntatge({ cua: { correus: [{ destinatariEmail: 'a@exemple.com' }] } });
  try {
    const p = m.motor.bucle();
    await new Promise((r) => setTimeout(r, 400));
    m.motor.atura();
    await p;
    assert.equal(m.cua.files[0].estat, 'ENVIAT');
    assert.ok(m.estat.instantani().ultimBatec);
  } finally { await m.neteja(); }
});
