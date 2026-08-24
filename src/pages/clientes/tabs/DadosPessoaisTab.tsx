import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, MapPin, Briefcase, Users, GraduationCap, Heart, IdCard, Calendar, AlertCircle } from "lucide-react";
import { formatCpfCnpj, formatPhone, formatDate, formatBRL } from "@/lib/format";
import {
  ESTADO_CIVIL_OPTS, ESCOLARIDADE_OPTS, ORIGEM_OPTS,
  calcularIdade, SALARIO_MINIMO_2025,
} from "../types";

const findLabel = (opts: ReadonlyArray<{ v: string; l: string }>, v: string | null) =>
  opts.find((o) => o.v === v)?.l ?? v ?? "—";

interface Props {
  cliente: any;
  advogadoNome?: string | null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gold" />
        <h3 className="font-display text-lg">{title}</h3>
      </div>
      <div className="grid sm:grid-cols-3 gap-x-6 gap-y-4">{children}</div>
    </Card>
  );
}

export default function DadosPessoaisTab({ cliente, advogadoNome }: Props) {
  const c = cliente;
  const idade = calcularIdade(c.nascimento);
  const rendaPC = Number(c.renda_per_capita ?? 0);
  const rendaAbaixoMin = rendaPC > 0 && rendaPC < SALARIO_MINIMO_2025 / 4;
  const isFisica = c.tipo_pessoa === "fisica";

  return (
    <div className="space-y-4">
      {/* Identificação */}
      <Section title="Identificação" icon={IdCard}>
        <Field label="Nome">{c.nome}</Field>
        {c.nome_social && <Field label="Nome social">{c.nome_social}</Field>}
        <Field label={isFisica ? "CPF" : "CNPJ"}>
          {c.cpf_cnpj ? <span className="font-mono">{formatCpfCnpj(c.cpf_cnpj)}</span> : "—"}
        </Field>
        {isFisica && (
          <>
            <Field label="Nascimento">
              {c.nascimento ? `${formatDate(c.nascimento)}${idade != null ? ` · ${idade} anos` : ""}` : "—"}
            </Field>
            <Field label="Estado civil">{findLabel(ESTADO_CIVIL_OPTS, c.estado_civil)}</Field>
            <Field label="Escolaridade">{findLabel(ESCOLARIDADE_OPTS, c.escolaridade)}</Field>
          </>
        )}
      </Section>

      {/* Documentos */}
      {isFisica && (c.rg || c.nit_pis || c.cnh_numero) && (
        <Section title="Documentos" icon={IdCard}>
          {c.rg && (
            <Field label="RG">
              {c.rg}
              {c.rg_orgao_emissor && <span className="text-muted-foreground"> · {c.rg_orgao_emissor}</span>}
              {c.rg_data_expedicao && <span className="text-muted-foreground"> · {formatDate(c.rg_data_expedicao)}</span>}
            </Field>
          )}
          {c.nit_pis && <Field label="NIT/PIS">{c.nit_pis}</Field>}
          {c.cnh_numero && (
            <Field label="CNH">
              {c.cnh_numero}
              {c.cnh_categoria && <span className="text-muted-foreground"> · cat. {c.cnh_categoria}</span>}
              {c.cnh_validade && (
                <div className="text-xs text-muted-foreground">Validade: {formatDate(c.cnh_validade)}</div>
              )}
            </Field>
          )}
        </Section>
      )}

      {/* Trabalho e renda */}
      {isFisica && (c.profissao || c.renda_mensal != null) && (
        <Section title="Trabalho e renda" icon={Briefcase}>
          {c.profissao && (
            <Field label="Profissão">
              {c.profissao}
              {c.cbo && <span className="text-muted-foreground"> · CBO {c.cbo}</span>}
            </Field>
          )}
          {c.ultimo_vinculo_emprego && <Field label="Último vínculo">{formatDate(c.ultimo_vinculo_emprego)}</Field>}
          {c.renda_mensal != null && <Field label="Renda mensal">{formatBRL(Number(c.renda_mensal))}</Field>}
          <Field label="Membros da família">
            <span className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {c.membros_familia ?? 1}</span>
          </Field>
          <Field label="Renda per capita">
            <span className={rendaAbaixoMin ? "text-amber-600 font-medium" : ""}>{formatBRL(rendaPC)}</span>
            {rendaAbaixoMin && (
              <span className="block text-xs text-amber-600 mt-0.5 inline-flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Abaixo de 1/4 do SM (BPC/LOAS)
              </span>
            )}
          </Field>
        </Section>
      )}

      {/* Contato */}
      <Section title="Contato" icon={Phone}>
        {c.whatsapp && <Field label="WhatsApp">{formatPhone(c.whatsapp)}</Field>}
        {c.telefone_adicional && <Field label="Telefone adicional">{formatPhone(c.telefone_adicional)}</Field>}
        {c.email && <Field label="E-mail"><span className="break-all">{c.email}</span></Field>}
      </Section>

      {/* Endereço */}
      {(c.endereco || c.cidade || c.cep) && (
        <Section title="Endereço" icon={MapPin}>
          <div className="sm:col-span-3">
            {c.cep && <span className="text-xs text-muted-foreground mr-2">CEP {c.cep}</span>}
            <p className="text-sm">
              {c.endereco}{c.numero ? `, ${c.numero}` : ""}{c.complemento ? ` - ${c.complemento}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              {c.bairro}{c.bairro && c.cidade ? " • " : ""}{c.cidade}{c.estado ? `/${c.estado}` : ""}
            </p>
          </div>
        </Section>
      )}

      {/* Contato de emergência */}
      {c.contato_emergencia_nome && (
        <Section title="Contato de emergência" icon={Heart}>
          <Field label="Nome">{c.contato_emergencia_nome}</Field>
          {c.contato_emergencia_parentesco && <Field label="Parentesco">{c.contato_emergencia_parentesco}</Field>}
          {c.contato_emergencia_telefone && <Field label="Telefone">{formatPhone(c.contato_emergencia_telefone)}</Field>}
        </Section>
      )}

      {/* Responsável legal */}
      {c.responsavel_legal_nome && (
        <Section title="Responsável legal" icon={Users}>
          <Field label="Nome">{c.responsavel_legal_nome}</Field>
          {c.responsavel_legal_cpf && <Field label="CPF">{formatCpfCnpj(c.responsavel_legal_cpf)}</Field>}
          {c.responsavel_legal_parentesco && <Field label="Parentesco">{c.responsavel_legal_parentesco}</Field>}
          {c.responsavel_legal_telefone && <Field label="Telefone">{formatPhone(c.responsavel_legal_telefone)}</Field>}
        </Section>
      )}

      {/* Gestão */}
      <Section title="Gestão" icon={GraduationCap}>
        <Field label="Origem">
          {findLabel(ORIGEM_OPTS, c.origem)}
          {c.origem_detalhe && <span className="text-muted-foreground"> · {c.origem_detalhe}</span>}
        </Field>
        <Field label="Advogado responsável">{advogadoNome ?? "—"}</Field>
        <Field label="Cadastrado em">{formatDate(c.criado_em)}</Field>
        {c.proximo_contato_data && (
          <Field label="Próximo contato">
            <span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gold" /> {formatDate(c.proximo_contato_data)}</span>
            {c.proximo_contato_motivo && <span className="block text-xs text-muted-foreground mt-1">{c.proximo_contato_motivo}</span>}
          </Field>
        )}
      </Section>

      {c.observacoes && (
        <Card className="p-6">
          <h3 className="font-display text-lg mb-3">Observações internas</h3>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{c.observacoes}</p>
        </Card>
      )}
    </div>
  );
}
