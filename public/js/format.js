// Formatadors de dates i durades (zona horària de Madrid, idioma català).
const dataHora = new Intl.DateTimeFormat('ca-ES', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Madrid' });
const hora = new Intl.DateTimeFormat('ca-ES', { timeStyle: 'medium', timeZone: 'Europe/Madrid' });
const horaCurta = new Intl.DateTimeFormat('ca-ES', { hour: '2-digit', timeZone: 'Europe/Madrid' });

export const formataDataHora = (iso) => (iso ? dataHora.format(new Date(iso)) : '—');
export const formataHora = (iso) => (iso ? hora.format(new Date(iso)) : '—');
export const formataHoraCurta = (iso) => horaCurta.format(new Date(iso));

// «fa 5 min», «fa 2 h 10 min», «fa 3 dies».
export function fa(iso, ara = Date.now()) {
  if (!iso) return '—';
  const s = Math.max(0, Math.floor((ara - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'fa uns segons';
  return `fa ${durada(s)}`;
}

export function durada(segons) {
  const s = Math.floor(segons);
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'dia' : 'dies'}${h % 24 ? ` ${h % 24} h` : ''}`;
}

export const minutsAText = (min) => (min === null ? 'Cap' : durada(min * 60));
