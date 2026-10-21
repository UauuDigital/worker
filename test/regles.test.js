const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../src/regles');
const { tradueixErrorSmtp } = require('../src/missatges-error');
const { carregaConfig, netejaUrlBd } = require('../src/config');
const registre = require('../src/registre');

test('llista blanca: buida permet tot', () => {
  assert.equal(r.permesPerLlistaBlanca('qualsevol@exemple.com', []), true);
});

test('llista blanca: email exacte i domini, sense distingir majúscules', () => {
  const llista = ['jo@uauu.cat', '@proves.cat'];
  assert.equal(r.permesPerLlistaBlanca('JO@uauu.cat', llista), true);
  assert.equal(r.permesPerLlistaBlanca('algu@proves.cat', llista), true);
  assert.equal(r.permesPerLlistaBlanca('altre@uauu.cat', llista), false);
  assert.equal(r.permesPerLlistaBlanca('algu@subproves.cat', llista), false);
});

test('llista blanca: un domini no ha de coincidir amb un altre que només hi acaba igual', () => {
  assert.equal(r.permesPerLlistaBlanca('x@fals-proves.cat', ['@proves.cat']), false);
});

test('errors: permanent només amb 5xx, EAUTH és temporal', () => {
  assert.equal(r.esErrorPermanent({ responseCode: 550 }), true);
  assert.equal(r.esErrorPermanent({ responseCode: 451 }), false);
  assert.equal(r.esErrorPermanent({ code: 'EAUTH', responseCode: 535 }), false);
  assert.equal(r.esErrorPermanent({ code: 'ETIMEDOUT' }), false);
  assert.equal(r.esErrorPermanent(null), false);
});

test('backoff: 1, 5, 30, 120, 360 i es queda al darrer', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(r.minutsBackoff), [1, 5, 30, 120, 360, 360, 360]);
});

test('decideix fallit: permanent o massa intents', () => {
  assert.equal(r.decideixFallit({ responseCode: 550 }, 1), true);
  assert.equal(r.decideixFallit({ code: 'ETIMEDOUT' }, 4), false);
  assert.equal(r.decideixFallit({ code: 'ETIMEDOUT' }, 5), true);
});

test('estat del lead: buit permet tot; si no, ha de coincidir', () => {
  assert.equal(r.estatLeadPermet([], 'PERDUT'), true);
  assert.equal(r.estatLeadPermet(['NURTURING'], 'NURTURING'), true);
  assert.equal(r.estatLeadPermet(['NURTURING'], 'CONVERTIT'), false);
});

const base = { mode: 'bucle', verifyOk: true, fallits24h: 0, minutsDesDelBatec: 0.1, minutsPendentMesAntic: null, reintentant: 0, llistaBlancaActiva: false };

test('semàfor: verd quan tot va bé', () => {
  assert.equal(r.calculaSemafor(base).nivell, 'verd');
});

test('semàfor: vermell per SMTP caigut, fallits o motor mut', () => {
  assert.equal(r.calculaSemafor({ ...base, verifyOk: false }).nivell, 'vermell');
  assert.equal(r.calculaSemafor({ ...base, fallits24h: 1 }).nivell, 'vermell');
  assert.equal(r.calculaSemafor({ ...base, minutsDesDelBatec: 3 }).nivell, 'vermell');
  assert.equal(r.calculaSemafor({ ...base, minutsDesDelBatec: null }).nivell, 'vermell');
});

test('semàfor: el límit de batec depèn del mode (2 min bucle, 15 min tick)', () => {
  assert.equal(r.calculaSemafor({ ...base, mode: 'tick', minutsDesDelBatec: 10 }).nivell, 'verd');
  assert.equal(r.calculaSemafor({ ...base, mode: 'tick', minutsDesDelBatec: 16 }).nivell, 'vermell');
});

test('semàfor: un correu massa estona en «enviant» avisa i explica la causa', () => {
  const lent = r.calculaSemafor({ ...base, segonsEnviantMesAntic: 90 });
  assert.equal(lent.nivell, 'taronja');
  assert.match(lent.motius.join(' '), /altre worker actiu/);
  assert.equal(r.calculaSemafor({ ...base, segonsEnviantMesAntic: 20 }).nivell, 'verd');
  const penjat = r.calculaSemafor({ ...base, segonsEnviantMesAntic: 600 });
  assert.equal(penjat.nivell, 'vermell');
  assert.match(penjat.motius.join(' '), /s'ha aturat o s'ha penjat/);
});

test('semàfor: taronja per retard, reintents, llista blanca o SMTP sense comprovar', () => {
  assert.equal(r.calculaSemafor({ ...base, minutsPendentMesAntic: 15 }).nivell, 'taronja');
  assert.equal(r.calculaSemafor({ ...base, minutsPendentMesAntic: 40 }).nivell, 'vermell');
  assert.equal(r.calculaSemafor({ ...base, reintentant: 2 }).nivell, 'taronja');
  assert.equal(r.calculaSemafor({ ...base, llistaBlancaActiva: true }).nivell, 'taronja');
  assert.equal(r.calculaSemafor({ ...base, verifyOk: null }).nivell, 'taronja');
});

test('traducció d’errors SMTP: casos coneguts i mai text tècnic en cru', () => {
  assert.match(tradueixErrorSmtp('Invalid login: 535 5.7.3 Authentication unsuccessful'), /usuari o la contrasenya/);
  assert.match(tradueixErrorSmtp('connect ETIMEDOUT 52.96.0.1:587'), /No s'ha pogut connectar/);
  assert.match(tradueixErrorSmtp('550 5.1.1 User unknown'), /no existeix/);
  const desconegut = tradueixErrorSmtp('xyzzy raro');
  assert.doesNotMatch(desconegut, /xyzzy/);
  assert.equal(tradueixErrorSmtp(null), null);
});

const entornValid = {
  DATABASE_URL: 'postgresql://u:clau-secreta@host.supabase.com:6543/postgres?pgbouncer=true',
  SMTP_HOST: 'smtp.office365.com', SMTP_PORT: '587', SMTP_USER: 'a@uauu.cat', SMTP_PASS: 'smtp-secret-123',
  CORREU_REMITENT_EMAIL: 'a@uauu.cat', PANELL_USUARI: 'admin', PANELL_CONTRASENYA: 'una-contrasenya-llarga',
};

test('config: entorn vàlid, treu pgbouncer i normalitza la llista blanca', () => {
  const { config, errors } = carregaConfig({ ...entornValid, CORREU_LLISTA_BLANCA: ' A@uauu.cat , @Proves.cat ' });
  assert.equal(errors, undefined);
  assert.doesNotMatch(config.urlBd, /pgbouncer/);
  assert.deepEqual(config.llistaBlanca, ['a@uauu.cat', '@proves.cat']);
  assert.equal(config.mode, 'bucle');
});

test('config: errors en català, amb el nom de la variable i sense mostrar-ne el valor', () => {
  const { errors } = carregaConfig({ ...entornValid, SMTP_PASS: '', MODE_WORKER: 'tick', PANELL_CONTRASENYA: 'xq7z' });
  const text = errors.join(' ');
  assert.match(text, /SMTP_PASS/);
  assert.match(text, /TICK_SECRET/);
  assert.match(text, /PANELL_CONTRASENYA/);
  assert.doesNotMatch(text, /xq7z/);
});

test('netejaUrlBd conserva la resta de paràmetres', () => {
  assert.equal(netejaUrlBd('postgresql://u:p@h:6543/db?pgbouncer=true&sslmode=require'), 'postgresql://u:p@h:6543/db?sslmode=require');
});

test('registre: amaga secrets coneguts i URLs amb contrasenya', () => {
  registre.configuraSecrets(['smtp-secret-123']);
  assert.doesNotMatch(registre.neteja('error amb smtp-secret-123 dins'), /smtp-secret-123/);
  assert.doesNotMatch(registre.neteja('connectant a postgresql://usuari:clau-xxx@host/db'), /clau-xxx/);
  registre.configuraSecrets([]);
});
