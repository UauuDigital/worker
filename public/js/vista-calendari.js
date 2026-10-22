// Calendari mensual: els dies amb correus van marcats; clicar-ne un filtra la llista per aquell dia (ho gestiona main.js).
import { el, $ } from './dom.js';

const DIES_SETMANA = ['dl', 'dm', 'dc', 'dj', 'dv', 'ds', 'dg'];
const nomMes = new Intl.DateTimeFormat('ca-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const nomDia = new Intl.DateTimeFormat('ca-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
// «AAAA-MM-DD» del dia d'avui a Madrid (el format sv-SE dona exactament aquesta forma).
const avuiMadrid = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());

let mes = null; // «AAAA-MM» del mes que es veu; es conserva entre refrescos.
let dadesActuals = { perDia: [], diesCalendari: 0 };
let diaActual = '';

const sumaMesos = (aaaamm, n) => {
  const [a, m] = aaaamm.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const textCorreus = (n) => `${n} ${n === 1 ? 'correu' : 'correus'}`;

export function pintaCalendari(perDia, diesCalendari, diaFiltrat) {
  dadesActuals = { perDia, diesCalendari };
  diaActual = diaFiltrat;
  const avui = avuiMadrid();
  if (!mes) mes = avui.slice(0, 7);
  pinta(avui);
}

function pinta(avui) {
  const { perDia, diesCalendari } = dadesActuals;
  const comptes = new Map(perDia.map((x) => [x.dia, x.n]));
  const mesAvui = avui.slice(0, 7);
  // Només es pot navegar per mesos dins del que el servidor ens dona (els últims `diesCalendari` dies).
  const mesMinim = new Date(Date.parse(`${avui}T00:00:00Z`) - diesCalendari * 86_400_000).toISOString().slice(0, 7);

  const [a, m] = mes.split('-').map(Number);
  const primer = new Date(Date.UTC(a, m - 1, 1));
  const diesMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const buits = (primer.getUTCDay() + 6) % 7; // la setmana comença en dilluns

  const info = el('div', { class: 'calendari-info', role: 'status', hidden: '' });
  const amaga = () => { info.hidden = true; };

  const cel = [];
  for (let i = 0; i < buits; i += 1) cel.push(el('span', { class: 'dia dia--fora', 'aria-hidden': 'true' }));
  for (let d = 1; d <= diesMes; d += 1) {
    const iso = `${mes}-${String(d).padStart(2, '0')}`;
    const n = comptes.get(iso) || 0;
    const classes = `dia${iso === avui ? ' dia--avui' : ''}`;
    if (!n) { cel.push(el('span', { class: `${classes} dia--buit`, text: String(d) })); continue; }
    const etiqueta = `${nomDia.format(new Date(`${iso}T00:00:00Z`))}: ${textCorreus(n)}`;
    const b = el('button', { type: 'button', class: `${classes} dia--amb`, 'data-dia': iso, 'aria-pressed': String(iso === diaActual), 'aria-label': etiqueta, text: String(d) });
    const mostra = () => {
      info.textContent = `${String(d).padStart(2, '0')}/${mes.slice(5)}: ${textCorreus(n)}`;
      info.style.left = `${b.offsetLeft + b.offsetWidth / 2}px`;
      info.style.top = `${b.offsetTop}px`;
      info.hidden = false;
    };
    b.addEventListener('pointerenter', mostra);
    b.addEventListener('focus', mostra);
    b.addEventListener('pointerleave', amaga);
    b.addEventListener('blur', amaga);
    cel.push(b);
  }

  const canvia = (n) => { mes = sumaMesos(mes, n); pinta(avui); };
  const anterior = el('button', { type: 'button', class: 'boto-text', 'aria-label': 'Mes anterior', text: '‹' });
  const seguent = el('button', { type: 'button', class: 'boto-text', 'aria-label': 'Mes següent', text: '›' });
  anterior.disabled = mes <= mesMinim;
  seguent.disabled = mes >= mesAvui;
  anterior.addEventListener('click', () => canvia(-1));
  seguent.addEventListener('click', () => canvia(1));

  const titol = nomMes.format(primer);
  $('calendari').replaceChildren(
    el('div', { class: 'calendari__cap' }, anterior, el('strong', { text: titol.charAt(0).toUpperCase() + titol.slice(1), 'aria-live': 'polite' }), seguent),
    el('div', { class: 'calendari__graella' },
      ...DIES_SETMANA.map((s) => el('span', { class: 'dia dia--setmana', 'aria-hidden': 'true', text: s })), ...cel),
    info,
  );
}
