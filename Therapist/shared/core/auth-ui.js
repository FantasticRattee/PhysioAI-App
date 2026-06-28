// PhysioAI · Therapist (web) — login/register overlay.
// ensureTherapist() resolves with the therapist user, showing a sign-in card first
// if there's no valid session. Re-exports getTherapist/logout for convenience.

import { h, clear, getLang } from './ui.js';
import { login, register, resendVerification, getTherapist, isLoggedIn, logout, verify, continueAsGuest, isGuest } from './auth.js';
import { isDemoEnabled } from './api.js';

export { getTherapist, logout, isGuest };

const LOGO = new URL('../assets/logo-reversed.svg', import.meta.url).href;

/** Resolve with the logged-in therapist; otherwise show the sign-in overlay. */
export function ensureTherapist() {
  return new Promise((resolve) => {
    if (isLoggedIn()) { verify(); resolve(getTherapist()); return; }
    if (isGuest()) { resolve({ guest: true, name: 'Guest' }); return; }
    showOverlay(resolve);
  });
}

const STYLE_ID = 'physioai-auth-styles';
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  .auth-overlay {
    position: fixed; inset: 0; z-index: 9999;
    display: flex; align-items: center; justify-content: center; padding: 24px;
    background:
      radial-gradient(130% 90% at 50% -8%, var(--brand-soft) 0%, rgba(245,241,232,0) 58%),
      var(--bg);
    animation: px-fade-in .25s ease both;
  }
  .auth-card {
    width: 100%; max-width: 384px; background: var(--surface);
    border-radius: var(--r-xl); padding: 32px 28px 26px;
    box-shadow: var(--shadow-lg), inset 0 0 0 1px var(--line);
  }
  .auth-head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; }
  .auth-logo {
    width: 60px; height: 60px; border-radius: 18px; background: var(--brand-deep);
    display: flex; align-items: center; justify-content: center; margin-bottom: 10px;
    box-shadow: 0 14px 30px rgba(47,93,80,0.30);
  }
  .auth-word { font-family: "Gabarito","Inter Tight",sans-serif; font-weight: 700; font-size: 25px; letter-spacing: -0.4px; color: var(--ink); line-height: 1.1; }
  .auth-word b { color: var(--brand-deep); }
  .auth-eyebrow { font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 600; color: var(--ink3); }
  .auth-lead { font-size: 13.5px; color: var(--ink2); margin: 14px 0 2px; text-align: center; }
  .auth-field { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
  .auth-field label, .auth-field > span { font-size: 12px; font-weight: 600; letter-spacing: .2px; color: var(--ink2); }
  .auth-card .auth-input {
    height: 46px; padding: 0 14px; border-radius: var(--r-md);
    border: 1px solid var(--line); background: var(--surface);
    color: var(--ink); font-family: inherit; font-size: 14.5px;
    transition: border-color .15s, box-shadow .15s; outline: none; width: 100%;
  }
  .auth-card .auth-input::placeholder { color: var(--ink3); }
  .auth-card .auth-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
  .auth-err { min-height: 18px; font-size: 12.5px; font-weight: 500; color: var(--bad); margin: 12px 2px 0; text-align: center; }
  .auth-err.info { color: var(--brand-deep); }
  .auth-submit { margin-top: 4px; }
  .auth-verify { display: flex; flex-direction: column; gap: 14px; margin-top: 18px; text-align: center; }
  .auth-verify-title { font-weight: 700; color: var(--ink); font-size: 15px; }
  .auth-verify-copy { color: var(--ink2); font-size: 13.5px; line-height: 1.55; margin: 0; }
  .auth-verify-email {
    display: block; width: 100%; min-height: 42px; padding: 10px 12px;
    border-radius: var(--r-md); border: 1px solid var(--line); background: var(--brand-soft);
    color: var(--brand-deep); font-size: 13px; font-weight: 700; word-break: break-word;
  }
  .auth-toggle {
    width: 100%; margin-top: 12px; padding: 8px; background: none; border: 0;
    color: var(--brand-deep); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .auth-toggle:hover { text-decoration: underline; }
  .auth-resend { display: none; width: 100%; margin-top: 8px; padding: 8px; background: none; border: 0; color: var(--brand-deep); font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
  .auth-resend:hover { text-decoration: underline; }
  .auth-guest { width: 100%; margin-top: 2px; padding: 7px; background: none; border: 0; color: var(--ink3); font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .auth-guest:hover { color: var(--ink2); text-decoration: underline; }
  `;
  document.head.appendChild(style);
}

function showOverlay(resolve) {
  injectStyles();
  const th = () => getLang() === 'th';
  const vals = { name: '', email: '', password: '' };
  let mode = 'login'; // 'login' | 'register' | 'verify'
  let busy = false;

  const overlay = h('div', { class: 'auth-overlay' });
  const card = h('div', { class: 'auth-card' });
  overlay.append(card);

  const msg = (code) => {
    const T = th();
    switch (code) {
      case 'required': return T ? 'กรอกข้อมูลให้ครบ' : 'Please fill in all fields';
      case 'invalid': return T ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'Wrong email or password';
      case 'exists': return T ? 'อีเมลนี้ถูกใช้แล้ว' : 'Email already registered';
      case 'not_therapist': return T ? 'บัญชีนี้ไม่ใช่นักกายภาพ' : 'This account is not a therapist';
      case 'email_confirmation_required': return T
        ? 'ส่งอีเมลยืนยันแล้ว กรุณากดยืนยันในอีเมล แล้วกลับมาเข้าสู่ระบบ'
        : 'Verification email sent. Please verify your email, then sign in.';
      case 'email_not_verified': return T
        ? 'อีเมลนี้ยังไม่ได้ยืนยัน กรุณาคลิกลิงก์ verify ในอีเมล หรือส่งลิงก์ใหม่'
        : 'This email is not verified yet. Click the verify link in your email, or resend it.';
      case 'verification_resent': return T
        ? 'ส่งลิงก์ยืนยันใหม่แล้ว กรุณาเช็กอีเมล'
        : 'Verification link resent. Please check your email.';
      default: return T ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ' : 'Could not reach the server';
    }
  };
  const submitLabel = () => mode === 'register' ? (th() ? 'สร้างบัญชี' : 'Create account') : (th() ? 'เข้าสู่ระบบ' : 'Sign in');

  function field(labelText, key, type, placeholder) {
    const input = h('input', {
      type, value: vals[key], placeholder: placeholder || '', class: 'auth-input',
      autocomplete: type === 'password' ? (mode === 'register' ? 'new-password' : 'current-password') : type,
      oninput: (e) => { vals[key] = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter') submit(); },
    });
    return h('label', { class: 'auth-field' }, h('span', {}, labelText), input);
  }

  async function submit() {
    if (busy) return;
    busy = true; err.textContent = ''; err.classList.remove('info'); btn.disabled = true; btn.textContent = th() ? 'กำลังดำเนินการ…' : 'Please wait…';
    try {
      const creds = { email: vals.email, password: vals.password };
      const user = mode === 'register' ? await register({ name: vals.name, ...creds }) : await login(creds);
      overlay.remove();
      resolve(user);
    } catch (e) {
      if (mode === 'register' && e.code === 'email_confirmation_required') {
        mode = 'verify';
        busy = false;
        rebuild();
        return;
      }
      const needsVerification = e.code === 'email_confirmation_required';
      err.classList.toggle('info', needsVerification);
      err.textContent = msg(needsVerification && mode === 'login' ? 'email_not_verified' : e.code);
      if (resendBtn) resendBtn.style.display = needsVerification ? 'block' : 'none';
      busy = false; btn.disabled = false; btn.textContent = submitLabel();
    }
  }

  async function resendEmail(button, target = err) {
    if (busy) return;
    const label = button?.textContent || '';
    if (button) { button.disabled = true; button.textContent = th() ? 'กำลังส่ง…' : 'Sending…'; }
    try {
      await resendVerification(vals.email);
      if (target) {
        target.classList.add('info');
        target.textContent = msg('verification_resent');
      }
    } catch (e) {
      if (target) {
        target.classList.remove('info');
        target.textContent = msg(e.code);
      }
    } finally {
      if (button) { button.disabled = false; button.textContent = label; }
    }
  }

  let btn, err, resendBtn;
  function showSignIn() {
    mode = 'login';
    busy = false;
    rebuild();
  }

  function rebuild() {
    clear(card);
    const T = th();
    if (mode === 'verify') {
      const signIn = h('button', {
        class: 'btn primary block lg auth-submit',
        onclick: showSignIn,
      }, T ? 'กลับไปหน้าเข้าสู่ระบบ' : 'Back to sign in');
      card.append(...[
        h('div', { class: 'auth-head' },
          h('div', { class: 'auth-logo', html: `<img src="${LOGO}" width="30" height="30" alt="PhysioAI"/>` }),
          h('div', { class: 'auth-word', html: 'Physio<b>AI</b>' }),
          h('div', { class: 'auth-eyebrow' }, T ? 'ยืนยันอีเมล' : 'Verify email'),
        ),
        h('div', { class: 'auth-verify' },
          h('div', { class: 'auth-verify-title' }, T ? 'สร้างบัญชีแล้ว' : 'Account created'),
          h('p', { class: 'auth-verify-copy' }, T
            ? 'เราได้ส่งลิงก์ยืนยันไปที่อีเมลนี้ กรุณาเปิดอีเมลแล้วคลิกลิงก์ verify ก่อนกลับมาเข้าสู่ระบบ'
            : 'We sent a verification link to this email. Please open it and click the verify link before signing in.'),
          h('span', { class: 'auth-verify-email' }, vals.email || 'you@example.com'),
          err = h('div', { class: 'auth-err info' }, ''),
          h('button', { class: 'auth-toggle', onclick: (e) => resendEmail(e.currentTarget, err) },
            T ? 'ส่งลิงก์ยืนยันใหม่' : 'Resend verification email'),
          signIn,
          h('button', { class: 'auth-toggle', onclick: () => { mode = 'register'; rebuild(); } },
            T ? 'ใช้อีเมลอื่น' : 'Use a different email'),
        ),
      ]);
      return;
    }

    btn = h('button', { class: 'btn primary block lg auth-submit', onclick: submit }, submitLabel());
    err = h('div', { class: 'auth-err' }, '');
    resendBtn = h('button', { class: 'auth-resend', onclick: (e) => resendEmail(e.currentTarget, err) },
      T ? 'ส่งลิงก์ยืนยันใหม่' : 'Resend verification email');
    const toggle = h('button', {
      class: 'auth-toggle',
      onclick: () => { mode = mode === 'login' ? 'register' : 'login'; rebuild(); },
    }, mode === 'login' ? (T ? 'ยังไม่มีบัญชี? สร้างบัญชีนักกายภาพ' : 'No account? Create a therapist account')
                        : (T ? 'มีบัญชีอยู่แล้ว? เข้าสู่ระบบ' : 'Have an account? Sign in'));
    const guest = isDemoEnabled()
      ? h('button', {
          class: 'auth-guest', title: T ? 'ชมระบบด้วยข้อมูลตัวอย่าง (ไม่บันทึกขึ้นคลาวด์)' : 'Explore with sample data (nothing saved to the cloud)',
          onclick: () => { continueAsGuest(); overlay.remove(); resolve({ guest: true, name: 'Guest' }); },
        }, T ? 'หรือเข้าชมแบบเดโม (Guest)' : 'or explore as guest (demo)')
      : null;

    card.append(...[
      h('div', { class: 'auth-head' },
        h('div', { class: 'auth-logo', html: `<img src="${LOGO}" width="30" height="30" alt="PhysioAI"/>` }),
        h('div', { class: 'auth-word', html: 'Physio<b>AI</b>' }),
        h('div', { class: 'auth-eyebrow' }, T ? 'คอนโซลนักกายภาพ' : 'Therapist Console'),
      ),
      h('div', { class: 'auth-lead' },
        mode === 'register' ? (T ? 'สร้างบัญชีนักกายภาพใหม่' : 'Create your therapist account')
                            : (T ? 'เข้าสู่ระบบเพื่อจัดการแผนการรักษาผู้ป่วย' : 'Sign in to manage your patients')),
      mode === 'register' ? field(T ? 'ชื่อ' : 'Name', 'name', 'text', T ? 'ชื่อ-นามสกุล' : 'Your name') : null,
      field(T ? 'อีเมล' : 'Email', 'email', 'email', 'you@example.com'),
      field(T ? 'รหัสผ่าน' : 'Password', 'password', 'password', '••••••••'),
      err,
      resendBtn,
      btn,
      toggle,
      guest,
    ].filter(Boolean));
  }

  rebuild();
  document.body.append(overlay);
}
