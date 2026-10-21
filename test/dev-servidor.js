// Servidor de demostració per veure el panell al navegador amb dades FALSES.
// No es connecta a cap BD ni SMTP reals:  node test/dev-servidor.js  ->  http://localhost:3100
const { carregaConfig } = require('../src/config');
const log = require('../src/registre');
const { creaSeguretat } = require('../src/seguretat');
const { creaEstadistiques } = require('../src/estadistiques');
const { creaApp } = require('../src/app');
const { creaMotor } = require('../src/motor-cua');
const { creaEstat } = require('../src/estat-viu');
const { creaBdFalsa } = require('./bd-falsa');
const { creaCuaFalsa } = require('./cua-falsa');

const mode = process.env.DEMO_NIVELL || 'verd';
const { config } = carregaConfig({
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db', SMTP_HOST: 'localhost', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASS: 'p',
  CORREU_REMITENT_EMAIL: 'a@uauu.cat', PANELL_USUARI: 'admin', PANELL_CONTRASENYA: 'demo-contrasenya-12',
  EXIGEIX_HTTPS: 'false', CORREU_LLISTA_BLANCA: mode === 'taronja' ? 'jo@uauu.cat' : '',
});
const estat = creaEstat();
estat.batec();
estat.posaVerify(mode !== 'vermell', mode === 'vermell' ? 'El servidor de correu ha rebutjat l’usuari o la contrasenya.' : null);
if (mode === 'vermell') estat.afegeixError('No s’ha pogut connectar amb el servidor de correu (sense resposta o bloquejat).');
setInterval(() => estat.batec(), 5000);

const motor = creaMotor({ cua: creaCuaFalsa(), enviador: { verifica: async () => { throw new Error('no'); }, envia: async () => 'x' }, estat, log, config });
const bd = creaBdFalsa({ fallits24h: mode === 'vermell' ? 2 : 0 });
const seguretat = creaSeguretat(config, log);
const app = creaApp({ config, log, motor, seguretat, estadistiques: creaEstadistiques(bd, estat, config) });
// Només per a captures automàtiques de la demo: entra sense formulari.
const fora = require('express')();
fora.get('/entrada-demo', (req, res) => { seguretat.iniciaSessio(req, res); res.redirect('/'); });
// Marc de 375 px (la demo permet iframes; el servidor real no).
fora.use((req, res, next) => { const set = res.setHeader.bind(res); res.setHeader = (k, v) => (['x-frame-options', 'content-security-policy'].includes(k.toLowerCase()) ? res : set(k, v)); next(); });
fora.get('/marc', (req, res) => res.type('html').send(`<body style="margin:0;background:#888"><iframe src="/" width="${req.query.w || 375}" height="${req.query.h || 2600}" style="border:0;background:#fff"></iframe>`));
fora.use(app);
fora.listen(3100, () => console.log(`Demo (${mode}) a http://localhost:3100  usuari: admin  contrasenya: demo-contrasenya-12`));
