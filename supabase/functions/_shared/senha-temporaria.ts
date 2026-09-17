const MAIUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCULAS = "abcdefghijkmnopqrstuvwxyz";
const NUMEROS = "23456789";
const SIMBOLOS = "!@#$%*-_";
const TODOS = MAIUSCULAS + MINUSCULAS + NUMEROS + SIMBOLOS;

function indiceSeguro(maximo: number): number {
  if (!Number.isInteger(maximo) || maximo <= 0) throw new Error("Limite aleatório inválido");
  const limite = Math.floor(0x1_0000_0000 / maximo) * maximo;
  const valor = new Uint32Array(1);
  do {
    crypto.getRandomValues(valor);
  } while (valor[0] >= limite);
  return valor[0] % maximo;
}

function escolher(conjunto: string): string {
  return conjunto[indiceSeguro(conjunto.length)];
}

export function gerarSenhaTemporaria(tamanho = 20): string {
  if (tamanho < 12 || tamanho > 128) {
    throw new Error("A senha temporária deve ter entre 12 e 128 caracteres");
  }

  const caracteres = [
    escolher(MAIUSCULAS),
    escolher(MINUSCULAS),
    escolher(NUMEROS),
    escolher(SIMBOLOS),
  ];

  while (caracteres.length < tamanho) caracteres.push(escolher(TODOS));

  for (let i = caracteres.length - 1; i > 0; i -= 1) {
    const j = indiceSeguro(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }

  return caracteres.join("");
}
