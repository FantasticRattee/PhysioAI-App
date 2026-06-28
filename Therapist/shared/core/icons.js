// PhysioAI · monochrome stroke icon set (no emoji). Returns SVG markup strings.
// Ported from UI-Mock/shared/components.js <Ico>.

const PATHS = {
  play:   '<polygon points="7,5 19,12 7,19" fill="CUR" stroke="none"/>',
  pause:  '<rect x="7" y="5" width="3.5" height="14" rx="1" fill="CUR" stroke="none"/><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="CUR" stroke="none"/>',
  mic:    '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  mic_off:'<path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3M3 3l18 18"/><path d="M9 5a3 3 0 0 1 6 0v6"/>',
  eye:    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eye_off:'<path d="M2 12s3.5-7 10-7a11 11 0 0 1 4 .8M22 12s-3.5 7-10 7a11 11 0 0 1-4-.8"/><path d="M3 3l18 18"/>',
  chev_r: '<polyline points="9,6 15,12 9,18"/>',
  chev_l: '<polyline points="15,6 9,12 15,18"/>',
  chev_d: '<polyline points="6,9 12,15 18,9"/>',
  close:  '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  plus:   '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  check:  '<polyline points="4,12 10,18 20,6"/>',
  cam:    '<rect x="2" y="7" width="15" height="12" rx="2"/><path d="M17 10l5-3v10l-5-3Z"/>',
  body:   '<circle cx="12" cy="4.5" r="2"/><path d="M12 6.5v6M7 9l10 0M9 12.5l-2 8M15 12.5l2 8"/>',
  bolt:   '<polygon points="13,2 4,14 11,14 10,22 20,10 13,10" fill="CUR" stroke="none"/>',
  sig:    '<path d="M3 20v-4M8 20v-8M13 20V8M18 20V4"/>',
  user:   '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
  users:  '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M17 20c0-3 2-5 4.5-5"/>',
  home:   '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  chart:  '<path d="M3 20h18"/><path d="M6 17v-6M11 17V7M16 17v-9"/>',
  cal:    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  set:    '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.7l2-1.5-2-3.5-2.3 1a7 7 0 0 0-3-1.7L13 2h-4l-.5 2.6a7 7 0 0 0-3 1.7l-2.3-1-2 3.5 2 1.5A7 7 0 0 0 3 12c0 .6.1 1.1.2 1.7l-2 1.5 2 3.5 2.3-1a7 7 0 0 0 3 1.7L9 22h4l.5-2.6a7 7 0 0 0 3-1.7l2.3 1 2-3.5-2-1.5c.1-.6.2-1.1.2-1.7Z"/>',
  bell:   '<path d="M6 9a6 6 0 1 1 12 0v5l2 3H4l2-3V9Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  speak:  '<polygon points="4,9 8,9 13,5 13,19 8,15 4,15" fill="CUR" stroke="none"/><path d="M17 8a5 5 0 0 1 0 8M19.5 5.5a8 8 0 0 1 0 13"/>',
  speak_off:'<polygon points="4,9 8,9 13,5 13,19 8,15 4,15" fill="CUR" stroke="none"/><path d="M17 9l5 6M22 9l-5 6"/>',
  wave:   '<path d="M3 12h2l2-6 3 12 3-8 2 4h6"/>',
  arrow_r:'<line x1="5" y1="12" x2="19" y2="12"/><polyline points="13,6 19,12 13,18"/>',
  arrow_up:'<line x1="12" y1="19" x2="12" y2="5"/><polyline points="6,11 12,5 18,11"/>',
  arrow_dn:'<line x1="12" y1="5" x2="12" y2="19"/><polyline points="6,13 12,19 18,13"/>',
  globe:  '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  refresh:'<path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/>',
  save:   '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7M8 14h8v6H8z"/>',
  download:'<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  trash:  '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  spark:  '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M18 18l-2.5-2.5M18 6l-2.5 2.5M6 18l2.5-2.5"/>',
  message:'<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12Z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z"/>',
  flame:  '<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 1-4 1.5 1 3 1 3-4Z"/>',
};

export function icon(name, opts = {}) {
  const { size = 20, color = 'currentColor', stroke = 1.6 } = opts;
  const body = (PATHS[name] || '').replaceAll('CUR', color);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function iconEl(name, opts) {
  const span = document.createElement('span');
  span.style.display = 'inline-flex';
  span.innerHTML = icon(name, opts);
  return span;
}
