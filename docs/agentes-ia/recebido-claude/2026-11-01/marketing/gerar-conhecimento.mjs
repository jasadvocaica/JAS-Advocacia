// Gera supabase/functions/agente-marketing/conhecimento.ts a partir da skill,
// da voz e da camada OAB. Rode de novo sempre que editar voz-jas.md,
// camada-oab.md ou algum ROBO.md:   node gerar-conhecimento.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(aqui, 'skill-instagram');
const ler = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const semCabecalho = t => t.replace(/^---\n[\s\S]*?\n---\n/, '').trim();

// Os robôs foram escritos para rodar no Claude Code com arquivos locais.
// Dentro do sistema, o código faz essas partes; o aviso abaixo evita que o
// modelo peça para rodar programa ou salvar arquivo.
const AVISO = 'Observação do sistema: ignore instruções deste robô sobre rodar programas Python, ' +
  'ler ou salvar arquivos em ~/.claude ou pedir arquivos. O sistema já entrega o voz.md, ' +
  'humaniza o texto e confere as regras da OAB depois de você. Faça as checagens do robô à mão.';

const robos = {};
for (const id of fs.readdirSync(path.join(skill, 'robos')).sort()) {
  const arq = path.join(skill, 'robos', id, 'ROBO.md');
  if (fs.existsSync(arq)) robos[id] = `${AVISO}\n\n${semCabecalho(ler(arq))}`;
}

// fórmulas de gancho: só o que o modelo usa, sem o peso do arquivo inteiro
const hooks = JSON.parse(ler(path.join(skill, 'robos', 'ig-reel', 'hooks.json')));
const formulas = hooks.hooks.map(h =>
  `#${h.id} ${h.name}: ${h.template} | ex.: ${h.example} | serve para: ${h.best_for} | cuidado: ${h.trap}`).join('\n');

const saida = `// GERADO por gerar-conhecimento.mjs. Não edite à mão.
// Fonte: skill-instagram (MIT, Jake Schincariol; versão brasileira Creator AI),
// voz-jas.md e camada-oab.md.

export const ROBOS: Record<string, string> = ${JSON.stringify(robos, null, 1)};

export const FORMULAS_GANCHO = ${JSON.stringify(formulas)};

export const VOZ = ${JSON.stringify(ler(path.join(aqui, 'voz-jas.md')))};

export const CAMADA_OAB = ${JSON.stringify(ler(path.join(aqui, 'camada-oab.md')))};
`;
const destino = path.join(aqui, 'supabase', 'functions', 'agente-marketing', 'conhecimento.ts');
fs.writeFileSync(destino, saida);
console.log(`conhecimento.ts gerado: ${Object.keys(robos).length} robôs, ${hooks.hooks.length} fórmulas de gancho.`);
