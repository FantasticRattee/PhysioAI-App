// PhysioAI · Version-1 — shared UI chrome & DOM helpers (vanilla, no framework).

import { icon } from './icons.js';
import { t, getLang, setLang, onLangChange } from './i18n.js';

export { t, getLang, setLang, onLangChange, icon };

// ── Hyperscript helper ──────────────────────────────────────
export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}
export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

// ── Score ring (SVG string) ─────────────────────────────────
export function ringSVG(value, { size = 72, thickness = 6, color = 'var(--brand)', track = 'rgba(60,48,30,0.10)', label = '', fontSize = 18 } = {}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * Math.max(0, Math.min(1, value));
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${track}" stroke-width="${thickness}" fill="none"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${thickness}" fill="none"
        stroke-dasharray="${dash} ${c}" stroke-linecap="round" style="transition:stroke-dasharray .4s cubic-bezier(.2,.7,.3,1)"/>
    </svg>
    <div class="ring-val" style="font-size:${fontSize}px;color:${color}">${label}</div>
  </div>`;
}

// ── Sparkline (SVG string) ──────────────────────────────────
export function sparkSVG(points, { width = 90, height = 26, color = 'var(--brand)' } = {}) {
  if (!points || points.length < 2) return '';
  const max = Math.max(...points), min = Math.min(...points);
  const d = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p - min) / (max - min + 1e-6)) * (height - 4) - 2;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${width}" height="${height}"><path d="${d}" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function barsSVG() {
  return '<span class="bars">' + Array.from({ length: 8 }).map((_, i) =>
    `<i style="height:${30 + (i % 4) * 12}%;animation-delay:${i * 0.06}s;animation-duration:${0.6 + (i % 5) * 0.1}s"></i>`).join('') + '</span>';
}

// ── Toast ───────────────────────────────────────────────────
let toastTimer = null;
export function toast(msg, ms = 2200) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast' }, msg);
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), ms);
}

// ── Routes for the floating nav ─────────────────────────────
export const NAV_ROUTES = [
  { path: 'therapist/capture', file: 'therapist/capture.html', key: 'modeCapture',  label: 'Setup',       labelTh: 'ตั้งค่า',         group: 'therapist', icon: 'cam' },
  { path: 'therapist/plan',    file: 'therapist/plan.html',    key: 'modePlan',     label: 'Plan Builder',  labelTh: 'สร้างแผน',       group: 'therapist', icon: 'check' },
  { path: 'therapist/record',  file: 'therapist/record.html',  key: 'modeRecord',   label: 'Data Recorder', labelTh: 'เก็บข้อมูล AI',  group: 'therapist', icon: 'play' },
  { path: 'therapist/dashboard', file: 'therapist/dashboard.html', key: 'modeDash', label: 'Dashboard',   labelTh: 'แดชบอร์ด',       group: 'therapist', icon: 'chart' },
];

function prefixFor(current) {
  const depth = current ? current.split('/').length - 1 : 0;
  return depth > 0 ? '../'.repeat(depth) : '';
}

// ── Floating nav (back · home · screens menu · language) ────
export function mountNav(current) {
  document.querySelectorAll('.nav, .nav-back').forEach((n) => n.remove());
  const lang = getLang();
  const up = prefixFor(current);
  const labelFor = (r) => (lang === 'th' ? r.labelTh : r.label);

  // Back button (hidden on landing)
  if (current) {
    let fallback = up + 'index.html';
    if (current !== 'patient/home' && current.startsWith('patient/')) fallback = up + 'patient/home.html';
    else if (current !== 'therapist/dashboard' && current.startsWith('therapist/')) fallback = up + 'therapist/dashboard.html';
    const back = h('a', {
      class: 'nav-back nav-btn', href: fallback,
      onclick: (e) => {
        e.preventDefault();
        if (window.history.length > 1 && document.referrer && document.referrer !== location.href) history.back();
        else location.href = fallback;
      },
      html: icon('chev_l', { size: 14 }) + (lang === 'th' ? 'ย้อนกลับ' : 'Back'),
    });
    document.body.appendChild(back);
  }

  const isHome = !current;
  const homeHref = up + 'index.html';
  const homeBtn = h('a', { class: 'nav-btn' + (isHome ? ' active' : ''), href: homeHref, title: lang === 'th' ? 'หน้าแรก' : 'Home', html: icon('home', { size: 15, color: isHome ? '#FBFAF5' : 'var(--ink2)' }) });

  const cur = NAV_ROUTES.find((r) => r.path === current);
  const menuBtn = h('button', { class: 'nav-btn' + (cur ? ' active' : ''), html:
    icon(cur ? cur.icon : 'set', { size: 14, color: cur ? '#FBFAF5' : 'var(--ink)' }) +
    (cur ? labelFor(cur) : (lang === 'th' ? 'เลือกหน้าจอ' : 'Screens')) +
    icon('chev_d', { size: 12, color: cur ? '#FBFAF5' : 'var(--ink)' }) });

  const linkFor = (r) => h('a', {
    class: current === r.path ? 'active' : '', href: up + r.file,
    html: icon(r.icon, { size: 14, color: current === r.path ? 'var(--brand)' : 'var(--ink2)' }) + labelFor(r),
  });
  const menu = h('div', { class: 'nav-menu' },
    h('div', { class: 'group-label' }, lang === 'th' ? 'นักกายภาพ (เว็บ)' : 'Therapist (web)'),
    ...NAV_ROUTES.map(linkFor),
  );
  const menuWrap = h('div', { style: { position: 'relative' } }, menuBtn, menu);
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
  document.addEventListener('click', () => menu.classList.remove('open'));

  const langBtn = h('button', { class: 'nav-btn', title: lang === 'th' ? 'เปลี่ยนภาษา (TH/EN)' : 'Switch language (EN/TH)', html: icon('globe', { size: 14 }) + (lang === 'th' ? 'TH' : 'EN'),
    onclick: () => setLang(lang === 'th' ? 'en' : 'th') });

  const nav = h('div', { class: 'nav' }, homeBtn, menuWrap, langBtn);
  document.body.appendChild(nav);
}

// ── Phone shell (wrap a mobile page in a device bezel) ──────
export function phoneShell(contentNode) {
  return h('div', { class: 'mobile-shell' },
    h('div', { class: 'phone' },
      h('div', { class: 'phone-screen' },
        h('div', { class: 'phone-notch' }),
        h('div', { class: 'phone-statusbar', html:
          '<span>9:41</span><span style="display:flex;gap:6px;align-items:center">' +
          icon('sig', { size: 15 }) + icon('globe', { size: 13 }) +
          '<span style="display:inline-block;width:24px;height:12px;border:1.5px solid var(--ink);border-radius:3px;position:relative"><span style="position:absolute;inset:1.5px;width:78%;background:var(--ink);border-radius:1px"></span></span></span>' }),
        contentNode,
        h('div', { class: 'phone-home-indicator' }),
      )));
}

// Standard <head> font + stylesheet block (documented; pages include inline).
export const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
