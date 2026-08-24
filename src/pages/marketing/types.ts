export const CANAIS_LEAD = {
  meta_ads: { label: "Meta Ads", cor: "#1877F2" },
  instagram_organico: { label: "Instagram orgânico", cor: "#E1306C" },
  tiktok: { label: "TikTok", cor: "#010101" },
  indicacao_parceiro: { label: "Indicação de parceiro", cor: "#BC943F" },
  site_seo: { label: "Site / SEO", cor: "#34A853" },
  whatsapp_direto: { label: "WhatsApp direto", cor: "#25D366" },
  outro: { label: "Outro", cor: "#888780" },
} as const;
export type CanalLead = keyof typeof CANAIS_LEAD;

export const CANAIS_CAMPANHA = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  tiktok_ads: "TikTok Ads",
  outro_pago: "Outro (pago)",
} as const;

export const STATUS_LEAD = {
  novo: { label: "Novo", cor: "bg-blue-100 text-blue-800" },
  em_atendimento: { label: "Em atendimento", cor: "bg-amber-100 text-amber-800" },
  proposta_enviada: { label: "Proposta enviada", cor: "bg-purple-100 text-purple-800" },
  convertido: { label: "Convertido", cor: "bg-green-100 text-green-800" },
  perdido: { label: "Perdido", cor: "bg-red-100 text-red-800" },
} as const;
export type StatusLead = keyof typeof STATUS_LEAD;

export const MOTIVOS_PERDA = {
  valor: "Achou caro",
  concorrente: "Foi para outro escritório",
  caso_inviavel: "Caso sem fundamento",
  sem_retorno: "Sem retorno",
  nao_urgente: "Não urgente agora",
  outro: "Outro motivo",
} as const;

export const AREAS_DIREITO = {
  previdenciario: "Previdenciário",
  familia: "Família",
  civil: "Cível",
  trabalhista: "Trabalhista",
  tributario: "Tributário",
  consumidor: "Consumidor",
  saude: "Saúde",
  outro: "Outro",
} as const;

export const STATUS_CAMPANHA = {
  planejada: "Planejada",
  ativa: "Ativa",
  pausada: "Pausada",
  encerrada: "Encerrada",
} as const;

export const CANAIS_CONTEUDO = {
  instagram: { label: "Instagram", cor: "#E1306C" },
  tiktok: { label: "TikTok", cor: "#010101" },
  facebook: { label: "Facebook", cor: "#1877F2" },
  site_blog: { label: "Site / Blog", cor: "#34A853" },
  youtube: { label: "YouTube", cor: "#FF0000" },
  linkedin: { label: "LinkedIn", cor: "#0A66C2" },
} as const;

export const FORMATOS_CONTEUDO = {
  reels: "Reels",
  carrossel: "Carrossel",
  feed_foto: "Foto no feed",
  story: "Story",
  video_longo: "Vídeo longo",
  blog_post: "Post de blog",
  live: "Live",
} as const;

export const STATUS_CONTEUDO = {
  ideia: "Ideia",
  planejado: "Planejado",
  producao: "Produção",
  revisao: "Revisão",
  aprovado: "Aprovado",
  publicado: "Publicado",
  cancelado: "Cancelado",
} as const;
