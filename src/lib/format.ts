/* Brazilian formatting helpers */

export const formatCPF = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

export const formatCNPJ = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

export const formatCpfCnpj = (v: string) => {
  const d = v.replace(/\D/g, "");
  return d.length <= 11 ? formatCPF(v) : formatCNPJ(v);
};

export const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
  }
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
};

export const formatCEP = (v: string) =>
  v.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");

export const formatCNJ = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 20);
  return d
    .replace(/^(\d{7})(\d)/, "$1-$2")
    .replace(/^(\d{7}-\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{7}-\d{2}\.\d{4})(\d)/, "$1.$2")
    .replace(/^(\d{7}-\d{2}\.\d{4}\.\d)(\d)/, "$1.$2")
    .replace(/^(\d{7}-\d{2}\.\d{4}\.\d\.\d{2})(\d)/, "$1.$2");
};

export const formatBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

export const formatDate = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toLocaleDateString("pt-BR");
};

export const formatDateTime = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export const onlyDigits = (v: string) => v.replace(/\D/g, "");
