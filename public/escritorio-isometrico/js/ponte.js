/* ===========================================================
   ponte.js — liga o escritório isométrico ao sistema JAS.
   Recebe da página do app (mesma origem, via postMessage) os agentes e as
   execuções reais e devolve os pedidos de executar, revisar e personalizar,
   que o app atende com as mesmas funções do escritório 3D. Não chama o
   banco nem a IA diretamente.
   =========================================================== */
const VIVO = (() => {
  const E = window.ESCRITORIO;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PAI = window.parent !== window ? window.parent : null;
  const enviar = msg => { if (PAI) PAI.postMessage({ origem: 'escritorio-isometrico', ...msg }, location.origin); };

  const STATUS = {
    pendente: 'Na fila', executando: 'Trabalhando', aguardando_aprovacao: 'Para revisar',
    concluida: 'Concluída', rejeitada: 'Rejeitada', erro: 'Erro', cancelada: 'Cancelada'
  };
  const DEZ_MIN = 10 * 60000;   // como no escritório 3D: sem confirmação há 10 min, não conta como trabalhando
  let st = { agentes: [], execucoes: [], mensagens: [], atualizadoEm: null, ocupado: false };
  let recebido = false, primeira = true;
  const pessoa = id => SIM.equipe.find(p => p.id === id);
  const agente = id => st.agentes.find(a => a.id === id);

  /* ---------- o que cada boneco está fazendo ---------- */
  function recalcular() {
    const extra = {};
    const somar = (id, campo, valor) => {
      const v = extra[id] || (extra[id] = { trabalhando: null, fila: 0, revisao: 0, erro: null });
      if (campo === 'trabalhando') { if (!v.trabalhando) v.trabalhando = valor; } else v[campo] += 1;
    };
    const agora = Date.now();
    for (const x of st.execucoes) {
      if (x.status === 'executando' && agora - Date.parse(x.iniciado_em) < DEZ_MIN)
        somar(x.agente_id, 'trabalhando', { id: x.id, titulo: x.resumo || (agente(x.agente_id) || {}).nome || 'Execução' });
      else if (x.status === 'pendente') somar(x.agente_id, 'fila');
      else if (x.status === 'aguardando_aprovacao') somar(x.agente_id, 'revisao');
    }
    // Erro recente (30 min) que não foi seguido de outra execução do mesmo agente.
    const ultimaPorAgente = new Map();
    for (const x of st.execucoes) {
      const u = ultimaPorAgente.get(x.agente_id);
      if (!u || Date.parse(x.iniciado_em) > Date.parse(u.iniciado_em)) ultimaPorAgente.set(x.agente_id, x);
    }
    for (const [id, x] of ultimaPorAgente) {
      if (x.status === 'erro' && agora - Date.parse(x.finalizado_em || x.iniciado_em) < 30 * 60000) {
        const v = extra[id] || (extra[id] = { trabalhando: null, fila: 0, revisao: 0, erro: null });
        v.erro = x.erro || 'Falha na execução';
      }
    }
    for (const c of (window.CENTRAL ? CENTRAL.simulados() : [])) {
      if (c.etapa === 'trabalhando') somar(c.agente, 'trabalhando', { id: 'sim' + c.id, titulo: c.titulo });
      else if (c.etapa === 'fila') somar(c.agente, 'fila');
      else if (c.etapa === 'aprovacao') somar(c.agente, 'revisao');
    }
    for (const p of SIM.equipe) {
      if (p.dona) continue;
      const x = extra[p.id] || { trabalhando: null, fila: 0, revisao: 0, erro: null };
      const eraT = p.vivo && p.vivo.trabalhando;
      p.vivo = { trabalhando: x.trabalhando, fila: x.fila, revisao: x.revisao, erro: x.erro, conversando: false };
      const novoTrab = x.trabalhando && (!eraT || eraT.id !== x.trabalhando.id);
      if (novoTrab && !p.fora && p.seat !== p.casa) p.limpar();   // volta para a mesa
      if (novoTrab && !p.fala && !primeira) p.dizer('Deixa comigo!');
      if (eraT && !x.trabalhando && !p.fala && !p.fora) p.dizer('Pronto! ✓');
      const ag = agente(p.id);
      if (ag) { p.nome = ag.nome; p.atividade = ag.ativo ? 'Disponível' : 'Pausado'; }
    }
  }

  function entregarNaMesa(x) {
    const anterior = st.execucoes
      .filter(o => o.missao_id === x.missao_id && o.agente_id !== x.agente_id && Date.parse(o.iniciado_em) <= Date.parse(x.iniciado_em))
      .sort((a, b) => Date.parse(b.iniciado_em) - Date.parse(a.iniciado_em))[0];
    const de = anterior && pessoa(anterior.agente_id), para = pessoa(x.agente_id);
    if (de && para && de.levarTarefa(para, x.resumo || 'tarefa da missão')) E.aviso(`${de.nome} passou uma tarefa para ${para.nome}`);
  }

  // Mensagem nova de um agente para outro: quem escreveu vai até a mesa de quem recebe.
  function conversasNovas(anteriores) {
    for (const m of st.mensagens) {
      if (anteriores.has(m.id) || m.origem === 'sistema' || !m.agente_id || !m.destinatario_id) continue;
      if (Date.now() - Date.parse(m.criado_em) > 5 * 60000) continue;
      const de = pessoa(m.agente_id), para = pessoa(m.destinatario_id);
      const curto = m.texto.length > 60 ? m.texto.slice(0, 59) + '…' : m.texto;
      if (de && para && de.irAte(para, curto, 'Combinado!', `Conversando com ${para.nome}`)) E.aviso(`${de.nome} foi falar com ${para.nome}`);
    }
  }

  function aplicar(novo) {
    const antes = new Map(st.execucoes.map(x => [x.id, x.status]));
    const msgsAntes = new Set(st.mensagens.map(m => m.id));
    st = novo;
    recebido = true;
    recalcular();
    if (!primeira) {
      for (const x of st.execucoes) {
        const s0 = antes.get(x.id), a = agente(x.agente_id);
        if (!a || s0 === x.status) continue;
        if (x.status === 'aguardando_aprovacao') {
          E.aviso(`${a.nome} entregou para revisão`);
          // leva a entrega até a mesa da Dra. Juliana
          const d = SIM.equipe.find(p => p.dona), p = pessoa(x.agente_id);
          if (d && p) p.irAte(d, 'Entrega pronta para sua revisão.', null, 'Levando entrega para revisão');
        }
        else if (x.status === 'erro' && s0) E.aviso(`Erro em ${a.nome}: ${x.erro || 'veja o histórico'}`.slice(0, 140));
        else if (x.status === 'executando' && !s0) E.aviso(`${a.nome} começou a trabalhar`);
        // Tarefa nova de uma missão: quem trabalhou antes nela vai até a mesa de quem recebeu.
        if (!s0 && x.missao_id && (x.status === 'executando' || x.status === 'pendente')) entregarNaMesa(x);
      }
    }
    if (!primeira) conversasNovas(msgsAntes);
    primeira = false;
    const c = E.custom && E.custom();
    if (E.painelAberto && E.painelAberto() === 'custom' && c && c.atualizar) c.atualizar();
  }

  window.addEventListener('message', ev => {
    if (ev.origin !== location.origin || ev.source !== PAI) return;
    const m = ev.data || {};
    if (m.destino !== 'escritorio-isometrico') return;
    if (m.tipo === 'estado') aplicar({ agentes: m.agentes || [], execucoes: m.execucoes || [], mensagens: m.mensagens || [], atualizadoEm: m.atualizadoEm || null, ocupado: !!m.ocupado });
  });

  /* ---------- selo acima da cabeça ---------- */
  function selo(ctx, p, x, y, pilula) {
    if (!p.vivo) return;
    const v = p.vivo;
    if (v.erro) {
      pilula('⚠ Parou com erro', x, y - 14, { fundo: '#7a1f1f', cor: '#fff', borda: '#ef5b5b' });
    } else if (v.trabalhando) {
      const t = v.trabalhando.titulo, curto = t.length > 26 ? t.slice(0, 25) + '…' : t;
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(performance.now() / 260);
      pilula('✎ ' + curto, x, y - 14, { fundo: 'rgba(201,164,92,0.95)', cor: '#020726', borda: '#ecd59a', fonte: '600 10px Montserrat, sans-serif' });
      ctx.globalAlpha = 1;
    } else if (v.revisao) {
      pilula(`● ${v.revisao} para revisar`, x, y - 14, { fundo: '#f3f0ea', cor: '#0b1236', borda: '#c9a45c' });
    } else if (v.fila) {
      pilula(`${v.fila} na fila`, x, y - 14, {});
    }
  }

  function resumo() {
    if (!PAI) return 'Abra pelo sistema JAS para ver os agentes reais';
    if (!recebido) return 'Conectando ao sistema…';
    const v = SIM.equipe.filter(p => p.vivo).map(p => p.vivo);
    const trab = v.filter(x => x.trabalhando).length, rev = v.reduce((s, x) => s + x.revisao, 0);
    const hora = st.atualizadoEm ? new Date(st.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    return `${trab} trabalhando · ${rev} para revisar${hora ? ' · atualizado ' + hora : ''}`;
  }

  /* ---------- painel do boneco ---------- */
  const quando = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function htmlExecucoes(lista) {
    if (!lista.length) return '<span class="vazio">Nenhuma execução registrada.</span>';
    return lista.map(x => `<li class="tarefa st-${x.status === 'aguardando_aprovacao' ? 'revisao' : x.status === 'executando' ? 'trabalhando' : x.status === 'concluida' ? 'aprovada' : x.status}" ${x.status === 'aguardando_aprovacao' ? `data-revisar="${esc(x.id)}"` : ''}>
      <span class="t-topo"><b>${esc((agente(x.agente_id) || {}).nome || 'Agente')}</b> <span class="t-st">${STATUS[x.status] || esc(x.status)}</span><span class="t-h">${quando(x.iniciado_em)}</span></span>
      <span class="t-tit">${esc(x.resumo || x.erro || 'Sem resumo')}</span>
      ${x.status === 'aguardando_aprovacao' ? '<span class="t-or">Clique para revisar</span>' : ''}</li>`).join('');
  }
  function ligarRevisar(el) {
    el.querySelectorAll('[data-revisar]').forEach(li => { li.style.cursor = 'pointer'; li.onclick = () => enviar({ tipo: 'revisar', execucao_id: li.dataset.revisar }); });
  }

  function montarPessoa(p, el) {
    if (p.dona) {
      el.innerHTML = '<h3>Para sua revisão</h3><ul class="lista tarefas" id="vp-lista"></ul>';
      return atualizarPessoa(p);
    }
    const a = agente(p.id);
    if (!a) { el.innerHTML = ''; return; }
    el.innerHTML = `${a.descricao ? `<p>${esc(a.descricao)}</p>` : ''}
      <div><span class="chip">${a.ativo ? 'Ligado' : 'Pausado'}</span>${a.intervalo_minutos ? `<span class="chip">Rotina a cada ${a.intervalo_minutos >= 1440 ? '24 h' : a.intervalo_minutos / 60 + ' h'}</span>` : '<span class="chip">Execução manual</span>'}</div>
      <div class="acoes">
        <button class="btn cheio" id="vp-executar" ${a.ativo && !st.ocupado ? '' : 'disabled'}>▶ Executar agora</button>
        <button class="btn" id="vp-editar">Personalizar</button>
      </div>
      ${a.ativo ? '' : '<p class="nota">Ligue o agente em Personalizar para poder executar.</p>'}
      <h3>Últimas execuções</h3><ul class="lista tarefas" id="vp-lista"></ul>`;
    $('vp-executar').onclick = () => { $('vp-executar').disabled = true; enviar({ tipo: 'executar', agente_id: a.id }); };
    $('vp-editar').onclick = () => enviar({ tipo: 'editar', agente_id: a.id });
    atualizarPessoa(p);
  }
  function atualizarPessoa(p) {
    const ul = $('vp-lista'); if (!ul) return;
    const lista = p.dona
      ? st.execucoes.filter(x => x.status === 'aguardando_aprovacao')
      : st.execucoes.filter(x => x.agente_id === p.id).slice(0, 6);
    const html = p.dona && !lista.length ? '<span class="vazio">Nada esperando por você.</span>' : htmlExecucoes(lista);
    if (ul.dataset.h !== html) { ul.innerHTML = html; ul.dataset.h = html; ligarRevisar(ul); }
    const b = $('vp-executar'), a = agente(p.id);
    if (b && a) b.disabled = !a.ativo || st.ocupado;
  }

  /* ---------- o que a Central lê ---------- */
  function estado() {
    return {
      tarefas: [],
      sistema: {
        atualizado: st.atualizadoEm,
        execucoes: st.execucoes.map(x => ({
          id: x.id, status: x.status, origem: x.origem, resumo: x.resumo, erro: x.erro,
          iniciado_em: x.iniciado_em, finalizado_em: x.finalizado_em,
          agente: { nome: (agente(x.agente_id) || {}).nome || 'Agente' }, personagem: x.agente_id
        }))
      },
      integracoes: { sistema: recebido ? 'conectado' : 'conectando' }
    };
  }

  // recalcula sozinho a cada 15 s (a regra dos 10 minutos depende do relógio)
  setInterval(recalcular, 15000);
  if (window.EQUIPE_SEM_MESA && window.EQUIPE_SEM_MESA.length) {
    setTimeout(() => E.aviso(`Sem mesa livre para: ${window.EQUIPE_SEM_MESA.join(', ')}`), 1500);
  }
  enviar({ tipo: 'pronto' });

  return {
    selo, resumo, montarPessoa, atualizarPessoa, recalcular, estado,
    conectado: () => recebido,
    revisar: id => enviar({ tipo: 'revisar', execucao_id: id })
  };
})();
window.VIVO = VIVO;
