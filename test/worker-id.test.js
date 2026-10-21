// Atribució: cada worker deixa el seu identificador a l'auditoria i al Message-ID.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregaConfig } = require('../src/config');
const { creaCua } = require('../src/cua');
const { creaEnviador } = require('../src/enviament');
const { creaSmtpFals } = require('./smtp-fals');

const ENTORN = {
  DATABASE_URL: 'postgresql://u:p@h:6543/db', SMTP_HOST: 'h', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASS: 'clau-smtp-1',
  CORREU_REMITENT_EMAIL: 'planner@uauu.cat', PANELL_USUARI: 'admin', PANELL_CONTRASENYA: 'Contrasenya-del-panell-1',
};

test('config: WORKER_ID es neteja de caràcters estranys i, si no hi és, s’usa el nom de la màquina', () => {
  assert.equal(carregaConfig({ ...ENTORN, WORKER_ID: 'servatica prod/1' }).config.workerId, 'servatica-prod-1');
  assert.ok(carregaConfig(ENTORN).config.workerId.length > 0);
});

test('auditoria: el metadata porta el workerId (i res si no n’hi ha)', async () => {
  const consultes = [];
  const bd = { query: async (text, params) => { consultes.push({ text, params }); return { rows: [], rowCount: 1 }; } };
  const c = { id: 'c1', leadId: null, assumpte: 'A', destinatariEmail: 'a@exemple.com' };
  await creaCua(bd, { error() {} }, 'servatica').marcaEnviat(c, '<x>');
  const meta = JSON.parse(consultes.find((q) => q.text.includes('INSERT INTO "audit_logs"')).params[6]);
  assert.deepEqual(meta, { font: 'worker-correus', correuId: 'c1', workerId: 'servatica' });

  consultes.length = 0;
  await creaCua(bd, { error() {} }).marcaCancelat(c, 'motiu');
  const meta2 = JSON.parse(consultes.find((q) => q.text.includes('INSERT INTO "audit_logs"')).params[6]);
  assert.equal('workerId' in meta2, false);
});

test('Message-ID: porta l’identificador del worker i el domini del remitent', async () => {
  const servidor = creaSmtpFals();
  const port = await servidor.arrenca();
  const config = { smtp: { host: '127.0.0.1', port, user: 'u', pass: 'p' }, remitent: { email: 'planner@uauu.cat', nom: 'UAUU' }, workerId: 'local-marti' };
  const enviador = creaEnviador(config, { requireTLS: false, ignoreTLS: true });
  try {
    const id = await enviador.envia({ destinatariEmail: 'a@exemple.com', destinatariNom: null, assumpte: 'X', cosHtml: '<p>x</p>', cosText: 'x' });
    assert.match(id, /^<[0-9a-f-]{36}\.local-marti@uauu\.cat>$/);
    assert.match(servidor.rebuts[0].dades, /Message-ID: <[0-9a-f-]{36}\.local-marti@uauu\.cat>/i);
  } finally { enviador.tanca(); await servidor.atura(); }
});
