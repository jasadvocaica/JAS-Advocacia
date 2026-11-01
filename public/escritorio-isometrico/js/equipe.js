/* ===========================================================
   equipe.js — a equipe vem dos agentes cadastrados no sistema JAS.
   A página do app (EscritorioIsometrico.tsx) passa os agentes no endereço
   (#d=...). Roda depois de moveis.js (precisa das cadeiras) e antes de
   pessoas.js (que cria os bonecos a partir de window.EQUIPE_DINAMICA).
   =========================================================== */
(() => {
  let dados = null;
  try {
    const m = location.hash.match(/[#&]d=([^&]+)/);
    if (m) dados = JSON.parse(decodeURIComponent(m[1]));
  } catch { dados = null; }
  if (!dados || !Array.isArray(dados.agentes)) return;   // sem dados: fica a equipe de exemplo

  const A = MOVEIS.ASSENTOS;
  // cadeiras que não são de trabalho: Dra. Juliana, visitas, estúdio, recepção e copa
  const FORA = new Set(['dir-juliana', 'mkt-set', 'rec-1']);
  const PRIORIDADE = { escritorio: 0, executiva: 1, poltrona: 2, reuniao: 3, sofa: 4 };
  const livres = sala => Object.values(A)
    .filter(s => s.sala === sala && !FORA.has(s.id) && s.estilo !== 'visita' && !usadas.has(s.id))
    .sort((a, b) => (PRIORIDADE[a.estilo] ?? 9) - (PRIORIDADE[b.estilo] ?? 9) || a.id.localeCompare(b.id));
  const usadas = new Set();

  // aparência estável por agente (o mesmo id sempre gera o mesmo boneco)
  const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const de = (lista, h, k) => lista[(h >>> (k * 3)) % lista.length];
  const PELES = ['#f2cfb0', '#e8bf9d', '#d9ad86', '#c99a72', '#a8714b', '#8d5a3b', '#6b4228'];
  const CABELOS = ['#120c08', '#1e1410', '#3a2216', '#5a3a22', '#8a3f1e', '#b9874d'];
  const ESTILOS = ['curto', 'longo', 'coque', 'rabo', 'cacheado', 'careca'];
  const ROUPAS = ['#0b1236', '#1c2756', '#2b3a6a', '#3a4256', '#6b1f24', '#1f3b2c', '#a77d55', '#c9a45c', '#f3f0ea', '#6f8fbd'];
  const look = id => {
    const h = hash(id);
    const estilo = de(ESTILOS, h, 2);
    return {
      pele: de(PELES, h, 0), cabelo: de(CABELOS, h, 1), estilo, roupa: de(ROUPAS, h, 3),
      camisa: '#ffffff', baixo: de(['#0b1236', '#20232b', '#3a4256', '#2b2f3a'], h, 4),
      oculos: h % 5 === 0, saia: (estilo === 'coque' || estilo === 'longo') && h % 3 === 0, headset: false
    };
  };
  const SALAS_MAPA = new Set(['diretoria', 'operacional', 'comercial', 'reuniao', 'diligencias', 'marketing']);

  const equipe = [{
    id: 'juliana', nome: 'Dra. Juliana Araújo', cargo: 'Advogada · Sócia-fundadora', sala: 'diretoria',
    assento: 'dir-juliana', dona: true, atividade: 'Na diretoria',
    look: { pele: '#e8bf9d', cabelo: '#3a2216', estilo: 'longo', roupa: '#0b1236', camisa: '#f4efe6', baixo: '#0b1236', broche: true }
  }];
  const semMesa = [];
  for (const ag of dados.agentes) {
    const sala = SALAS_MAPA.has(ag.sala) ? ag.sala : 'operacional';
    const s = livres(sala)[0] || livres('operacional')[0] || livres('comercial')[0] || livres('marketing')[0];
    if (!s) { semMesa.push(ag.nome); continue; }
    usadas.add(s.id);
    equipe.push({
      id: ag.id, nome: ag.nome, cargo: ag.cargo || 'Agente de IA', sala: s.sala, assento: s.id,
      atividade: ag.ativo ? 'Disponível' : 'Pausado', rua: s.sala === 'diligencias',
      agente: true, look: look(ag.id)
    });
  }
  window.EQUIPE_DINAMICA = equipe;
  window.EQUIPE_SEM_MESA = semMesa;   // a ponte avisa se faltar cadeira
})();
