// Correus amb fitxer adjunt (el PDF d'un pressupost, tag PRESSUPOST): el worker l'adjunta, no el cancel·la per «accepta correus»,
// no envia res si falta el fitxer i buida la còpia de la cua en acabar. SMTP fals i cua en memòria, com a motor.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { creaMotor } = require('../src/motor-cua');
const { creaEnviador } = require('../src/enviament');
const { creaEstat } = require('../src/estat-viu');
const { creaCua } = require('../src/cua');
const { creaSmtpFals } = require('./smtp-fals');
const { creaCuaFalsa } = require('./cua-falsa');

const silenci = { info() {}, avis() {}, error() {} };
const PDF = Buffer.from('%PDF-1.4\n%contingut de prova\n');

async function muntatge({ cua = {}, respondAReserves = null } = {}) {
  const servidor = creaSmtpFals();
  const port = await servidor.arrenca();
  const config = {
    smtp: { host: '127.0.0.1', port, user: 'u', pass: 'p' },
    remitent: { email: 'planner@uauu.cat', nom: 'UAUU' },
    llistaBlanca: [],
    respondAReserves,
  };
  const enviador = creaEnviador(config, { requireTLS: false, ignoreTLS: true });
  const cuaFalsa = creaCuaFalsa(cua);
  const motor = creaMotor({ cua: cuaFalsa, enviador, estat: creaEstat(), log: silenci, config, msEntre: 0, msSenseFeina: 10 });
  return { servidor, cua: cuaFalsa, motor, neteja: async () => { enviador.tanca(); await servidor.atura(); } };
}

test('el correu amb adjunt arriba al SMTP amb el PDF adjunt', async () => {
  const m = await muntatge({ cua: { correus: [{ destinatariEmail: 'client@exemple.com', tag: 'PRESSUPOST', adjuntNom: 'pressupost.pdf', adjuntDades: PDF }] } });
  try {
    await m.motor.tick(10);
    assert.equal(m.cua.files[0].estat, 'ENVIAT');
    const dades = m.servidor.rebuts[0].dades;
    assert.match(dades, /Content-Disposition: attachment; filename=(")?pressupost\.pdf/);
    assert.match(dades, /application\/pdf/);
    assert.ok(dades.includes(PDF.toString('base64').slice(0, 20)), 'el contingut del PDF (base64) és al missatge');
  } finally { await m.neteja(); }
});

test('el tag PRESSUPOST s’envia encara que el lead no accepti correus; un altre tag es cancel·la', async () => {
  const m = await muntatge({
    cua: {
      leads: { l1: { acceptaCorreus: false, estat: 'NURTURING' } },
      correus: [
        { destinatariEmail: 'a@exemple.com', leadId: 'l1', tag: 'PRESSUPOST' },
        { destinatariEmail: 'b@exemple.com', leadId: 'l1', tag: 'LEAD_FUNNEL' },
      ],
    },
  });
  try {
    await m.motor.tick(10);
    assert.equal(m.cua.files[0].estat, 'ENVIAT');
    assert.equal(m.cua.files[1].estat, 'CANCELAT');
    assert.equal(m.cua.files[1].motiuCancelacio, 'El lead no accepta rebre correus');
    assert.equal(m.servidor.rebuts.length, 1);
  } finally { await m.neteja(); }
});

test('una fila que anuncia adjunt però no el porta queda FALLIT i no arriba al SMTP', async () => {
  const m = await muntatge({ cua: { correus: [{ destinatariEmail: 'client@exemple.com', tag: 'PRESSUPOST', adjuntNom: 'pressupost.pdf', adjuntDades: null }] } });
  try {
    await m.motor.tick(10);
    assert.equal(m.cua.files[0].estat, 'FALLIT');
    assert.match(m.cua.files[0].darrerError, /adjunt/i);
    assert.equal(m.servidor.rebuts.length, 0);
  } finally { await m.neteja(); }
});

test('«Respon a» també als correus de pressupost', async () => {
  const m = await muntatge({ respondAReserves: 'info@uauu.cat', cua: { correus: [{ destinatariEmail: 'client@exemple.com', tag: 'PRESSUPOST', adjuntNom: 'p.pdf', adjuntDades: PDF }] } });
  try {
    await m.motor.tick(10);
    assert.match(m.servidor.rebuts[0].dades, /Reply-To: info@uauu\.cat/i);
  } finally { await m.neteja(); }
});

// L'SQL real de la cua (cua.js): el fitxer es llegeix en reservar i es buida en acabar, sigui quin sigui el final.
test('cua.js: reserva les columnes de l’adjunt i les tres sortides buiden adjuntDades', async () => {
  const consultes = [];
  const bd = { async query(text, params) { consultes.push(text); return { rows: [] }; } };
  const cua = creaCua(bd, silenci, 'w1');
  await cua.reservaSeguent(5);
  assert.match(consultes[0], /"adjuntNom"/);
  assert.match(consultes[0], /"adjuntDades"/);
  const c = { id: 'c1', leadId: null, assumpte: 'x', destinatariEmail: 'a@b.c' };
  for (const [nom, args] of [['marcaEnviat', [c, '<id>']], ['marcaCancelat', [c, 'motiu']], ['marcaFallit', [c, 'error']]]) {
    consultes.length = 0;
    await cua[nom](...args);
    assert.match(consultes[0], /"adjuntDades" = NULL/, `${nom} ha de buidar adjuntDades`);
  }
});
