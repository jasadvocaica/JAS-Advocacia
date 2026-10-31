/* ===========================================================
   app.js — câmera, desenho por quadro, interação e painéis
   =========================================================== */
(() => {
  const { P, noChao } = ISO;
  const cv = document.getElementById('cena'), ctx = cv.getContext('2d');
  const $ = id => document.getElementById(id);

  let dpr = 1, vw = 0, vh = 0;
  const cam = { z: 0.6, x: 0, y: 0 };      // tela = mundo * z + (x, y)
  let anim = null, ultimoZoom = 0;
  let hoverSala = null, hoverPessoa = null, salaSel = null, pessoaSel = null;
  let modoLuz = 'auto';

  const horaAtual = () => {
    if (modoLuz === 'dia') return 11;
    if (modoLuz === 'noite') return 21.5;
    const d = new Date(); return d.getHours() + d.getMinutes() / 60;
  };

  /* ---------- tamanho ---------- */
  function redimensionar() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth; vh = window.innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  }

  function enquadrar(suave) {
    const L = MAPA.LIMITES, mobile = vw < 720;
    const topo = mobile ? 80 : 120, baixo = mobile ? 70 : 80;
    const z = Math.min((vw - 32) / (L.x1 - L.x0), (vh - topo - baixo) / (L.y1 - L.y0));
    const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
    irPara(cx, cy, z, topo + (vh - topo - baixo) / 2, suave);
  }

  /** leva o ponto do mundo (wx, wy) para o centro da tela com zoom z */
  function irPara(wx, wy, z, telaY = vh / 2, suave = true) {
    const alvo = { z, x: vw / 2 - wx * z, y: telaY - wy * z };
    if (!suave) { Object.assign(cam, alvo); return; }
    anim = { de: { ...cam }, para: alvo, t: 0 };
  }

  function zoomEm(fator, sx, sy) {
    const z = Math.min(2.6, Math.max(0.3, cam.z * fator));
    const wx = (sx - cam.x) / cam.z, wy = (sy - cam.y) / cam.z;
    cam.z = z; cam.x = sx - wx * z; cam.y = sy - wy * z;
    anim = null; ultimoZoom = performance.now();
  }

  /* ---------- fundo em cache ---------- */
  const fundo = document.createElement('canvas');
  let fundoEsc = 0, fundoMin = -1, fundoSujo = true;
  function renderFundo() {
    const L = MAPA.LIMITES, lw = L.x1 - L.x0, lh = L.y1 - L.y0;
    const esc = Math.min(4096 / lw, Math.max(0.6, Math.round(cam.z * dpr * 4) / 4));
    fundo.width = Math.ceil(lw * esc); fundo.height = Math.ceil(lh * esc);
    const c = fundo.getContext('2d');
    c.setTransform(esc, 0, 0, esc, -L.x0 * esc, -L.y0 * esc);
    MAPA.desenharFundo(c, horaAtual(), IMG);
    fundoEsc = esc; fundoSujo = false; fundoMin = Math.floor(Date.now() / 60000);
  }
  function talvezFundo() {
    const desejada = Math.min(4096 / (MAPA.LIMITES.x1 - MAPA.LIMITES.x0), Math.max(0.6, Math.round(cam.z * dpr * 4) / 4));
    const parado = performance.now() - ultimoZoom > 250 && !anim;
    if (fundoSujo || Math.floor(Date.now() / 60000) !== fundoMin ||
        (parado && Math.abs(desejada - fundoEsc) / fundoEsc > 0.2)) renderFundo();
  }
  IMG.logo.addEventListener('load', () => { fundoSujo = true; });
  if (document.fonts) document.fonts.ready.then(() => { fundoSujo = true; });

  /* ---------- quadro ---------- */
  function desenhar() {
    talvezFundo();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, cam.x * dpr, cam.y * dpr);
    const L = MAPA.LIMITES;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fundo, L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0);

    // destaque da sala
    for (const [id, forte] of [[salaSel, true], [hoverSala !== salaSel ? hoverSala : null, false]]) {
      if (!id) continue;
      const s = MAPA.SALAS[id];
      const pts = [P(s.x1, s.y1), P(s.x2 + 1, s.y1), P(s.x2 + 1, s.y2 + 1), P(s.x1, s.y2 + 1)];
      ISO.poly(ctx, pts, forte ? 'rgba(201,164,92,0.13)' : 'rgba(201,164,92,0.07)', forte ? '#ecd59a' : 'rgba(236,213,154,0.6)', 2 / cam.z);
    }

    // itens ordenados
    const lista = MOVEIS.ITENS.slice();
    for (const p of SIM.todos())
      if (!p.seat && !p.fora && p.alpha > 0) lista.push({ key: p.fx + p.fy, pri: 2, draw: c => p.desenhar(c) });
    lista.sort((a, b) => a.key - b.key || a.pri - b.pri);
    for (const it of lista) it.draw(ctx);

    // camada de tela: rótulos, balões
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rotulos();
    baloes();
  }

  const tela = (wx, wy) => [wx * cam.z + cam.x, wy * cam.z + cam.y];

  function pilula(txt, x, y, { fundo = 'rgba(6,11,40,0.82)', cor = '#ecd59a', borda = 'rgba(201,164,92,0.6)', fonte = '600 10px Montserrat, sans-serif' } = {}) {
    ctx.font = fonte;
    const w = ctx.measureText(txt).width + 18, h = 20;
    ISO.rrect(ctx, x - w / 2, y - h / 2, w, h, 10);
    ctx.fillStyle = fundo; ctx.fill();
    ctx.strokeStyle = borda; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = cor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y + 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function rotulos() {
    for (const id of MAPA.ORDEM) {
      const s = MAPA.SALAS[id];
      const [wx, wy] = P((s.x1 + s.x2 + 1) / 2, s.y2 + 1, 0);
      const [x, y] = tela(wx, wy);
      const ativo = id === salaSel || id === hoverSala;
      pilula(s.nome.toUpperCase(), x, y + 4, ativo ? { fundo: '#c9a45c', cor: '#020726', borda: '#ecd59a' } : {});
    }
  }

  function baloes() {
    for (const p of SIM.todos()) {
      if (p.fora || p.alpha <= 0) continue;
      const [x, y] = tela(p.topo[0], p.topo[1]);
      if (p === pessoaSel || p === hoverPessoa) {
        ctx.fillStyle = '#ecd59a';
        ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x - 5, y - 9); ctx.lineTo(x + 5, y - 9); ctx.closePath(); ctx.fill();
        pilula(p.nome, x, y - 20, { fundo: '#0b1236', cor: p.dona ? '#ecd59a' : '#f3f0ea', borda: '#c9a45c' });
        continue;
      }
      if (!p.fala) continue;
      ctx.font = '500 11px Montserrat, sans-serif';
      const txt = p.fala.txt, w = ctx.measureText(txt).width + 16, h = 22;
      const by = y - 16;
      ctx.globalAlpha = Math.min(1, p.fala.t * 2) * p.alpha;
      ISO.rrect(ctx, x - w / 2, by - h / 2, w, h, 8);
      ctx.fillStyle = '#fbfaf7'; ctx.fill();
      ctx.strokeStyle = 'rgba(11,18,54,0.25)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 4, by + h / 2 - 0.5); ctx.lineTo(x, by + h / 2 + 5); ctx.lineTo(x + 4, by + h / 2 - 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0b1236'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, x, by + 0.5);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
    }
  }

  /* ---------- laço ---------- */
  let ultimo = performance.now();
  function laco(agora) {
    const dt = Math.min(0.1, (agora - ultimo) / 1000); ultimo = agora;
    if (anim) {
      anim.t = Math.min(1, anim.t + dt / 0.6);
      const e = 1 - Math.pow(1 - anim.t, 3);
      for (const k of ['z', 'x', 'y']) cam[k] = anim.de[k] + (anim.para[k] - anim.de[k]) * e;
      if (anim.t >= 1) { anim = null; ultimoZoom = performance.now(); }
    }
    SIM.atualizar(dt);
    desenhar();
    requestAnimationFrame(laco);
  }

  /* ---------- acerto do mouse ---------- */
  function pessoaEm(sx, sy) {
    const wx = (sx - cam.x) / cam.z, wy = (sy - cam.y) / cam.z;
    let melhor = null, chave = -Infinity;
    for (const p of SIM.todos()) {
      if (p.fora || p.alpha <= 0) continue;
      const [px, py] = p.pe, topo = p.topo[1];
      if (wx > px - 12 && wx < px + 12 && wy > topo && wy < py + 2) {
        const k = p.fx + p.fy;
        if (k > chave) { chave = k; melhor = p; }
      }
    }
    return melhor;
  }
  function salaEm(sx, sy) {
    const c = noChao((sx - cam.x) / cam.z, (sy - cam.y) / cam.z);
    const id = MAPA.salaEm(c.x, c.y);
    return id === 'corredor' ? null : id;
  }

  /* ---------- painéis ---------- */
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iniciais = n => esc(n.replace(/^(Dra?\.)\s*/, '').split(' ').map(s => s[0]).slice(0, 2).join(''));
  const onde = p => {
    if (p.fora) return 'Fora do escritório';
    const id = MAPA.salaEm(p.fx, p.fy);
    return id ? MAPA.SALAS[id].nome : '';
  };
  function itemPessoa(p, mostrarOnde) {
    const sub = mostrarOnde ? `${p.status} · ${onde(p)}` : p.status;
    return `<li data-p="${esc(p.id)}"><span class="avatar" style="background:${p.look.roupa}">${iniciais(p.nome)}</span>
      <span><span class="nome">${esc(p.nome)}</span><br><span class="cargo">${esc(p.cargo)}</span><br><span class="st">${esc(sub)}</span></span></li>`;
  }

  /** prazos e tarefas da pessoa (modo real) */
  function blocoPrazos(p) {
    const i = p.info;
    if (!i) return '';
    const chips = `<div><span class="chip"${i.atrasados ? ' style="border-color:#d0605a;color:#f2a29c"' : ''}>${i.atrasados} atrasado(s)</span>` +
      `<span class="chip">${i.hoje} vence(m) hoje</span><span class="chip">${i.semana} nos próximos 7 dias</span></div>`;
    const lista = i.itens.length
      ? `<ul class="lista prazos">${i.itens.map(t => `<li class="prazo${t.atrasado ? ' atrasado' : ''}">
          <span class="data">${esc(t.data)}</span><span><span class="nome">${esc(t.titulo)}</span><br><span class="cargo">${esc(t.tipo)}</span></span></li>`).join('')}</ul>`
      : '<span class="vazio">Nada pendente para os próximos 7 dias.</span>';
    return `<h3>Prazos e tarefas</h3>${chips}${lista}`;
  }

  let painelTipo = null;
  function abrirSala(id) {
    salaSel = id; pessoaSel = null; painelTipo = 'sala';
    const s = MAPA.SALAS[id];
    const [wx, wy] = P((s.x1 + s.x2 + 1) / 2, (s.y1 + s.y2 + 1) / 2, 30);
    irPara(wx, wy, Math.max(cam.z, vw < 720 ? 0.85 : 1.15), vw < 720 ? vh * 0.3 : vh / 2);
    $('painel').hidden = false;
    atualizarPainel();
    marcarNav();
  }
  function abrirPessoa(p) {
    pessoaSel = p; salaSel = null; painelTipo = 'pessoa';
    $('painel').hidden = false;
    atualizarPainel();
    marcarNav();
  }
  function abrirEquipe() {
    salaSel = null; pessoaSel = null; painelTipo = 'equipe';
    $('painel').hidden = false;
    atualizarPainel();
    marcarNav();
  }
  function fecharPainel() {
    $('painel').hidden = true; salaSel = null; pessoaSel = null; painelTipo = null; marcarNav();
  }
  function localizar(p) {
    if (p.fora) return;
    const [wx, wy] = p.pe;
    irPara(wx, wy - 30, Math.max(cam.z, 1.4), vw < 720 ? vh * 0.3 : vh / 2);
  }

  function atualizarPainel() {
    const el = $('painel-conteudo');
    if (painelTipo === 'sala') {
      const s = MAPA.SALAS[salaSel];
      const time = SIM.equipe.filter(p => p.sala === salaSel);
      const agora = SIM.todos().filter(p => !p.fora && MAPA.salaEm(p.fx, p.fy) === salaSel);
      let extra = '';
      if (salaSel === 'reuniao' && SIM.reuniao) extra = `<span class="chip">Reunião em andamento</span>`;
      if (salaSel === 'recepcao' && !SIM.modoReal) extra = `<span class="chip">${SIM.clientes.length} cliente(s) no escritório</span>`;
      el.innerHTML = `<span class="etiqueta">Sala</span><h2>${s.nome}</h2>${extra ? `<div>${extra}</div>` : ''}<p>${s.desc}</p>
        ${time.length ? `<h3>Equipe da sala</h3><ul class="lista">${time.map(p => itemPessoa(p, true)).join('')}</ul>` : ''}
        <h3>Agora na sala</h3>${agora.length ? `<ul class="lista">${agora.map(p => itemPessoa(p, false)).join('')}</ul>` : '<span class="vazio">Ninguém no momento.</span>'}`;
    } else if (painelTipo === 'pessoa') {
      const p = pessoaSel;
      if (!p || p.remover) { fecharPainel(); return; }
      const sala = MAPA.SALAS[p.sala];
      el.innerHTML = `<span class="etiqueta">${p.cliente ? 'Visitante' : 'Equipe'}</span><h2>${esc(p.nome)}</h2>
        <p>${esc(p.cargo)}</p>
        <span class="chip">${esc(p.status || '—')}</span><span class="chip">${esc(onde(p))}</span>
        ${p.cliente ? '' : `<h3>Base</h3><p>${sala.nome}</p>`}
        ${SIM.modoReal ? blocoPrazos(p) : ''}
        ${SIM.modoReal ? `<button class="btn" id="btn-abrir">Abrir painel ${p.dona ? 'da Juliana' : 'de ' + esc(p.nome.split(' ')[0])}</button>` : ''}
        ${p.fora ? '' : '<button class="btn" id="btn-localizar">Localizar no escritório</button>'}`;
      const b = $('btn-localizar'); if (b) b.onclick = () => localizar(p);
      const a = $('btn-abrir'); if (a) a.onclick = () => window.parent.postMessage({ tipo: 'abrir', id: p.id }, location.origin);
    } else if (painelTipo === 'equipe') {
      const fora = SIM.equipe.filter(p => p.fora).length;
      const chips = SIM.modoReal
        ? `<span class="chip">${SIM.equipe.length - fora} no escritório</span><span class="chip">${fora} ausente(s)</span>`
        : `<span class="chip">${SIM.equipe.length - fora} no escritório</span><span class="chip">${fora} na rua</span><span class="chip">${SIM.clientes.length} cliente(s)</span>`;
      el.innerHTML = `<span class="etiqueta">Juliana Araújo Advocacia</span><h2>Equipe</h2>
        <div>${chips}</div>
        <ul class="lista">${SIM.equipe.map(p => itemPessoa(p, true)).join('')}</ul>`;
    }
    el.querySelectorAll('[data-p]').forEach(li => li.onclick = () => {
      const p = SIM.todos().find(q => q.id === li.dataset.p);
      if (p) { abrirPessoa(p); localizar(p); }
    });
  }

  /* ---------- navegação ---------- */
  const nav = $('salas');
  nav.innerHTML = MAPA.ORDEM.map(id => `<button data-sala="${id}">${MAPA.SALAS[id].nome}</button>`).join('') +
    '<span class="sep"></span><button data-equipe>Equipe</button>';
  nav.querySelectorAll('[data-sala]').forEach(b => b.onclick = () => abrirSala(b.dataset.sala));
  nav.querySelector('[data-equipe]').onclick = abrirEquipe;
  function marcarNav() {
    nav.querySelectorAll('button').forEach(b =>
      b.classList.toggle('ativa', (b.dataset.sala && b.dataset.sala === salaSel) || (b.hasAttribute('data-equipe') && painelTipo === 'equipe')));
  }
  $('fechar').onclick = fecharPainel;
  $('z-mais').onclick = () => zoomEm(1.25, vw / 2, vh / 2);
  $('z-menos').onclick = () => zoomEm(0.8, vw / 2, vh / 2);
  $('centro').onclick = () => enquadrar(true);
  $('luz').onclick = () => {
    modoLuz = { auto: 'dia', dia: 'noite', noite: 'auto' }[modoLuz];
    $('luz').title = { auto: 'Luz: automática pela hora', dia: 'Luz: dia', noite: 'Luz: noite' }[modoLuz];
    $('luz').textContent = { auto: '◐', dia: '☀', noite: '☾' }[modoLuz];
    fundoSujo = true;
    aviso({ auto: 'Luz automática pela hora', dia: 'Modo dia', noite: 'Modo noite' }[modoLuz]);
  };
  window.addEventListener('keydown', e => { if (e.key === 'Escape') fecharPainel(); });

  /* ---------- ponteiro: arrastar, pinça, clique ---------- */
  const toques = new Map();
  let arrasto = null, pinca = null;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (toques.size === 2) {
      const [a, b] = [...toques.values()];
      pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z };
      arrasto = null;
    } else {
      arrasto = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moveu: false };
    }
    anim = null;
  });
  cv.addEventListener('pointermove', e => {
    if (toques.has(e.pointerId)) toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinca && toques.size === 2) {
      const [a, b] = [...toques.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomEm((pinca.z * d / pinca.d) / cam.z, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (arrasto) {
      const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
      if (Math.hypot(dx, dy) > 5) arrasto.moveu = true;
      if (arrasto.moveu) { cam.x = arrasto.cx + dx; cam.y = arrasto.cy + dy; cv.classList.add('arrastando'); }
      return;
    }
    if (e.pointerType === 'mouse') passar(e.clientX, e.clientY);
  });
  const soltar = e => {
    toques.delete(e.pointerId);
    if (toques.size < 2) pinca = null;
    if (arrasto && !arrasto.moveu && e.type === 'pointerup') clicar(e.clientX, e.clientY);
    arrasto = null; cv.classList.remove('arrastando');
  };
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', soltar);
  cv.addEventListener('pointerleave', () => { hoverSala = null; hoverPessoa = null; $('dica').hidden = true; });
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomEm(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });

  function passar(x, y) {
    hoverPessoa = pessoaEm(x, y);
    hoverSala = hoverPessoa ? null : salaEm(x, y);
    cv.classList.toggle('aponta', !!(hoverPessoa || hoverSala));
    const d = $('dica');
    if (hoverPessoa) d.innerHTML = `<b>${esc(hoverPessoa.nome)}</b><span>${esc(hoverPessoa.cargo)}</span><i>${esc(hoverPessoa.status)}</i>`;
    else if (hoverSala) d.innerHTML = `<b>${MAPA.SALAS[hoverSala].nome}</b><span>Clique para ver a sala</span>`;
    d.hidden = !(hoverPessoa || hoverSala);
    d.style.left = Math.min(x + 16, vw - 250) + 'px'; d.style.top = (y + 16) + 'px';
  }
  function clicar(x, y) {
    const p = pessoaEm(x, y);
    if (p) { abrirPessoa(p); return; }
    const s = salaEm(x, y);
    if (s) abrirSala(s); else fecharPainel();
  }

  /* ---------- avisos e topo ---------- */
  function aviso(txt) {
    const el = document.createElement('div');
    el.className = 'aviso'; el.textContent = txt;
    $('avisos').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }, 4200);
    while ($('avisos').children.length > 3) $('avisos').firstChild.remove();
  }
  setInterval(() => {
    while (SIM.avisos.length) aviso(SIM.avisos.shift());
    const d = new Date();
    $('hora').textContent = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    $('data').textContent = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const fora = SIM.equipe.filter(p => p.fora).length;
    if (embutido && !SIM.modoReal) $('resumo').textContent = 'Carregando a equipe…';
    else if (SIM.modoReal) {
      const atr = SIM.equipe.reduce((s, p) => s + (p.info ? p.info.atrasados : 0), 0);
      $('resumo').textContent = `${SIM.equipe.length - fora} no escritório · ${fora} ausente(s) · ${atr} prazo(s) atrasado(s)`;
    } else $('resumo').textContent = `${SIM.equipe.length - fora} no escritório · ${fora} na rua · ${SIM.clientes.length} cliente(s)`;
    if (painelTipo) atualizarPainel();
  }, 1000);

  /* ---------- início ---------- */
  window.addEventListener('resize', () => { redimensionar(); enquadrar(false); fundoSujo = true; });
  /* ---------- modo real: dentro do sistema, os dados vêm da página-mãe ---------- */
  const embutido = window.parent !== window;
  if (embutido) {
    SIM.aplicarEquipe([]);
    window.addEventListener('message', e => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      const m = e.data || {};
      if (m.tipo === 'equipe' && Array.isArray(m.pessoas)) {
        SIM.aplicarEquipe(m.pessoas);
        if (painelTipo) atualizarPainel();
      }
    });
    window.parent.postMessage({ tipo: 'pronto' }, location.origin);
  }

  window.ESCRITORIO = { cam, irPara, abrirSala, abrirPessoa };
  redimensionar();
  enquadrar(false);
  requestAnimationFrame(laco);
})();
