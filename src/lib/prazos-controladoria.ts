export function limitarAntecedenciaInterna(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.min(30, Math.max(0, Math.trunc(valor)));
}

export function prazoInternoNaoUltrapassaJudicial(
  prazoJudicial?: Date,
  prazoInterno?: Date,
): boolean {
  if (!prazoJudicial || !prazoInterno) return true;
  return prazoInterno.getTime() <= prazoJudicial.getTime();
}
