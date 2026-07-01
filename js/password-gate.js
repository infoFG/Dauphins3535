// Simple password gate for review branches
// Password is set below — change PASSWORD_HASH when rotating
// To generate: run in console: await crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpassword')).then(h => Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,'0')).join(''))
// Current password: dauphins2026
const PASSWORD_HASH = 'f9747267ab8b21bfffef8f9c449a24aa9917a68ad6dba22cda42a4551ea17dd4';

(async function() {
  // Already authenticated this session?
  if (sessionStorage.getItem('_auth') === '1') return;

  const overlay = document.createElement('div');
  overlay.id = 'pw-gate';
  overlay.innerHTML = `
    <style>
      #pw-gate {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(58,36,4,0.95);
        display: flex; align-items: center; justify-content: center;
        font-family: system-ui, sans-serif;
      }
      #pw-gate form {
        background: #fff; padding: 2.5rem; border-radius: 12px;
        text-align: center; max-width: 360px; width: 90%;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      #pw-gate h2 { margin: 0 0 0.5rem; color: #3A2404; font-size: 1.3rem; }
      #pw-gate p { color: #89897C; font-size: 0.85rem; margin: 0 0 1.25rem; }
      #pw-gate input {
        width: 100%; padding: 0.65rem 0.75rem; border: 1px solid #D3D8D6;
        border-radius: 8px; font-size: 1rem; text-align: center;
        box-sizing: border-box; margin-bottom: 0.75rem;
      }
      #pw-gate button {
        width: 100%; padding: 0.65rem; background: #A19B80; color: #fff;
        border: none; border-radius: 8px; font-size: 0.95rem; cursor: pointer;
        font-weight: 600;
      }
      #pw-gate button:hover { background: #8a856e; }
      #pw-gate .error { color: #c62828; font-size: 0.8rem; margin-top: 0.5rem; display: none; }
    </style>
    <form autocomplete="off">
      <h2>🔒 Accès restreint</h2>
      <p>Ce site est en révision. Veuillez entrer le mot de passe.</p>
      <input type="password" id="pw-input" placeholder="Mot de passe" autofocus>
      <button type="submit">Accéder</button>
      <div class="error" id="pw-error">Mot de passe incorrect.</div>
    </form>
  `;
  document.body.prepend(overlay);

  const form = overlay.querySelector('form');
  const input = overlay.querySelector('#pw-input');
  const error = overlay.querySelector('#pw-error');

  async function hashPassword(pw) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hash = await hashPassword(input.value);
    if (hash === PASSWORD_HASH) {
      sessionStorage.setItem('_auth', '1');
      overlay.remove();
    } else {
      error.style.display = 'block';
      input.value = '';
      input.focus();
    }
  });
})();
