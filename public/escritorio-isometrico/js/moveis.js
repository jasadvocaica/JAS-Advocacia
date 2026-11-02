/* ===========================================================
   moveis.js — mobiliário de cada sala, cadeiras e pontos
   Paleta da marca: azul-marinho, dourado, marfim e nogueira.
   =========================================================== */
const MOVEIS = (() => {
  const { P, VPX, caixa, solido, tom, rng, faceS, cilindro, elipseChao, poly, linha, rrect, monograma } = ISO;

  const C = {
    nogueira: '#6e4a32', nogueiraEsc: '#4a3020', carvalho: '#dcc29b',
    marinho: '#1c2756', marinho2: '#0b1236', ouro: '#c9a45c', ouroClaro: '#ecd59a',
    marfim: '#f3f0ea', grafite: '#353a46', metal: '#c3c8d0', preto: '#1a1d24', creme: '#e8dfd0'
  };

  const ITENS = [];      // itens estáticos { key, pri, draw }
  const ASSENTOS = {};   // id -> assento
  const PONTOS = { visitas: {} };

  /** móvel de caixas; bloqueia as células ocupadas (+ retângulo extra opcional) */
  function add(caixas, extra) {
    const { itens, celulas } = solido(caixas);
    ITENS.push(...itens);
    for (const [x, y] of celulas) MAPA.bloquear(x, y);
    if (extra) for (let x = extra[0]; x < extra[0] + extra[2]; x++)
      for (let y = extra[1]; y < extra[1] + extra[3]; y++) MAPA.bloquear(x, y);
  }
  function custom(key, draw, bloqueia = [], pri = 0) {
    ITENS.push({ key, pri, draw });
    for (const [x, y] of bloqueia) MAPA.bloquear(x, y);
  }

  /* ===========================================================
     DECORAÇÃO DE FACES  fn(ctx, largura, altura)
     =========================================================== */
  const livros = s => (ctx, w, h) => {
    const r = rng(s);
    ctx.fillStyle = '#2e1e13'; ctx.fillRect(0, 0, w, h);
    const prat = 5, ph = (h - 6) / prat;
    const cores = ['#6b1f24', '#14204f', '#1f3b2c', '#c9a45c', '#e9e2d3', '#3a2a4d', '#7a5a3a', '#0b1236'];
    for (let i = 0; i < prat; i++) {
      const base = 4 + (i + 1) * ph;
      let u = 3;
      while (u < w - 5) {
        if (r() < 0.1) {
          if (r() < 0.5) { ctx.fillStyle = C.ouro; ctx.beginPath(); ctx.arc(u + 4, base - 6, 3.2, 0, 7); ctx.fill(); }
          u += 9 + r() * 6; continue;
        }
        const bw = 2 + r() * 2.4, bh = ph * (0.55 + r() * 0.35);
        ctx.fillStyle = cores[Math.floor(r() * cores.length)];
        ctx.fillRect(u, base - 2 - bh, bw, bh);
        ctx.fillStyle = 'rgba(236,213,154,0.65)'; ctx.fillRect(u, base - bh + 1, bw, 0.8);
        u += bw + 0.4;
      }
      ctx.fillStyle = C.nogueira; ctx.fillRect(0, base - 2, w, 3);
    }
    ctx.fillStyle = C.nogueira;
    ctx.fillRect(0, 0, 2.5, h); ctx.fillRect(w - 2.5, 0, 2.5, h); ctx.fillRect(0, 0, w, 3.5);
  };

  const gavetas = (n, etiqueta) => (ctx, w, h) => {
    const gh = h / n;
    for (let i = 0; i < n; i++) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
      ctx.strokeRect(2, i * gh + 1.5, w - 4, gh - 3);
      ctx.fillStyle = C.ouro; ctx.fillRect(w / 2 - 4, i * gh + gh / 2 - 0.7, 8, 1.4);
      if (etiqueta) { ctx.fillStyle = '#f3f0ea'; ctx.fillRect(5, i * gh + 4, 7, 3.5); }
    }
  };

  const portas = n => (ctx, w, h) => {
    const pw = w / n;
    for (let i = 0; i < n; i++) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
      ctx.strokeRect(i * pw + 1.5, 2, pw - 3, h - 4);
      ctx.fillStyle = C.ouro; ctx.fillRect(i * pw + (i % 2 ? 3.5 : pw - 5), 5, 1.4, 7);
    }
  };

  const telaD = tipo => (ctx, w, h) => {
    ctx.fillStyle = '#0d0f14'; ctx.fillRect(0, 0, w, h);
    const x = 1.4, y = 1.4, ww = w - 2.8, hh = h - 2.8;
    if (tipo === 'design') {
      const g = ctx.createLinearGradient(x, y, x + ww, y + hh);
      g.addColorStop(0, '#f6efe2'); g.addColorStop(1, '#efe3cf');
      ctx.fillStyle = g; ctx.fillRect(x, y, ww, hh);
      const cores = ['#0b1236', '#c9a45c', '#e7b8b0', '#0b1236', '#f3f0ea', '#c9a45c'];
      const cw = (ww - 4) / 3, ch = (hh - 4) / 3;
      for (let i = 0; i < 9; i++) { ctx.fillStyle = cores[i % cores.length]; ctx.fillRect(x + 1 + (i % 3) * (cw + 1), y + 1 + Math.floor(i / 3) * (ch + 1), cw, ch); }
      return;
    }
    ctx.fillStyle = tipo === 'crm' ? '#f7f8fa' : '#f4f5f7'; ctx.fillRect(x, y, ww, hh);
    ctx.fillStyle = tipo === 'crm' ? C.ouro : C.marinho2; ctx.fillRect(x, y, ww, 3);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(30,40,70,0.25)';
      ctx.fillRect(x + (tipo === 'crm' ? 4 : 2), y + 5.5 + i * 2.6, ww * (tipo === 'doc' ? 0.85 - (i % 3) * 0.15 : 0.6), 1);
      if (tipo === 'crm') { ctx.fillStyle = ['#3fa36b', '#c9a45c', '#d0605a'][i % 3]; ctx.fillRect(x + 1.5, y + 5.2 + i * 2.6, 1.6, 1.6); }
      if (tipo === 'prazos') { ctx.fillStyle = i < 2 ? '#d0605a' : C.ouro; ctx.fillRect(x + ww - 4, y + 5.2 + i * 2.6, 2.5, 1.6); }
    }
  };

  const kanban = (ctx, w, h) => {
    const r = rng(3);
    ctx.fillStyle = '#f7f5f0'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = C.ouro; ctx.lineWidth = 1.5; ctx.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);
    ctx.fillStyle = C.marinho2; ctx.font = '600 6.5px Montserrat, sans-serif';
    ctx.fillText('CONTROLE DE PRAZOS', 5, 9);
    const cols = [['HOJE', '#b8463f'], ['AMANHÃ', C.ouro], ['SEMANA', C.marinho]];
    const cw = (w - 10) / 3;
    cols.forEach(([t, cor], i) => {
      const x = 5 + i * cw;
      ctx.fillStyle = 'rgba(11,18,54,0.6)'; ctx.font = '600 4.5px Montserrat, sans-serif';
      ctx.fillText(t, x + 1, 17);
      const n = 3 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        ctx.fillStyle = cor; ctx.fillRect(x + 1, 20 + k * 8.5, cw - 5, 6.5);
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(x + 3, 22.5 + k * 8.5, (cw - 10) * (0.5 + r() * 0.5), 1);
      }
    });
  };

  const metas = (ctx, w, h) => {
    ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0f1b55'); g.addColorStop(1, '#040822');
    ctx.fillStyle = g; ctx.fillRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = C.ouroClaro; ctx.font = '600 6.5px Montserrat, sans-serif';
    ctx.fillText('METAS DO MÊS · COMERCIAL', 7, 11);
    const alts = [0.35, 0.5, 0.42, 0.66, 0.58, 0.8, 0.72];
    alts.forEach((a, i) => { ctx.fillStyle = i === alts.length - 1 ? C.ouroClaro : C.ouro; ctx.fillRect(8 + i * 9, h - 8 - a * (h - 24), 6, a * (h - 24)); });
    const cx = w - 22, cy = h / 2 + 4;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, 7); ctx.stroke();
    ctx.strokeStyle = C.ouroClaro; ctx.beginPath(); ctx.arc(cx, cy, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.72); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '600 6px Montserrat, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('72%', cx, cy + 2); ctx.textAlign = 'left';
  };

  const mapaRotas = (ctx, w, h) => {
    const r = rng(9);
    ctx.fillStyle = '#eef0ea'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#9fc3dd'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, h * 0.7); ctx.bezierCurveTo(w * 0.3, h * 0.4, w * 0.6, h * 0.95, w, h * 0.6); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath(); ctx.moveTo(r() * w, 12); ctx.lineTo(r() * w, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 14 + r() * (h - 14)); ctx.lineTo(w, 14 + r() * (h - 14)); ctx.stroke();
    }
    ctx.strokeStyle = C.ouro; ctx.lineWidth = 1.2; ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.moveTo(14, h - 10); ctx.lineTo(w * 0.35, 30); ctx.lineTo(w * 0.62, h * 0.55); ctx.lineTo(w - 16, 24); ctx.stroke();
    ctx.setLineDash([]);
    [['FÓRUM', 14, h - 10], ['INSS', w * 0.35, 30], ['TRT', w * 0.62, h * 0.55], ['CARTÓRIO', w - 16, 24]].forEach(([t, x, y]) => {
      ctx.fillStyle = '#b8463f'; ctx.beginPath(); ctx.arc(x, y - 3, 2.6, 0, 7); ctx.fill();
      ctx.fillStyle = C.marinho2; ctx.font = '600 4.2px Montserrat, sans-serif'; ctx.fillText(t, x + 3.5, y - 1);
    });
    ctx.fillStyle = C.marinho2; ctx.fillRect(0, 0, w, 11);
    ctx.fillStyle = C.ouroClaro; ctx.font = '600 6px Montserrat, sans-serif'; ctx.fillText('ROTAS DE DILIGÊNCIA', 5, 8);
  };

  const armarios = n => (ctx, w, h) => {
    const pw = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * pw;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(x + 1, 1.5, pw - 2, h - 3);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let k = 0; k < 4; k++) ctx.fillRect(x + 4, 8 + k * 3, pw - 8, 1);
      ctx.fillStyle = '#f3f0ea'; ctx.fillRect(x + 4, 24, pw - 8, 5);
      ctx.fillStyle = C.ouro; ctx.fillRect(x + pw - 5, h / 2, 1.5, 9);
    }
  };

  const malotes = (ctx, w, h) => {
    const r = rng(12);
    ctx.fillStyle = '#2e1e13'; ctx.fillRect(0, 0, w, h);
    const prat = 3, ph = h / prat;
    for (let i = 0; i < prat; i++) {
      let u = 3;
      while (u < w - 14) {
        const bw = 12 + r() * 8, bh = ph * (0.55 + r() * 0.3);
        ctx.fillStyle = r() < 0.75 ? '#c79b6b' : C.marinho;
        ctx.fillRect(u, (i + 1) * ph - 2 - bh, bw, bh);
        ctx.fillStyle = '#f3f0ea'; ctx.fillRect(u + 3, (i + 1) * ph - bh + 2, bw - 6, 3);
        u += bw + 2;
      }
      ctx.fillStyle = C.nogueira; ctx.fillRect(0, (i + 1) * ph - 2, w, 2.5);
    }
    ctx.fillStyle = C.nogueira; ctx.fillRect(0, 0, 2.5, h); ctx.fillRect(w - 2.5, 0, 2.5, h); ctx.fillRect(0, 0, w, 2.5);
  };

  const comMonograma = (fundo, alt, topo = 6) => (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, tom(fundo, 0.08)); g.addColorStop(1, tom(fundo, -0.25));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.ouro; ctx.fillRect(0, 2, w, 1);
    monograma(ctx, w / 2 - alt * 360 / 475 / 2, topo, alt);
  };

  const geladeira = (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#c3c8d0'); g.addColorStop(0.5, '#eef0f3'); g.addColorStop(1, '#b6bcc6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, h * 0.36, w, 1);
    ctx.fillStyle = C.ouro; ctx.fillRect(w - 5, 8, 1.6, 22); ctx.fillRect(w - 5, h * 0.36 + 6, 1.6, 30);
  };

  const maquinaCafe = (ctx, w, h) => {
    ctx.fillStyle = '#20232b'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.ouroClaro; ctx.fillRect(3, 2.5, w - 6, 2.5);
    ctx.fillStyle = '#b9bec8'; ctx.fillRect(w / 2 - 2, 6, 4, 2.5);
    ctx.fillStyle = '#f3f0ea'; ctx.fillRect(w / 2 - 2.2, h - 5, 4.4, 3.5);
  };

  const placa = (ctx, w, h) => { ctx.fillStyle = C.ouro; ctx.fillRect(2, h / 2 - 0.5, w - 4, 1); };

  /* ===========================================================
     PEÇAS
     =========================================================== */
  function mesaCaixas(x, y, w, d, { tampo = C.carvalho, pe = C.marinho2, alt = 28 } = {}) {
    return [
      { x: x + .06, y: y + .1, z: 0, w: .1, d: d - .2, h: alt, c: pe },
      { x: x + w - .16, y: y + .1, z: 0, w: .1, d: d - .2, h: alt, c: pe },
      { x, y, z: alt, w, d, h: 3, c: tampo, borda: tom(tampo, .3) }
    ];
  }

  function monitorCaixas(mx, my, f, z0 = 31, tipo = 'doc') {
    const sc = '#15171d', base = '#2a2d35', haste = '#9aa0aa', tela = telaD(tipo);
    if (f === 'S') return [
      { x: mx - .13, y: my - .14, z: z0, w: .26, d: .16, h: 1.5, c: base },
      { x: mx - .03, y: my - .1, z: z0 + 1.5, w: .06, d: .05, h: 7, c: haste },
      { x: mx - .32, y: my - .05, z: z0 + 7, w: .64, d: .05, h: 20, c: sc, s: tela }
    ];
    if (f === 'N') return [
      { x: mx - .13, y: my - .02, z: z0, w: .26, d: .16, h: 1.5, c: base },
      { x: mx - .03, y: my + .05, z: z0 + 1.5, w: .06, d: .05, h: 7, c: haste },
      { x: mx - .32, y: my, z: z0 + 7, w: .64, d: .05, h: 20, c: sc }
    ];
    if (f === 'E') return [
      { x: mx - .14, y: my - .13, z: z0, w: .16, d: .26, h: 1.5, c: base },
      { x: mx - .1, y: my - .03, z: z0 + 1.5, w: .05, d: .06, h: 7, c: haste },
      { x: mx - .05, y: my - .32, z: z0 + 7, w: .05, d: .64, h: 20, c: sc, e: tela }
    ];
    return [
      { x: mx - .02, y: my - .13, z: z0, w: .16, d: .26, h: 1.5, c: base },
      { x: mx + .05, y: my - .03, z: z0 + 1.5, w: .05, d: .06, h: 7, c: haste },
      { x: mx, y: my - .32, z: z0 + 7, w: .05, d: .64, h: 20, c: sc }
    ];
  }

  function teclado(x, y, z = 31) { return { x, y, z, w: .4, d: .12, h: 1, c: '#e9eaee' }; }

  /** bancada dupla (2 de profundidade) com divisória e estações dos dois lados */
  function bancada(x, y, w, norte, sul, tipoS = 'doc') {
    const cx = [
      { x: x + .05, y: y + .15, z: 0, w: .1, d: 1.7, h: 28, c: C.marinho2 },
      { x: x + w - .15, y: y + .15, z: 0, w: .1, d: 1.7, h: 28, c: C.marinho2 },
      { x, y, z: 28, w, d: 2, h: 3, c: C.carvalho, borda: tom(C.carvalho, .3) },
      { x: x + .1, y: y + .96, z: 31, w: w - .2, d: .08, h: 14, c: C.marinho, borda: C.ouro }
    ];
    for (const sx of norte) cx.push(...monitorCaixas(sx + .5, y + .45, 'N'), teclado(sx + .3, y + .1));
    for (const sx of sul) cx.push(...monitorCaixas(sx + .5, y + 1.55, 'S', 31, tipoS), teclado(sx + .3, y + 1.78));
    add(cx);
  }

  function sofaCaixas(x, y, w, d, f, cor) {
    const enc = tom(cor, -0.06);
    if (f === 'E') return [
      { x, y, z: 0, w: .25, d, h: 30, c: enc },
      { x: x + .25, y, z: 0, w: w - .25, d: .18, h: 20, c: enc },
      { x: x + .25, y: y + d - .18, z: 0, w: w - .25, d: .18, h: 20, c: enc },
      { x: x + .25, y: y + .18, z: 0, w: w - .25, d: d - .36, h: 12, c: cor, borda: tom(cor, .4) }
    ];
    return [
      { x, y, z: 0, w, d: .25, h: 30, c: enc },
      { x, y: y + .25, z: 0, w: .18, d: d - .25, h: 20, c: enc },
      { x: x + w - .18, y: y + .25, z: 0, w: .18, d: d - .25, h: 20, c: enc },
      { x: x + .18, y: y + .25, z: 0, w: w - .36, d: d - .25, h: 12, c: cor, borda: tom(cor, .4) }
    ];
  }

  function quadro(x0, x1, y, zb, h, deco, pe = C.marinho2) {
    add([
      { x: x0 + .15, y, z: 0, w: .06, d: .06, h: zb, c: pe },
      { x: x1 - .21, y, z: 0, w: .06, d: .06, h: zb, c: pe },
      { x: x0, y, z: zb, w: x1 - x0, d: .08, h, c: '#e9e6df', s: deco }
    ], [Math.floor(x0), Math.floor(y), Math.ceil(x1) - Math.floor(x0), 1]);
  }

  /* ---------- cadeiras e assentos ---------- */
  const ESTILO = {
    escritorio: { a: .44, z: 12, alt: 5, enc: 18, cor: '#1c2756', pe: true },
    executiva:  { a: .54, z: 12, alt: 6, enc: 32, cor: '#151a2e', pe: true },
    reuniao:    { a: .44, z: 12, alt: 5, enc: 16, cor: '#ece6da', pernas: C.nogueira },
    visita:     { a: .46, z: 12, alt: 6, enc: 18, cor: '#22307a', pernas: C.ouro },
    banqueta:   { a: .36, z: 24, alt: 4, enc: 0, cor: C.nogueira, pe: true },
    poltrona:   { a: .68, z: 4, alt: 9, enc: 20, cor: C.creme, braco: true },
    sofa:       null
  };

  function cadeiraCaixas(s) {
    const E = ESTILO[s.estilo], cx = s.cx, cy = s.cy, a = E.a / 2;
    const cor = s.cor || E.cor;
    const antes = [], depois = [];
    if (E.pe) {
      antes.push({ x: cx - .19, y: cy - .19, z: 0, w: .38, d: .38, h: 2, c: '#2a2f3a' });
      antes.push({ x: cx - .035, y: cy - .035, z: 2, w: .07, d: .07, h: E.z - 2, c: '#7b818c' });
    } else if (E.pernas) {
      for (const [dx, dy] of [[-a + .03, -a + .03], [a - .08, -a + .03], [-a + .03, a - .08], [a - .08, a - .08]])
        antes.push({ x: cx + dx, y: cy + dy, z: 0, w: .05, d: .05, h: E.z, c: E.pernas });
    } else {
      antes.push({ x: cx - a, y: cy - a, z: 0, w: 2 * a, d: 2 * a, h: E.z, c: tom(cor, -0.15) });
    }
    antes.push({ x: cx - a, y: cy - a, z: E.z, w: 2 * a, d: 2 * a, h: E.alt, c: cor, borda: tom(cor, .25) });
    const zt = E.z + E.alt, t = .08;
    const partes = [];
    if (E.enc) {
      const enc = { S: { x: cx - a, y: cy - a, w: 2 * a, d: t }, N: { x: cx - a, y: cy + a - t, w: 2 * a, d: t },
                    E: { x: cx - a, y: cy - a, w: t, d: 2 * a }, W: { x: cx + a - t, y: cy - a, w: t, d: 2 * a } }[s.f];
      partes.push({ ...enc, z: zt, h: E.enc, c: tom(cor, -0.05), borda: s.estilo === 'executiva' ? C.ouro : undefined });
    }
    if (E.braco) {
      const lado = (s.f === 'S' || s.f === 'N')
        ? [{ x: cx - a, y: cy - a + (s.f === 'S' ? t : 0), w: .12, d: 2 * a - t }, { x: cx + a - .12, y: cy - a + (s.f === 'S' ? t : 0), w: .12, d: 2 * a - t }]
        : [{ x: cx - a + (s.f === 'E' ? t : 0), y: cy - a, w: 2 * a - t, d: .12 }, { x: cx - a + (s.f === 'E' ? t : 0), y: cy + a - .12, w: 2 * a - t, d: .12 }];
      for (const b of lado) partes.push({ ...b, z: zt, h: 8, c: tom(cor, -0.08) });
    }
    for (const p of partes) ((p.x + p.w / 2 + p.y + p.d / 2) < cx + cy ? antes : depois).push(p);
    return { antes, depois };
  }

  function assento(id, x, y, f, estilo, sala, extra = {}) {
    const s = { id, x, y, f, estilo, sala, occ: null, res: null, cx: x + .5, cy: y + .5, ...extra };
    s.alt = ESTILO[estilo] ? ESTILO[estilo].z + ESTILO[estilo].alt : (extra.alt || 13);
    ASSENTOS[id] = s;
    const cx = ESTILO[estilo] ? cadeiraCaixas(s) : { antes: [], depois: [] };
    ITENS.push({
      key: s.cx + s.cy, pri: 1, assento: s,
      draw: ctx => {
        for (const b of cx.antes) caixa(ctx, b);
        if (s.occ) s.occ.desenhar(ctx);
        for (const b of cx.depois) caixa(ctx, b);
      }
    });
    return s;
  }

  /* ---------- objetos desenhados à mão ---------- */
  function planta(x, y, tipo = 'alta', vaso = '#efece6') {
    const cx = x + .5, cy = y + .5, semente = x * 31 + y * 7 + 3;
    custom(x + y + 1, ctx => {
      const r = rng(semente);
      caixa(ctx, { x: cx - .19, y: cy - .19, z: 0, w: .38, d: .38, h: 18, c: vaso, borda: C.ouro });
      const [sx, sy] = P(cx, cy, 18);
      const verdes = ['#2f6b3f', '#3f8650', '#24502f', '#5a9a5c', '#1f4a2c'];
      if (tipo === 'alta') {
        linha(ctx, [sx, sy], [sx + 1, sy - 34], '#5a3d28', 2);
        for (let i = 0; i < 34; i++) {
          const ang = r() * Math.PI * 2, rad = r() * 15;
          ctx.fillStyle = verdes[Math.floor(r() * verdes.length)];
          ctx.beginPath(); ctx.ellipse(sx + Math.cos(ang) * rad, sy - 46 + Math.sin(ang) * rad * 1.2, 5, 2.8, r() * 3, 0, 7); ctx.fill();
        }
      } else if (tipo === 'monstera') {
        for (let i = 0; i < 9; i++) {
          const ang = -Math.PI * (0.12 + 0.76 * i / 8) + (r() - .5) * .2, len = 16 + r() * 12;
          const ex = sx + Math.cos(ang) * len, ey = sy - 4 + Math.sin(ang) * len;
          linha(ctx, [sx, sy - 2], [ex, ey], '#3d6b3e', 1.2);
          ctx.fillStyle = verdes[i % verdes.length];
          ctx.beginPath(); ctx.ellipse(ex, ey, 8, 4.6, ang, 0, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(ex - Math.cos(ang) * 6, ey - Math.sin(ang) * 6); ctx.lineTo(ex + Math.cos(ang) * 6, ey + Math.sin(ang) * 6); ctx.stroke();
        }
      } else {
        for (let i = 0; i < 20; i++) {
          const ang = r() * Math.PI * 2, rad = r() * 9;
          ctx.fillStyle = verdes[Math.floor(r() * verdes.length)];
          ctx.beginPath(); ctx.ellipse(sx + Math.cos(ang) * rad, sy - 9 + Math.sin(ang) * rad * 0.8, 4.5, 2.6, r() * 3, 0, 7); ctx.fill();
        }
      }
    }, [[x, y]]);
  }

  function mesaRedonda(cx, cy, r, alt, tampo, bloqueia) {
    custom(cx + cy, ctx => {
      elipseChao(ctx, cx, cy, 0, r * 0.45); ctx.fillStyle = C.marinho2; ctx.fill();
      cilindro(ctx, cx, cy, 1, 0.06, alt - 1, '#7b6a52', C.ouro);
      cilindro(ctx, cx, cy, alt, r, 3, tampo, tom(tampo, -0.2));
    }, bloqueia);
  }

  function balanca(cx, cy, z) {
    custom(cx + cy, ctx => {
      const [sx, sy] = P(cx, cy, z);
      ctx.fillStyle = C.ouro;
      ctx.beginPath(); ctx.ellipse(sx, sy, 5, 2.2, 0, 0, 7); ctx.fill();
      ctx.fillRect(sx - 0.8, sy - 16, 1.6, 16);
      ctx.fillRect(sx - 8, sy - 16, 16, 1.4);
      ctx.strokeStyle = C.ouro; ctx.lineWidth = 0.6;
      for (const dx of [-7.5, 7.5]) {
        ctx.beginPath(); ctx.moveTo(sx + dx, sy - 15); ctx.lineTo(sx + dx - 2.5, sy - 8); ctx.moveTo(sx + dx, sy - 15); ctx.lineTo(sx + dx + 2.5, sy - 8); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(sx + dx, sy - 8, 3, 1.1, 0, 0, Math.PI); ctx.fill();
      }
      ctx.fillStyle = C.ouroClaro; ctx.beginPath(); ctx.arc(sx, sy - 17, 1.4, 0, 7); ctx.fill();
    }, [], 0.5);
  }

  function vasoDourado(cx, cy, z) {
    custom(cx + cy, ctx => {
      cilindro(ctx, cx, cy, z, .08, 12, '#b88f45', C.ouro);
      const [sx, sy] = P(cx, cy, z + 12);
      ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 0.8;
      for (const [dx, dy] of [[-6, -14], [-1, -18], [5, -13]]) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + dx * .3, sy + dy * .6, sx + dx, sy + dy); ctx.stroke(); }
    }, [], 0.5);
  }

  function ringLight(cx, cy) {
    custom(cx + cy, ctx => {
      const [sx, sy] = P(cx, cy, 0);
      ctx.strokeStyle = '#2a2d35'; ctx.lineWidth = 1.2;
      for (const dx of [-7, 0, 7]) { ctx.beginPath(); ctx.moveTo(sx + dx, sy + (dx ? 0 : 3)); ctx.lineTo(sx, sy - 14); ctx.stroke(); }
      linha(ctx, [sx, sy - 14], [sx, sy - 60], '#2a2d35', 1.6);
      ctx.save(); faceS(ctx, cx, cy, 72);
      ctx.shadowColor = 'rgba(255,248,225,0.95)'; ctx.shadowBlur = 10;
      ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.stroke();
      ctx.restore();
    }, [[Math.floor(cx), Math.floor(cy)]]);
  }

  function cameraTripe(cx, cy) {
    custom(cx + cy, ctx => {
      const [sx, sy] = P(cx, cy, 0);
      ctx.strokeStyle = '#2a2d35'; ctx.lineWidth = 1.2;
      for (const [dx, dy] of [[-8, 0], [8, 0], [0, 4]]) { ctx.beginPath(); ctx.moveTo(sx + dx, sy + dy); ctx.lineTo(sx, sy - 40); ctx.stroke(); }
      caixa(ctx, { x: cx - .05, y: cy - .26, z: 46, w: .1, d: .14, h: 6, c: '#0d0f14' });
      caixa(ctx, { x: cx - .12, y: cy - .12, z: 42, w: .24, d: .2, h: 12, c: '#1a1d24', borda: '#3a3f4b' });
      const [rx, ry] = P(cx + .12, cy - .02, 48);
      ctx.fillStyle = '#d0605a'; ctx.beginPath(); ctx.arc(rx - 2, ry - 2, 1, 0, 7); ctx.fill();
    }, [[Math.floor(cx), Math.floor(cy)]]);
  }

  function softbox(cx, cy) {
    custom(cx + cy, ctx => {
      const [sx, sy] = P(cx, cy, 0);
      ctx.strokeStyle = '#2a2d35'; ctx.lineWidth = 1.2;
      for (const dx of [-7, 7]) { ctx.beginPath(); ctx.moveTo(sx + dx, sy); ctx.lineTo(sx, sy - 14); ctx.stroke(); }
      linha(ctx, [sx, sy - 14], [sx, sy - 54], '#2a2d35', 1.6);
      caixa(ctx, { x: cx - .3, y: cy - .08, z: 54, w: .6, d: .16, h: 28, c: '#20232b', l: '#fbf7ee', s: (c, w, h) => {
        c.fillStyle = '#fffaf0'; c.fillRect(1, 1, w - 2, h - 2);
        c.strokeStyle = 'rgba(0,0,0,0.12)'; c.strokeRect(3, 3, w - 6, h - 6);
      } });
    }, [[Math.floor(cx), Math.floor(cy)]]);
  }

  function gongo(cx, cy) {
    custom(cx + cy, ctx => {
      caixa(ctx, { x: cx - .3, y: cy - .03, z: 0, w: .05, d: .06, h: 52, c: C.nogueiraEsc });
      caixa(ctx, { x: cx + .25, y: cy - .03, z: 0, w: .05, d: .06, h: 52, c: C.nogueiraEsc });
      caixa(ctx, { x: cx - .3, y: cy - .03, z: 52, w: .6, d: .06, h: 3, c: C.nogueiraEsc });
      ctx.save(); faceS(ctx, cx, cy, 34);
      const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 10);
      g.addColorStop(0, C.ouroClaro); g.addColorStop(1, '#a8823d');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
      ctx.strokeStyle = '#8a6a30'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.stroke();
      ctx.restore();
    }, [[Math.floor(cx), Math.floor(cy)]]);
  }

  function cabideiro(cx, cy) {
    custom(cx + cy, ctx => {
      const [sx, sy] = P(cx, cy, 0);
      ctx.fillStyle = C.marinho2; ctx.beginPath(); ctx.ellipse(sx, sy, 6, 2.6, 0, 0, 7); ctx.fill();
      linha(ctx, [sx, sy], [sx, sy - 72], C.nogueiraEsc, 2);
      ctx.fillStyle = '#2b3a6a'; rrect(ctx, sx - 9, sy - 66, 9, 30, 3); ctx.fill();
      ctx.fillStyle = '#a77d55'; rrect(ctx, sx + 1, sy - 64, 8, 26, 3); ctx.fill();
      ctx.fillStyle = C.ouro; ctx.fillRect(sx - 6, sy - 72, 12, 1.4);
    }, [[Math.floor(cx), Math.floor(cy)]]);
  }

  function puff(cx, cy, cor) {
    custom(cx + cy, ctx => {
      const [sx, sy] = P(cx, cy, 0);
      ctx.fillStyle = tom(cor, -0.2); ctx.beginPath(); ctx.ellipse(sx, sy - 4, 15, 8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = cor; ctx.beginPath(); ctx.ellipse(sx - 1, sy - 9, 13, 7.5, -0.15, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(sx - 4, sy - 11, 5, 2.5, -0.3, 0, 7); ctx.fill();
    }, [[Math.floor(cx), Math.floor(cy)]]);
  }

  function bebedouro(x, y) {
    const cx = x + .5, cy = y + .5;
    custom(cx + cy, ctx => {
      caixa(ctx, { x: cx - .18, y: cy - .18, z: 0, w: .36, d: .36, h: 30, c: '#f1f2f4', borda: '#c9cdd4' });
      cilindro(ctx, cx, cy, 30, .14, 16, 'rgba(160,200,235,0.85)', 'rgba(120,170,220,0.75)');
    }, [[x, y]]);
  }

  function luminariaArco(cx, cy, alvoX, alvoY) {
    custom(cx + cy, ctx => {
      const [sx, sy] = P(cx, cy, 0), [tx, ty] = P(alvoX, alvoY, 62);
      ctx.fillStyle = C.marinho2; ctx.beginPath(); ctx.ellipse(sx, sy, 7, 3, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = C.ouro; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 60);
      ctx.quadraticCurveTo(sx + (tx - sx) * 0.3, ty - 40, tx, ty); ctx.stroke();
      ctx.fillStyle = C.ouroClaro; ctx.beginPath(); ctx.arc(tx, ty + 2, 6, Math.PI, 0); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,200,0.25)'; ctx.beginPath(); ctx.ellipse(tx, ty + 4, 10, 3, 0, 0, 7); ctx.fill();
    }, [[Math.floor(cx), Math.floor(cy)]]);
  }

  function fruteira(cx, cy, z) {
    custom(cx + cy, ctx => {
      const [sx, sy] = P(cx, cy, z);
      ctx.fillStyle = C.ouro; ctx.beginPath(); ctx.ellipse(sx, sy - 1, 7, 3, 0, 0, Math.PI); ctx.fill();
      for (const [dx, dy, c] of [[-3, -3, '#d0605a'], [1, -4, '#f0b33c'], [4, -2, '#7aa54a'], [-1, -1, '#e2833a']]) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx + dx, sy + dy, 2.2, 0, 7); ctx.fill();
      }
    }, [], 0.5);
  }

  /* ===========================================================
     MONTAGEM DAS SALAS
     =========================================================== */
  const vis = (sala, x, y, f) => (PONTOS.visitas[sala] = PONTOS.visitas[sala] || []).push({ x, y, f });

  /* ---------- RECEPÇÃO ---------- */
  MAPA.tapete(0.15, 5.4, 2.6, 4.2, '#ddd2bf', C.ouro);
  add([
    { x: 2, y: 4, z: 0, w: 5, d: .9, h: 34, c: C.marfim, l: C.marinho2, s: comMonograma(C.marinho2, 22, 7) },
    { x: 2, y: 4.62, z: 34, w: 5, d: .28, h: 7, c: C.marfim, l: '#e2ddd3', borda: C.ouro },
    ...monitorCaixas(4.5, 4.35, 'N', 34),
    { x: 5.4, y: 4.15, z: 34, w: .5, d: .35, h: 1, c: '#fbfaf7' }
  ]);
  assento('rec-1', 4, 3, 'S', 'escritorio', 'recepcao');
  add(sofaCaixas(0, 6, 1, 3, 'E', '#e3d9c8'));
  for (let i = 0; i < 3; i++) assento('esp-' + (i + 1), 0, 6 + i, 'E', 'sofa', 'recepcao', { cx: .62, alt: 13 });
  mesaRedonda(1.75, 7.5, .3, 12, C.marfim, []);
  planta(0, 0, 'alta'); planta(8, 0, 'alta'); planta(8, 8, 'monstera');
  PONTOS.balcao = { x: 4, y: 5, f: 'N' };
  vis('recepcao', 5, 6, 'N');

  /* ---------- DIRETORIA ---------- */
  MAPA.tapete(11.3, 1.4, 4.6, 5.2, '#14204f', C.ouro);
  MAPA.tapete(17.4, 0.9, 3.5, 4.8, '#e9e1d2', C.ouro);
  add([{ x: 10, y: 0, z: 0, w: 2, d: .55, h: 112, c: C.nogueira, s: livros(10) }]);
  add([{ x: 19, y: 0, z: 0, w: 2, d: .55, h: 112, c: C.nogueira, s: livros(19) }]);
  add([
    { x: 12.2, y: 0, z: 0, w: 5.6, d: .55, h: 30, c: C.nogueira, l: C.nogueiraEsc, s: portas(4) },
    { x: 13, y: .1, z: 30, w: .5, d: .3, h: 5, c: '#6b1f24' },
    { x: 13.03, y: .12, z: 35, w: .44, d: .26, h: 4, c: C.marinho },
    { x: 16.6, y: .2, z: 30, w: .45, d: .06, h: 16, c: C.ouro, s: (c, w, h) => { c.fillStyle = '#f3f0ea'; c.fillRect(2, 2, w - 4, h - 4); c.fillStyle = C.marinho; c.fillRect(4, 5, w - 8, 1); c.fillRect(4, 8, w - 10, 1); } }
  ]);
  vasoDourado(15, .28, 30);
  add([
    { x: 12.05, y: 3.1, z: 0, w: .6, d: .8, h: 28, c: C.marinho2, s: gavetas(3) },
    { x: 14.35, y: 3.1, z: 0, w: .6, d: .8, h: 28, c: C.marinho2, s: gavetas(3) },
    { x: 12.65, y: 3.75, z: 8, w: 1.7, d: .08, h: 20, c: C.marinho2 },
    { x: 11.95, y: 3, z: 28, w: 3.1, d: 1.05, h: 4, c: C.nogueira, borda: C.ouro },
    ...monitorCaixas(13.5, 3.3, 'N', 32),
    { x: 12.3, y: 3.2, z: 32, w: .16, d: .16, h: 1.5, c: C.ouro },
    { x: 12.36, y: 3.26, z: 33.5, w: .04, d: .04, h: 12, c: C.ouro },
    { x: 12.25, y: 3.15, z: 45.5, w: .26, d: .26, h: 5, c: C.ouroClaro },
    { x: 13.2, y: 3.85, z: 32, w: .6, d: .1, h: 3.5, c: C.marinho2, s: placa },
    { x: 14.05, y: 3.35, z: 32, w: .38, d: .3, h: .8, c: '#fbfaf7' }
  ]);
  balanca(14.65, 3.45, 32);
  assento('dir-juliana', 13, 2, 'S', 'executiva', 'diretoria');
  assento('dir-c1', 12, 5, 'N', 'visita', 'diretoria');
  assento('dir-c2', 14, 5, 'N', 'visita', 'diretoria');
  add(sofaCaixas(18, 1.05, 2.9, .95, 'S', '#22307a'));
  assento('dir-s1', 18, 1, 'S', 'sofa', 'diretoria', { cy: 1.65, alt: 13 });
  assento('dir-s2', 19, 1, 'S', 'sofa', 'diretoria', { cx: 19.45, cy: 1.65, alt: 13 });
  mesaRedonda(19.45, 3.05, .45, 12, '#f1ede6', [[19, 2], [19, 3]]);
  assento('dir-p1', 19, 4, 'N', 'poltrona', 'diretoria', { cor: C.creme });
  luminariaArco(17.3, 1.4, 18.6, 2.8);
  planta(10, 9, 'monstera'); planta(20, 8, 'alta');
  vis('diretoria', 13, 6, 'N');

  /* ---------- SALA DE REUNIÃO ---------- */
  add([
    { x: 24.7, y: 4.6, z: 0, w: .6, d: .8, h: 28, c: C.marinho2 },
    { x: 28.7, y: 4.6, z: 0, w: .6, d: .8, h: 28, c: C.marinho2 },
    { x: 24, y: 4, z: 28, w: 6, d: 2, h: 4, c: C.nogueira, borda: C.ouro },
    { x: 24.5, y: 4.3, z: 32, w: .42, d: .3, h: 1, c: '#c3c8d0' },
    { x: 27.1, y: 5.4, z: 32, w: .42, d: .3, h: 1, c: '#c3c8d0' },
    { x: 28.9, y: 4.25, z: 32, w: .35, d: .45, h: .8, c: '#fbfaf7' },
    { x: 26.75, y: 4.75, z: 32, w: .5, d: .5, h: 2, c: C.ouro, borda: C.ouroClaro }
  ], [24, 4, 6, 2]);
  for (let i = 0; i < 6; i++) {
    assento('reu-n' + i, 24 + i, 3, 'S', 'reuniao', 'reuniao');
    assento('reu-s' + i, 24 + i, 6, 'N', 'reuniao', 'reuniao');
  }
  planta(22, 0, 'alta'); planta(31, 0, 'alta'); planta(22, 9, 'baixa'); planta(31, 9, 'baixa');
  vis('reuniao', 27, 8, 'N');

  /* ---------- MARKETING ---------- */
  MAPA.tapete(39.65, .31, 3.9, 2.7, '#0f1a4a');
  add([
    { x: 39.5, y: .15, z: 0, w: .08, d: .08, h: 118, c: '#2a2d35' },
    { x: 43.6, y: .15, z: 0, w: .08, d: .08, h: 118, c: '#2a2d35' },
    { x: 39.5, y: .15, z: 118, w: 4.18, d: .08, h: 4, c: '#2a2d35' },
    { x: 39.65, y: .25, z: 0, w: 3.9, d: .06, h: 116, c: '#0f1a4a', s: comMonograma('#0f1a4a', 46, 22) }
  ]);
  assento('mkt-set', 41, 1, 'S', 'poltrona', 'marketing', { cor: C.creme, cy: 1.75 });
  ringLight(40.4, 3.5); cameraTripe(41.6, 4.4); softbox(43.3, 3.4);
  add([
    ...mesaCaixas(33, 3, 4.6, 1, { tampo: '#f3f0ea', pe: C.marinho2 }),
    ...monitorCaixas(34.5, 3.4, 'S', 31, 'design'), teclado(34.3, 3.75),
    ...monitorCaixas(36.5, 3.4, 'S', 31, 'design'), teclado(36.3, 3.75),
    { x: 35.4, y: 3.2, z: 31, w: .3, d: .2, h: 4, c: '#1a1d24' },
    { x: 37.1, y: 3.25, z: 31, w: .3, d: .4, h: .8, c: '#c3c8d0' }
  ]);
  assento('mkt-1', 34, 4, 'N', 'escritorio', 'marketing', { cor: '#2b3a6a' });
  assento('mkt-2', 36, 4, 'N', 'escritorio', 'marketing', { cor: '#2b3a6a' });
  add([
    ...mesaCaixas(33, 6, 4.6, 1, { tampo: '#f3f0ea', pe: C.marinho2 }),
    ...monitorCaixas(34.5, 6.4, 'S', 31, 'design'), teclado(34.3, 6.75),
    ...monitorCaixas(36.5, 6.4, 'S', 31, 'design'), teclado(36.3, 6.75)
  ]);
  assento('mkt-3', 34, 7, 'N', 'escritorio', 'marketing', { cor: '#2b3a6a' });
  assento('mkt-4', 36, 7, 'N', 'escritorio', 'marketing', { cor: '#2b3a6a' });
  puff(38.6, 7.8, '#c9a45c'); puff(39.6, 8.4, '#1c2756');
  planta(33, 9, 'monstera'); planta(43, 8, 'alta');
  vis('marketing', 38, 5, 'W');

  /* ---------- CORREDOR ---------- */
  add([{ x: 42.15, y: 11.6, z: 0, w: .7, d: .8, h: 92, c: C.marinho2, s: comMonograma(C.marinho2, 30, 14), e: comMonograma(C.marinho2, 30, 14), borda: C.ouro }]);
  planta(14, 11, 'baixa'); planta(29, 11, 'baixa');
  PONTOS.elevador = { x: 0, y: 12, f: 'E' };

  /* ---------- OPERACIONAL ---------- */
  quadro(0.6, 4.4, 15.12, 22, 66, kanban);
  for (let i = 0; i < 5; i++)
    add([{ x: 10 + i + .05, y: 15.05, z: 0, w: .9, d: .7, h: 56, c: C.marinho, s: gavetas(4, true), borda: C.ouro }]);
  add([{ x: 15.08, y: 15.1, z: 0, w: .84, d: .7, h: 26, c: '#e9eaee', borda: '#c9cdd4' },
       { x: 15.15, y: 15.15, z: 26, w: .7, d: .5, h: 8, c: '#d5d8de' },
       { x: 15.3, y: 15.2, z: 34, w: .4, d: .3, h: 1, c: '#fbfaf7' }]);
  bancada(2, 19, 8, [3, 5, 7], [3, 5, 7], 'doc');
  bancada(2, 24, 8, [3, 5, 7], [3, 5, 7], 'prazos');
  for (const x of [3, 5, 7]) {
    assento(`op-a-n${x}`, x, 18, 'S', 'escritorio', 'operacional');
    assento(`op-a-s${x}`, x, 21, 'N', 'escritorio', 'operacional');
    assento(`op-b-n${x}`, x, 23, 'S', 'escritorio', 'operacional');
    assento(`op-b-s${x}`, x, 26, 'N', 'escritorio', 'operacional');
  }
  add([
    ...mesaCaixas(12, 22, 3, 1, { tampo: C.carvalho }),
    ...monitorCaixas(13, 22.4, 'N'), ...monitorCaixas(14, 22.4, 'N'),
    teclado(13.3, 22.1), { x: 12.2, y: 22.5, z: 31, w: .4, d: .3, h: 3, c: C.ouro }
  ]);
  assento('op-ctrl', 13, 21, 'S', 'escritorio', 'operacional');
  bebedouro(15, 19);
  planta(0, 27, 'alta'); planta(15, 27, 'alta'); planta(11, 15, 'baixa');
  vis('operacional', 6, 22, 'N'); vis('operacional', 11, 19, 'W'); vis('operacional', 11, 23, 'E');

  /* ---------- COMERCIAL ---------- */
  quadro(23.1, 26.9, 15.15, 30, 48, metas, C.ouro);
  gongo(27.5, 16.5);
  bancada(18, 19, 5, [19, 21], [19, 21], 'crm');
  for (const x of [19, 21]) {
    assento(`com-n${x}`, x, 18, 'S', 'escritorio', 'comercial');
    assento(`com-s${x}`, x, 21, 'N', 'escritorio', 'comercial');
  }
  MAPA.tapete(22.7, 20.7, 3.6, 3.6, '#14204f', C.ouro, 40);
  mesaRedonda(24.5, 22.5, .45, 28, '#f3f0ea', [[24, 22]]);
  assento('com-at1', 24, 21, 'S', 'visita', 'comercial');
  assento('com-at2', 24, 23, 'N', 'visita', 'comercial');
  assento('com-at3', 23, 22, 'E', 'visita', 'comercial');
  assento('com-at4', 25, 22, 'W', 'visita', 'comercial');
  planta(17, 27, 'alta'); planta(27, 27, 'alta'); planta(17, 15, 'baixa');
  vis('comercial', 20, 17, 'S'); vis('comercial', 22, 24, 'N');

  /* ---------- DILIGÊNCIAS ---------- */
  quadro(33.1, 36.9, 15.15, 24, 60, mapaRotas);
  add([{ x: 29.05, y: 16.6, z: 0, w: .65, d: 4.8, h: 84, c: '#26304e', e: armarios(6), borda: C.ouro }]);
  add([{ x: 29.05, y: 23.2, z: 0, w: .6, d: 3.4, h: 64, c: C.nogueira, e: malotes }]);
  cabideiro(30.5, 15.5);
  add([
    ...mesaCaixas(31, 21, 4, 2, { tampo: '#ece9e3' }),
    { x: 31.3, y: 21.3, z: 31, w: .5, d: .35, h: 6, c: '#4a2f20', borda: C.ouro },
    { x: 33.8, y: 21.2, z: 31, w: .42, d: .52, h: 3, c: C.ouro },
    { x: 33.82, y: 21.22, z: 34, w: .4, d: .5, h: 3, c: C.marinho },
    { x: 33.84, y: 21.24, z: 37, w: .38, d: .48, h: 2, c: '#e9e2d3' },
    { x: 32.2, y: 21.25, z: 31, w: .45, d: .3, h: 1, c: '#c3c8d0' },
    { x: 32.4, y: 22.3, z: 31, w: .45, d: .3, h: 1, c: '#c3c8d0' }
  ]);
  assento('dil-1', 32, 20, 'S', 'escritorio', 'diligencias');
  assento('dil-2', 32, 23, 'N', 'escritorio', 'diligencias');
  assento('dil-3', 34, 23, 'N', 'escritorio', 'diligencias');
  add([{ x: 36.08, y: 22.1, z: 0, w: .84, d: .8, h: 30, c: '#e9eaee', borda: '#c9cdd4' },
       { x: 36.15, y: 22.15, z: 30, w: .7, d: .6, h: 6, c: '#cfd3da' },
       { x: 36.25, y: 22.25, z: 36, w: .45, d: .3, h: 1, c: '#fbfaf7' }]);
  planta(36, 27, 'alta'); planta(36, 16, 'baixa');
  vis('diligencias', 33, 18, 'N');

  /* ---------- COPA ---------- */
  add([
    { x: 40, y: 15.05, z: 0, w: 3, d: .75, h: 30, c: C.marinho2, s: portas(4) },
    { x: 40, y: 15.05, z: 30, w: 3, d: .75, h: 3, c: '#f4f1eb', borda: C.ouro },
    { x: 40.3, y: 15.15, z: 33, w: .42, d: .4, h: 14, c: '#1a1d24', s: maquinaCafe },
    { x: 41.4, y: 15.25, z: 33, w: .5, d: .3, h: 1, c: '#c3c8d0' }
  ]);
  add([{ x: 43.05, y: 15.05, z: 0, w: .9, d: .8, h: 98, c: '#d7dbe1', s: geladeira, borda: '#eef0f3' }]);
  add([
    { x: 40, y: 19.1, z: 0, w: 3, d: .8, h: 30, c: C.marinho2 },
    { x: 39.95, y: 19.05, z: 30, w: 3.1, d: .9, h: 3, c: '#f4f1eb', borda: C.ouro }
  ]);
  fruteira(41.5, 19.5, 33);
  for (let i = 0; i < 3; i++) assento('copa-b' + (i + 1), 40 + i, 20, 'N', 'banqueta', 'copa');
  mesaRedonda(39.5, 23.5, .36, 28, '#f3f0ea', [[39, 23]]);
  mesaRedonda(42.5, 25.5, .36, 28, '#f3f0ea', [[42, 25]]);
  assento('copa-m1', 38, 23, 'E', 'reuniao', 'copa');
  assento('copa-m2', 40, 23, 'W', 'reuniao', 'copa');
  assento('copa-m3', 41, 25, 'E', 'reuniao', 'copa');
  assento('copa-m4', 43, 25, 'W', 'reuniao', 'copa');
  bebedouro(38, 18);
  planta(43, 27, 'alta'); planta(38, 27, 'baixa');
  vis('copa', 39, 21, 'E');

  ITENS.push(...MAPA.itensVidro());

  return { ITENS, ASSENTOS, PONTOS, C };
})();
