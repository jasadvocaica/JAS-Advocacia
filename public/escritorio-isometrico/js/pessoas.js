/* ===========================================================
   pessoas.js — equipe, bonecos, rotina, reuniões e clientes
   Para mudar nomes, cargos e visual, edite EQUIPE abaixo.
   =========================================================== */

/* ---------- a equipe ----------
   assento: id da cadeira em moveis.js
   look: pele, cabelo, estilo (longo | curto | coque | rabo | cacheado | careca),
         roupa (blazer/blusa), camisa, baixo, saia, gravata, oculos, barba, headset, broche */
const EQUIPE = [
  { id: 'juliana', nome: 'Dra. Juliana Araújo', cargo: 'Advogada · Sócia-fundadora', sala: 'diretoria', assento: 'dir-juliana', dona: true,
    atividade: 'Na diretoria',
    look: { pele: '#e8bf9d', cabelo: '#3a2216', estilo: 'longo', roupa: '#0b1236', camisa: '#f4efe6', baixo: '#0b1236', broche: true } },
  { id: 'manu', nome: 'Manu', cargo: 'Chefe de gabinete (IA)', sala: 'diretoria', assento: 'dir-p1',
    atividade: 'Organizando a agenda',
    look: { pele: '#d9a982', cabelo: '#2a1a10', estilo: 'rabo', roupa: '#c9a45c', camisa: '#f3f0ea', baixo: '#0b1236', oculos: true } },
  { id: 'beatriz', nome: 'Beatriz', cargo: 'Recepção & Triagem', sala: 'recepcao', assento: 'rec-1', fixo: true,
    atividade: 'Recebendo clientes',
    look: { pele: '#c99a72', cabelo: '#1e1410', estilo: 'coque', roupa: '#f3f0ea', camisa: '#c9a45c', baixo: '#1c2756', saia: true } },
  { id: 'rafael', nome: 'Rafael', cargo: 'Análise de CNIS', sala: 'operacional', assento: 'op-a-s3',
    atividade: 'Analisando CNIS',
    look: { pele: '#f0c8a5', cabelo: '#5a3a22', estilo: 'curto', roupa: '#2b2f3a', camisa: '#ffffff', gravata: '#0b1236', baixo: '#2b2f3a', barba: true } },
  { id: 'helena', nome: 'Helena', cargo: 'Peças & Pesquisa jurídica', sala: 'operacional', assento: 'op-a-n5',
    atividade: 'Redigindo petição',
    look: { pele: '#a8714b', cabelo: '#120c08', estilo: 'cacheado', roupa: '#6b1f24', camisa: '#f3f0ea', baixo: '#14204f' } },
  { id: 'gustavo', nome: 'Gustavo', cargo: 'Processos & Documentos', sala: 'operacional', assento: 'op-a-s7',
    atividade: 'Organizando pastas',
    look: { pele: '#d6a882', cabelo: '#2a1a10', estilo: 'curto', roupa: '#6f8fbd', camisa: '#ffffff', baixo: '#3a4256', oculos: true } },
  { id: 'vanessa', nome: 'Vanessa', cargo: 'Controladoria de prazos', sala: 'operacional', assento: 'op-ctrl',
    atividade: 'Conferindo prazos',
    look: { pele: '#8d5a3b', cabelo: '#120c08', estilo: 'longo', roupa: '#1c2756', camisa: '#ecd59a', baixo: '#0b1236', saia: true, oculos: true } },
  { id: 'thiago', nome: 'Thiago', cargo: 'Propostas & Contratos', sala: 'comercial', assento: 'com-n19', closer: true,
    atividade: 'Preparando proposta',
    look: { pele: '#e3b48c', cabelo: '#120c08', estilo: 'curto', roupa: '#0b1236', camisa: '#ffffff', gravata: '#c9a45c', baixo: '#0b1236', headset: true } },
  { id: 'mariana', nome: 'Mariana', cargo: 'Leads do WhatsApp', sala: 'comercial', assento: 'com-s19',
    atividade: 'Respondendo leads',
    look: { pele: '#f0c8a5', cabelo: '#8a3f1e', estilo: 'longo', roupa: '#e2b4ab', camisa: '#ffffff', baixo: '#1c2756', headset: true } },
  { id: 'fernando', nome: 'Fernando', cargo: 'Financeiro', sala: 'comercial', assento: 'com-s21',
    atividade: 'Conferindo recebimentos',
    look: { pele: '#6b4228', cabelo: '#120c08', estilo: 'careca', roupa: '#3a4256', camisa: '#ffffff', baixo: '#20232b', barba: true } },
  { id: 'gabriel', nome: 'Gabriel', cargo: 'Diligências · Fóruns', sala: 'diligencias', assento: 'dil-1', rua: true,
    atividade: 'Montando a rota',
    look: { pele: '#d9ad86', cabelo: '#3b2616', estilo: 'curto', roupa: '#1f3b2c', camisa: '#f3f0ea', baixo: '#2b2f3a' } },
  { id: 'renata', nome: 'Renata', cargo: 'INSS administrativo', sala: 'diligencias', assento: 'dil-2',
    atividade: 'Lendo carta do INSS',
    look: { pele: '#c08a62', cabelo: '#2a1a10', estilo: 'rabo', roupa: '#a77d55', camisa: '#ffffff', baixo: '#20232b' } },
  { id: 'camila', nome: 'Camila', cargo: 'Conteúdo & Instagram', sala: 'marketing', assento: 'mkt-1',
    atividade: 'Criando carrossel',
    look: { pele: '#f2cfb0', cabelo: '#1e1410', estilo: 'coque', roupa: '#c9a45c', camisa: '#ffffff', baixo: '#f3f0ea', saia: true } },
  { id: 'vinicius', nome: 'Vinícius', cargo: 'Vídeo & Design', sala: 'marketing', assento: 'mkt-2', videomaker: true,
    atividade: 'Editando reels',
    look: { pele: '#9a6644', cabelo: '#120c08', estilo: 'cacheado', roupa: '#20232b', camisa: '#20232b', baixo: '#3a4256', oculos: true } },
  { id: 'lara', nome: 'Lara', cargo: 'Legendas & Carrosséis', sala: 'marketing', assento: 'mkt-3',
    atividade: 'Escrevendo legenda',
    look: { pele: '#e8bf9d', cabelo: '#6b3b1f', estilo: 'rabo', roupa: '#f3f0ea', camisa: '#c9a45c', baixo: '#1c2756' } },
  { id: 'bruna', nome: 'Bruna', cargo: 'Comentários & Direct', sala: 'marketing', assento: 'mkt-4',
    atividade: 'Lendo comentários',
    look: { pele: '#b07a52', cabelo: '#1e1410', estilo: 'cacheado', roupa: '#22307a', camisa: '#ffffff', baixo: '#20232b', headset: true } }
];

/* Frases de ambiente. Não afirmam trabalho feito: o que é real aparece no selo
   dourado acima da cabeça e na lista de tarefas. */
const FALAS = {
  diretoria: ['Bom trabalho, equipe!', 'Vamos com calma e capricho.', 'Alguma dúvida, me chamem.', 'Prioridade é prazo.'],
  operacional: ['Conferindo com atenção.', 'Deixa eu revisar isso.', 'Organizando a mesa.', 'Foco total.'],
  comercial: ['Tudo pronto por aqui.', 'Organizando a agenda.', 'Revisando os modelos.'],
  diligencias: ['Conferindo a lista do que levar.', 'Separando a pasta.', 'Revendo os endereços.'],
  marketing: ['Pensando na próxima pauta.', 'Ajustando a identidade visual.', 'Revendo as ideias.'],
  recepcao: ['Juliana Araújo Advocacia, bom dia!', 'Seja bem-vindo(a)!', 'Um instante, por favor.'],
  copa: ['Café fresquinho!', 'Pausa rápida.', 'Alguém quer café?'],
  visita: ['Tem um minuto?', 'Posso te perguntar uma coisa?', 'Obrigado!', 'Combinado.'],
  saida: ['Volto já!', 'Vou dar uma volta rápida.'],
  volta: ['Voltei!', 'De volta à mesa.'],
  fechamento: ['Obrigado pela visita!', 'Até breve!', 'Foi um prazer.']
};

const PESSOAS = (() => {
  const { P, tom, rrect } = ISO;
  const A = MOVEIS.ASSENTOS, PT = MOVEIS.PONTOS;
  const VEL = 2.3;   // tiles por segundo
  const sorteio = a => a[Math.floor(Math.random() * a.length)];
  const entre = (a, b) => a + Math.random() * (b - a);

  /* ===========================================================
     BONECO — desenho base voltado para baixo-esquerda (S).
     E = espelho de S; W = costas; N = espelho das costas.
     =========================================================== */
  function boneco(ctx, sx, sy, L, dir, e) {
    const frente = dir === 'S' || dir === 'E';
    const espelho = dir === 'E' || dir === 'N';
    const pele = L.pele, roupa = L.roupa, baixo = L.baixo || '#20232b';
    const passo = e.andando ? Math.sin(e.fase) : 0;
    const bob = e.andando ? -Math.abs(Math.cos(e.fase)) * 1.2 : 0;
    ctx.save();
    ctx.translate(sx, sy);
    if (espelho) ctx.scale(-1, 1);

    /* pernas */
    const sapato = L.sapato || '#1a1410';
    const corPerna = L.saia ? tom(pele, -0.12) : baixo;
    if (e.sentado) {
      if (frente) {
        const canela = Math.max(6, e.alt - 6);
        ctx.fillStyle = baixo; rrect(ctx, -7, -16, 12, 6, 2); ctx.fill();
        ctx.fillStyle = corPerna;
        ctx.fillRect(-7, -11, 4, canela - 3); ctx.fillRect(-1.5, -11, 4, canela - 3);
        ctx.fillStyle = sapato;
        ctx.fillRect(-8.5, -14 + canela, 5.5, 3); ctx.fillRect(-3, -14 + canela, 5.5, 3);
      }
    } else {
      for (const [x, k] of [[0.5, -1], [-5.5, 1]]) {
        const dx = passo * 2 * k, lev = Math.max(0, passo * k) * 2;
        ctx.fillStyle = corPerna; ctx.fillRect(x + dx, -15 + bob, 5, 13 - lev);
        ctx.fillStyle = sapato; ctx.fillRect(x + dx - 1, -3 - lev, 6, 3);
      }
    }
    ctx.translate(0, bob);
    if (L.saia) { ctx.fillStyle = baixo; ctx.beginPath(); ctx.moveTo(-8, -17); ctx.lineTo(8, -17); ctx.lineTo(9.5, -8); ctx.lineTo(-9.5, -8); ctx.closePath(); ctx.fill(); }
    else if (!e.sentado || !frente) { ctx.fillStyle = baixo; ctx.fillRect(-7, -17, 13, 4); }

    /* cabelo longo por trás */
    if (frente && (L.estilo === 'longo')) { ctx.fillStyle = L.cabelo; rrect(ctx, -10.5, -51, 21, 25, 7); ctx.fill(); }
    if (frente && L.estilo === 'rabo') { ctx.fillStyle = L.cabelo; ctx.beginPath(); ctx.ellipse(8.5, -40, 3, 8, 0.25, 0, 7); ctx.fill(); }

    /* braço de trás */
    const bracoCor = tom(roupa, -0.1);
    const dig = e.digitando ? Math.sin(e.t * 18) * 0.8 : 0;
    if (e.digitando || e.sentado) {
      ctx.fillStyle = bracoCor; rrect(ctx, 7, -32, 4, 11, 2); ctx.fill();
    } else {
      ctx.fillStyle = bracoCor; rrect(ctx, 7.5, -32 - passo * 1.5, 4, 15, 2); ctx.fill();
      ctx.fillStyle = pele; ctx.beginPath(); ctx.arc(9.5, -16.5 - passo * 1.5, 2.2, 0, 7); ctx.fill();
    }

    /* tronco */
    ctx.fillStyle = roupa; rrect(ctx, -8.5, -34, 17, 20, 4); ctx.fill();
    if (frente) {
      if (L.camisa && L.camisa !== roupa) {
        ctx.fillStyle = L.camisa; ctx.beginPath(); ctx.moveTo(-4, -34); ctx.lineTo(4, -34); ctx.lineTo(0, -25); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = tom(roupa, -0.3); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-4, -34); ctx.lineTo(-1.5, -22); ctx.moveTo(4, -34); ctx.lineTo(1.5, -22); ctx.stroke();
      }
      if (L.gravata) { ctx.fillStyle = L.gravata; ctx.beginPath(); ctx.moveTo(-1, -32); ctx.lineTo(1, -32); ctx.lineTo(1.6, -25); ctx.lineTo(0, -23.5); ctx.lineTo(-1.6, -25); ctx.closePath(); ctx.fill(); }
      if (L.broche) { ctx.fillStyle = '#e6c97f'; ctx.beginPath(); ctx.arc(-5, -29, 1.3, 0, 7); ctx.fill(); }
    } else {
      ctx.strokeStyle = tom(roupa, -0.2); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, -33); ctx.lineTo(0, -16); ctx.stroke();
    }

    /* pescoço e cabeça */
    ctx.fillStyle = tom(pele, -0.08); ctx.fillRect(-2.5, -37, 5, 4);
    if (!frente && L.estilo === 'longo') { ctx.fillStyle = L.cabelo; rrect(ctx, -10.5, -50, 21, 24, 7); ctx.fill(); }
    ctx.fillStyle = pele; ctx.beginPath(); ctx.ellipse(0, -44, 9.5, 9.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = tom(pele, -0.08); ctx.beginPath(); ctx.ellipse(8.6, -43, 1.8, 2.6, 0, 0, 7); ctx.fill();

    cabelo(ctx, L, frente);

    if (frente) {
      ctx.fillStyle = '#1a1410';
      ctx.fillRect(-5.5, -45, 1.6, 2.6); ctx.fillRect(-0.5, -45, 1.6, 2.6);
      ctx.fillStyle = L.cabelo === '#ffffff' ? '#999' : tom(L.cabelo, 0.05);
      ctx.fillRect(-6, -48, 2.6, 0.9); ctx.fillRect(-1, -48, 2.6, 0.9);
      ctx.strokeStyle = '#8a4a3a'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(-4, -39.5); ctx.quadraticCurveTo(-2.4, -38.4, -0.8, -39.5); ctx.stroke();
      if (L.barba) { ctx.fillStyle = ISO.rgba(ISO.tom(L.cabelo, 0), 0.85); ctx.beginPath(); ctx.ellipse(-1.5, -38.5, 6.5, 3.6, 0, 0, Math.PI); ctx.fill(); }
      if (L.oculos) {
        ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 0.7;
        ctx.strokeRect(-7, -46.2, 4.2, 4); ctx.strokeRect(-2, -46.2, 4.2, 4);
        ctx.beginPath(); ctx.moveTo(-2.8, -44.5); ctx.lineTo(-2, -44.5); ctx.stroke();
      }
    }
    if (L.headset) {
      ctx.strokeStyle = '#20232b'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, -45, 10.2, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.fillStyle = '#20232b'; rrect(ctx, 7.2, -46, 3.4, 5, 1.2); ctx.fill();
      if (frente) { ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(8, -41); ctx.quadraticCurveTo(4, -36, -1, -38.5); ctx.stroke(); }
    }

    /* braço da frente */
    if (e.digitando || e.sentado) {
      ctx.fillStyle = bracoCor; rrect(ctx, -11, -32, 4, 11, 2); ctx.fill();
      ctx.fillStyle = pele;
      ctx.beginPath(); ctx.arc(-7, -21.5 + dig, 2.2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(-1, -21.5 - dig, 2.2, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = bracoCor; rrect(ctx, -11.5, -32 + passo * 1.5, 4, 15, 2); ctx.fill();
      ctx.fillStyle = pele; ctx.beginPath(); ctx.arc(-9.5, -16.5 + passo * 1.5, 2.2, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function cabelo(ctx, L, frente) {
    const c = L.cabelo;
    ctx.fillStyle = c;
    switch (L.estilo) {
      case 'careca':
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(-2, -50, 4, 2, -0.3, 0, 7); ctx.fill();
        return;
      case 'cacheado':
        for (const [x, y, r] of [[-7, -48, 5], [-2, -52, 5.5], [4, -51, 5], [8, -46, 4.5], [-9, -43, 3.6], [8.5, -40, 3.4], [0, -54, 4]]) {
          ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        }
        if (!frente) { ctx.beginPath(); ctx.ellipse(0, -44, 10.5, 10, 0, 0, 7); ctx.fill(); }
        return;
    }
    if (frente) {
      ctx.beginPath(); ctx.ellipse(0, -46.5, 10, 8.2, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-10, -46.5); ctx.quadraticCurveTo(-5, -43, 3, -47.5); ctx.lineTo(10, -46.5); ctx.closePath(); ctx.fill();
      if (L.estilo === 'longo') { rrect(ctx, -10.5, -47, 3.6, 18, 1.8); ctx.fill(); rrect(ctx, 7, -47, 3.6, 18, 1.8); ctx.fill(); }
      else { ctx.fillRect(7.5, -47, 2.6, 6); }
      if (L.estilo === 'coque') { ctx.beginPath(); ctx.arc(6, -53, 4.6, 0, 7); ctx.fill(); }
    } else {
      ctx.beginPath(); ctx.ellipse(0, -45.5, 10, 9.4, 0, 0, 7); ctx.fill();
      if (L.estilo === 'coque') { ctx.beginPath(); ctx.arc(0, -54, 4.8, 0, 7); ctx.fill(); }
      if (L.estilo === 'rabo') { rrect(ctx, -2.6, -47, 5.2, 18, 2.5); ctx.fill(); }
      if (L.estilo === 'curto') { ctx.fillStyle = tom(L.pele, -0.05); ctx.fillRect(-5, -38.5, 10, 2.5); }
    }
  }

  /* ===========================================================
     CAMINHOS (A* em 8 direções, sem cortar quina)
     =========================================================== */
  function rota(ax, ay, bx, by) {
    const W = MAPA.W, H = MAPA.H, N = W * H;
    if (ax === bx && ay === by) return [];
    const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (MAPA.livre(x, y) || (x === bx && y === by) || (x === ax && y === ay));
    const g = new Float32Array(N).fill(Infinity), f = new Float32Array(N).fill(Infinity);
    const de = new Int32Array(N).fill(-1), fechado = new Uint8Array(N), aberto = new Uint8Array(N);
    const h = (x, y) => { const dx = Math.abs(x - bx), dy = Math.abs(y - by); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const ini = ay * W + ax, fim = by * W + bx;
    const lista = [ini]; g[ini] = 0; f[ini] = h(ax, ay); aberto[ini] = 1;
    while (lista.length) {
      let bi = 0;
      for (let i = 1; i < lista.length; i++) if (f[lista[i]] < f[lista[bi]]) bi = i;
      const cur = lista[bi]; lista[bi] = lista[lista.length - 1]; lista.pop();
      if (cur === fim) break;
      fechado[cur] = 1;
      const cx = cur % W, cy = (cur / W) | 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!ok(nx, ny)) continue;
        if (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue;
        const n = ny * W + nx;
        if (fechado[n]) continue;
        const ng = g[cur] + (dx && dy ? 1.414 : 1);
        if (ng < g[n]) {
          g[n] = ng; f[n] = ng + h(nx, ny); de[n] = cur;
          if (!aberto[n]) { aberto[n] = 1; lista.push(n); }
        }
      }
    }
    if (de[fim] < 0) return null;
    const out = [];
    for (let n = fim; n !== ini; n = de[n]) out.push([n % W, (n / W) | 0]);
    return out.reverse();
  }

  const dirDe = (dx, dy) => Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
  const assentoLivre = (s, p) => s && !s.occ && (!s.res || s.res === p);

  /* ===========================================================
     PESSOA
     =========================================================== */
  class Pessoa {
    constructor(o) {
      Object.assign(this, o);
      this.q = []; this.acao = null; this.caminho = null; this.seat = null;
      this.dir = 'S'; this.fase = 0; this.t = Math.random() * 10; this.andando = false;
      this.alpha = 1; this.fora = false; this.ocupado = false; this.fala = null;
      this.status = o.atividade || ''; this.topo = [0, 0]; this.pe = [0, 0];
      this.casa = o.assento ? A[o.assento] : null;
      if (this.casa) { this.casa.res = this; this.sentarEm(this.casa); }
    }

    get tile() { return [Math.floor(this.fx), Math.floor(this.fy)]; }

    dizer(txt, s = 4.5) { this.fala = { txt, t: s }; }

    sentarEm(s) {
      this.seat = s; s.occ = this; s.res = this;
      this.fx = s.cx; this.fy = s.cy; this.dir = s.f;
    }
    levantar() {
      const s = this.seat;
      if (!s) return;
      s.occ = null;
      if (s !== this.casa && s.res === this) s.res = null;
      this.seat = null;
      this.fx = Math.floor(this.fx) + .5; this.fy = Math.floor(this.fy) + .5;
    }
    limpar() {
      for (const a of [this.acao, ...this.q])
        if (a && a.t === 'sentar' && a.seat !== this.casa && a.seat.res === this && a.seat.occ !== this) a.seat.res = null;
      this.q = []; this.acao = null; this.caminho = null; this.andando = false;
    }
    reservar(s) { if (s !== this.casa) s.res = this; }

    /* ----- ações ----- */
    iniciar(a) {
      if (a.st) this.status = a.st;
      switch (a.t) {
        case 'ir': case 'sentar': {
          const alvo = a.t === 'ir' ? [a.x, a.y] : [a.seat.x, a.seat.y];
          if (a.t === 'sentar' && this.seat === a.seat) { a.feito = true; break; }
          if (a.t === 'sentar' && !assentoLivre(a.seat, this)) { a.falhou = true; break; }
          this.levantar();
          const [tx, ty] = this.tile;
          this.caminho = rota(tx, ty, alvo[0], alvo[1]);
          if (!this.caminho) a.falhou = true;
          break;
        }
        case 'esperar': a.resta = a.s; break;
        case 'falar': this.dizer(a.txt); a.feito = true; break;
        case 'virar': if (!this.seat) this.dir = a.d; a.feito = true; break;
        case 'surgir': {
          const e = PT.elevador;
          this.fx = e.x + .5; this.fy = e.y + .5; this.dir = 'E'; this.alpha = 0; this.fora = false;
          break;
        }
        case 'fn': a.f(this); a.feito = true; break;
      }
    }

    executar(a, dt) {
      if (a.feito) return true;
      if (a.falhou) {
        if (a.t === 'sentar' && a.seat.res === this && a.seat !== this.casa) a.seat.res = null;
        return true;
      }
      switch (a.t) {
        case 'ir': return this.andar(dt);
        case 'sentar':
          if (this.andar(dt)) { this.sentarEm(a.seat); return true; }
          return false;
        case 'esperar': return (a.resta -= dt) <= 0;
        case 'ate': return SIM.t >= a.fim;
        case 'sumir':
          this.alpha -= dt / 0.6;
          if (this.alpha <= 0) { this.alpha = 0; this.fora = true; return true; }
          return false;
        case 'surgir':
          this.alpha += dt / 0.6;
          if (this.alpha >= 1) { this.alpha = 1; return true; }
          return false;
      }
      return true;
    }

    andar(dt) {
      if (!this.caminho || !this.caminho.length) { this.andando = false; return true; }
      const [tx, ty] = this.caminho[0];
      const gx = tx + .5, gy = ty + .5, dx = gx - this.fx, dy = gy - this.fy;
      const d = Math.hypot(dx, dy), passo = VEL * dt;
      if (d > 1e-4) this.dir = dirDe(dx, dy);
      this.andando = true; this.fase += dt * 11;
      if (d <= passo) { this.fx = gx; this.fy = gy; this.caminho.shift(); }
      else { this.fx += dx / d * passo; this.fy += dy / d * passo; }
      if (!this.caminho.length) { this.andando = false; return true; }
      return false;
    }

    update(dt) {
      this.t += dt;
      if (this.fala && (this.fala.t -= dt) <= 0) this.fala = null;
      if (!this.acao) {
        this.acao = this.q.shift() || null;
        if (!this.acao) { this.pensar(); return; }
        this.iniciar(this.acao);
      }
      if (this.acao && this.executar(this.acao, dt)) this.acao = null;
    }

    /* ----- rotina quando não há nada na fila ----- */
    pensar() {
      if (this.cliente || this.fora) return;
      const real = this.vivo && (this.vivo.trabalhando || this.vivo.conversando);
      if (real && this.seat === this.casa) {
        this.status = this.vivo.trabalhando ? 'Trabalhando: ' + this.vivo.trabalhando.titulo : 'Conversando com a Dra. Juliana';
        this.q.push({ t: 'esperar', s: 2 });
        return;
      }
      if (this.seat !== this.casa) {
        if (assentoLivre(this.casa, this)) this.q.push({ t: 'sentar', seat: this.casa, st: 'Voltando para a mesa' });
        else this.q.push({ t: 'esperar', s: 2 });
        return;
      }
      // agente sem tarefa real aparece como disponível, nunca com trabalho inventado
      this.status = this.vivo ? (this.vivo.erro ? 'Parou com erro: ' + this.vivo.erro : this.vivo.revisao ? 'Aguardando aprovação' : this.vivo.fila ? this.vivo.fila + ' na fila' : 'Disponível') : this.atividade;
      const r = Math.random();
      const fica = this.fixo ? 0.85 : 0.55;
      if (r < fica) {
        if (Math.random() < 0.3) this.dizer(sorteio(FALAS[this.sala]));
        this.q.push({ t: 'esperar', s: entre(14, 34), st: this.atividade });
        return;
      }
      const opcoes = ['cafe', 'cafe', 'visita'];
      if (this.rua) opcoes.push('rua', 'rua', 'rua');
      if (this.dona) opcoes.push('ronda', 'ronda', 'gravar');
      const tipo = sorteio(opcoes);
      if (tipo === 'cafe') this.cafe();
      else if (tipo === 'visita') this.visitar(sorteio(Object.keys(PT.visitas).filter(s => s !== this.sala && s !== 'copa')));
      else if (tipo === 'rua') this.diligencia();
      else if (tipo === 'ronda') { this.visitar(sorteio(['operacional', 'comercial', 'marketing', 'diligencias'])); }
      else if (tipo === 'gravar') this.gravar();
    }

    cafe() {
      const livres = Object.values(A).filter(s => s.sala === 'copa' && assentoLivre(s, this));
      if (!livres.length) { this.q.push({ t: 'esperar', s: 6 }); return; }
      const s = sorteio(livres); this.reservar(s);
      this.q.push({ t: 'sentar', seat: s, st: 'Indo à copa' });
      if (Math.random() < 0.5) this.q.push({ t: 'falar', txt: sorteio(FALAS.copa) });
      this.q.push({ t: 'esperar', s: entre(8, 16), st: 'Pausa para o café' });
    }

    visitar(sala) {
      const spot = sorteio(PT.visitas[sala]);
      const nome = MAPA.SALAS[sala].nome;
      this.q.push({ t: 'ir', x: spot.x, y: spot.y, st: `Indo até ${nome}` },
        { t: 'virar', d: spot.f },
        { t: 'falar', txt: sorteio(this.dona ? FALAS.diretoria : FALAS.visita) },
        { t: 'esperar', s: entre(6, 11), st: `Conversando em ${nome}` });
    }

    // Vai até a mesa de outra pessoa, fala, espera a resposta e volta (pensar() leva de volta).
    irAte(outro, fala, resposta, status) {
      const s = outro.casa;
      if (!s || this.fora || outro === this || this.cliente) return false;
      const [tx, ty] = this.tile;
      const perto = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
        .map(([dx, dy]) => [s.x + dx, s.y + dy])
        .find(([x, y]) => rota(tx, ty, x, y));
      if (!perto) return false;
      this.limpar();
      this.q.push({ t: 'ir', x: perto[0], y: perto[1], st: status },
        { t: 'falar', txt: fala },
        { t: 'esperar', s: 2.4, st: status },
        { t: 'fn', f: () => { if (resposta && !outro.fora) outro.dizer(resposta); } },
        { t: 'esperar', s: 1.8 });
      return true;
    }

    // Leva a tarefa da missão até a mesa de quem vai executar.
    levarTarefa(outro, titulo) {
      const s = outro.casa;
      if (!s || this.fora || outro === this || this.cliente) return false;
      const [tx, ty] = this.tile;
      const perto = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
        .map(([dx, dy]) => [s.x + dx, s.y + dy])
        .find(([x, y]) => rota(tx, ty, x, y));
      if (!perto) return false;
      const curto = titulo.length > 40 ? titulo.slice(0, 39) + '…' : titulo;
      this.limpar();
      this.q.push({ t: 'ir', x: perto[0], y: perto[1], st: `Levando tarefa para ${outro.nome}` },
        { t: 'falar', txt: `${outro.nome}, pode cuidar disso? ${curto}` },
        { t: 'esperar', s: 2.2, st: `Passando a tarefa para ${outro.nome}` },
        { t: 'fn', f: () => { if (!outro.fora) outro.dizer('Deixa comigo!'); } },
        { t: 'esperar', s: 1.8 });
      return true;
    }

    diligencia() {
      const e = PT.elevador;
      this.q.push({ t: 'falar', txt: sorteio(FALAS.saida) },
        { t: 'ir', x: e.x, y: e.y, st: 'Saindo da sala' },
        { t: 'sumir' },
        { t: 'esperar', s: entre(35, 75), st: 'Fora do escritório' },
        { t: 'surgir', st: 'Voltando da rua' },
        { t: 'falar', txt: sorteio(FALAS.volta) });
    }

    gravar() {
      const set = A['mkt-set'];
      if (!assentoLivre(set, this)) { this.visitar('marketing'); return; }
      this.reservar(set);
      const fim = SIM.t + 40;
      this.q.push({ t: 'sentar', seat: set, st: 'Indo ao estúdio' },
        { t: 'falar', txt: 'Vou ensaiar no estúdio.' },
        { t: 'ate', fim, st: 'No estúdio' });
      const vm = SIM.equipe.find(p => p.videomaker && !p.ocupado && !p.fora && p.seat === p.casa);
      if (vm) {
        vm.limpar();
        vm.q.push({ t: 'ir', x: 42, y: 5, st: 'Filmando no estúdio' }, { t: 'virar', d: 'N' },
          { t: 'falar', txt: 'Gravando em 3, 2, 1...' }, { t: 'ate', fim, st: 'Filmando no estúdio' });
      }
    }

    /* ----- desenho ----- */
    desenhar(ctx) {
      if (this.fora || this.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = this.alpha;
      if (this.seat) {
        const [sx, sy] = P(this.fx, this.fy, this.seat.alt);
        const trabalhando = this.seat === this.casa && ((this.acao && this.acao.t === 'esperar') || !!(this.vivo && this.vivo.trabalhando));
        boneco(ctx, sx, sy + 15, this.look, this.dir, { sentado: true, alt: this.seat.alt, digitando: trabalhando, t: this.t });
        this.topo = [sx, sy + 15 - 56]; this.pe = [sx, sy + 15];
      } else {
        const [sx, sy] = P(this.fx, this.fy, 0);
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.beginPath(); ctx.ellipse(sx, sy, 11, 4.5, 0, 0, 7); ctx.fill();
        boneco(ctx, sx, sy, this.look, this.dir, { andando: this.andando, fase: this.fase, t: this.t });
        this.topo = [sx, sy - 56]; this.pe = [sx, sy];
      }
      ctx.restore();
    }
  }

  /* ===========================================================
     SIMULAÇÃO: equipe, reuniões e clientes
     =========================================================== */
  const SIM = { t: 0, equipe: [], clientes: [], reuniao: null, proxReuniao: 75, proxCliente: 18, nCli: 0, avisos: [] };
  const avisar = txt => SIM.avisos.push(txt);

  // No sistema JAS a equipe vem dos agentes cadastrados (equipe.js); fora dele, a lista de exemplo.
  const MODO_SISTEMA = Array.isArray(window.EQUIPE_DINAMICA);
  for (const cfg of (MODO_SISTEMA ? window.EQUIPE_DINAMICA : EQUIPE)) SIM.equipe.push(new Pessoa(cfg));
  const dona = () => SIM.equipe.find(p => p.dona);
  const recep = () => SIM.equipe.find(p => p.sala === 'recepcao');
  const disponivel = p => !p.fora && !p.ocupado && !p.cliente && !(p.vivo && (p.vivo.trabalhando || p.vivo.conversando));

  function iniciarReuniao() {
    const d = dona();
    const outros = SIM.equipe.filter(p => p !== d && !p.fixo && disponivel(p)).sort(() => Math.random() - .5).slice(0, 5);
    const grupo = (d && disponivel(d) ? [d] : []).concat(outros);
    if (grupo.length < 3) { SIM.proxReuniao = SIM.t + 40; return; }
    const fim = SIM.t + 60;
    const cadeiras = ['reu-n2', 'reu-n3', 'reu-s2', 'reu-s3', 'reu-n1', 'reu-s1', 'reu-n4', 'reu-s4', 'reu-n0', 'reu-s0'].map(id => A[id]);
    grupo.forEach(p => {
      const s = cadeiras.find(c => assentoLivre(c, p));
      if (!s) return;
      p.limpar(); p.ocupado = true; p.reservar(s);
      p.q.push({ t: 'sentar', seat: s, st: 'Indo para a reunião' });
      if (p === d) p.q.push({ t: 'falar', txt: 'Pauta de hoje: prazos e metas.' });
      p.q.push({ t: 'ate', fim, st: 'Em reunião de alinhamento' }, { t: 'fn', f: q => { q.ocupado = false; } });
    });
    SIM.reuniao = { fim, grupo };
    avisar('Reunião de alinhamento começando na Sala de Reunião');
    SIM.proxReuniao = fim + entre(110, 200);
  }

  function novoCliente() {
    const esp = ['esp-1', 'esp-2', 'esp-3'].map(id => A[id]).find(s => assentoLivre(s));
    if (!esp) return;
    const peles = ['#f0c8a5', '#d6a882', '#a8714b', '#6b4228', '#e8bf9d', '#c08a62'];
    const cabelos = ['#120c08', '#3a2216', '#7a5230', '#b9874d', '#9a9a9a'];
    const roupas = ['#7a8fa6', '#a6493f', '#3d6b55', '#d9c7a3', '#5b4a7a', '#e0e0e0', '#2b3a55'];
    const c = new Pessoa({
      id: 'cli' + (++SIM.nCli), nome: 'Cliente', cargo: 'Visitante', sala: 'recepcao', cliente: true,
      look: {
        pele: sorteio(peles), cabelo: sorteio(cabelos), estilo: sorteio(['curto', 'longo', 'rabo', 'careca', 'cacheado', 'coque']),
        roupa: sorteio(roupas), camisa: '#ffffff', baixo: sorteio(['#20232b', '#3a4256', '#c9b48f', '#2b2f3a'])
      }
    });
    c.fx = PT.elevador.x + .5; c.fy = PT.elevador.y + .5; c.alpha = 0; c.status = 'Chegando';
    c.reservar(esp);
    c.tentativas = 0;
    c.q.push({ t: 'surgir', st: 'Chegando ao escritório' },
      { t: 'ir', x: PT.balcao.x, y: PT.balcao.y, st: 'Indo à recepção' }, { t: 'virar', d: 'N' },
      { t: 'falar', txt: 'Bom dia! Tenho um horário.' },
      { t: 'fn', f: () => { const r = recep(); if (r && !r.fora) r.dizer('Seja bem-vindo(a)! Um instante.'); } },
      { t: 'sentar', seat: esp, st: 'Aguardando atendimento' },
      { t: 'esperar', s: entre(6, 12) },
      { t: 'fn', f: chamarAtendimento });
    SIM.clientes.push(c);
    avisar('Cliente chegou à recepção');
  }

  function irEmbora(c, fala) {
    const e = PT.elevador;
    c.q.push({ t: 'falar', txt: fala }, { t: 'ir', x: e.x, y: e.y, st: 'Indo embora' }, { t: 'sumir' }, { t: 'fn', f: q => { q.remover = true; } });
  }

  function chamarAtendimento(c) {
    let atend = null, sAt = null, sCli = null;
    const com = SIM.equipe.filter(p => p.sala === 'comercial' && disponivel(p) && p.seat === p.casa);
    atend = com.find(p => p.closer) || com[0] || null;
    if (atend) {
      for (const [a, b] of [['com-at1', 'com-at2'], ['com-at3', 'com-at4']])
        if (assentoLivre(A[a], atend) && assentoLivre(A[b], c)) { sAt = A[a]; sCli = A[b]; break; }
    } else {
      const d = dona();
      if (d && disponivel(d) && d.seat === d.casa) {
        atend = d; sAt = d.casa;
        sCli = [A['dir-c1'], A['dir-c2']].find(s => assentoLivre(s, c)) || null;
      }
    }
    if (!atend || !sCli) {
      if (++c.tentativas > 3) irEmbora(c, 'Volto outro dia, obrigado!');
      else c.q.push({ t: 'esperar', s: 8, st: 'Aguardando atendimento' }, { t: 'fn', f: chamarAtendimento });
      return;
    }
    const fim = SIM.t + entre(32, 46);
    const r = recep(); if (r && !r.fora) r.dizer('Pode acompanhar, por favor.');
    atend.limpar(); atend.ocupado = true; atend.reservar(sAt); c.reservar(sCli);
    atend.q.push({ t: 'sentar', seat: sAt, st: 'Atendendo cliente' }, { t: 'ate', fim, st: 'Atendendo cliente' },
      { t: 'falar', txt: sorteio(FALAS.fechamento) }, { t: 'fn', f: p => { p.ocupado = false; } });
    c.q.push({ t: 'sentar', seat: sCli, st: 'Em atendimento' }, { t: 'ate', fim, st: 'Em atendimento' }, { t: 'esperar', s: 1.5 });
    irEmbora(c, 'Obrigado(a)! Até breve.');
    avisar(`${atend.nome} está atendendo um cliente`);
  }

  SIM.atualizar = dt => {
    SIM.t += dt;
    for (const p of SIM.equipe) p.update(dt);
    for (const c of SIM.clientes) c.update(dt);
    SIM.clientes = SIM.clientes.filter(c => !c.remover);
    if (SIM.reuniao && SIM.t >= SIM.reuniao.fim) SIM.reuniao = null;
    // com dados reais, nada de reunião ou cliente inventado: só o trabalho registrado no sistema
    if (MODO_SISTEMA) return;
    if (!SIM.reuniao && SIM.t >= SIM.proxReuniao) iniciarReuniao();
    if (SIM.t >= SIM.proxCliente) {
      if (SIM.clientes.length < 2) novoCliente();
      SIM.proxCliente = SIM.t + entre(45, 85);
    }
  };
  SIM.todos = () => SIM.equipe.concat(SIM.clientes);

  return { SIM, Pessoa };
})();
const SIM = PESSOAS.SIM;
