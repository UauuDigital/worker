// Punt d'entrada: valida l'entorn, arrenca Express i, en mode bucle, el motor de la cua.
require('dotenv').config({ quiet: true });
const log = require('./src/registre');
const { carregaConfig, secrets } = require('./src/config');

log.configuraSecrets(secrets(process.env));
const { config, errors } = carregaConfig(process.env);
if (errors) {
  for (const e of errors) log.error(e);
  log.error('No es pot arrencar. Revisa el fitxer .env (model: .env.example).');
  process.exit(1);
}

const { creaBd } = require('./src/base-dades');
const { creaCua } = require('./src/cua');
const { creaEnviador } = require('./src/enviament');
const { creaEstat } = require('./src/estat-viu');
const { creaMotor } = require('./src/motor-cua');
const { creaSeguretat } = require('./src/seguretat');
const { creaEstadistiques } = require('./src/estadistiques');
const { creaApp } = require('./src/app');

const bd = creaBd(config.urlBd, log);
const estat = creaEstat({ fitxer: config.fitxerEstat });
const enviador = creaEnviador(config);
const motor = creaMotor({ cua: creaCua(bd, log), enviador, estat, log, config });
const app = creaApp({
  config, log, motor,
  seguretat: creaSeguretat(config, log),
  estadistiques: creaEstadistiques(bd, estat, config),
});

const servidor = app.listen(config.port, () => log.info(`Panell escoltant al port ${config.port} (mode ${config.mode})`));

let bucle = Promise.resolve();
(async () => {
  await motor.comprovaSmtp();
  if (config.llistaBlanca.length > 0) log.avis(`MODE PROVA: només s'envia a ${config.llistaBlanca.join(', ')}`);
  if (config.mode === 'bucle') {
    log.info('Motor iniciat (mode bucle)');
    bucle = motor.bucle();
  } else {
    log.info('Mode tick: el motor només treballa quan es crida POST /api/tick');
  }
})();

// Aturada ordenada: acaba el correu en curs i surt.
let sortint = false;
async function atura() {
  if (sortint) return;
  sortint = true;
  log.info('Aturant...');
  motor.atura();
  servidor.close();
  const limit = Date.now() + 30_000;
  while (motor.estaOcupat() && Date.now() < limit) await new Promise((r) => setTimeout(r, 200));
  await bucle;
  enviador.tanca();
  await bd.tanca().catch(() => {});
  log.info('Aturat');
  process.exit(0);
}
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, atura);
process.on('unhandledRejection', (err) => log.error('Promesa rebutjada sense gestionar', err));
