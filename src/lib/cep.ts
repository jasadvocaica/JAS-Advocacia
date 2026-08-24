/** Busca de endereço pelo CEP via ViaCEP (API pública) */
export interface CepResult {
  logradouro?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
}

export async function buscarCep(cep: string): Promise<CepResult | null> {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    const j = await r.json();
    if (j.erro) return null;
    return {
      logradouro: j.logradouro,
      bairro: j.bairro,
      cidade: j.localidade,
      estado: j.uf,
    };
  } catch {
    return null;
  }
}
