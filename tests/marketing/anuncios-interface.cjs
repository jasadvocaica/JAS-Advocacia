const { chromium } = require("playwright-core");
const fs = require("fs");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  let fontesConcorrentes = ['https://www.instagram.com/referencia_ui/'];
  page.on("pageerror", (e) => errors.push(e.message));
  const uid = "11111111-1111-4111-8111-111111111111";
  const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: "marketing-ui@example.invalid",
    user_metadata: { nome: "Usuário de teste" },
    app_metadata: { provider: "email" },
    created_at: new Date().toISOString(),
  };
  const perms = {
    visualizar: true,
    criar: true,
    editar: true,
    aprovar: true,
    gestor: true,
    gerenciar: true,
    financeiro: true,
    exportar: true,
    comercial: false,
  };
  const now = new Date().toISOString();
  let items = [];
  let denyMetrics = false;
  const ctx = {
    permissoes: perms,
    usuarios: [{ id: uid, nome: "Usuário de teste" }],
    areas: [],
    servicos: [],
    teses: [],
    tese_servicos: [],
    clientes: [],
    leads: [],
    contratos: [],
    acessos: [],
    campanhas: [],
  };
  const base = {
    tipo: "tarefa",
    titulo: "Conferir pauta",
    descricao: "Atividade sintética para validar a interface.",
    status: "rascunho",
    prioridade: "normal",
    responsavel_id: uid,
    area_id: null,
    servico_id: null,
    tese_id: null,
    origem_id: null,
    campanha_id: null,
    planejamento_id: null,
    pauta_id: null,
    canal: null,
    formato: null,
    prazo: null,
    data_prevista: null,
    dados: {},
    versao: 1,
    versao_aprovada: null,
    roteiro_aprovado: null,
    arquivado_em: null,
    criado_em: now,
    atualizado_em: now,
  };
  items.push({ ...base, id: "22222222-2222-4222-8222-222222222222" });
  items.push({...base,id:"44444444-4444-4444-8444-444444444444",tipo:"conteudo",titulo:"Revisar roteiro institucional",status:"aguardando_aprovacao"});
  items.push({...base,id:"55555555-5555-4555-8555-555555555555",tipo:"conteudo",titulo:"Finalizar carrossel informativo",status:"producao"});
  items.push({...base,id:'77777777-7777-4777-8777-777777777777',tipo:'ideia',titulo:'Documentos do contrato PJ',status:'aguardando_aprovacao',dados:{tipo_peca:'rascunho_anuncio',titulo_anuncio:'Documentos do contrato PJ',texto:'Organize seus documentos antes da análise individual.',criativo_proposto:'Foto institucional com documentos organizados e título legível.',orcamento_sugerido:'120'}});
  await context.addInitScript(
    ({ user, uid }) => {
      const enc = (o) => btoa(JSON.stringify(o));
      const token =
        enc({ alg: "HS256", typ: "JWT" }) +
        "." +
        enc({
          sub: uid,
          role: "authenticated",
          aud: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 86400,
        }) +
        ".fake";
      localStorage.setItem(
        "sb-mzwnljgujheumdslkloc-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "fake",
          expires_at: Math.floor(Date.now() / 1000) + 86400,
          expires_in: 86400,
          token_type: "bearer",
          user,
        }),
      );
    },
    { user, uid },
  );
  await context.routeWebSocket("**/*.supabase.co/**", (ws) => ws.close());
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (!url.hostname.endsWith(".supabase.co")) return route.abort();
    let result = [];
    const path = url.pathname;
    const table = path.split("/").pop();
    const object = (req.headers().accept ?? "").includes("object+json");
    if (path.startsWith("/auth/")) result = user;
    else if (table === "profiles")
      result = object
        ? {
            id: uid,
            nome: "Usuário de teste",
            email: user.email,
            ativo: true,
            tipo_portal: "interno",
          }
        : [
            {
              id: uid,
              nome: "Usuário de teste",
              email: user.email,
              ativo: true,
              tipo_portal: "interno",
            },
          ];
    else if (table === "user_roles")
      result = [{ user_id: uid, role: "gestor" }];
    else if (table === "user_permissions") result = [];
    else if (table === "mkt_integrado") {
      const action = req.postDataJSON()._acao;
      if (action === "resultados" && denyMetrics) return route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({code:"42501",message:"Acesso aos indicadores revogado"})});
      result = action === "resultados" ? {
        conexao: { estado: "conectado", ultima_sync_ok_em: now, addon_ads: true, intervalo_minutos: 360 },
        contas: [{externo_id:"a1",nome:"Conta simulada",plataforma:"metaads",precisa_reconectar:false}],
        diario: [11.2,19.4,12.6,22,16.75,13.9].map((gasto,i)=>({nivel:"conta",referencia:"a1",data:now.slice(0,8)+String(i+1).padStart(2,"0"),moeda:"BRL",gasto,impressoes:4100+i*150,cliques:20+i*4,conversoes:i+1})),
        campanhas: [
          {externo_id:"c1",nome:"Conteúdo informativo · Previdenciário",estado:"active",moeda:"BRL",periodo_de:now.slice(0,8)+"01",periodo_ate:now.slice(0,10),metricas:{spend:42.5,clicks:76}},
          {externo_id:"c2",nome:"Planejamento patrimonial",estado:"paused",moeda:"BRL",periodo_de:now.slice(0,8)+"01",periodo_ate:now.slice(0,10),metricas:{spend:23.25,clicks:42}},
          {externo_id:"c3",nome:"Direitos do consumidor",estado:"active",moeda:"BRL",periodo_de:now.slice(0,8)+"01",periodo_ate:now.slice(0,10),metricas:{spend:30.1,clicks:62}},
        ],conjuntos:[],anuncios:[],publicacoes:[],job_ativo:null,ultima_rodada:{estado:"concluido"},parcial:false,
        crm:{leads:12,qualificados:5,contratos:2,sem_atribuicao:5,campanhas:[{campanha_id:null,nome:"Sem atribuição",leads:5,contratos:1}]},apurado_em:now,
      } : [];
    }
    else if (table === "mkt_rotinas_ia") { const p=req.postDataJSON();if(Array.isArray(p?._fontes))fontesConcorrentes=p._fontes;result={fontes:fontesConcorrentes,pode_configurar:true,rotinas:[]}; }
    else if (table === "mkt_inteligencia_mercado") result={pesquisas:[],referencias:[],estrategias:[]};
    else if (table === "mkt_equipe_disponivel") result = [{id:"agente-ui",nome:"Camila",descricao:"Conteúdo de teste",ativo:true,executor:"analista_operacional",ferramentas:["zernio_indicadores"]}];
    else if (path.endsWith("/motor-missoes")) result={ok:true,missao_id:"missao-ui"};
    else if (table === "comercial_operar") result = {permissoes:{visualizar:true,gerenciar:true,financeiro_visualizar:false}};
    else if (table === 'mkt_ads') {const p=req.postDataJSON();result=p._acao==='salvar'?{id:'plano-ui',versao:1,dados:p._payload.dados}:{planos:[],operacoes:[]};}
    else if (table === 'zernio') result={escrita_habilitada:true,contas:[{id:'conexao-teste',nome:'Conexão de teste',pagina:{id:'123',nome:'Página de teste'},anuncios:[{id:'act_123',nome:'Conta de teste'}],formularios:[]}]};
    else if (table === "mkt_contexto") result = ctx;
    else if (table === "mkt_itens") result = items;
    else if (table === "comercial_responsaveis_autorizados") result=[{user_id:uid,nome:"Usuário de teste",ativo:true,gestor:true}];
    else if (table === "mkt_leads") result=[{id:"lead-real",nome:"Contato real simulado",canal:"meta_ads",status:"novo",integracao_teste:false,criado_em:now,responsavel_id:uid},{id:"lead-teste",nome:"Contato de homologação",canal:"meta_ads",status:"novo",integracao_teste:true,criado_em:now,responsavel_id:uid}];
    else if (table === "mkt_operar") {
      const body = req.postDataJSON(),
        p = body.payload;
      if (body.operacao === "salvar") {
        const item = {
          ...base,
          ...p,
          id: p.id ?? "33333333-3333-4333-8333-333333333333",
          dados: p.dados ?? {},
          versao: 1,
        };
        items = items.filter((i) => i.id !== item.id);
        items.unshift(item);
        result = item;
      } else result = {};
    } else if (table === "mkt_demanda")
      result = {
        limiar: 0,
        servicos: [],
        mensal: [],
        teses: [],
        origens: [],
        campanhas: [],
        areas: [],
        resumo: null,
      };
    else if (table === "comercial_responsavel_comunicacao")
      result = { configurado: false };
    else if (path.includes("/rpc/")) result = {};
    else if (object) result = null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(result),
    });
  });
  await page.goto('http://127.0.0.1:4175/marketing?secao=anuncios',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Anúncios',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Documentos do contrato PJ',exact:true}).waitFor();
  await page.screenshot({path:'/tmp/jas-anuncios-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Montar campanha com esta ideia'}).click();
  await page.getByLabel('Título do anúncio',{exact:true}).waitFor();
  if(await page.getByLabel('Título do anúncio',{exact:true}).inputValue()!=='Documentos do contrato PJ')throw Error('Proposta não preenchida');
  if(!await page.getByRole('button',{name:'Revisar envio pausado'}).isDisabled())throw Error('Envio liberado sem revisão');
  await page.screenshot({path:'/tmp/jas-anuncios-plano.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/jas-anuncios-mobile.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2))throw Error('Transbordamento no celular');
  await page.getByRole('button',{name:'Públicos e listas',exact:true}).click();
  if(!await page.getByLabel('Lista de contatos CSV').isDisabled())throw Error('CSV sem revisão da origem');
  if(errors.length)throw Error(errors.join('\n'));
  console.log(JSON.stringify({desktop:'OK',mobile:'OK',ideiaPreenchida:'OK',envioSemAprovacao:'bloqueado',arquivoSemRevisao:'bloqueado',runtimeErrors:errors}));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
