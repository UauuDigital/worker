// Demostra el problema de zones horàries de `pg` i que la nostra gestió el resol.
// Cada prova s'executa en un procés fill amb TZ diferent (la zona es fixa en arrencar).
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

function enZona(tz, codi) {
  const sortida = execFileSync(process.execPath, ['-e', codi], {
    env: { ...process.env, TZ: tz },
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  return sortida.trim();
}

const ZONES = ['UTC', 'Europe/Madrid', 'Asia/Tokyo', 'America/New_York'];

test('el parser per defecte de pg desplaça les dates quan la zona no és UTC (el problema)', () => {
  const codi = `const {types}=require('pg');console.log(types.getTypeParser(1114)('2026-10-21 10:00:00.123').toISOString())`;
  assert.equal(enZona('UTC', codi), '2026-10-21T10:00:00.123Z');
  assert.notEqual(enZona('Asia/Tokyo', codi), '2026-10-21T10:00:00.123Z');
});

test('el nostre parser llegeix el timestamp com a UTC en qualsevol zona', () => {
  const codi = `const {tipus}=require('./src/base-dades');console.log(tipus.getTypeParser(1114,'text')('2026-10-21 10:00:00.123').toISOString())`;
  for (const z of ZONES) assert.equal(enZona(z, codi), '2026-10-21T10:00:00.123Z', z);
});

test('el parser nostre no toca els altres tipus', () => {
  const codi = `const {tipus}=require('./src/base-dades');console.log(tipus.getTypeParser(23,'text')('42')+1)`;
  assert.equal(enZona('Asia/Tokyo', codi), '43');
});

test('si enviéssim un Date, pg el serialitzaria amb l’hora local i un offset que `timestamp` descarta (per això no n’enviem cap)', () => {
  const codi = `const u=require('pg/lib/utils');console.log(u.prepareValue(new Date('2026-10-21T10:00:00.000Z')))`;
  assert.match(enZona('Asia/Tokyo', codi), /^2026-10-21T19:00:00\.000\+09:00$/);
});

test('cap sentència de cua.js passa dates per paràmetre: tot el temps es calcula a la BD en UTC', () => {
  const fs = require('node:fs');
  const font = fs.readFileSync(path.join(__dirname, '..', 'src', 'cua.js'), 'utf8');
  assert.doesNotMatch(font, /new Date|Date\.now/);
  assert.match(font, /now\(\) AT TIME ZONE 'UTC'/);
});
