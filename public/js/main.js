// Orquestració del panell: sessió, actualització automàtica cada 10 s, filtres i accions.
import { api, ErrorApi } from './api.js';
import { $ } from './dom.js';
import { pintaEstat, pintaEstatSenseDades, pintaTecnic } from './vista-estat.js';
import { pintaLlista, mostraAvisConnexio } from './vista-llista.js';
import { pintaCalendari } from './vista-calendari.js';
import { formataHora, formataHoraCurta, formataDiaCurt } from './format.js';

const INTERVAL_MS = 10_000;

const filtre = { pagina: 1, estat: '', finestra: '', cerca: '', hora: '', dia: '' };
let temporitzador = null;
let ultimaCarregaOk = null;
let carregant = false;

function mostraLogin(missatge = '') {
  clearInterval(temporitzador);
  $('vista-panell').hidden = true;
  $('vista-login').hidden = false;
  const e = $('error-login');
  e.hidden = !missatge;
  e.textContent = missatge;
  $('usuari').focus();
}

function mostraPanell() {
  $('vista-login').hidden = true;
  $('vista-panell').hidden = false;
  carrega();
  clearInterval(temporitzador);
  temporitzador = setInterval(() => { if (!document.hidden) carrega(); }, INTERVAL_MS);
}

async function carrega() {
  if (carregant) return undefined;
  carregant = true;
  try {
    const [estat, historial] = await Promise.all([api.estat(), api.historial(filtre)]);
    pintaEstat(estat);
    pintaTecnic(estat, filtre.hora);
    pintaCalendari(estat.perDia, estat.diesCalendari, filtre.dia);
    marcaFiltre();
    pintaLlista(historial, Boolean(filtre.hora || filtre.dia));
    ultimaCarregaOk = new Date().toISOString();
    mostraAvisConnexio('');
  } catch (err) {
    if (err instanceof ErrorApi && err.estat === 401) return mostraLogin(err.message);
    // Si l'API no respon, ho diem clarament: les dades que es veuen poden estar desfasades.
    const quan = ultimaCarregaOk ? `Les dades són de les ${formataHora(ultimaCarregaOk)}.` : 'Encara no s’ha pogut carregar cap dada.';
    mostraAvisConnexio(`${err.message} ${quan}`);
    if (!ultimaCarregaOk) pintaEstatSenseDades();
  } finally {
    carregant = false;
  }
  return undefined;
}

$('form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const boto = ev.target.querySelector('button');
  boto.disabled = true;
  try {
    await api.login($('usuari').value, $('contrasenya').value);
    $('contrasenya').value = '';
    mostraPanell();
  } catch (err) {
    mostraLogin(err.message);
  } finally {
    boto.disabled = false;
  }
});

$('boto-sortir').addEventListener('click', async () => {
  try { await api.logout(); } catch { /* si falla, igualment tornem a l'accés */ }
  ultimaCarregaOk = null;
  mostraLogin();
});

$('boto-smtp').addEventListener('click', async () => {
  const boto = $('boto-smtp');
  const resultat = $('resultat-smtp');
  boto.disabled = true;
  resultat.textContent = 'Comprovant…';
  try {
    const r = await api.comprovaSmtp();
    resultat.textContent = r.ok
      ? `El servidor de correu respon correctament (${formataHora(r.at)}).`
      : `El servidor de correu no respon bé: ${r.missatge}`;
    carrega();
  } catch (err) {
    resultat.textContent = err.message;
  } finally {
    boto.disabled = false;
  }
});

// Filtres: estat (clicant les xifres de dalt) i cerca per destinatari.
const NOMS_FILTRE = {
  'ENVIAT|enviats-avui': 'enviats avui', 'PENDENT,ENVIANT|pendents-ara': 'pendents ara',
  'FALLIT|fallits-24h': 'fallits de les últimes 24 h', 'CANCELAT|cancelats-24h': 'cancel·lats de les últimes 24 h',
  'ENVIAT|': 'enviats (tots)', 'PENDENT,ENVIANT|': 'pendents (tots)', 'FALLIT|': 'fallits (tots)', 'CANCELAT|': 'cancel·lats (tots)',
};
const canviaFiltre = () => { filtre.pagina = 1; marcaFiltre(); carrega(); };
function marcaFiltre() {
  for (const b of $('xifres').querySelectorAll('[data-estat]')) {
    const actiu = b.dataset.estat === filtre.estat && b.dataset.finestra === filtre.finestra;
    b.setAttribute('aria-pressed', String(actiu));
    b.classList.toggle('xifra--activa', actiu);
  }
  // El botó «Treu els filtres» apareix mentre hi hagi qualsevol filtre actiu (estat, hora o cerca).
  const parts = [];
  if (filtre.estat) parts.push(`els ${NOMS_FILTRE[`${filtre.estat}|${filtre.finestra}`]}`);
  if (filtre.hora) parts.push(`els correus del ${formataDiaCurt(filtre.hora)} a les ${formataHoraCurta(filtre.hora)} h`);
  if (filtre.dia) parts.push(`els correus del ${filtre.dia.split('-').reverse().join('/')}`);
  if (filtre.cerca) parts.push(`destinataris que contenen «${filtre.cerca}»`);
  $('filtre-actiu').hidden = !parts.length;
  $('filtre-actiu-text').textContent = parts.length ? `Només es mostren ${parts.join(' · ')}.` : '';
}
$('xifres').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-estat]');
  if (!b) return;
  const igual = filtre.estat === b.dataset.estat && filtre.finestra === b.dataset.finestra;
  filtre.estat = igual ? '' : b.dataset.estat;
  filtre.finestra = igual ? '' : b.dataset.finestra;
  canviaFiltre();
});
// Clicar una barra de la gràfica (hora) o un dia del calendari filtra la llista per aquell moment; tornar-hi a clicar treu el filtre.
// Surten tots els correus d'aquell moment, sigui quin sigui l'estat (es combina amb el d'estat i la cerca).
// Hora i dia són excloents entre ells: l'últim que es tria substitueix l'altre.
function triaMoment(camp, valor) {
  const nou = filtre[camp] === valor ? '' : valor;
  Object.assign(filtre, { hora: '', dia: '', [camp]: nou });
  canviaFiltre();
}
for (const [id, camp] of [['ritme', 'hora'], ['calendari', 'dia']]) {
  $(id).addEventListener('click', (ev) => {
    const zona = ev.target.closest(`[data-${camp}]`);
    if (zona) triaMoment(camp, zona.dataset[camp]);
  });
}
// La gràfica té zones enfocables (role=button): Enter i espai les activen igual que el clic.
$('ritme').addEventListener('keydown', (ev) => {
  const zona = ev.target.closest('[data-hora]');
  if (zona && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); triaMoment('hora', zona.dataset.hora); }
});
let retard = null;
$('filtre-treu').addEventListener('click', () => {
  clearTimeout(retard);
  Object.assign(filtre, { estat: '', finestra: '', hora: '', dia: '', cerca: '' });
  $('filtre-cerca').value = '';
  canviaFiltre();
});
$('filtre-cerca').addEventListener('input', (ev) => {
  clearTimeout(retard);
  retard = setTimeout(() => { filtre.cerca = ev.target.value.trim(); canviaFiltre(); }, 350);
});
$('pag-anterior').addEventListener('click', () => { filtre.pagina = Math.max(1, filtre.pagina - 1); carrega(); });
$('pag-seguent').addEventListener('click', () => { filtre.pagina += 1; carrega(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('vista-panell').hidden) carrega(); });

// En pantalla ampla l'estat tècnic és una columna lateral: sempre oberta i sense botó de plegar.
const ample = window.matchMedia('(min-width: 1000px)');
// Les xifres (filtre d'estat) viuen a la banda d'estat; en pantalla ampla passen a la columna dreta, sota la gràfica.
const colocaXifres = () => (ample.matches ? $('xifres-dreta') : $('estat').querySelector('.estat__fila')).append($('xifres'));
const ajustaTecnic = () => { if (ample.matches) $('tecnic').open = true; colocaXifres(); };
ample.addEventListener('change', ajustaTecnic);
$('tecnic').querySelector('summary').addEventListener('click', (ev) => { if (ample.matches) ev.preventDefault(); });
ajustaTecnic();

(async function inicia() {
  try {
    await api.sessio();
    mostraPanell();
  } catch (err) {
    mostraLogin(err instanceof ErrorApi && err.estat === 0 ? err.message : '');
  }
})();
