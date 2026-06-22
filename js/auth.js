/* Autenticación con Supabase (email + contraseña). Controla la pantalla de
   login y avisa a la app cuando hay/no hay sesión. */

const Auth = (() => {
  function el(id) { return document.getElementById(id); }

  function mostrarLogin() {
    el('pantallaLogin').style.display = 'flex';
    el('appPrincipal').style.display = 'none';
    el('headerUsuario').style.display = 'none';
  }

  function mostrarApp(email) {
    el('pantallaLogin').style.display = 'none';
    el('appPrincipal').style.display = '';
    el('headerUsuario').style.display = 'flex';
    el('usuarioEmail').textContent = email || '';
  }

  function setMsg(texto, tipo) {
    const m = el('loginMsg');
    m.textContent = texto || '';
    m.className = 'login-msg' + (tipo ? ' ' + tipo : '');
  }

  async function iniciarSesion(email, password) {
    if (!window.sb) { setMsg('Sin conexión a la nube. Revisa tu internet.', 'error'); return; }
    setMsg('Ingresando…');
    const { error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) { setMsg(traducirError(error.message), 'error'); return; }
    setMsg('');
  }

  async function registrarse(email, password) {
    if (!window.sb) { setMsg('Sin conexión a la nube. Revisa tu internet.', 'error'); return; }
    setMsg('Creando cuenta…');
    const { data, error } = await window.sb.auth.signUp({ email, password });
    if (error) { setMsg(traducirError(error.message), 'error'); return; }
    if (data && data.session) {
      setMsg('');
    } else {
      setMsg('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.', 'ok');
    }
  }

  async function cerrarSesion() {
    if (window.sb) await window.sb.auth.signOut();
    Storage.limpiarCacheLocal();
    mostrarLogin();
  }

  function traducirError(msg) {
    const m = (msg || '').toLowerCase();
    if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
    if (m.includes('already registered')) return 'Ese correo ya tiene una cuenta. Inicia sesión.';
    if (m.includes('password')) return 'La contraseña debe tener al menos 6 caracteres.';
    if (m.includes('email')) return 'Revisa el correo ingresado.';
    return msg;
  }

  function init(onLogin, onLogout) {
    // Formulario
    el('formLogin').addEventListener('submit', (e) => {
      e.preventDefault();
      iniciarSesion(el('loginEmail').value.trim(), el('loginPassword').value);
    });
    el('btnRegistrarse').addEventListener('click', () => {
      registrarse(el('loginEmail').value.trim(), el('loginPassword').value);
    });
    el('btnCerrarSesion').addEventListener('click', cerrarSesion);

    if (!window.sb) {
      // Sin librería/cliente (offline total): modo local con lo que haya en caché.
      mostrarApp('(sin conexión)');
      onLogin();
      return;
    }

    async function entrar(session) {
      mostrarApp(session.user.email);
      window.Perfil = await Storage.miPerfil();
      onLogin();
    }

    // Reacciona a cambios de sesión (login, logout, refresco de token).
    window.sb.auth.onAuthStateChange((_event, session) => {
      if (session && session.user) {
        entrar(session);
      } else {
        window.Perfil = null;
        mostrarLogin();
        if (onLogout) onLogout();
      }
    });

    // Estado inicial
    window.sb.auth.getSession().then(({ data }) => {
      if (data && data.session) {
        entrar(data.session);
      } else {
        mostrarLogin();
      }
    });
  }

  return { init, cerrarSesion };
})();

window.Auth = Auth;
