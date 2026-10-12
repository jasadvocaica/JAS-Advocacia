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
    else if (table === "mkt_contexto") result = ctx;
    else if (table === "mkt_itens") result = items;
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
  await page.goto(`${process.env.MARKETING_TEST_URL || "http://127.0.0.1:4173"}/marketing`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { name: "Marketing · Visão Geral", exact: true }).waitFor();
  const group = page.getByRole("button", {name: "Marketing", exact: true});
  await group.waitFor();
  for (const label of ["Visão Geral", "Planejamento", "Produção", "Aprovações", "Resultados"])
    await page.getByRole("link", {name: label, exact: true}).waitFor();
  if (await page.getByLabel("Menu do marketing").count()) throw new Error("Barra lateral interna permanece");
  await page.getByRole("button", { name: "Novo", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ideia", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox")
    .first()
    .fill("Ideia criada na validação de interface");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", {
      name: "Ideia criada na validação de interface",
      exact: true,
    })
    .waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  for (const [groupName, label] of [
    ["Planejamento", "Pacotes de Conteúdo"], ["Produção", "Modelos de Conteúdo"],
    ["Aprovações", "Histórico de Aprovações"], ["Resultados", "Análise de Demanda Jurídica"],
    ["Resultados", "Relatórios de Marketing"]
  ]) {
    await page.getByRole("link", {name: groupName, exact: true}).click();
    await page.getByRole("navigation", {name: "Funcionalidades do marketing"}).getByRole("button", {name: label, exact: true}).click();
    await page.waitForTimeout(250);
  }
  await group.click();
  if (await page.getByRole("link", {name: "Planejamento", exact: true}).count()) throw new Error("Grupo não recolheu");
  await group.click();
  await page.screenshot({ path: "/tmp/marketing-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${process.env.MARKETING_TEST_URL || "http://127.0.0.1:4173"}/marketing?secao=visao`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { name: "Marketing · Visão Geral", exact: true }).waitFor();
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    view: innerWidth,
  }));
  if (width.scroll > width.view + 5) {
    console.log(
      await page.evaluate(() =>
        Array.from(document.querySelectorAll("*"))
          .map((e) => ({
            tag: e.tagName,
            cls: e.className,
            right: e.getBoundingClientRect().right,
            width: e.getBoundingClientRect().width,
          }))
          .filter((x) => x.right > innerWidth + 3)
          .slice(-20),
      ),
    );
    await page.screenshot({
      path: "/tmp/marketing-mobile-overflow.png",
      fullPage: true,
    });
  }
  if (width.scroll > width.view + 5)
    throw new Error(
      "Interface transborda no celular: " + JSON.stringify(width),
    );
  await page.screenshot({ path: "/tmp/marketing-mobile.png", fullPage: true });
  if (errors.length) throw new Error("Erros de runtime: " + errors.join("\n"));
  console.log(
    JSON.stringify({
      desktop: "OK",
      mobile: "OK",
      fiveMenus: "OK",
      creation: "OK",
      pages: "OK",
      runtimeErrors: errors,
    }),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
