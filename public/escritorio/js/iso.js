/* ===========================================================
   iso.js — projeção isométrica e primitivas de desenho
   Tile 64 x 32. Mundo: x (desce para a direita), y (desce para
   a esquerda), z em px para cima.
   =========================================================== */
const IMG = { logo: new Image() };
IMG.logo.src = 'assets/logo.webp';

const ISO = (() => {
  const HW = 32, HH = 16;               // meia largura / meia altura do tile
  const U = 64;                         // unidades por tile no espaço do chão
  const VPX = Math.hypot(HW, HH);       // px visuais de um tile ao longo de uma face

  const P = (x, y, z = 0) => [(x - y) * HW, (x + y) * HH - z];

  /** tela (coordenadas do mundo) -> chão */
  function noChao(sx, sy) {
    const a = sx / HW, b = sy / HH;
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }

  /* ---------- cores ---------- */
  function rgb(c) {
    if (c[0] === '#') {
      let h = c.slice(1);
      if (h.length === 3) h = [...h].map(k => k + k).join('');
      const n = parseInt(h, 16);
      return [n >> 16, (n >> 8) & 255, n & 255];
    }
    const m = c.match(/[\d.]+/g);
    return [+m[0], +m[1], +m[2]];
  }
  /** k < 0 escurece, k > 0 clareia */
  function tom(c, k) {
    const f = v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
    const [r, g, b] = rgb(c);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  function rgba(c, a) { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; }
  function mistura(c1, c2, t) {
    const a = rgb(c1), b = rgb(c2);
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
  }

  /** aleatório com semente: o mesmo desenho sempre */
  function rng(seed) {
    let s = (Math.abs(Math.floor(seed * 7919)) % 2147483646) + 1;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  /* ---------- polígonos ---------- */
  function caminho(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function poly(ctx, pts, fill, stroke, lw = 1) {
    caminho(ctx, pts);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function linha(ctx, a, b, cor, lw = 1) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = cor; ctx.lineWidth = lw; ctx.stroke();
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* ---------- espaços de superfície ----------
     chão: 64 unidades por tile em u (x) e v (y)
     faces: u em px visuais ao longo da face, v em px para baixo  */
  function espacoChao(ctx, x, y, z = 0) {
    const [sx, sy] = P(x, y, z);
    ctx.transform(HW / U, HH / U, -HW / U, HH / U, sx, sy);
  }
  /** face voltada para o sul (plano y fixo), u ao longo de +x, a partir do canto superior esquerdo */
  function faceS(ctx, x, yPlano, zTopo) {
    const [sx, sy] = P(x, yPlano, zTopo);
    ctx.transform(HW / VPX, HH / VPX, 0, 1, sx, sy);
  }
  /** face voltada para o leste (plano x fixo), u ao longo de -y, a partir da ponta y = yFim */
  function faceE(ctx, xPlano, yFim, zTopo) {
    const [sx, sy] = P(xPlano, yFim, zTopo);
    ctx.transform(HW / VPX, -HH / VPX, 0, 1, sx, sy);
  }

  function deco(ctx, clip, tf, fn, w, h) {
    ctx.save();
    caminho(ctx, clip); ctx.clip();
    tf(); fn(ctx, w, h);
    ctx.restore();
  }

  /* ---------- caixa ----------
     B = { x, y, z, w, d, h, c (topo), l (face sul), r (face leste),
           s / e / t: fn(ctx, larg, alt) decoração das faces,
           borda: cor do contorno do topo }
     (cx, cy, cw, cd) = recorte da caixa dentro de uma célula      */
  function caixa(ctx, B, cx = B.x, cy = B.y, cw = B.w, cd = B.d) {
    const z0 = B.z, z1 = B.z + B.h;
    const topo = B.c, sul = B.l || tom(B.c, -0.12), leste = B.r || tom(B.c, -0.26);
    const fimS = Math.abs(cy + cd - (B.y + B.d)) < 1e-6;
    const fimE = Math.abs(cx + cw - (B.x + B.w)) < 1e-6;
    if (B.h > 0 && fimS) {
      const f = [P(cx, cy + cd, z0), P(cx + cw, cy + cd, z0), P(cx + cw, cy + cd, z1), P(cx, cy + cd, z1)];
      poly(ctx, f, sul);
      if (B.s) deco(ctx, f, () => faceS(ctx, B.x, B.y + B.d, z1), B.s, B.w * VPX, B.h);
    }
    if (B.h > 0 && fimE) {
      const f = [P(cx + cw, cy, z0), P(cx + cw, cy + cd, z0), P(cx + cw, cy + cd, z1), P(cx + cw, cy, z1)];
      poly(ctx, f, leste);
      if (B.e) deco(ctx, f, () => faceE(ctx, B.x + B.w, B.y + B.d, z1), B.e, B.d * VPX, B.h);
    }
    const t = [P(cx, cy, z1), P(cx + cw, cy, z1), P(cx + cw, cy + cd, z1), P(cx, cy + cd, z1)];
    poly(ctx, t, topo);
    if (B.t) deco(ctx, t, () => espacoChao(ctx, B.x, B.y, z1), B.t, B.w * U, B.d * U);
    if (B.borda) {
      ctx.strokeStyle = B.borda; ctx.lineWidth = 1;
      ctx.beginPath();
      if (Math.abs(cy - B.y) < 1e-6) { ctx.moveTo(...t[0]); ctx.lineTo(...t[1]); }
      if (fimE) { ctx.moveTo(...t[1]); ctx.lineTo(...t[2]); }
      if (fimS) { ctx.moveTo(...t[2]); ctx.lineTo(...t[3]); }
      if (Math.abs(cx - B.x) < 1e-6) { ctx.moveTo(...t[3]); ctx.lineTo(...t[0]); }
      ctx.stroke();
    }
  }

  /** a deve ser desenhada antes de b? (caixas sem interseção) */
  function antes(a, b) {
    const ox = a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6;
    const oy = a.y < b.y + b.d - 1e-6 && b.y < a.y + a.d - 1e-6;
    if (!ox && a.x + a.w <= b.x + 1e-6) return true;
    if (!oy && a.y + a.d <= b.y + 1e-6) return true;
    if (ox && oy && a.z + a.h <= b.z + 1e-6) return true;
    return false;
  }
  function ordenar(partes) {
    const out = [], resto = partes.slice();
    while (resto.length) {
      let i = resto.findIndex(p => !resto.some(q => q !== p && antes(q, p)));
      if (i < 0) i = 0;
      out.push(resto.splice(i, 1)[0]);
    }
    return out;
  }

  /**
   * Móvel feito de caixas. É fatiado em células de 1x1 para que os
   * bonecos passem atrás/na frente de móveis grandes do jeito certo.
   * Devolve itens { key, pri, draw } e a lista de células ocupadas.
   */
  function solido(caixas) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of caixas) {
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.d);
    }
    const itens = [], celulas = [];
    for (let cx = Math.floor(x0); cx < Math.ceil(x1 - 1e-6); cx++) {
      for (let cy = Math.floor(y0); cy < Math.ceil(y1 - 1e-6); cy++) {
        const partes = [];
        let area = 0;
        for (const B of caixas) {
          const ax = Math.max(B.x, cx), bx = Math.min(B.x + B.w, cx + 1);
          const ay = Math.max(B.y, cy), by = Math.min(B.y + B.d, cy + 1);
          if (bx - ax > 1e-6 && by - ay > 1e-6) {
            partes.push({ B, x: ax, y: ay, w: bx - ax, d: by - ay, z: B.z, h: B.h });
            if (B.z < 40 && !B.livre) area += (bx - ax) * (by - ay);
          }
        }
        if (!partes.length) continue;
        const ord = ordenar(partes);
        itens.push({ key: cx + cy + 1, pri: 0, draw: ctx => { for (const p of ord) caixa(ctx, p.B, p.x, p.y, p.w, p.d); } });
        if (area > 0.22) celulas.push([cx, cy]);
      }
    }
    return { itens, celulas };
  }

  /** elipse de um círculo deitado no chão (raio em tiles) */
  function elipseChao(ctx, cx, cy, z, r) {
    const [sx, sy] = P(cx, cy, z);
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * HW * Math.SQRT2, r * HH * Math.SQRT2, 0, 0, Math.PI * 2);
  }
  /** cilindro em pé */
  function cilindro(ctx, cx, cy, z, r, h, topo, lado) {
    const [sx, sy] = P(cx, cy, z);
    const rx = r * HW * Math.SQRT2, ry = r * HH * Math.SQRT2;
    ctx.fillStyle = lado;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(sx - rx, sy - h);
    ctx.ellipse(sx, sy - h, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = topo;
    ctx.beginPath(); ctx.ellipse(sx, sy - h, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }

  /** desenha o monograma (recorte da logo) num retângulo */
  function monograma(ctx, x, y, h) {
    const img = IMG.logo;
    if (!img.complete || !img.naturalWidth) return;
    ctx.drawImage(img, 850, 595, 360, 475, x, y, h * 360 / 475, h);
  }

  return {
    HW, HH, U, VPX, P, noChao, rgb, tom, rgba, mistura, rng, monograma,
    caminho, poly, linha, rrect, espacoChao, faceS, faceE,
    caixa, solido, elipseChao, cilindro
  };
})();
