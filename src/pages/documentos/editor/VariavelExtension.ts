import { Mark, mergeAttributes } from "@tiptap/core";

export interface VariavelOptions {
  HTMLAttributes: Record<string, any>;
}

/**
 * Marca trechos de texto que contêm variáveis no formato {{nome}}.
 * Renderiza como <span class="doc-variavel" data-variavel="..."> com cor distintiva.
 */
export const VariavelMark = Mark.create<VariavelOptions>({
  name: "variavel",

  addOptions() {
    return {
      HTMLAttributes: {
        class: "doc-variavel",
      },
    };
  },

  addAttributes() {
    return {
      "data-variavel": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-variavel"),
        renderHTML: (attributes) =>
          attributes["data-variavel"] ? { "data-variavel": attributes["data-variavel"] } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span.doc-variavel",
      },
      {
        tag: "span[data-variavel]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
});
