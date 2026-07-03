// wakeAlert (web) — imperative overlay replacing react-native's Alert.alert,
// which is a no-op in react-native-web. Renders in vanilla DOM so it works from
// any context (screens, services, error handlers) without depending on the
// React tree. Signature matches Alert.alert:
//   wakeAlert(title, message?, buttons?, options?)
//   buttons: Array<{ text, onPress?, style?: 'default'|'cancel'|'destructive' }>
//
// No buttons / single button  → auto-dismissing toast (onPress fires on close).
// Two or more buttons          → modal dialog (backdrop, focus, keyboard).
// Design: dark premium system — canvas #1a1a1a, white opacity tones, spring ease.

const EASE = 'cubic-bezier(0.22,1,0.36,1)';
let stylesInjected = false;

function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.setAttribute('data-wake-alert', '');
  style.textContent = `
    .wk-alert-backdrop{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
      padding:24px;opacity:0;transition:opacity .22s ${EASE};}
    .wk-alert-backdrop.in{opacity:1;}
    .wk-alert-card{width:100%;max-width:340px;background:#1f1f1f;border:1px solid rgba(255,255,255,0.08);
      border-radius:18px;padding:22px 20px 16px;box-shadow:0 24px 60px rgba(0,0,0,0.5);
      transform:translateY(12px) scale(.98);opacity:0;transition:transform .28s ${EASE},opacity .28s ${EASE};}
    .wk-alert-backdrop.in .wk-alert-card{transform:translateY(0) scale(1);opacity:1;}
    .wk-alert-title{font-size:17px;font-weight:600;color:rgba(255,255,255,0.95);margin:0 0 6px;line-height:1.3;}
    .wk-alert-msg{font-size:14px;color:rgba(255,255,255,0.62);margin:0 0 18px;line-height:1.45;white-space:pre-wrap;}
    .wk-alert-btns{display:flex;flex-direction:column;gap:8px;}
    .wk-alert-btn{width:100%;border:none;border-radius:12px;padding:13px 16px;font-size:15px;font-weight:600;
      cursor:pointer;transition:opacity .15s ${EASE},background .15s ${EASE};font-family:inherit;}
    .wk-alert-btn:active{opacity:.7;}
    .wk-alert-btn.default{background:#fff;color:#111;}
    .wk-alert-btn.cancel{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.85);}
    .wk-alert-btn.destructive{background:rgba(220,60,60,0.14);color:#ff6b6b;}
    .wk-toast-root{position:fixed;top:0;left:0;right:0;z-index:99999;display:flex;flex-direction:column;
      align-items:center;gap:8px;padding:16px 16px 0;pointer-events:none;}
    .wk-toast{pointer-events:auto;max-width:440px;width:100%;display:flex;align-items:flex-start;gap:10px;
      background:#1f1f1f;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:13px 15px;
      box-shadow:0 12px 34px rgba(0,0,0,0.45);color:rgba(255,255,255,0.9);font-size:14px;line-height:1.4;
      transform:translateY(-14px);opacity:0;transition:transform .26s ${EASE},opacity .26s ${EASE};cursor:pointer;}
    .wk-toast.in{transform:translateY(0);opacity:1;}
    .wk-toast-title{font-weight:600;color:rgba(255,255,255,0.96);}
    .wk-toast-dot{flex-shrink:0;width:8px;height:8px;border-radius:4px;margin-top:5px;background:rgba(255,255,255,0.5);}
    .wk-toast-dot.error{background:#ff6b6b;}
  `;
  document.head.appendChild(style);
}

function looksLikeError(title = '', message = '') {
  return /error|fall|no se pudo|inv[aá]lid|problema|intenta|no pudimos/i.test(`${title} ${message}`);
}

function showToast(title, message, onClose) {
  injectStyles();
  let root = document.querySelector('.wk-toast-root');
  if (!root) {
    root = document.createElement('div');
    root.className = 'wk-toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = 'wk-toast';
  const isErr = looksLikeError(title, message);
  const body = [title, message].filter(Boolean);
  el.innerHTML =
    `<span class="wk-toast-dot${isErr ? ' error' : ''}"></span>` +
    `<span><span class="wk-toast-title">${escapeHtml(body[0] || '')}</span>` +
    (body[1] ? `<br/>${escapeHtml(body[1])}` : '') + '</span>';
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    el.classList.remove('in');
    setTimeout(() => { el.remove(); onClose?.(); }, 260);
  };
  el.addEventListener('click', close);
  setTimeout(close, 4200);
}

function showDialog(title, message, buttons) {
  injectStyles();
  const backdrop = document.createElement('div');
  backdrop.className = 'wk-alert-backdrop';
  const card = document.createElement('div');
  card.className = 'wk-alert-card';
  card.innerHTML =
    (title ? `<p class="wk-alert-title">${escapeHtml(title)}</p>` : '') +
    (message ? `<p class="wk-alert-msg">${escapeHtml(message)}</p>` : '') +
    '<div class="wk-alert-btns"></div>';
  const btnRow = card.querySelector('.wk-alert-btns');

  let closed = false;
  const close = (cb) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.classList.remove('in');
    setTimeout(() => { backdrop.remove(); cb?.(); }, 280);
  };

  // Render cancel-style buttons last (visually bottom) to match native ordering.
  const ordered = [...buttons].sort((a, b) => {
    const rank = (x) => (x.style === 'cancel' ? 1 : 0);
    return rank(a) - rank(b);
  });
  ordered.forEach((b) => {
    const btn = document.createElement('button');
    btn.className = `wk-alert-btn ${b.style === 'destructive' ? 'destructive' : b.style === 'cancel' ? 'cancel' : 'default'}`;
    btn.textContent = b.text || 'OK';
    btn.addEventListener('click', () => close(b.onPress));
    btnRow.appendChild(btn);
  });

  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const onKey = (e) => {
    if (e.key === 'Escape') close(cancelBtn?.onPress);
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close(cancelBtn?.onPress);
  });
  document.addEventListener('keydown', onKey);

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('in'));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wakeAlert(title, message, buttons, _options) {
  if (typeof document === 'undefined') return;
  const btns = Array.isArray(buttons) ? buttons.filter(Boolean) : [];
  if (btns.length >= 2) {
    showDialog(title, message, btns);
  } else {
    showToast(title, message, btns[0]?.onPress);
  }
}

export default wakeAlert;
