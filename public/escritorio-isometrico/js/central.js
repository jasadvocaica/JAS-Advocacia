/* ===========================================================
   central.js — Central dos agentes: o caminho de cada tarefa,
   da agenda até a sua aprovação, com os bonecos reagindo.
   Junta tarefas do escritório, execuções do sistema jurídico e,
   quando ligada, uma SIMULAÇÃO do fluxo (marcada como tal).
   =========================================================== */
const CENTRAL = (() => {
  const E = window.ESCRITORIO;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pessoa = id => SIM.equipe.find(p => p.id === id);

  const COLUNAS = [
    ['pedido', 'Chegou', 'agenda, painel, Telegram, WhatsApp'],
    ['fila', 'Na fila', 'esperando o trabalhador'],
    ['trabalhando', 'Trabalhando', 'o agente está na mesa'],
    ['aprovacao', 'Sua aprovação', 'nada sai sem você'],
    ['concluido', 'Concluído', 'feito, enviado ou agendado']
  ];

  /* ---------- tarefas reais ---------- */
  const DO_ESCRITORIO = { triagem: 'fila', fila: 'fila', trabalhando: 'trabalhando', revisao: 'aprovacao', aprovada: 'concluido', recusada: 'concluido', erro: 'concluido' };
  const DO_SISTEMA = { pendente: 'fila', executando: 'trabalhando', aguardando_aprovacao: 'aprovacao', concluida: 'concluido', rejeitada: 'concluido', erro: 'concluido', cancelada: 'concluido' };
  const ROTULO_FIM = { aprovada: 'Aprovada', recusada: 'Recusada', erro: 'Erro', concluida: 'Concluída', rejeitada: 'Rejeitada', cancelada: 'Cancelada' };

  function reais() {
    const st = VIVO.estado(), cartoes = [];
    for (const t of st.tarefas || []) cartoes.push({
      chave: 'e' + t.id, fonte: 'Escritório', agente: t.agente, titulo: t.titulo, etapa: DO_ESCRITORIO[t.status] || 'fila',
      detalhe: ROTULO_FIM[t.status] || (t.origem !== 'painel' ? 'via ' + t.origem : ''), quando: t.atualizada, abrir: () => VIVO.abrirTarefa(t.id),
      ruim: t.status === 'erro' || t.status === 'recusada'
    });
    for (const x of ((st.sistema || {}).execucoes || [])) cartoes.push({
      chave: 's' + x.id, fonte: 'Sistema JAS', agente: x.personagem, titulo: (x.agente && x.agente.nome) || 'Agente do sistema',
      etapa: DO_SISTEMA[x.status] || 'fila', detalhe: x.status === 'erro' ? (x.erro || 'Erro') : (x.resumo || ROTULO_FIM[x.status] || x.origem),
      quando: x.finalizado_em || x.iniciado_em, ruim: x.status === 'erro',
      // entrega esperando revisão abre a revisão real no app
      abrir: x.status === 'aguardando_aprovacao' && VIVO.revisar ? () => VIVO.revisar(x.id) : undefined
    });
    return cartoes;
  }

  /* ---------- simulação ---------- */
  let sim = null;            // { inicio, passo, cartoes: [], narracao, timer }
  const SIMULACAO_ID = () => (sim ? sim.cartoes : []);

  function falar(id, txt) { const p = pessoa(id); if (p && !p.fora) p.dizer(txt, 5); }
  function focar(id) { const p = pessoa(id); if (p && !p.fora && $('acompanhar') && $('acompanhar').checked) E.localizar(p); }
  function cartao(id, agente, titulo, origem) { sim.cartoes.push({ id, agente, titulo, origem, etapa: 'pedido', detalhe: origem, quando: new Date().toISOString() }); }
  function mover(id, etapa, detalhe) {
    const c = sim.cartoes.find(x => x.id === id); if (!c) return;
    c.etapa = etapa; if (detalhe) c.detalhe = detalhe; c.quando = new Date().toISOString();
  }

  // Cada passo mostra uma peça da arquitetura real (ESPECIFICACAO-AGENTES-IA.md, versão 2).
  const ROTEIRO = [
    [0, 'Às 07:00 o relógio do Supabase (pg_cron) acorda o agendador. Dois horários venceram: o briefing da Manu e a leitura do DJEN pela Vanessa.', () => {
      cartao('A', 'vanessa', 'Ler publicações do DJEN', 'Agenda · dias úteis 07:15');
      cartao('B', 'manu', 'Briefing do dia', 'Agenda · seg a sex 07:00');
    }],
    [3, 'O agendador coloca as duas tarefas na fila do banco (agente_execucoes, status "pendente").', () => { mover('A', 'fila'); mover('B', 'fila'); }],
    [6, 'A cada minuto o trabalhador pega até 3 tarefas da fila e chama o agente de cada uma. Vanessa e Manu vão para a mesa.', () => {
      mover('A', 'trabalhando', 'agente-prazos'); mover('B', 'trabalhando', 'agente-executar'); focar('vanessa');
    }],
    [10, 'Você pede pelo painel: "faz um reel sobre BPC negado". O pedido entra na fila na hora.', () => {
      cartao('C', 'vinicius', 'Reel sobre BPC negado', 'Painel · Dra. Juliana'); falar('juliana', 'Preciso de um reel sobre BPC negado.');
    }],
    [12, 'O Vinícius estava livre: o trabalhador já o chama no mesmo minuto.', () => { mover('C', 'fila'); }],
    [14, 'A Vanessa termina sozinha: 3 publicações lidas e 2 prazos lançados na Controladoria como NÃO conferidos. Esse agente não precisa da sua aprovação.', () => {
      mover('A', 'concluido', '2 prazos lançados (não conferidos)');
    }],
    [16, 'O Vinícius (agente-marketing) escreve o roteiro com as regras da OAB por cima de tudo e no seu jeito de falar.', () => {
      mover('C', 'trabalhando', 'robô ig-reel'); focar('vinicius');
    }],
    [19, 'Briefing pronto. Relatório interno vai direto para o seu Telegram, sem passar por aprovação.', () => {
      mover('B', 'concluido', 'Enviado no Telegram');
    }],
    [21, 'Chega mensagem de um número novo no WhatsApp: "meu BPC foi negado". Vira tarefa da Mariana.', () => {
      cartao('D', 'mariana', 'Responder lead do WhatsApp', 'WhatsApp · número novo');
    }],
    [23, 'A tarefa da Mariana entra na fila.', () => { mover('D', 'fila'); }],
    [25, 'O roteiro passa pelo Humanizador (5 correções de texto de IA) e pela conferência da OAB (nenhum alerta). Agora ele espera você.', () => {
      mover('C', 'aprovacao', 'Humanizador: 5 correções · OAB: ok'); focar('juliana'); falar('juliana', 'Vou revisar.');
    }],
    [27, 'O trabalhador chama a Mariana. Ela rascunha uma resposta curta, sem parecer jurídico, convidando para o atendimento.', () => {
      mover('D', 'trabalhando'); focar('mariana');
    }],
    [31, 'Resposta da Mariana pronta. Mensagem para cliente sempre passa por você.', () => {
      mover('D', 'aprovacao', 'Rascunho, sem parecer jurídico'); focar('juliana');
    }],
    [33, 'Você aprova o reel e anexa o vídeo. A OAB é conferida de novo no texto final e o Zernio agenda o post.', () => {
      mover('C', 'concluido', 'Zernio: agendado hoje 19:30'); falar('juliana', 'Aprovado!');
    }],
    [36, 'Você aprova a resposta e ela sai pelo WhatsApp.', () => { mover('D', 'concluido', 'Enviada no WhatsApp'); }],
    [39, 'Fim da simulação. Quando a Fase 0 estiver pronta no sistema, esta Central mostra as tarefas reais, ao vivo.', () => { }]
  ];

  function simular() {
    parar(true);
    sim = { inicio: performance.now(), passo: 0, cartoes: [], narracao: '' };
    abrir();
    sim.timer = setInterval(() => {
      const t = (performance.now() - sim.inicio) / 1000;
      while (sim.passo < ROTEIRO.length && ROTEIRO[sim.passo][0] <= t) {
        const [, txt, fn] = ROTEIRO[sim.passo++];
        sim.narracao = txt; fn();
      }
      if (sim.passo >= ROTEIRO.length) { clearInterval(sim.timer); sim.timer = null; }
      VIVO.recalcular(); desenhar();
    }, 250);
  }
  function parar(limpar) {
    if (sim && sim.timer) clearInterval(sim.timer);
    if (limpar) sim = null; else if (sim) sim.timer = null;
    VIVO.recalcular(); desenhar();
  }

  /* ---------- desenho ---------- */
  const agoraHM = iso => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  function cartaoHtml(c, fonte) {
    const p = pessoa(c.agente);
    const nome = p ? p.nome : (c.agente || 'Agente');
    const cor = p ? p.look.roupa : '#3a4256';
    return `<li class="cc ${fonte === 'Simulação' ? 'sim' : ''} ${c.ruim ? 'ruim' : ''}" ${c.chave ? `data-k="${esc(c.chave)}"` : ''}>
      <span class="cc-topo"><i style="background:${esc(cor)}"></i><b>${esc(nome)}</b><em>${esc(fonte)}</em><span>${agoraHM(c.quando)}</span></span>
      <span class="cc-tit">${esc(c.titulo)}</span>
      ${c.detalhe ? `<span class="cc-det">${esc(c.detalhe)}</span>` : ''}</li>`;
  }

  function desenhar() {
    const el = $('central'); if (!el || el.hidden) return;
    const cartoes = [...SIMULACAO_ID().map(c => ({ ...c, fonte: 'Simulação' })), ...reais()];
    const html = COLUNAS.map(([k, nome, dica]) => {
      let lista = cartoes.filter(c => c.etapa === k);
      if (k === 'concluido') lista = lista.sort((a, b) => String(b.quando).localeCompare(String(a.quando))).slice(0, 8);
      return `<section class="col col-${k}"><header><b>${nome}</b><span>${lista.length || ''}</span><small>${dica}</small></header>
        <ul>${lista.map(c => cartaoHtml(c, c.fonte)).join('') || '<li class="vazio">—</li>'}</ul></section>`;
    }).join('');
    const quadro = $('central-quadro');
    if (quadro.dataset.h !== html) {
      quadro.innerHTML = html; quadro.dataset.h = html;
      const mapa = new Map(reais().filter(c => c.abrir).map(c => [c.chave, c.abrir]));
      quadro.querySelectorAll('[data-k]').forEach(li => { const f = mapa.get(li.dataset.k); if (f) { li.classList.add('clica'); li.onclick = f; } });
    }
    const n = $('central-narracao');
    n.hidden = !sim;
    if (sim) n.innerHTML = `<b>SIMULAÇÃO</b> ${esc(sim.narracao || 'Começando…')}`;
    if (!$('central-sim').hidden) $('central-sim').textContent = sim && sim.timer ? '■ Parar simulação' : sim ? '↺ Simular de novo' : '▶ Simular o fluxo';
    $('central-limpar').hidden = !sim;
    const st = VIVO.estado(), sis = (st.integracoes || {}).sistema || 'desligado';
    $('central-fontes').innerHTML =
      `<span class="fonte ${VIVO.conectado() ? 'ok' : ''}">Escritório ${VIVO.conectado() ? 'ao vivo' : 'desconectado'}</span>` +
      `<span class="fonte ${sis === 'conectado' ? 'ok' : ''}">Sistema JAS: ${esc(sis)}</span>`;
  }

  function abrir() { $('central').hidden = false; document.body.classList.add('com-central'); marcar(); desenhar(); }
  function fechar() { $('central').hidden = true; document.body.classList.remove('com-central'); marcar(); }
  function marcar() { const b = document.querySelector('[data-central]'); if (b) b.classList.toggle('ativa', !$('central').hidden); }

  /* ---------- montagem ---------- */
  document.body.insertAdjacentHTML('beforeend', `
    <section class="central" id="central" hidden aria-label="Central dos agentes">
      <div class="central-topo">
        <div><span class="etiqueta">Central dos agentes</span><div id="central-fontes" class="fontes"></div></div>
        <div class="central-acoes">
          <label class="linha"><input type="checkbox" id="acompanhar" checked> câmera acompanha</label>
          <button class="btn cheio" id="central-sim">▶ Simular o fluxo</button>
          <button class="btn" id="central-limpar" hidden>Limpar simulação</button>
          <button class="fechar" id="central-fechar" aria-label="Fechar">×</button>
        </div>
      </div>
      <p class="narracao" id="central-narracao" hidden></p>
      <div class="quadro" id="central-quadro"></div>
    </section>`);
  // ignora o segundo clique de um duplo clique (senão começa e já para)
  let ultimoClique = 0;
  $('central-sim').onclick = () => {
    if (performance.now() - ultimoClique < 600) return;
    ultimoClique = performance.now();
    if (sim && sim.timer) parar(false); else simular();
  };
  $('central-limpar').onclick = () => parar(true);
  $('central-fechar').onclick = fechar;
  const nav = $('salas');
  const antes = nav.querySelector('[data-painel=nova]');
  if (antes) antes.insertAdjacentHTML('beforebegin', '<button data-central class="destaque">Central</button>');
  else nav.insertAdjacentHTML('beforeend', '<span class="sep"></span><button data-central class="destaque">Central</button>');
  // no sistema JAS mostra só o que é real: a simulação narrava outra arquitetura
  if (Array.isArray(window.EQUIPE_DINAMICA)) {
    $('central-sim').hidden = true;
    $('acompanhar').closest('label').hidden = true;
  }
  nav.querySelector('[data-central]').onclick = () => ($('central').hidden ? abrir() : fechar());
  setInterval(desenhar, 1000);

  return { simulados: () => (sim ? sim.cartoes.filter(c => c.etapa !== 'concluido') : []), abrir, simular };
})();
window.CENTRAL = CENTRAL;
