/**
 * Sanitizador de HTML para conteúdo importado do Word / modelos.
 *
 * O HTML que vem do Word (via mammoth) e de modelos antigos costuma trazer
 * estilos inline que quebram o layout da folha A4 do editor:
 *  - `margin`, `margin-top`, etc. em parágrafos (cria espaços enormes)
 *  - `width` / `max-width` em parágrafos e divs
 *  - `font-size` e `font-family` que sobrescrevem a configuração da peça
 *  - Tags `<o:p>`, `<w:*>` específicas do Word
 *  - Classes `MsoNormal`, `MsoListParagraph`...
 *
 * Esta função preserva alinhamento (`text-align`), recuo de primeira linha
 * (`text-indent`), negrito/itálico/sublinhado e listas — que são o que
 * realmente importa para a peça final.
 */

const ATRIBUTOS_STYLE_PERMITIDOS = new Set([
  "text-align",
  "text-indent",
  "font-weight",
  "font-style",
  "text-decoration",
  "color",
  "background-color",
  "list-style-type",
  "vertical-align",
]);

const TAGS_REMOVER_COMPLETAMENTE = new Set([
  "o:p", "style", "meta", "link",
  "script", "iframe", "object", "embed", "form", "input",
  "textarea", "button", "frame", "frameset", "applet", "base",
]);

/**
 * Limpa o HTML preservando apenas o que é seguro renderizar dentro da folha.
 */
export function sanitizarHtmlDocumento(html: string): string {
  if (!html || typeof window === "undefined") return html;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  // Remove tags do Word que viram lixo
  TAGS_REMOVER_COMPLETAMENTE.forEach((tag) => {
    wrapper.querySelectorAll(tag).forEach((el) => el.remove());
  });

  // Remove namespaces XML do Word (<w:*>, <o:*>)
  wrapper.querySelectorAll("*").forEach((el) => {
    const nome = el.tagName.toLowerCase();
    if (nome.includes(":")) {
      // Substitui por seu conteúdo
      const pai = el.parentNode;
      if (pai) {
        while (el.firstChild) pai.insertBefore(el.firstChild, el);
        pai.removeChild(el);
      }
    }
  });

  // Sanitiza atributos
  wrapper.querySelectorAll<HTMLElement>("*").forEach((el) => {
    // Remove classes Mso* do Word
    if (el.className && typeof el.className === "string") {
      const classesLimpas = el.className
        .split(/\s+/)
        .filter((c) => !c.startsWith("Mso") && !c.startsWith("Wp") && c.trim().length > 0)
        .join(" ");
      if (classesLimpas) el.className = classesLimpas;
      else el.removeAttribute("class");
    }

    // Remove atributos típicos do Word
    ["lang", "xml:lang", "id"].forEach((attr) => {
      if (el.hasAttribute(attr)) el.removeAttribute(attr);
    });

    // Remove TODOS os event handlers (on*) — proteção XSS
    Array.from(el.attributes).forEach((attr) => {
      const nome = attr.name.toLowerCase();
      if (nome.startsWith("on")) el.removeAttribute(attr.name);
    });

    // Bloqueia href/src com javascript:, data: (exceto data:image), vbscript:
    ["href", "src", "xlink:href", "action", "formaction"].forEach((attr) => {
      const valor = el.getAttribute(attr);
      if (!valor) return;
      const limpo = valor.trim().toLowerCase();
      if (
        limpo.startsWith("javascript:") ||
        limpo.startsWith("vbscript:") ||
        (limpo.startsWith("data:") && !limpo.startsWith("data:image/"))
      ) {
        el.removeAttribute(attr);
      }
    });

    // Filtra `style` inline mantendo só propriedades seguras
    const style = el.getAttribute("style");
    if (style) {
      const declaracoes = style
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const idx = d.indexOf(":");
          if (idx === -1) return null;
          const prop = d.slice(0, idx).trim().toLowerCase();
          const valor = d.slice(idx + 1).trim();
          return { prop, valor };
        })
        .filter(
          (d): d is { prop: string; valor: string } =>
            !!d && ATRIBUTOS_STYLE_PERMITIDOS.has(d.prop),
        );

      if (declaracoes.length === 0) {
        el.removeAttribute("style");
      } else {
        el.setAttribute(
          "style",
          declaracoes.map((d) => `${d.prop}: ${d.valor}`).join("; "),
        );
      }
    }

    // Remove largura/altura fixas em imagens muito grandes (deixa o CSS controlar)
    if (el.tagName === "IMG") {
      const width = el.getAttribute("width");
      if (width && /^\d+$/.test(width) && Number(width) > 600) {
        el.removeAttribute("width");
        el.removeAttribute("height");
      }
    }
  });

  // Remove parágrafos completamente vazios criados pelo Word
  wrapper.querySelectorAll("p").forEach((p) => {
    const texto = p.textContent?.replace(/\u00a0|\s/g, "") ?? "";
    const temFilhoSignificativo = p.querySelector("img, br, table");
    if (!texto && !temFilhoSignificativo) {
      // Mantém um único <br> para preservar a quebra visual
      p.innerHTML = "<br>";
    }
  });

  return wrapper.innerHTML;
}
