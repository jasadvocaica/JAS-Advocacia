/* ===========================================================
   mapa.js — planta do escritório Juliana Araújo Advocacia
   Grade 44 x 28. Divisórias de vidro com perfil dourado.

     y 0..9    Recepção | Diretoria | Reunião | Marketing
     y 10      vidro
     y 11..13  corredor (elevador na parede oeste)
     y 14      vidro
     y 15..27  Operacional | Comercial | Diligências | Copa
   =========================================================== */
const MAPA = (() => {
  const { P, VPX, poly, tom, rgba, rng, espacoChao, faceS, faceE, rrect } = ISO;

  const W = 44, H = 28, WH = 128;       // WH: altura das paredes do fundo
  const LIVRE = 0, VIDRO = 1;

  const SALAS = {
    recepcao: {
      nome: 'Recepção', x1: 0, y1: 0, x2: 8, y2: 9,
      piso: { tipo: 'marmore', cor: '#ece8e0' },
      desc: 'A primeira impressão do escritório. Parede azul-marinho com a marca, balcão com o monograma em dourado, jardim vertical e espera para clientes.'
    },
    diretoria: {
      nome: 'Diretoria', x1: 10, y1: 0, x2: 20, y2: 9,
      piso: { tipo: 'madeira', cor: '#6c4831' },
      desc: 'Sala da Dra. Juliana. Vidro jateado para privacidade, vista panorâmica, mesa em nogueira com a balança da justiça e um canto de conversa para clientes estratégicos.'
    },
    reuniao: {
      nome: 'Sala de Reunião', x1: 22, y1: 0, x2: 31, y2: 9,
      piso: { tipo: 'carpete', cor: '#3c4664' },
      desc: 'Mesa em nogueira para 12 pessoas e tela para videochamadas e audiências virtuais. Aqui acontecem os alinhamentos da equipe.'
    },
    marketing: {
      nome: 'Marketing', x1: 33, y1: 0, x2: 43, y2: 9,
      piso: { tipo: 'concreto', cor: '#bfc1c4' },
      desc: 'Estúdio de conteúdo: fundo infinito azul-marinho com o monograma, ring light, câmera e bancada de criação com o calendário editorial na parede.'
    },
    operacional: {
      nome: 'Operacional', x1: 0, y1: 15, x2: 15, y2: 27,
      piso: { tipo: 'madeira', cor: '#d2b48d' },
      desc: 'O coração jurídico: advogados, assistentes e controladoria de prazos. Bancadas compartilhadas, arquivo de processos e quadro de prazos do dia.'
    },
    comercial: {
      nome: 'Comercial', x1: 17, y1: 15, x2: 27, y2: 27,
      piso: { tipo: 'madeira', cor: '#cfb089' },
      desc: 'Atendimento e fechamento de contratos. Ilha de SDR e closer, mesa redonda para receber clientes e painel de metas do mês.'
    },
    diligencias: {
      nome: 'Diligências', x1: 29, y1: 15, x2: 36, y2: 27,
      piso: { tipo: 'concreto', cor: '#aeb2b8' },
      desc: 'Base de quem vai para a rua: fóruns, cartórios, INSS e órgãos públicos. Mapa de rotas, armários, malotes e scanner.'
    },
    copa: {
      nome: 'Copa', x1: 38, y1: 15, x2: 43, y2: 27,
      piso: { tipo: 'granilite', cor: '#ebe6de' },
      desc: 'Café, água e uma pausa. Ilha com banquetas e mesinhas.'
    },
    corredor: {
      nome: 'Corredor & Elevador', x1: 0, y1: 10, x2: 43, y2: 14,
      piso: { tipo: 'marmore', cor: '#e6e2da' },
      desc: 'Circulação entre as salas, elevador social e o totem com o monograma.'
    }
  };
  const ORDEM = ['recepcao', 'diretoria', 'operacional', 'comercial', 'reuniao', 'diligencias', 'marketing', 'copa'];

  /* ---------- divisórias de vidro e vãos de porta ---------- */
  const VIDROS = [
    { o: 'h', y: 10, x0: 0, x1: 43, portas: [[3, 6], [11, 12], [26, 27], [37, 38]] },
    { o: 'h', y: 14, x0: 0, x1: 43, portas: [[7, 8], [21, 22], [31, 32], [38, 39]] },
    { o: 'v', x: 9, y0: 0, y1: 9 }, { o: 'v', x: 21, y0: 0, y1: 9 }, { o: 'v', x: 32, y0: 0, y1: 9 },
    { o: 'v', x: 16, y0: 15, y1: 27 }, { o: 'v', x: 28, y0: 15, y1: 27 }, { o: 'v', x: 37, y0: 15, y1: 27 }
  ];

  const tipo = new Uint8Array(W * H);
  const bloq = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;
  const dentro = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  for (const v of VIDROS) {
    if (v.o === 'h') {
      for (let x = v.x0; x <= v.x1; x++)
        if (!v.portas.some(([a, b]) => x >= a && x <= b)) tipo[idx(x, v.y)] = VIDRO;
    } else {
      for (let y = v.y0; y <= v.y1; y++) tipo[idx(v.x, y)] = VIDRO;
    }
  }

  const ehVidro = (x, y) => dentro(x, y) && tipo[idx(x, y)] === VIDRO;
  const livre = (x, y) => dentro(x, y) && tipo[idx(x, y)] === LIVRE && !bloq[idx(x, y)];
  const bloquear = (x, y) => { if (dentro(x, y)) bloq[idx(x, y)] = 1; };

  function salaEm(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!dentro(x, y)) return null;
    for (const id of ORDEM) {
      const s = SALAS[id];
      if (x >= s.x1 && x <= s.x2 && y >= s.y1 && y <= s.y2) return id;
    }
    if (y >= 10 && y <= 14) return 'corredor';
    return null;
  }

  /* ===========================================================
     VIDRO (itens ordenáveis, um por tile)
     =========================================================== */
  const GH = 74;  // altura do vidro
  const jateado = (x, y) =>
    ((x === 9 || x === 21) && y <= 9) || (y === 10 && x >= 10 && x <= 20);

  function painel(ctx, ax, ay, bx, by, fosco) {
    const base = [P(ax, ay, 0), P(bx, by, 0), P(bx, by, 6), P(ax, ay, 6)];
    poly(ctx, base, '#0b1236');
    const vid = [P(ax, ay, 6), P(bx, by, 6), P(bx, by, GH), P(ax, ay, GH)];
    poly(ctx, vid, fosco ? 'rgba(236,240,248,0.50)' : 'rgba(170,196,230,0.16)');
    if (fosco) {
      // faixa com fios dourados no jateado
      poly(ctx, [P(ax, ay, 40), P(bx, by, 40), P(bx, by, 42), P(ax, ay, 42)], 'rgba(201,164,92,0.55)');
    } else {
      // reflexo
      const m = 0.35;
      poly(ctx, [P(ax + (bx - ax) * m, ay + (by - ay) * m, 14), P(ax + (bx - ax) * (m + 0.12), ay + (by - ay) * (m + 0.12), 14),
                 P(ax + (bx - ax) * (m + 0.32), ay + (by - ay) * (m + 0.32), GH - 6), P(ax + (bx - ax) * (m + 0.2), ay + (by - ay) * (m + 0.2), GH - 6)],
           'rgba(255,255,255,0.10)');
    }
    ISO.linha(ctx, P(ax, ay, GH), P(bx, by, GH), '#d8b56a', 2);
  }
  function poste(ctx, x, y) {
    const [sx, sy] = P(x, y, 0);
    ctx.fillStyle = '#c9a45c';
    ctx.fillRect(sx - 1.5, sy - GH, 3, GH);
  }

  function itensVidro() {
    const itens = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!ehVidro(x, y)) continue;
      const linhaH = y === 10 || y === 14;
      itens.push({
        key: x + y + 1, pri: 0,
        draw: ctx => {
          const f = jateado(x, y);
          if (linhaH) {
            if (ehVidro(x, y - 1)) painel(ctx, x + .5, y, x + .5, y + .5, f);
            painel(ctx, x, y + .5, x + 1, y + .5, f);
            if (ehVidro(x, y + 1)) painel(ctx, x + .5, y + .5, x + .5, y + 1, f);
            if (!ehVidro(x - 1, y) && x > 0) poste(ctx, x, y + .5);
            if (!ehVidro(x + 1, y) && x < W - 1) poste(ctx, x + 1, y + .5);
          } else {
            painel(ctx, x + .5, y, x + .5, y + 1, f);
          }
        }
      });
    }
    return itens;
  }

  /* ===========================================================
     CÉU pela hora do dia
     =========================================================== */
  function ceu(h) {
    const fases = [
      [0,    '#050a22', '#141c46', 1],
      [5.2,  '#0a1236', '#2a2f5c', 1],
      [6.3,  '#3d4f86', '#f2b27c', 0.4],
      [7.5,  '#6aa6dc', '#cfe5f6', 0],
      [16.5, '#5f9fd8', '#d7e9f6', 0],
      [18.0, '#3d4c8c', '#f3a35d', 0.3],
      [19.2, '#121a45', '#4a3d6e', 0.85],
      [20.2, '#050a22', '#141c46', 1],
      [24,   '#050a22', '#141c46', 1]
    ];
    let i = 0;
    while (i < fases.length - 2 && h >= fases[i + 1][0]) i++;
    const a = fases[i], b = fases[i + 1];
    const t = Math.min(1, Math.max(0, (h - a[0]) / (b[0] - a[0])));
    const noite = a[3] + (b[3] - a[3]) * t;
    return {
      topo: ISO.mistura(a[1], b[1], t), base: ISO.mistura(a[2], b[2], t), noite,
      predio: ISO.mistura('#9fb1c6', '#121a3c', noite), predio2: ISO.mistura('#8197b2', '#0d1431', noite)
    };
  }

  function janela(ctx, u0, u1, v0, v1, hora, semente) {
    const c = ceu(hora), r = rng(semente);
    ctx.save();
    ctx.beginPath(); ctx.rect(u0, v0, u1 - u0, v1 - v0); ctx.clip();
    const g = ctx.createLinearGradient(0, v0, 0, v1);
    g.addColorStop(0, c.topo); g.addColorStop(1, c.base);
    ctx.fillStyle = g; ctx.fillRect(u0, v0, u1 - u0, v1 - v0);
    if (c.noite > 0.5) {
      ctx.fillStyle = `rgba(255,255,255,${(c.noite - 0.5) * 1.4})`;
      for (let i = 0; i < (u1 - u0) / 9; i++) ctx.fillRect(u0 + r() * (u1 - u0), v0 + r() * (v1 - v0) * 0.5, 1, 1);
    }
    // duas camadas de prédios
    for (const [cor, alt, luz] of [[c.predio2, 0.75, 0.25], [c.predio, 0.48, 0.45]]) {
      let u = u0 - 10;
      while (u < u1) {
        const w = 12 + r() * 26, hh = (v1 - v0) * (0.15 + r() * alt);
        ctx.fillStyle = cor;
        ctx.fillRect(u, v1 - hh, w, hh);
        if (c.noite > 0.4) {
          ctx.fillStyle = `rgba(255,214,140,${0.5 * c.noite})`;
          for (let yy = v1 - hh + 4; yy < v1 - 3; yy += 6)
            for (let xx = u + 3; xx < u + w - 3; xx += 5)
              if (r() < luz) ctx.fillRect(xx, yy, 2, 2);
        }
        u += w + 2 + r() * 6;
      }
    }
    // reflexo
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath(); ctx.moveTo(u0 + 10, v1); ctx.lineTo(u0 + 40, v0); ctx.lineTo(u0 + 60, v0); ctx.lineTo(u0 + 30, v1); ctx.fill();
    ctx.restore();
    // caixilhos
    ctx.fillStyle = '#060b26';
    for (let u = u0; u <= u1 + 0.1; u += VPX) ctx.fillRect(Math.min(u, u1) - 1.5, v0, 3, v1 - v0);
    ctx.fillRect(u0, v0 + (v1 - v0) * 0.7, u1 - u0, 2);
    ctx.strokeStyle = '#c9a45c'; ctx.lineWidth = 1.2;
    ctx.strokeRect(u0 - 2, v0 - 2, u1 - u0 + 4, v1 - v0 + 4);
    ctx.fillStyle = '#e9e4da'; ctx.fillRect(u0 - 4, v1 + 2, u1 - u0 + 8, 3);
  }

  /* ===========================================================
     PISOS (desenhados no espaço do chão: 64 unidades por tile)
     =========================================================== */
  function piso(ctx, p, w, h, semente) {
    const r = rng(semente);
    ctx.fillStyle = p.cor; ctx.fillRect(0, 0, w, h);
    if (p.tipo === 'marmore') {
      ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
      for (let u = 0; u <= w; u += 128) { ctx.beginPath(); ctx.moveTo(u, 0); ctx.lineTo(u, h); ctx.stroke(); }
      for (let v = 0; v <= h; v += 128) { ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(w, v); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(140,128,112,0.16)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < w * h / 9000; i++) {
        const x = r() * w, y = r() * h;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 30 * r(), y + 20 * r(), x + 50 * r(), y - 10 * r(), x + 90 * r(), y + 40 * r());
        ctx.stroke();
      }
    } else if (p.tipo === 'madeira') {
      for (let v = 0; v < h; v += 16) {
        let u = -r() * 120;
        while (u < w) {
          const len = 110 + r() * 90;
          ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + r() * 0.04})`;
          ctx.fillRect(u, v, len, 16);
          ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(u, v, 1, 16);
          u += len;
        }
        ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(0, v, w, 1);
      }
    } else if (p.tipo === 'carpete') {
      for (let v = 0; v < h; v += 64) for (let u = 0; u < w; u += 64) {
        ctx.fillStyle = ((u + v) / 64) % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
        ctx.fillRect(u, v, 64, 64);
      }
    } else if (p.tipo === 'concreto') {
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
      for (let u = 0; u <= w; u += 192) { ctx.beginPath(); ctx.moveTo(u, 0); ctx.lineTo(u, h); ctx.stroke(); }
      for (let v = 0; v <= h; v += 192) { ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(w, v); ctx.stroke(); }
      for (let i = 0; i < w * h / 300; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`;
        ctx.fillRect(r() * w, r() * h, 2, 2);
      }
    } else if (p.tipo === 'granilite') {
      const cores = ['#c9a45c', '#1b2550', '#9aa0aa', '#d9c9a8', '#6b7488'];
      for (let i = 0; i < w * h / 140; i++) {
        ctx.fillStyle = cores[Math.floor(r() * cores.length)];
        const s = 2 + r() * 4;
        ctx.save(); ctx.translate(r() * w, r() * h); ctx.rotate(r() * 3);
        ctx.fillRect(-s / 2, -s / 3, s, s * 0.66); ctx.restore();
      }
    }
  }

  /** tapete no chão (fica na camada de fundo) */
  const TAPETES = [];
  function tapete(x, y, w, d, cor, borda, raio = 0) { TAPETES.push({ x, y, w, d, cor, borda, raio }); }

  /* ===========================================================
     PAREDES DO FUNDO
     =========================================================== */
  const ESP = 0.16;  // espessura da parede

  function conteudoNorte(ctx, hora, img) {
    const u = x => x * VPX;
    // recepção: a marca
    const g = ctx.createRadialGradient(u(4.6), 60, 4, u(4.6), 60, 120);
    g.addColorStop(0, 'rgba(201,164,92,0.20)'); g.addColorStop(1, 'rgba(201,164,92,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, u(9.5), WH);
    if (img.logo && img.logo.complete && img.logo.naturalWidth) {
      const hh = 80, ww = hh * 1315 / 787;
      ctx.drawImage(img.logo, 341, 600, 1315, 787, u(4.6) - ww / 2, 18, ww, hh);
    }
    // diretoria: vista panorâmica
    janela(ctx, u(12.1), u(18.9), 16, 92, hora, 11);
    // reunião: janelas + tela
    janela(ctx, u(22.3), u(24.7), 16, 96, hora, 23);
    janela(ctx, u(29.3), u(31.7), 16, 96, hora, 29);
    tela(ctx, u(25.1), u(28.9), 22, 82, img);
    // marketing: calendário editorial + janela
    calendario(ctx, u(33.3), u(37.8), 20, 94);
    janela(ctx, u(38.1), u(39.3), 16, 96, hora, 38);
    // junções das divisórias
    ctx.fillStyle = '#c9a45c';
    for (const x of [9.5, 21.5, 32.5]) ctx.fillRect(u(x) - 1, WH - GH, 2, GH);
  }

  function conteudoOeste(ctx, hora) {
    const u = y => (H - y) * VPX;   // a face oeste corre de y = H (esquerda) até y = 0
    jardim(ctx, u(9.3), u(0.7), 12, 114);
    elevador(ctx, u(14), u(11), 24, WH);
    janela(ctx, u(27.4), u(15.6), 16, 96, hora, 5);
    ctx.fillStyle = '#c9a45c';
    for (const y of [10.5, 14.5]) ctx.fillRect(u(y) - 1, WH - GH, 2, GH);
  }

  function acabamento(ctx, comp) {
    // LED dourado no alto e rodapé
    ctx.save();
    ctx.shadowColor = 'rgba(236,205,130,0.9)'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#ecd59a'; ctx.fillRect(0, 5, comp, 1.5);
    ctx.restore();
    ctx.fillStyle = '#060b26'; ctx.fillRect(0, WH - 8, comp, 8);
    ctx.fillStyle = '#c9a45c'; ctx.fillRect(0, WH - 9, comp, 1);
  }

  function tela(ctx, u0, u1, v0, v1, img) {
    ctx.fillStyle = '#05070f'; rrect(ctx, u0, v0, u1 - u0, v1 - v0, 3); ctx.fill();
    const x = u0 + 3, y = v0 + 3, w = u1 - u0 - 6, h = v1 - v0 - 6;
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#0d1850'); g.addColorStop(1, '#030824');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    if (img.logo && img.logo.complete && img.logo.naturalWidth)
      ctx.drawImage(img.logo, 850, 595, 360, 475, x + 8, y + 8, 22, 29);
    ctx.fillStyle = '#ecd59a'; ctx.font = '600 8px Montserrat, sans-serif';
    ctx.fillText('ALINHAMENTO SEMANAL', x + 38, y + 18);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '6px Montserrat, sans-serif';
    ctx.fillText('Pauta · prazos · metas · conteúdo', x + 38, y + 28);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 10, y + 42 + i * 6, w * (0.7 - i * 0.15), 2);
    ctx.fillStyle = '#c9a45c'; ctx.fillRect(x, y + h - 2, w, 2);
  }

  function calendario(ctx, u0, u1, v0, v1) {
    const r = rng(77);
    ctx.fillStyle = '#f6f4ef'; ctx.fillRect(u0, v0, u1 - u0, v1 - v0);
    ctx.strokeStyle = '#c9a45c'; ctx.lineWidth = 1.5; ctx.strokeRect(u0, v0, u1 - u0, v1 - v0);
    const mes = new Date().toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();
    ctx.fillStyle = '#0b1236'; ctx.font = '600 7px Montserrat, sans-serif';
    ctx.fillText('CALENDÁRIO EDITORIAL · ' + mes, u0 + 5, v0 + 10);
    const cols = 7, rows = 4, cw = (u1 - u0 - 10) / cols, ch = (v1 - v0 - 20) / rows;
    const cores = ['#c9a45c', '#0b1236', '#e7b8b0', '#a9c2a4', '#9fb7d8'];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = u0 + 5 + i * cw, y = v0 + 15 + j * ch;
      ctx.strokeStyle = 'rgba(11,18,54,0.12)'; ctx.lineWidth = 0.6; ctx.strokeRect(x, y, cw, ch);
      if (r() < 0.62) { ctx.fillStyle = cores[Math.floor(r() * cores.length)]; ctx.fillRect(x + 2, y + 3, cw - 4, ch * 0.45); }
    }
  }

  function jardim(ctx, u0, u1, v0, v1) {
    const r = rng(5);
    ctx.fillStyle = '#16301f'; ctx.fillRect(u0, v0, u1 - u0, v1 - v0);
    const verdes = ['#2f6b3f', '#3f8650', '#24502f', '#5a9a5c', '#1f4a2c', '#78ad6a'];
    for (let i = 0; i < (u1 - u0) * (v1 - v0) / 22; i++) {
      ctx.fillStyle = verdes[Math.floor(r() * verdes.length)];
      ctx.beginPath();
      ctx.ellipse(u0 + r() * (u1 - u0), v0 + r() * (v1 - v0), 3 + r() * 4, 1.6 + r() * 2, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#6c4831'; ctx.fillRect(u0 - 3, v0 - 4, u1 - u0 + 6, 4); ctx.fillRect(u0 - 3, v1, u1 - u0 + 6, 4);
    ctx.fillStyle = '#c9a45c'; ctx.fillRect(u0 - 3, v0 - 5, u1 - u0 + 6, 1);
  }

  function elevador(ctx, u0, u1, v0, v1) {
    ctx.fillStyle = '#c9a45c'; ctx.fillRect(u0 - 4, v0 - 4, u1 - u0 + 8, v1 - v0 + 4);
    const g = ctx.createLinearGradient(u0, 0, u1, 0);
    g.addColorStop(0, '#9aa1ad'); g.addColorStop(0.5, '#dfe2e8'); g.addColorStop(1, '#8e95a2');
    ctx.fillStyle = g; ctx.fillRect(u0, v0, u1 - u0, v1 - v0);
    ctx.fillStyle = '#5d6472'; ctx.fillRect((u0 + u1) / 2 - 0.7, v0, 1.4, v1 - v0);
    ctx.fillStyle = '#05070f'; ctx.fillRect((u0 + u1) / 2 - 12, v0 - 16, 24, 9);
    ctx.fillStyle = '#ecd59a'; ctx.font = '600 6px Montserrat, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('▲ 12', (u0 + u1) / 2, v0 - 9.5); ctx.textAlign = 'left';
    ctx.fillStyle = '#c9a45c'; ctx.fillRect(u1 + 8, v0 + 34, 5, 12);
  }

  /* ---------- o fundo inteiro: pisos, tapetes, paredes ---------- */
  function desenharFundo(ctx, hora, img) {
    // laje (borda da frente)
    poly(ctx, [P(-ESP, H, 0), P(W, H, 0), P(W, H, -16), P(-ESP, H, -16)], '#0a1236');
    poly(ctx, [P(W, -ESP, 0), P(W, H, 0), P(W, H, -16), P(W, -ESP, -16)], '#060b26');
    ISO.linha(ctx, P(-ESP, H, 0), P(W, H, 0), '#c9a45c', 1.5);
    ISO.linha(ctx, P(W, -ESP, 0), P(W, H, 0), '#c9a45c', 1.5);

    // pisos
    let semente = 1;
    for (const id of ['corredor', ...ORDEM]) {
      const s = SALAS[id];
      const w = s.x2 - s.x1 + 1, h = s.y2 - s.y1 + 1;
      ctx.save(); espacoChao(ctx, s.x1, s.y1);
      ctx.beginPath(); ctx.rect(0, 0, w * 64, h * 64); ctx.clip();
      piso(ctx, s.piso, w * 64, h * 64, semente++ * 31);
      if (id === 'corredor') {
        ctx.fillStyle = '#c9a45c'; ctx.fillRect(0, 2.5 * 64 - 1.5, w * 64, 3);
      }
      ctx.restore();
    }
    for (const t of TAPETES) {
      ctx.save(); espacoChao(ctx, t.x, t.y);
      ctx.fillStyle = t.cor;
      if (t.raio) { rrect(ctx, 0, 0, t.w * 64, t.d * 64, t.raio); ctx.fill(); }
      else ctx.fillRect(0, 0, t.w * 64, t.d * 64);
      if (t.borda) { ctx.strokeStyle = t.borda; ctx.lineWidth = 2; ctx.strokeRect(6, 6, t.w * 64 - 12, t.d * 64 - 12); }
      ctx.restore();
    }
    // sombra suave junto às paredes
    ctx.save(); espacoChao(ctx, 0, 0);
    let g = ctx.createLinearGradient(0, 0, 0, 60); g.addColorStop(0, 'rgba(0,0,0,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W * 64, 60);
    g = ctx.createLinearGradient(0, 0, 60, 0); g.addColorStop(0, 'rgba(0,0,0,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 60, H * 64);
    ctx.restore();

    // parede oeste
    const fO = [P(0, H, 0), P(0, 0, 0), P(0, 0, WH), P(0, H, WH)];
    poly(ctx, fO, '#0c1440');
    ctx.save(); ISO.caminho(ctx, fO); ctx.clip(); faceE(ctx, 0, H, WH);
    conteudoOeste(ctx, hora); acabamento(ctx, H * VPX); ctx.restore();
    // parede norte
    const fN = [P(0, 0, 0), P(W, 0, 0), P(W, 0, WH), P(0, 0, WH)];
    poly(ctx, fN, '#111b4a');
    ctx.save(); ISO.caminho(ctx, fN); ctx.clip(); faceS(ctx, 0, 0, WH);
    conteudoNorte(ctx, hora, img); acabamento(ctx, W * VPX); ctx.restore();
    // pontas e topo
    poly(ctx, [P(W, -ESP, 0), P(W, 0, 0), P(W, 0, WH), P(W, -ESP, WH)], '#050a24');
    poly(ctx, [P(-ESP, H, 0), P(0, H, 0), P(0, H, WH), P(-ESP, H, WH)], '#08102f');
    poly(ctx, [P(-ESP, H, WH), P(0, H, WH), P(0, 0, WH), P(W, 0, WH), P(W, -ESP, WH), P(-ESP, -ESP, WH)], '#1c2861');
    ISO.linha(ctx, P(0, H, WH), P(0, 0, WH), '#c9a45c', 1);
    ISO.linha(ctx, P(0, 0, WH), P(W, 0, WH), '#c9a45c', 1);
  }

  /** limites da cena em coordenadas do mundo */
  const LIMITES = { x0: -H * 32 - 30, x1: W * 32 + 30, y0: -WH - 40, y1: (W + H) * 16 + 40 };

  return {
    W, H, WH, SALAS, ORDEM, salaEm, livre, ehVidro, bloquear, tapete,
    itensVidro, desenharFundo, LIMITES, ceu
  };
})();
