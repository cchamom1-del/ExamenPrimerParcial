const API_BASE =
'https://backvideo-hpevgdenh7hygvfm.canadacentral-01.azurewebsites.net';
const state = {
  videos: [],
  categories: [],
  currentVideo: null,
  user: JSON.parse(localStorage.getItem('videoedu_user') || 'null')
};

const $ = (id) => document.getElementById(id);
const els = {
  sessionLabel: $('sessionLabel'), btnRegister: $('btnRegister'), btnLogin: $('btnLogin'), btnLogout: $('btnLogout'),
  searchInput: $('searchInput'), categorySelect: $('categorySelect'), videoGrid: $('videoGrid'), videoCount: $('videoCount'),
  loading: $('loading'), errorBox: $('errorBox'), emptyState: $('emptyState'), authModal: $('authModal'), videoModal: $('videoModal'),
  tabLogin: $('tabLogin'), tabRegister: $('tabRegister'), loginForm: $('loginForm'), registerForm: $('registerForm'),
  loginUser: $('loginUser'), loginPassword: $('loginPassword'), loginMessage: $('loginMessage'),
  regCarnet: $('regCarnet'), regName: $('regName'), regEmail: $('regEmail'), regPassword: $('regPassword'), registerMessage: $('registerMessage'),
  playerHost: $('playerHost'), detailCategory: $('detailCategory'), detailTitle: $('detailTitle'), detailDescription: $('detailDescription'),
  detailDuration: $('detailDuration'), likeButton: $('likeButton'), likeCount: $('likeCount'), commentsCount: $('commentsCount'),
  commentForm: $('commentForm'), commentText: $('commentText'), interactionNotice: $('interactionNotice'), commentsList: $('commentsList')
};

function firstDefined(obj, keys, fallback = '') {
  for (const key of keys) if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  return fallback;
}

function unwrapArray(payload, likelyKeys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of [...likelyKeys, 'data', 'result', 'resultado', 'items']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function getVideoId(v) { return firstDefined(v, ['idVideo', 'id_video', 'videoId', 'id']); }
function getVideoTitle(v) { return firstDefined(v, ['titulo', 'title', 'nombre'], 'Video educativo'); }
function getVideoDescription(v) { return firstDefined(v, ['descripcion', 'description', 'detalle'], 'Sin descripción disponible.'); }
function getVideoDuration(v) { return firstDefined(v, ['duracion', 'duration', 'tiempo'], ''); }
function getVideoCategory(v) {
  const raw = firstDefined(v, ['categoria', 'nombreCategoria', 'category'], 'General');
  if (typeof raw === 'object' && raw) return firstDefined(raw, ['nombre', 'nombreCategoria', 'categoria'], 'General');
  return raw || 'General';
}
function getVideoPoster(v) {
  return firstDefined(v, ['poster', 'posterUrl', 'urlPoster', 'imagen', 'imagenUrl', 'thumbnail', 'miniatura'], 'https://placehold.co/800x450/e2e8f0/475569?text=Video+Educativo');
}
function getVideoUrl(v) { return firstDefined(v, ['url', 'urlVideo', 'videoUrl', 'url_video', 'enlace', 'ruta', 'src']); }
function getCarnetFromUser(u = state.user) { return firstDefined(u, ['carne', 'carnet', 'usuario', 'user']); }
function getDisplayName(u = state.user) { return firstDefined(u, ['estudiante', 'nombre', 'name', 'correo', 'email', 'usuario'], getCarnetFromUser(u) || 'Estudiante'); }

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let body = null;
  const contentType = res.headers.get('content-type') || '';
  try { body = contentType.includes('application/json') ? await res.json() : await res.text(); } catch { body = null; }
  if (!res.ok) {
    const msg = typeof body === 'string' ? body : firstDefined(body, ['mensaje', 'message', 'error'], `Error ${res.status}`);
    const err = new Error(msg || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

function updateSessionUI() {
  const logged = !!state.user;
  els.sessionLabel.textContent = logged ? `Sesión: ${getDisplayName()}` : 'Visitante';
  els.btnLogin.classList.toggle('hidden', logged);
  els.btnRegister.classList.toggle('hidden', logged);
  els.btnLogout.classList.toggle('hidden', !logged);
  els.interactionNotice.textContent = logged ? '' : 'Inicia sesión para dar Me Gusta, comentar y responder.';
}

function openAuth(mode = 'login') {
  els.authModal.classList.remove('hidden');
  switchAuthTab(mode);
}
function closeAuth() { els.authModal.classList.add('hidden'); }
function switchAuthTab(mode) {
  const login = mode === 'login';
  els.tabLogin.classList.toggle('active', login);
  els.tabRegister.classList.toggle('active', !login);
  els.loginForm.classList.toggle('hidden', !login);
  els.registerForm.classList.toggle('hidden', login);
  els.loginMessage.textContent = '';
  els.registerMessage.textContent = '';
}
function setMessage(el, text, ok = false) {
  el.textContent = text;
  el.className = `form-message ${ok ? 'ok' : 'bad'}`;
}

async function loadCategories() {
  try {
    const payload = await api('/api/videos/categoria');
    const rows = unwrapArray(payload, ['categorias', 'categories']);
    state.categories = rows.map(c => typeof c === 'string' ? c : firstDefined(c, ['nombreCategoria', 'nombre', 'categoria', 'category'])).filter(Boolean);
  } catch {
    state.categories = [];
  }

  if (!state.categories.length) {
    state.categories = [...new Set(state.videos.map(getVideoCategory).filter(Boolean))];
  }
  els.categorySelect.innerHTML = '<option value="">Todas las categorías</option>' +
    state.categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}

async function loadVideos(path = '/api/videos') {
  els.loading.classList.remove('hidden');
  els.errorBox.classList.add('hidden');
  try {
    const payload = await api(path);
    state.videos = unwrapArray(payload, ['videos']);
    renderVideos();
  } catch (err) {
    state.videos = [];
    renderVideos();
    els.errorBox.textContent = `No fue posible cargar el catálogo: ${err.message}`;
    els.errorBox.classList.remove('hidden');
  } finally {
    els.loading.classList.add('hidden');
  }
}

function renderVideos() {
  const q = els.searchInput.value.trim().toLowerCase();
  const cat = els.categorySelect.value;
  const filtered = state.videos.filter(v => {
    const text = `${getVideoTitle(v)} ${getVideoDescription(v)}`.toLowerCase();
    const matchesText = !q || text.includes(q);
    const matchesCat = !cat || getVideoCategory(v) === cat;
    return matchesText && matchesCat;
  });

  els.videoGrid.innerHTML = '';
  els.videoCount.textContent = `${filtered.length} video${filtered.length === 1 ? '' : 's'}`;
  els.emptyState.classList.toggle('hidden', filtered.length !== 0 || state.videos.length === 0);

  const tpl = $('videoCardTemplate');
  for (const v of filtered) {
    const node = tpl.content.cloneNode(true);
    const img = node.querySelector('.poster');
    img.src = getVideoPoster(v);
    img.onerror = () => { img.src = 'https://placehold.co/800x450/e2e8f0/475569?text=Video+Educativo'; };
    node.querySelector('.duration-pill').textContent = getVideoDuration(v) || 'Video';
    node.querySelector('.card-category').textContent = getVideoCategory(v);
    node.querySelector('.card-title').textContent = getVideoTitle(v);
    node.querySelector('.card-description').textContent = getVideoDescription(v);
    node.querySelector('.play-btn').addEventListener('click', () => openVideo(v));
    els.videoGrid.appendChild(node);
  }
}

async function filterByCategory() {
  const cat = els.categorySelect.value;
  if (!cat) return loadVideos('/api/videos');
  els.loading.classList.remove('hidden');
  try {
    const payload = await api(`/api/videos/categoria/${encodeURIComponent(cat)}`);
    state.videos = unwrapArray(payload, ['videos']);
    renderVideos();
  } catch {
    // Si el backend no filtra como se espera, se conserva filtrado local del catálogo completo.
    await loadVideos('/api/videos');
    els.categorySelect.value = cat;
    renderVideos();
  } finally { els.loading.classList.add('hidden'); }
}

function requireLogin() {
  if (state.user) return true;
  alert('Debes iniciar sesión para usar esta función.');
  openAuth('login');
  return false;
}

async function openVideo(video) {
  els.videoModal.classList.remove('hidden');
  state.currentVideo = video;
  renderVideoDetail(video);
  const id = getVideoId(video);
  if (!id) return;
  try {
    const detail = await api(`/api/videos/${id}`);
    const data = detail?.video || detail?.data || detail;
    if (data && typeof data === 'object') {
      state.currentVideo = data;
      renderVideoDetail(data);
    }
  } catch (err) {
    console.warn('No se pudo ampliar el detalle:', err.message);
  }
}

function closeVideo() {
  els.videoModal.classList.add('hidden');
  els.playerHost.innerHTML = '';
  state.currentVideo = null;
}

function toYouTubeEmbed(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return `https://www.youtube.com/embed/${u.pathname.replace('/', '')}`;
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith('/embed/')) return url;
    }
  } catch {}
  return null;
}

function renderPlayer(video) {
  const url = getVideoUrl(video);
  els.playerHost.innerHTML = '';
  if (!url) {
    els.playerHost.innerHTML = '<div class="player-fallback">El API no devolvió una URL reproducible para este video.</div>';
    return;
  }
  const yt = toYouTubeEmbed(url);
  if (yt) {
    const iframe = document.createElement('iframe');
    iframe.src = yt;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    els.playerHost.appendChild(iframe);
    return;
  }
  const videoEl = document.createElement('video');
  videoEl.src = url;
  videoEl.controls = true;
  videoEl.autoplay = false;
  videoEl.poster = getVideoPoster(video);
  videoEl.addEventListener('error', () => {
    els.playerHost.innerHTML = `<div class="player-fallback">No se pudo reproducir directamente. <a href="${escapeAttr(url)}" target="_blank" rel="noopener" style="color:#93c5fd">Abrir recurso</a></div>`;
  }, { once: true });
  els.playerHost.appendChild(videoEl);
}

function renderVideoDetail(v) {
  renderPlayer(v);
  els.detailCategory.textContent = getVideoCategory(v);
  els.detailTitle.textContent = getVideoTitle(v);
  els.detailDescription.textContent = getVideoDescription(v);
  els.detailDuration.textContent = getVideoDuration(v) ? `Duración: ${getVideoDuration(v)}` : '';

  const likes = Number(firstDefined(v, ['likes', 'cantidadLikes', 'totalLikes', 'meGusta', 'cantidad_me_gusta'], 0)) || 0;
  const liked = Boolean(firstDefined(v, ['liked', 'tieneLike', 'leGusta', 'miLike'], false));
  els.likeButton.innerHTML = `${liked ? '♥' : '♡'} Me Gusta <span id="likeCount">${likes ? `(${likes})` : ''}</span>`;

  const comments = unwrapArray(firstDefined(v, ['comentarios', 'comments'], []), ['comentarios', 'comments']);
  renderComments(comments);
  updateSessionUI();
}

function normalizeComment(c) {
  return {
    raw: c,
    id: firstDefined(c, ['idComentario', 'id_comentario', 'comentarioId', 'id']),
    carnet: firstDefined(c, ['carne', 'carnet', 'carnetEstudiante', 'usuario']),
    author: firstDefined(c, ['estudiante', 'nombreEstudiante', 'nombre', 'autor', 'usuario'], firstDefined(c, ['carne', 'carnet'], 'Estudiante')),
    text: firstDefined(c, ['texto', 'comentario', 'contenido', 'text'], ''),
    replies: unwrapArray(firstDefined(c, ['respuestas', 'replies'], []), ['respuestas', 'replies'])
  };
}

function renderComments(comments) {
  els.commentsList.innerHTML = '';
  els.commentsCount.textContent = comments.length;
  if (!comments.length) {
    els.commentsList.innerHTML = '<p class="muted">Todavía no hay comentarios.</p>';
    return;
  }
  comments.forEach(c => {
    const item = normalizeComment(c);
    els.commentsList.appendChild(buildCommentNode(item, false));
    item.replies.forEach(r => els.commentsList.appendChild(buildCommentNode(normalizeComment(r), true)));
  });
}

function buildCommentNode(c, isReply) {
  const div = document.createElement('div');
  div.className = `comment${isReply ? ' reply' : ''}`;
  const own = state.user && String(c.carnet) === String(getCarnetFromUser());
  div.innerHTML = `
    <div class="comment-meta">
      <span class="comment-author">${escapeHtml(c.author || c.carnet || 'Estudiante')}</span>
      <span class="muted">${escapeHtml(c.carnet || '')}</span>
    </div>
    <p class="comment-text">${escapeHtml(c.text)}</p>
    <div class="comment-actions">
      ${!isReply ? '<button class="mini-btn reply-action" type="button">Responder</button>' : ''}
      ${own && c.id ? '<button class="mini-btn delete delete-action" type="button">Eliminar</button>' : ''}
    </div>
    ${!isReply ? '<form class="reply-form hidden"><input maxlength="500" placeholder="Escribe tu respuesta..."><button class="btn btn-primary" type="submit">Enviar</button></form>' : ''}
  `;

  if (!isReply) {
    const replyBtn = div.querySelector('.reply-action');
    const form = div.querySelector('.reply-form');
    replyBtn?.addEventListener('click', () => {
      if (!requireLogin()) return;
      if (!c.id) return alert('No se encontró el identificador del comentario.');
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden')) form.querySelector('input').focus();
    });
    form?.addEventListener('submit', async e => {
      e.preventDefault();
      if (!requireLogin()) return;
      const input = form.querySelector('input');
      const texto = input.value.trim();
      if (!texto) return;
      try {
        await api(`/api/interaccionvideo/comentario/${c.id}/responder`, {
          method: 'POST', body: JSON.stringify({ carnet: getCarnetFromUser(), carne: getCarnetFromUser(), texto })
        });
        input.value = '';
        await refreshCurrentVideo();
      } catch (err) { alert(`No se pudo responder: ${err.message}`); }
    });
  }

  div.querySelector('.delete-action')?.addEventListener('click', async () => {
    if (!requireLogin()) return;
    if (!confirm('¿Deseas eliminar este comentario?')) return;
    try {
      await api(`/api/interaccionvideo/comentario/${c.id}?carne=${encodeURIComponent(getCarnetFromUser())}&carnet=${encodeURIComponent(getCarnetFromUser())}`, { method: 'DELETE' });
      await refreshCurrentVideo();
    } catch (err) { alert(`No se pudo eliminar: ${err.message}`); }
  });
  return div;
}

async function refreshCurrentVideo() {
  const id = getVideoId(state.currentVideo);
  if (!id) return;
  const detail = await api(`/api/videos/${id}`);
  const data = detail?.video || detail?.data || detail;
  state.currentVideo = data;
  renderVideoDetail(data);
}

els.loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const usuario = els.loginUser.value.trim();
  const password = els.loginPassword.value.trim();
  if (!usuario || !password) return setMessage(els.loginMessage, 'Completa usuario y contraseña.');
  if (!/^\d+$/.test(password)) return setMessage(els.loginMessage, 'La contraseña debe ser un PIN numérico.');
  try {
    const payload = await api('/api/login', { method: 'POST', body: JSON.stringify({ usuario, password }) });
    const user = payload?.estudiante || payload?.usuario || payload?.user || payload?.data || { usuario };
    state.user = { ...user, usuario, carnet: firstDefined(user, ['carnet', 'carne'], /^\d{4}-\d{2}-\d{5}$/.test(usuario) ? usuario : undefined) };
    localStorage.setItem('videoedu_user', JSON.stringify(state.user));
    setMessage(els.loginMessage, 'Inicio de sesión correcto.', true);
    updateSessionUI();
    setTimeout(closeAuth, 450);
    if (state.currentVideo) refreshCurrentVideo().catch(() => {});
  } catch (err) { setMessage(els.loginMessage, `No se pudo iniciar sesión: ${err.message}`); }
});

els.registerForm.addEventListener('submit', async e => {
  e.preventDefault();
  const carnet = els.regCarnet.value.trim();
  const estudiante = els.regName.value.trim();
  const correo = els.regEmail.value.trim();
  const password = els.regPassword.value.trim();
  if (!/^\d{4}-\d{2}-\d{5}$/.test(carnet)) return setMessage(els.registerMessage, 'Carné inválido. Usa el formato 0000-00-00000.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return setMessage(els.registerMessage, 'Correo electrónico inválido.');
  if (!/^\d+$/.test(password)) return setMessage(els.registerMessage, 'La contraseña debe contener solo números y no puede tener espacios.');
  try {
    await api('/api/estudiantes/registrar', {
      method: 'POST',
      body: JSON.stringify({ carne: carnet, carnet, estudiante, correo, password })
    });
    setMessage(els.registerMessage, 'Registro exitoso. Ahora inicia sesión.', true);
    els.loginUser.value = carnet;
    els.loginPassword.value = password;
    setTimeout(() => switchAuthTab('login'), 650);
  } catch (err) {
    const suffix = err.status === 409 ? ' El carné o correo ya podría estar registrado.' : '';
    setMessage(els.registerMessage, `No se pudo registrar: ${err.message}.${suffix}`);
  }
});

els.commentForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!requireLogin()) return;
  const texto = els.commentText.value.trim();
  if (!texto) return alert('Escribe un comentario antes de publicarlo.');
  const id = getVideoId(state.currentVideo);
  if (!id) return alert('No se encontró el ID del video.');
  try {
    await api(`/api/interaccionvideo/${id}/comentario`, {
      method: 'POST', body: JSON.stringify({ carnet: getCarnetFromUser(), carne: getCarnetFromUser(), texto })
    });
    els.commentText.value = '';
    await refreshCurrentVideo();
  } catch (err) { alert(`No se pudo publicar el comentario: ${err.message}`); }
});

els.likeButton.addEventListener('click', async () => {
  if (!requireLogin()) return;
  const id = getVideoId(state.currentVideo);
  if (!id) return alert('No se encontró el ID del video.');
  try {
    await api(`/api/interaccionvideo/${id}/like`, {
      method: 'POST', body: JSON.stringify({ carnet: getCarnetFromUser(), carne: getCarnetFromUser() })
    });
    await refreshCurrentVideo();
  } catch (err) { alert(`No se pudo actualizar Me Gusta: ${err.message}`); }
});

els.btnLogin.addEventListener('click', () => openAuth('login'));
els.btnRegister.addEventListener('click', () => openAuth('register'));
els.btnLogout.addEventListener('click', () => {
  state.user = null;
  localStorage.removeItem('videoedu_user');
  updateSessionUI();
  if (state.currentVideo) renderVideoDetail(state.currentVideo);
});
els.tabLogin.addEventListener('click', () => switchAuthTab('login'));
els.tabRegister.addEventListener('click', () => switchAuthTab('register'));
els.searchInput.addEventListener('input', renderVideos);
els.categorySelect.addEventListener('change', filterByCategory);
document.querySelectorAll('[data-close="auth"]').forEach(x => x.addEventListener('click', closeAuth));
document.querySelectorAll('[data-close="video"]').forEach(x => x.addEventListener('click', closeVideo));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeAuth(); closeVideo(); }
});

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}
function escapeAttr(value = '') { return escapeHtml(value); }

async function init() {
  updateSessionUI();
  await loadVideos('/api/videos');
  await loadCategories();
  renderVideos();
}
init();
