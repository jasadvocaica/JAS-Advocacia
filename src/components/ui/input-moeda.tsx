import { forwardRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * Input monetário no formato brasileiro (1.234,56).
 * - `value`: string com o número "puro" (ex: "1234.56" ou "" para vazio).
 * - `onChange(valorPuro)`: devolve o número como string com ponto decimal,
 *   pronto para ser convertido com Number(...) ou enviado ao banco.
 */
interface InputMoedaProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value: string;
  onChange: (valorPuro: string) => void;
}

function formatarBR(valorPuro: string): string {
  if (!valorPuro) return "";
  const n = Number(valorPuro);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function digitarParaPuro(input: string): string {
  // Mantém apenas dígitos; últimos 2 = centavos.
  const digitos = input.replace(/\D/g, "");
  if (!digitos) return "";
  const semZerosEsq = digitos.replace(/^0+/, "") || "0";
  const reais = semZerosEsq.length <= 2 ? "0" : semZerosEsq.slice(0, -2);
  const centavos = semZerosEsq.padStart(3, "0").slice(-2);
  return `${reais}.${centavos}`;
}

export const InputMoeda = forwardRef<HTMLInputElement, InputMoedaProps>(
  ({ value, onChange, ...rest }, ref) => {
    const [texto, setTexto] = useState<string>(formatarBR(value));

    // Sincroniza quando value externo muda (ex: carregar contrato existente).
    useEffect(() => {
      setTexto(formatarBR(value));
    }, [value]);

    return (
      <Input
        {...rest}
        ref={ref}
        type="text"
        inputMode="decimal"
        value={texto}
        onChange={(e) => {
          const puro = digitarParaPuro(e.target.value);
          setTexto(formatarBR(puro));
          onChange(puro);
        }}
        onBlur={(e) => {
          setTexto(formatarBR(value));
          rest.onBlur?.(e);
        }}
        placeholder={rest.placeholder ?? "0,00"}
      />
    );
  },
);
InputMoeda.displayName = "InputMoeda";
