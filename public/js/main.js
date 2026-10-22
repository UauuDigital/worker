// Orquestració del panell: sessió, actualització automàtica cada 10 s, filtres i accions.
import { api, ErrorApi } from './api.js';
import { $ } from './dom.js';
import { pintaEstat, pintaEstatSenseDades, pintaTecnic } from './vista-estat.js';
import { pintaLlista, mostraAvisConnexio } from './vista-llista.js';
import { formataHora } from './format.js';

const INTERVAL_MS = 10_000;

const filtre = { pagina: 1, estat: '', finestra: '', cerca: '' };
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
    pintaTecnic(estat);
    marcaFiltre();
    pintaLlista(historial);
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
  $('filtre-actiu').hidden = !filtre.estat;
  $('filtre-actiu-text').textContent = filtre.estat ? `Només es mostren els ${NOMS_FILTRE[`${filtre.estat}|${filtre.finestra}`]}.` : '';
}
$('xifres').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-estat]');
  if (!b) return;
  const igual = filtre.estat === b.dataset.estat && filtre.finestra === b.dataset.finestra;
  filtre.estat = igual ? '' : b.dataset.estat;
  filtre.finestra = igual ? '' : b.dataset.finestra;
  canviaFiltre();
});
$('filtre-treu').addEventListener('click', () => { filtre.estat = ''; filtre.finestra = ''; canviaFiltre(); });
let retard = null;
$('filtre-cerca').addEventListener('input', (ev) => {
  clearTimeout(retard);
  retard = setTimeout(() => { filtre.cerca = ev.target.value.trim(); canviaFiltre(); }, 350);
});
$('pag-anterior').addEventListener('click', () => { filtre.pagina = Math.max(1, filtre.pagina - 1); carrega(); });
$('pag-seguent').addEventListener('click', () => { filtre.pagina += 1; carrega(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('vista-panell').hidden) carrega(); });

// En pantalla ampla l'estat tècnic és una columna lateral: sempre oberta i sense botó de plegar.
const ample = window.matchMedia('(min-width: 1000px)');
const ajustaTecnic = () => { if (ample.matches) $('tecnic').open = true; };
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
