export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      andamentos: {
        Row: {
          acao_gerada_id: string | null
          acao_gerada_tipo: string | null
          codigo_movimento: number | null
          complemento_tpu: Json | null
          criado_em: string
          criado_por: string | null
          data: string
          datajud_id: string | null
          descricao: string
          fonte: string
          gera_acao: boolean
          id: string
          processo_id: string
        }
        Insert: {
          acao_gerada_id?: string | null
          acao_gerada_tipo?: string | null
          codigo_movimento?: number | null
          complemento_tpu?: Json | null
          criado_em?: string
          criado_por?: string | null
          data?: string
          datajud_id?: string | null
          descricao: string
          fonte?: string
          gera_acao?: boolean
          id?: string
          processo_id: string
        }
        Update: {
          acao_gerada_id?: string | null
          acao_gerada_tipo?: string | null
          codigo_movimento?: number | null
          complemento_tpu?: Json | null
          criado_em?: string
          criado_por?: string | null
          data?: string
          datajud_id?: string | null
          descricao?: string
          fonte?: string
          gera_acao?: boolean
          id?: string
          processo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "andamentos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      assistente_conversas: {
        Row: {
          arquivada: boolean
          atualizado_em: string
          contexto_usado: Json
          criado_em: string
          id: string
          mensagens: Json
          titulo: string | null
          user_id: string
        }
        Insert: {
          arquivada?: boolean
          atualizado_em?: string
          contexto_usado?: Json
          criado_em?: string
          id?: string
          mensagens?: Json
          titulo?: string | null
          user_id: string
        }
        Update: {
          arquivada?: boolean
          atualizado_em?: string
          contexto_usado?: Json
          criado_em?: string
          id?: string
          mensagens?: Json
          titulo?: string | null
          user_id?: string
        }
        Relationships: []
      }
      auth_login_eventos: {
        Row: {
          contexto: Json | null
          criado_em: string
          email: string | null
          evento: string
          id: string
          motivo: string | null
          portal: string | null
          rota_destino: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          contexto?: Json | null
          criado_em?: string
          email?: string | null
          evento: string
          id?: string
          motivo?: string | null
          portal?: string | null
          rota_destino?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          contexto?: Json | null
          criado_em?: string
          email?: string | null
          evento?: string
          id?: string
          motivo?: string | null
          portal?: string | null
          rota_destino?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bia_preferencias: {
        Row: {
          created_at: string
          estilo: string
          id: string
          instrucoes_extras: string | null
          nivel_autonomia: string
          prazo_padrao_dias: number | null
          prioridade_padrao: string | null
          tipo_item: string
          tom: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          estilo?: string
          id?: string
          instrucoes_extras?: string | null
          nivel_autonomia?: string
          prazo_padrao_dias?: number | null
          prioridade_padrao?: string | null
          tipo_item: string
          tom?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          estilo?: string
          id?: string
          instrucoes_extras?: string | null
          nivel_autonomia?: string
          prazo_padrao_dias?: number | null
          prioridade_padrao?: string | null
          tipo_item?: string
          tom?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      catalogo_servico_documentos: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          metadados: Json
          nome: string
          nome_norm: string | null
          obrigatorio: boolean
          observacao: string | null
          ordem: number
          servico_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          metadados?: Json
          nome: string
          nome_norm?: string | null
          obrigatorio?: boolean
          observacao?: string | null
          ordem?: number
          servico_id: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          metadados?: Json
          nome?: string
          nome_norm?: string | null
          obrigatorio?: boolean
          observacao?: string | null
          ordem?: number
          servico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_servico_documentos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "catalogo_servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_servico_perguntas: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          metadados: Json
          obrigatoria: boolean
          opcoes: Json
          ordem: number
          pergunta: string
          pergunta_norm: string | null
          servico_id: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          metadados?: Json
          obrigatoria?: boolean
          opcoes?: Json
          ordem?: number
          pergunta: string
          pergunta_norm?: string | null
          servico_id: string
          tipo?: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          metadados?: Json
          obrigatoria?: boolean
          opcoes?: Json
          ordem?: number
          pergunta?: string
          pergunta_norm?: string | null
          servico_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_servico_perguntas_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "catalogo_servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_servicos: {
        Row: {
          acao_recomendada: string
          area: string
          area_norm: string | null
          area_sugerida: string | null
          area_sugerida_justificativa: string | null
          ativo_operacional: boolean
          atualizado_em: string
          classificacao: string
          classificacao_justificativa: string | null
          classificacao_sugerida: string
          comercial: Json
          conteudo: Json
          criado_em: string
          criado_por: string | null
          descricao: string | null
          duplicidade_grupo: string | null
          duplicidade_justificativa: string | null
          duplicidade_sugerida: boolean
          duplicidade_sugerida_justificativa: string | null
          id: string
          metadados: Json
          modalidade: string | null
          modalidade_sugerida: string | null
          nome: string
          nome_norm: string | null
          observacao_comercial: string | null
          origem_id: string | null
          origem_tabela: string | null
          origem_texto: string | null
          parceiro_id: string | null
          possivel_duplicidade: boolean
          publico: string
          responsavel_id: string | null
          revisor_id: string | null
          servico_principal_id: string | null
          servico_principal_sugerido_id: string | null
          servico_principal_sugerido_nome: string | null
          sla_dias_uteis: number | null
          sla_metadados: Json
          status_homologacao: string
          subtipo: string | null
          subtipo_norm: string | null
          sugestao_atualizada_em: string | null
          template_id: string | null
          valor_referencia: number | null
        }
        Insert: {
          acao_recomendada?: string
          area: string
          area_norm?: string | null
          area_sugerida?: string | null
          area_sugerida_justificativa?: string | null
          ativo_operacional?: boolean
          atualizado_em?: string
          classificacao?: string
          classificacao_justificativa?: string | null
          classificacao_sugerida?: string
          comercial?: Json
          conteudo?: Json
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          duplicidade_grupo?: string | null
          duplicidade_justificativa?: string | null
          duplicidade_sugerida?: boolean
          duplicidade_sugerida_justificativa?: string | null
          id?: string
          metadados?: Json
          modalidade?: string | null
          modalidade_sugerida?: string | null
          nome: string
          nome_norm?: string | null
          observacao_comercial?: string | null
          origem_id?: string | null
          origem_tabela?: string | null
          origem_texto?: string | null
          parceiro_id?: string | null
          possivel_duplicidade?: boolean
          publico?: string
          responsavel_id?: string | null
          revisor_id?: string | null
          servico_principal_id?: string | null
          servico_principal_sugerido_id?: string | null
          servico_principal_sugerido_nome?: string | null
          sla_dias_uteis?: number | null
          sla_metadados?: Json
          status_homologacao?: string
          subtipo?: string | null
          subtipo_norm?: string | null
          sugestao_atualizada_em?: string | null
          template_id?: string | null
          valor_referencia?: number | null
        }
        Update: {
          acao_recomendada?: string
          area?: string
          area_norm?: string | null
          area_sugerida?: string | null
          area_sugerida_justificativa?: string | null
          ativo_operacional?: boolean
          atualizado_em?: string
          classificacao?: string
          classificacao_justificativa?: string | null
          classificacao_sugerida?: string
          comercial?: Json
          conteudo?: Json
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          duplicidade_grupo?: string | null
          duplicidade_justificativa?: string | null
          duplicidade_sugerida?: boolean
          duplicidade_sugerida_justificativa?: string | null
          id?: string
          metadados?: Json
          modalidade?: string | null
          modalidade_sugerida?: string | null
          nome?: string
          nome_norm?: string | null
          observacao_comercial?: string | null
          origem_id?: string | null
          origem_tabela?: string | null
          origem_texto?: string | null
          parceiro_id?: string | null
          possivel_duplicidade?: boolean
          publico?: string
          responsavel_id?: string | null
          revisor_id?: string | null
          servico_principal_id?: string | null
          servico_principal_sugerido_id?: string | null
          servico_principal_sugerido_nome?: string | null
          sla_dias_uteis?: number | null
          sla_metadados?: Json
          status_homologacao?: string
          subtipo?: string | null
          subtipo_norm?: string | null
          sugestao_atualizada_em?: string | null
          template_id?: string | null
          valor_referencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_servicos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogo_servicos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogo_servicos_revisor_id_fkey"
            columns: ["revisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogo_servicos_servico_principal_id_fkey"
            columns: ["servico_principal_id"]
            isOneToOne: false
            referencedRelation: "catalogo_servicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogo_servicos_servico_principal_sugerido_id_fkey"
            columns: ["servico_principal_sugerido_id"]
            isOneToOne: false
            referencedRelation: "catalogo_servicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogo_servicos_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "fluxos_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_diligencias: {
        Row: {
          atualizado_em: string
          base_legal: string | null
          categoria: string
          concluido_em: string | null
          concluido_por: string | null
          criado_em: string
          criado_por: string | null
          data_sugerida: string | null
          descricao: string | null
          id: string
          item_controladoria_id: string | null
          observacoes: string | null
          ordem: number
          origem: string
          prazo_dias: number | null
          prazo_tipo: string | null
          prioridade: string
          processo_id: string
          status: string
          titulo: string
          visivel_cliente: boolean
        }
        Insert: {
          atualizado_em?: string
          base_legal?: string | null
          categoria?: string
          concluido_em?: string | null
          concluido_por?: string | null
          criado_em?: string
          criado_por?: string | null
          data_sugerida?: string | null
          descricao?: string | null
          id?: string
          item_controladoria_id?: string | null
          observacoes?: string | null
          ordem?: number
          origem?: string
          prazo_dias?: number | null
          prazo_tipo?: string | null
          prioridade?: string
          processo_id: string
          status?: string
          titulo: string
          visivel_cliente?: boolean
        }
        Update: {
          atualizado_em?: string
          base_legal?: string | null
          categoria?: string
          concluido_em?: string | null
          concluido_por?: string | null
          criado_em?: string
          criado_por?: string | null
          data_sugerida?: string | null
          descricao?: string | null
          id?: string
          item_controladoria_id?: string | null
          observacoes?: string | null
          ordem?: number
          origem?: string
          prazo_dias?: number | null
          prazo_tipo?: string | null
          prioridade?: string
          processo_id?: string
          status?: string
          titulo?: string
          visivel_cliente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "checklist_diligencias_item_controladoria_id_fkey"
            columns: ["item_controladoria_id"]
            isOneToOne: false
            referencedRelation: "controladoria_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_diligencias_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_atendimentos: {
        Row: {
          analisado_em: string | null
          area: string | null
          atualizado_em: string
          cliente_id: string
          convertido_em: string | null
          convertido_tipo: string | null
          criado_em: string
          criado_por: string | null
          dados_estruturados: Json
          documentos_faltantes: Json
          estrategia: string | null
          evidencias: Json
          fatos: string | null
          ferramenta: string | null
          fundamentacao_legal: Json
          id: string
          informacoes_brutas: string | null
          item_controladoria_id: string | null
          link: string | null
          metadados: Json | null
          origem: string
          partes: Json
          pedidos: Json
          processo_id: string | null
          proximos_passos: Json
          qualificacao: Json
          resumo: string
          resumo_ia: string | null
          riscos: Json
          status: string
          subtipo: string | null
          tese_juridica: string | null
          titulo: string
          urgencia: string | null
        }
        Insert: {
          analisado_em?: string | null
          area?: string | null
          atualizado_em?: string
          cliente_id: string
          convertido_em?: string | null
          convertido_tipo?: string | null
          criado_em?: string
          criado_por?: string | null
          dados_estruturados?: Json
          documentos_faltantes?: Json
          estrategia?: string | null
          evidencias?: Json
          fatos?: string | null
          ferramenta?: string | null
          fundamentacao_legal?: Json
          id?: string
          informacoes_brutas?: string | null
          item_controladoria_id?: string | null
          link?: string | null
          metadados?: Json | null
          origem?: string
          partes?: Json
          pedidos?: Json
          processo_id?: string | null
          proximos_passos?: Json
          qualificacao?: Json
          resumo: string
          resumo_ia?: string | null
          riscos?: Json
          status?: string
          subtipo?: string | null
          tese_juridica?: string | null
          titulo: string
          urgencia?: string | null
        }
        Update: {
          analisado_em?: string | null
          area?: string | null
          atualizado_em?: string
          cliente_id?: string
          convertido_em?: string | null
          convertido_tipo?: string | null
          criado_em?: string
          criado_por?: string | null
          dados_estruturados?: Json
          documentos_faltantes?: Json
          estrategia?: string | null
          evidencias?: Json
          fatos?: string | null
          ferramenta?: string | null
          fundamentacao_legal?: Json
          id?: string
          informacoes_brutas?: string | null
          item_controladoria_id?: string | null
          link?: string | null
          metadados?: Json | null
          origem?: string
          partes?: Json
          pedidos?: Json
          processo_id?: string | null
          proximos_passos?: Json
          qualificacao?: Json
          resumo?: string
          resumo_ia?: string | null
          riscos?: Json
          status?: string
          subtipo?: string | null
          tese_juridica?: string | null
          titulo?: string
          urgencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_atendimentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_atendimentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_atendimentos_item_controladoria_id_fkey"
            columns: ["item_controladoria_id"]
            isOneToOne: false
            referencedRelation: "controladoria_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_atendimentos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_beneficios_inss: {
        Row: {
          atualizado_em: string
          cliente_id: string
          competencia_inicio: string | null
          criado_em: string
          der: string | null
          dib: string | null
          id: string
          nb: string
          observacao: string | null
          status: string
          tipo_beneficio: string
          valor_mensal: number | null
        }
        Insert: {
          atualizado_em?: string
          cliente_id: string
          competencia_inicio?: string | null
          criado_em?: string
          der?: string | null
          dib?: string | null
          id?: string
          nb: string
          observacao?: string | null
          status?: string
          tipo_beneficio: string
          valor_mensal?: number | null
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string
          competencia_inicio?: string | null
          criado_em?: string
          der?: string | null
          dib?: string | null
          id?: string
          nb?: string
          observacao?: string | null
          status?: string
          tipo_beneficio?: string
          valor_mensal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_beneficios_inss_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_beneficios_inss_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_credenciais: {
        Row: {
          atualizado_em: string
          cliente_id: string
          criado_em: string
          criado_por: string | null
          id: string
          identificador: string | null
          observacoes: string | null
          senha_cifrada: string
          sistema: string
          tipo: string
          ultima_atualizacao_senha: string | null
          url: string | null
          validade: string | null
        }
        Insert: {
          atualizado_em?: string
          cliente_id: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          identificador?: string | null
          observacoes?: string | null
          senha_cifrada: string
          sistema: string
          tipo?: string
          ultima_atualizacao_senha?: string | null
          url?: string | null
          validade?: string | null
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          identificador?: string | null
          observacoes?: string | null
          senha_cifrada?: string
          sistema?: string
          tipo?: string
          ultima_atualizacao_senha?: string | null
          url?: string | null
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_credenciais_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_credenciais_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_credenciais_acesso_log: {
        Row: {
          acao: string
          credencial_id: string
          criado_em: string
          id: string
          user_id: string
        }
        Insert: {
          acao?: string
          credencial_id: string
          criado_em?: string
          id?: string
          user_id: string
        }
        Update: {
          acao?: string
          credencial_id?: string
          criado_em?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_credenciais_acesso_log_credencial_id_fkey"
            columns: ["credencial_id"]
            isOneToOne: false
            referencedRelation: "cliente_credenciais"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_ficha_documentos: {
        Row: {
          atendimento_id: string
          cliente_id: string
          criado_em: string
          enviado_por: string | null
          id: string
          mime_type: string | null
          nome: string
          resumo_ia: string | null
          storage_path: string
          tamanho_bytes: number | null
          tipo: string | null
        }
        Insert: {
          atendimento_id: string
          cliente_id: string
          criado_em?: string
          enviado_por?: string | null
          id?: string
          mime_type?: string | null
          nome: string
          resumo_ia?: string | null
          storage_path: string
          tamanho_bytes?: number | null
          tipo?: string | null
        }
        Update: {
          atendimento_id?: string
          cliente_id?: string
          criado_em?: string
          enviado_por?: string | null
          id?: string
          mime_type?: string | null
          nome?: string
          resumo_ia?: string | null
          storage_path?: string
          tamanho_bytes?: number | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_ficha_documentos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "cliente_atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_interacoes: {
        Row: {
          cliente_id: string
          criado_em: string
          criado_por: string | null
          data: string
          descricao: string
          id: string
          tipo: string
        }
        Insert: {
          cliente_id: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          descricao: string
          id?: string
          tipo: string
        }
        Update: {
          cliente_id?: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          descricao?: string
          id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_interacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_interacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_portal_andamentos: {
        Row: {
          andamento_id: string
          atualizado_em: string
          cliente_id: string
          id: string
          liberado_em: string
          liberado_por: string | null
          observacao_cliente: string | null
          visivel: boolean
        }
        Insert: {
          andamento_id: string
          atualizado_em?: string
          cliente_id: string
          id?: string
          liberado_em?: string
          liberado_por?: string | null
          observacao_cliente?: string | null
          visivel?: boolean
        }
        Update: {
          andamento_id?: string
          atualizado_em?: string
          cliente_id?: string
          id?: string
          liberado_em?: string
          liberado_por?: string | null
          observacao_cliente?: string | null
          visivel?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cliente_portal_andamentos_andamento_id_fkey"
            columns: ["andamento_id"]
            isOneToOne: false
            referencedRelation: "andamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_andamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_andamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_portal_atualizacoes: {
        Row: {
          atualizado_em: string
          cliente_id: string
          criado_em: string
          criado_por: string | null
          id: string
          processo_id: string
          proximos_passos: string | null
          publicado: boolean
          publicado_em: string | null
          publicado_por: string | null
          texto_juridico: string | null
          texto_simples: string
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          cliente_id: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          processo_id: string
          proximos_passos?: string | null
          publicado?: boolean
          publicado_em?: string | null
          publicado_por?: string | null
          texto_juridico?: string | null
          texto_simples: string
          titulo: string
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          processo_id?: string
          proximos_passos?: string | null
          publicado?: boolean
          publicado_em?: string | null
          publicado_por?: string | null
          texto_juridico?: string | null
          texto_simples?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_portal_atualizacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_atualizacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_atualizacoes_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_portal_documentos: {
        Row: {
          cliente_id: string
          documento_id: string | null
          id: string
          liberado_em: string
          liberado_por: string | null
          nome_exibicao: string
          pode_download: boolean
          processo_id: string | null
        }
        Insert: {
          cliente_id: string
          documento_id?: string | null
          id?: string
          liberado_em?: string
          liberado_por?: string | null
          nome_exibicao: string
          pode_download?: boolean
          processo_id?: string | null
        }
        Update: {
          cliente_id?: string
          documento_id?: string | null
          id?: string
          liberado_em?: string
          liberado_por?: string | null
          nome_exibicao?: string
          pode_download?: boolean
          processo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_portal_documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_documentos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_documentos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_portal_financeiro: {
        Row: {
          atualizado_em: string
          cliente_id: string
          contrato_id: string
          id: string
          liberado_em: string
          liberado_por: string | null
          visivel: boolean
        }
        Insert: {
          atualizado_em?: string
          cliente_id: string
          contrato_id: string
          id?: string
          liberado_em?: string
          liberado_por?: string | null
          visivel?: boolean
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string
          contrato_id?: string
          id?: string
          liberado_em?: string
          liberado_por?: string | null
          visivel?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cliente_portal_financeiro_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_financeiro_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_financeiro_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "honorarios_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_portal_mensagens: {
        Row: {
          cliente_id: string
          criado_em: string
          id: string
          lida: boolean
          lida_em: string | null
          processo_id: string | null
          remetente_id: string | null
          remetente_tipo: string
          texto: string
        }
        Insert: {
          cliente_id: string
          criado_em?: string
          id?: string
          lida?: boolean
          lida_em?: string | null
          processo_id?: string | null
          remetente_id?: string | null
          remetente_tipo: string
          texto: string
        }
        Update: {
          cliente_id?: string
          criado_em?: string
          id?: string
          lida?: boolean
          lida_em?: string | null
          processo_id?: string | null
          remetente_id?: string | null
          remetente_tipo?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_portal_mensagens_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_mensagens_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_mensagens_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_portal_processos: {
        Row: {
          atualizado_em: string
          cid_codigo: string | null
          cid_descricao: string | null
          cliente_id: string
          fase_atual_explicacao: string | null
          ficha_atualizada_em: string | null
          id: string
          liberado_em: string
          liberado_por: string | null
          mostrar_andamentos: boolean
          mostrar_documentos: boolean
          motivo_negativa: string | null
          notificar_cliente_mudancas: boolean
          processo_id: string
          proximas_etapas: string[] | null
          resumo_cliente: string | null
          tipo_beneficio: string | null
          via_processual: string | null
          visivel: boolean
        }
        Insert: {
          atualizado_em?: string
          cid_codigo?: string | null
          cid_descricao?: string | null
          cliente_id: string
          fase_atual_explicacao?: string | null
          ficha_atualizada_em?: string | null
          id?: string
          liberado_em?: string
          liberado_por?: string | null
          mostrar_andamentos?: boolean
          mostrar_documentos?: boolean
          motivo_negativa?: string | null
          notificar_cliente_mudancas?: boolean
          processo_id: string
          proximas_etapas?: string[] | null
          resumo_cliente?: string | null
          tipo_beneficio?: string | null
          via_processual?: string | null
          visivel?: boolean
        }
        Update: {
          atualizado_em?: string
          cid_codigo?: string | null
          cid_descricao?: string | null
          cliente_id?: string
          fase_atual_explicacao?: string | null
          ficha_atualizada_em?: string | null
          id?: string
          liberado_em?: string
          liberado_por?: string | null
          mostrar_andamentos?: boolean
          mostrar_documentos?: boolean
          motivo_negativa?: string | null
          notificar_cliente_mudancas?: boolean
          processo_id?: string
          proximas_etapas?: string[] | null
          resumo_cliente?: string | null
          tipo_beneficio?: string | null
          via_processual?: string | null
          visivel?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cliente_portal_processos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_processos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_processos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_unificacoes: {
        Row: {
          cliente_mantido_id: string
          cliente_removido_id: string
          cliente_removido_snapshot: Json
          id: string
          registros_movidos: Json
          unificado_em: string
          unificado_por: string | null
        }
        Insert: {
          cliente_mantido_id: string
          cliente_removido_id: string
          cliente_removido_snapshot: Json
          id?: string
          registros_movidos?: Json
          unificado_em?: string
          unificado_por?: string | null
        }
        Update: {
          cliente_mantido_id?: string
          cliente_removido_id?: string
          cliente_removido_snapshot?: Json
          id?: string
          registros_movidos?: Json
          unificado_em?: string
          unificado_por?: string | null
        }
        Relationships: []
      }
      cliente_usuarios: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cliente_id: string
          criado_em: string
          criado_por: string | null
          email: string
          id: string
          mostrar_financeiro: boolean
          primeiro_acesso: boolean
          ultimo_acesso: string | null
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cliente_id: string
          criado_em?: string
          criado_por?: string | null
          email: string
          id?: string
          mostrar_financeiro?: boolean
          primeiro_acesso?: boolean
          ultimo_acesso?: string | null
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cliente_id?: string
          criado_em?: string
          criado_por?: string | null
          email?: string
          id?: string
          mostrar_financeiro?: boolean
          primeiro_acesso?: boolean
          ultimo_acesso?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_usuarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_usuarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          advogado_responsavel_id: string | null
          ativo: boolean
          atualizado_em: string
          autoriza_parceiro_ver_whatsapp: boolean
          bairro: string | null
          campanha_origem: string | null
          cbo: string | null
          cep: string | null
          cidade: string | null
          cnh_categoria: string | null
          cnh_numero: string | null
          cnh_validade: string | null
          como_chegou: string | null
          complemento: string | null
          contato_emergencia_nome: string | null
          contato_emergencia_parentesco: string | null
          contato_emergencia_telefone: string | null
          cpf_cnpj: string | null
          criado_em: string
          criado_por: string | null
          email: string | null
          endereco: string | null
          escolaridade: string | null
          estado: string | null
          estado_civil: string | null
          id: string
          lead_origem_id: string | null
          membros_familia: number | null
          nascimento: string | null
          nit_pis: string | null
          nome: string
          nome_social: string | null
          numero: string | null
          observacoes: string | null
          origem: string | null
          origem_detalhe: string | null
          parceiro_indicacao: string | null
          profissao: string | null
          proximo_contato_data: string | null
          proximo_contato_motivo: string | null
          renda_mensal: number | null
          renda_per_capita: number | null
          responsavel_legal_cpf: string | null
          responsavel_legal_nome: string | null
          responsavel_legal_parentesco: string | null
          responsavel_legal_telefone: string | null
          rg: string | null
          rg_data_expedicao: string | null
          rg_orgao_emissor: string | null
          status: string | null
          telefone_adicional: string | null
          telefones: string[] | null
          tipo_pessoa: string
          ultimo_vinculo_emprego: string | null
          whatsapp: string | null
        }
        Insert: {
          advogado_responsavel_id?: string | null
          ativo?: boolean
          atualizado_em?: string
          autoriza_parceiro_ver_whatsapp?: boolean
          bairro?: string | null
          campanha_origem?: string | null
          cbo?: string | null
          cep?: string | null
          cidade?: string | null
          cnh_categoria?: string | null
          cnh_numero?: string | null
          cnh_validade?: string | null
          como_chegou?: string | null
          complemento?: string | null
          contato_emergencia_nome?: string | null
          contato_emergencia_parentesco?: string | null
          contato_emergencia_telefone?: string | null
          cpf_cnpj?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          endereco?: string | null
          escolaridade?: string | null
          estado?: string | null
          estado_civil?: string | null
          id?: string
          lead_origem_id?: string | null
          membros_familia?: number | null
          nascimento?: string | null
          nit_pis?: string | null
          nome: string
          nome_social?: string | null
          numero?: string | null
          observacoes?: string | null
          origem?: string | null
          origem_detalhe?: string | null
          parceiro_indicacao?: string | null
          profissao?: string | null
          proximo_contato_data?: string | null
          proximo_contato_motivo?: string | null
          renda_mensal?: number | null
          renda_per_capita?: number | null
          responsavel_legal_cpf?: string | null
          responsavel_legal_nome?: string | null
          responsavel_legal_parentesco?: string | null
          responsavel_legal_telefone?: string | null
          rg?: string | null
          rg_data_expedicao?: string | null
          rg_orgao_emissor?: string | null
          status?: string | null
          telefone_adicional?: string | null
          telefones?: string[] | null
          tipo_pessoa?: string
          ultimo_vinculo_emprego?: string | null
          whatsapp?: string | null
        }
        Update: {
          advogado_responsavel_id?: string | null
          ativo?: boolean
          atualizado_em?: string
          autoriza_parceiro_ver_whatsapp?: boolean
          bairro?: string | null
          campanha_origem?: string | null
          cbo?: string | null
          cep?: string | null
          cidade?: string | null
          cnh_categoria?: string | null
          cnh_numero?: string | null
          cnh_validade?: string | null
          como_chegou?: string | null
          complemento?: string | null
          contato_emergencia_nome?: string | null
          contato_emergencia_parentesco?: string | null
          contato_emergencia_telefone?: string | null
          cpf_cnpj?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          endereco?: string | null
          escolaridade?: string | null
          estado?: string | null
          estado_civil?: string | null
          id?: string
          lead_origem_id?: string | null
          membros_familia?: number | null
          nascimento?: string | null
          nit_pis?: string | null
          nome?: string
          nome_social?: string | null
          numero?: string | null
          observacoes?: string | null
          origem?: string | null
          origem_detalhe?: string | null
          parceiro_indicacao?: string | null
          profissao?: string | null
          proximo_contato_data?: string | null
          proximo_contato_motivo?: string | null
          renda_mensal?: number | null
          renda_per_capita?: number | null
          responsavel_legal_cpf?: string | null
          responsavel_legal_nome?: string | null
          responsavel_legal_parentesco?: string | null
          responsavel_legal_telefone?: string | null
          rg?: string | null
          rg_data_expedicao?: string | null
          rg_orgao_emissor?: string | null
          status?: string | null
          telefone_adicional?: string | null
          telefones?: string[] | null
          tipo_pessoa?: string
          ultimo_vinculo_emprego?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_campanha_origem_fkey"
            columns: ["campanha_origem"]
            isOneToOne: false
            referencedRelation: "mkt_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_lead_origem_id_fkey"
            columns: ["lead_origem_id"]
            isOneToOne: false
            referencedRelation: "mkt_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_parceiro_indicacao_fkey"
            columns: ["parceiro_indicacao"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes_comissoes_fechamento: {
        Row: {
          atualizado_em: string
          cliente_id: string
          contrato_id: string | null
          criado_em: string
          criado_por: string | null
          data_confirmacao: string | null
          fechador_user_id: string
          id: string
          lancado_em: string | null
          lancado_por: string | null
          observacao: string | null
          percentual: number | null
          status: Database["public"]["Enums"]["status_comissao_fechamento"]
          valor_base: number | null
          valor_comissao: number | null
        }
        Insert: {
          atualizado_em?: string
          cliente_id: string
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_confirmacao?: string | null
          fechador_user_id: string
          id?: string
          lancado_em?: string | null
          lancado_por?: string | null
          observacao?: string | null
          percentual?: number | null
          status?: Database["public"]["Enums"]["status_comissao_fechamento"]
          valor_base?: number | null
          valor_comissao?: number | null
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_confirmacao?: string | null
          fechador_user_id?: string
          id?: string
          lancado_em?: string | null
          lancado_por?: string | null
          observacao?: string | null
          percentual?: number | null
          status?: Database["public"]["Enums"]["status_comissao_fechamento"]
          valor_base?: number | null
          valor_comissao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_comissoes_fechamento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_comissoes_fechamento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_comissoes_fechamento_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "honorarios_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes: {
        Row: {
          beneficiario: string
          caso_id: string | null
          created_at: string
          created_by: string | null
          data_competencia: string
          data_pagamento: string | null
          evento_gerador: Database["public"]["Enums"]["comissao_evento"]
          forma_pagamento: string | null
          id: string
          observacao: string | null
          percentual_aplicado: number | null
          status: Database["public"]["Enums"]["comissao_status"]
          tipo_beneficiario: Database["public"]["Enums"]["comissao_beneficiario_tipo"]
          updated_at: string
          valor_comissao: number
          valor_honorarios: number
        }
        Insert: {
          beneficiario: string
          caso_id?: string | null
          created_at?: string
          created_by?: string | null
          data_competencia: string
          data_pagamento?: string | null
          evento_gerador: Database["public"]["Enums"]["comissao_evento"]
          forma_pagamento?: string | null
          id?: string
          observacao?: string | null
          percentual_aplicado?: number | null
          status?: Database["public"]["Enums"]["comissao_status"]
          tipo_beneficiario: Database["public"]["Enums"]["comissao_beneficiario_tipo"]
          updated_at?: string
          valor_comissao: number
          valor_honorarios: number
        }
        Update: {
          beneficiario?: string
          caso_id?: string | null
          created_at?: string
          created_by?: string | null
          data_competencia?: string
          data_pagamento?: string | null
          evento_gerador?: Database["public"]["Enums"]["comissao_evento"]
          forma_pagamento?: string | null
          id?: string
          observacao?: string | null
          percentual_aplicado?: number | null
          status?: Database["public"]["Enums"]["comissao_status"]
          tipo_beneficiario?: Database["public"]["Enums"]["comissao_beneficiario_tipo"]
          updated_at?: string
          valor_comissao?: number
          valor_honorarios?: number
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicacoes_cliente: {
        Row: {
          atualizado_em: string
          cliente_id: string | null
          comunicado_em: string | null
          comunicado_por: string | null
          criado_em: string
          id: string
          item_id: string
          observacao: string | null
          origem: string
          processo_id: string | null
          responsavel_id: string | null
          sla_limite_em: string | null
          sla_preferencial_em: string | null
          status: string
        }
        Insert: {
          atualizado_em?: string
          cliente_id?: string | null
          comunicado_em?: string | null
          comunicado_por?: string | null
          criado_em?: string
          id?: string
          item_id: string
          observacao?: string | null
          origem?: string
          processo_id?: string | null
          responsavel_id?: string | null
          sla_limite_em?: string | null
          sla_preferencial_em?: string | null
          status?: string
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string | null
          comunicado_em?: string | null
          comunicado_por?: string | null
          criado_em?: string
          id?: string
          item_id?: string
          observacao?: string | null
          origem?: string
          processo_id?: string | null
          responsavel_id?: string | null
          sla_limite_em?: string | null
          sla_preferencial_em?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicacoes_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacoes_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacoes_cliente_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "controladoria_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacoes_cliente_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_sistema: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          criado_em: string
          descricao: string | null
          editavel_por: string
          id: string
          publica: boolean
          secao: string
          tipo: string
          valor: string | null
          valor_json: Json | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          criado_em?: string
          descricao?: string | null
          editavel_por?: string
          id?: string
          publica?: boolean
          secao: string
          tipo?: string
          valor?: string | null
          valor_json?: Json | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          criado_em?: string
          descricao?: string | null
          editavel_por?: string
          id?: string
          publica?: boolean
          secao?: string
          tipo?: string
          valor?: string | null
          valor_json?: Json | null
        }
        Relationships: []
      }
      controladoria_comentarios: {
        Row: {
          arquivos: Json | null
          criado_em: string
          id: string
          item_id: string | null
          processo_id: string | null
          texto: string
          user_id: string
        }
        Insert: {
          arquivos?: Json | null
          criado_em?: string
          id?: string
          item_id?: string | null
          processo_id?: string | null
          texto: string
          user_id: string
        }
        Update: {
          arquivos?: Json | null
          criado_em?: string
          id?: string
          item_id?: string | null
          processo_id?: string | null
          texto?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "controladoria_comentarios_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "controladoria_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controladoria_comentarios_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      controladoria_etapas_historico: {
        Row: {
          created_at: string
          criado_por: string | null
          etapa: string
          finalizada_em: string | null
          id: string
          iniciada_em: string
          item_id: string
          observacao: string | null
          responsavel_id: string | null
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          etapa: string
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          item_id: string
          observacao?: string | null
          responsavel_id?: string | null
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          etapa?: string
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          item_id?: string
          observacao?: string | null
          responsavel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "controladoria_etapas_historico_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "controladoria_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      controladoria_google_eventos: {
        Row: {
          criado_em: string
          google_calendar_id: string
          google_event_id: string
          item_id: string
          ultimo_erro: string | null
          ultimo_sync: string
        }
        Insert: {
          criado_em?: string
          google_calendar_id?: string
          google_event_id: string
          item_id: string
          ultimo_erro?: string | null
          ultimo_sync?: string
        }
        Update: {
          criado_em?: string
          google_calendar_id?: string
          google_event_id?: string
          item_id?: string
          ultimo_erro?: string | null
          ultimo_sync?: string
        }
        Relationships: [
          {
            foreignKeyName: "controladoria_google_eventos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "controladoria_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      controladoria_itens: {
        Row: {
          alerta_1dia_enviado: boolean
          alerta_3dias_enviado: boolean
          alerta_atraso_enviado: boolean
          anotacoes_revisao: string | null
          atualizado_em: string
          cancelado_motivo: string | null
          cliente_confirmado: boolean
          cliente_id: string | null
          coluna_kanban: string
          comentario_revisao: string | null
          concluido_em: string | null
          concluido_por: string | null
          corretor_id: string | null
          criado_em: string
          criado_por: string | null
          data_inicio: string | null
          data_intimacao: string | null
          data_vencimento: string
          descricao: string | null
          documentos_entregues: string | null
          documentos_recebidos: string | null
          etapa_atualizada_em: string
          etapa_workflow: string
          executor_id: string | null
          exige_revisao: boolean
          id: string
          juiz: string | null
          link_virtual: string | null
          local: string | null
          o_que_levar: string | null
          orientacoes: string | null
          origem: string
          origem_atendimento_id: string | null
          prioridade: Database["public"]["Enums"]["prioridade"]
          processo_id: string | null
          protocolador_id: string | null
          proximo_passo: string | null
          responsavel_id: string | null
          resultado: string | null
          revisor_id: string | null
          sla_entrada_em: string | null
          sla_minutos_pausados: number
          sla_pausa_motivo: string | null
          sla_pausado_em: string | null
          sla_previsto_em: string | null
          sla_status: string
          status: Database["public"]["Enums"]["status_item"]
          tarefa_origem_id: string | null
          tipo: Database["public"]["Enums"]["tipo_item_controladoria"]
          tipo_prazo_id: string | null
          titulo: string
          vara: string | null
          visivel_parceiro: boolean
        }
        Insert: {
          alerta_1dia_enviado?: boolean
          alerta_3dias_enviado?: boolean
          alerta_atraso_enviado?: boolean
          anotacoes_revisao?: string | null
          atualizado_em?: string
          cancelado_motivo?: string | null
          cliente_confirmado?: boolean
          cliente_id?: string | null
          coluna_kanban?: string
          comentario_revisao?: string | null
          concluido_em?: string | null
          concluido_por?: string | null
          corretor_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_inicio?: string | null
          data_intimacao?: string | null
          data_vencimento: string
          descricao?: string | null
          documentos_entregues?: string | null
          documentos_recebidos?: string | null
          etapa_atualizada_em?: string
          etapa_workflow?: string
          executor_id?: string | null
          exige_revisao?: boolean
          id?: string
          juiz?: string | null
          link_virtual?: string | null
          local?: string | null
          o_que_levar?: string | null
          orientacoes?: string | null
          origem?: string
          origem_atendimento_id?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade"]
          processo_id?: string | null
          protocolador_id?: string | null
          proximo_passo?: string | null
          responsavel_id?: string | null
          resultado?: string | null
          revisor_id?: string | null
          sla_entrada_em?: string | null
          sla_minutos_pausados?: number
          sla_pausa_motivo?: string | null
          sla_pausado_em?: string | null
          sla_previsto_em?: string | null
          sla_status?: string
          status?: Database["public"]["Enums"]["status_item"]
          tarefa_origem_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_item_controladoria"]
          tipo_prazo_id?: string | null
          titulo: string
          vara?: string | null
          visivel_parceiro?: boolean
        }
        Update: {
          alerta_1dia_enviado?: boolean
          alerta_3dias_enviado?: boolean
          alerta_atraso_enviado?: boolean
          anotacoes_revisao?: string | null
          atualizado_em?: string
          cancelado_motivo?: string | null
          cliente_confirmado?: boolean
          cliente_id?: string | null
          coluna_kanban?: string
          comentario_revisao?: string | null
          concluido_em?: string | null
          concluido_por?: string | null
          corretor_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_inicio?: string | null
          data_intimacao?: string | null
          data_vencimento?: string
          descricao?: string | null
          documentos_entregues?: string | null
          documentos_recebidos?: string | null
          etapa_atualizada_em?: string
          etapa_workflow?: string
          executor_id?: string | null
          exige_revisao?: boolean
          id?: string
          juiz?: string | null
          link_virtual?: string | null
          local?: string | null
          o_que_levar?: string | null
          orientacoes?: string | null
          origem?: string
          origem_atendimento_id?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade"]
          processo_id?: string | null
          protocolador_id?: string | null
          proximo_passo?: string | null
          responsavel_id?: string | null
          resultado?: string | null
          revisor_id?: string | null
          sla_entrada_em?: string | null
          sla_minutos_pausados?: number
          sla_pausa_motivo?: string | null
          sla_pausado_em?: string | null
          sla_previsto_em?: string | null
          sla_status?: string
          status?: Database["public"]["Enums"]["status_item"]
          tarefa_origem_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_item_controladoria"]
          tipo_prazo_id?: string | null
          titulo?: string
          vara?: string | null
          visivel_parceiro?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "controladoria_itens_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controladoria_itens_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controladoria_itens_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controladoria_itens_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controladoria_itens_tarefa_origem_id_fkey"
            columns: ["tarefa_origem_id"]
            isOneToOne: false
            referencedRelation: "controladoria_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controladoria_itens_tipo_prazo_id_fkey"
            columns: ["tipo_prazo_id"]
            isOneToOne: false
            referencedRelation: "tipos_prazo"
            referencedColumns: ["id"]
          },
        ]
      }
      controladoria_responsaveis: {
        Row: {
          item_id: string
          papel: Database["public"]["Enums"]["papel_responsavel"]
          user_id: string
        }
        Insert: {
          item_id: string
          papel?: Database["public"]["Enums"]["papel_responsavel"]
          user_id: string
        }
        Update: {
          item_id?: string
          papel?: Database["public"]["Enums"]["papel_responsavel"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "controladoria_responsaveis_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "controladoria_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      datajud_log_execucoes: {
        Row: {
          detalhes: Json | null
          disparado_por: string | null
          duracao_ms: number | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          modo: string
          total_acoes_geradas: number
          total_andamentos_novos: number
          total_consultados: number
          total_erros: number
        }
        Insert: {
          detalhes?: Json | null
          disparado_por?: string | null
          duracao_ms?: number | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          modo?: string
          total_acoes_geradas?: number
          total_andamentos_novos?: number
          total_consultados?: number
          total_erros?: number
        }
        Update: {
          detalhes?: Json | null
          disparado_por?: string | null
          duracao_ms?: number | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          modo?: string
          total_acoes_geradas?: number
          total_andamentos_novos?: number
          total_consultados?: number
          total_erros?: number
        }
        Relationships: []
      }
      datajud_regras_acao: {
        Row: {
          acao: string
          ativo: boolean
          atualizado_em: string
          codigo_movimento: number
          criado_em: string
          fluxo_template_id: string | null
          id: string
          nome_movimento: string
          prazo_dias: number | null
          prazo_tipo: string | null
          prioridade: Database["public"]["Enums"]["prioridade"]
          titulo_tarefa: string | null
        }
        Insert: {
          acao: string
          ativo?: boolean
          atualizado_em?: string
          codigo_movimento: number
          criado_em?: string
          fluxo_template_id?: string | null
          id?: string
          nome_movimento: string
          prazo_dias?: number | null
          prazo_tipo?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade"]
          titulo_tarefa?: string | null
        }
        Update: {
          acao?: string
          ativo?: boolean
          atualizado_em?: string
          codigo_movimento?: number
          criado_em?: string
          fluxo_template_id?: string | null
          id?: string
          nome_movimento?: string
          prazo_dias?: number | null
          prazo_tipo?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade"]
          titulo_tarefa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "datajud_regras_acao_fluxo_template_id_fkey"
            columns: ["fluxo_template_id"]
            isOneToOne: false
            referencedRelation: "fluxos_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      dje_analises: {
        Row: {
          arquivo_nome: string | null
          arquivo_path: string | null
          atualizado_em: string
          criado_em: string
          criado_por: string
          erro: string | null
          id: string
          modelo_ia: string | null
          origem: string
          status: string
          texto_bruto: string | null
          titulo: string
          total_itens: number
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_path?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por: string
          erro?: string | null
          id?: string
          modelo_ia?: string | null
          origem: string
          status?: string
          texto_bruto?: string | null
          titulo: string
          total_itens?: number
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_path?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por?: string
          erro?: string | null
          id?: string
          modelo_ia?: string | null
          origem?: string
          status?: string
          texto_bruto?: string | null
          titulo?: string
          total_itens?: number
        }
        Relationships: []
      }
      dje_itens_extraidos: {
        Row: {
          advogados: Json
          analise_id: string
          atualizado_em: string
          cliente_id: string | null
          confianca: number | null
          criado_em: string
          data_publicacao: string | null
          id: string
          intimados: Json
          item_controladoria_id: string | null
          numero_processo: string | null
          numero_processo_normalizado: string | null
          observacoes: string | null
          ordem: number
          orgao_julgador: string | null
          partes: Json
          prazo_base_legal: string | null
          prazo_dias: number | null
          prazo_tipo: string | null
          processo_id: string | null
          resumo_simples: string | null
          status_revisao: string
          tipo_ato: string | null
          trecho_original: string | null
          tribunal: string | null
        }
        Insert: {
          advogados?: Json
          analise_id: string
          atualizado_em?: string
          cliente_id?: string | null
          confianca?: number | null
          criado_em?: string
          data_publicacao?: string | null
          id?: string
          intimados?: Json
          item_controladoria_id?: string | null
          numero_processo?: string | null
          numero_processo_normalizado?: string | null
          observacoes?: string | null
          ordem?: number
          orgao_julgador?: string | null
          partes?: Json
          prazo_base_legal?: string | null
          prazo_dias?: number | null
          prazo_tipo?: string | null
          processo_id?: string | null
          resumo_simples?: string | null
          status_revisao?: string
          tipo_ato?: string | null
          trecho_original?: string | null
          tribunal?: string | null
        }
        Update: {
          advogados?: Json
          analise_id?: string
          atualizado_em?: string
          cliente_id?: string | null
          confianca?: number | null
          criado_em?: string
          data_publicacao?: string | null
          id?: string
          intimados?: Json
          item_controladoria_id?: string | null
          numero_processo?: string | null
          numero_processo_normalizado?: string | null
          observacoes?: string | null
          ordem?: number
          orgao_julgador?: string | null
          partes?: Json
          prazo_base_legal?: string | null
          prazo_dias?: number | null
          prazo_tipo?: string | null
          processo_id?: string | null
          resumo_simples?: string | null
          status_revisao?: string
          tipo_ato?: string | null
          trecho_original?: string | null
          tribunal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dje_itens_extraidos_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "dje_analises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dje_itens_extraidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dje_itens_extraidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dje_itens_extraidos_item_controladoria_id_fkey"
            columns: ["item_controladoria_id"]
            isOneToOne: false
            referencedRelation: "controladoria_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dje_itens_extraidos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_comentarios: {
        Row: {
          autor_id: string | null
          comentario: string
          criado_em: string
          id: string
          peca_id: string
          resolvido: boolean
          resolvido_em: string | null
          resolvido_por: string | null
          trecho_texto: string | null
        }
        Insert: {
          autor_id?: string | null
          comentario: string
          criado_em?: string
          id?: string
          peca_id: string
          resolvido?: boolean
          resolvido_em?: string | null
          resolvido_por?: string | null
          trecho_texto?: string | null
        }
        Update: {
          autor_id?: string | null
          comentario?: string
          criado_em?: string
          id?: string
          peca_id?: string
          resolvido?: boolean
          resolvido_em?: string | null
          resolvido_por?: string | null
          trecho_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_comentarios_peca_id_fkey"
            columns: ["peca_id"]
            isOneToOne: false
            referencedRelation: "doc_pecas"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_modelos: {
        Row: {
          area_direito: Database["public"]["Enums"]["doc_area_direito"] | null
          ativo: boolean
          atualizado_em: string
          categoria: Database["public"]["Enums"]["doc_categoria"]
          conteudo_html: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          espacamento_entre_linhas: number | null
          fonte: string | null
          id: string
          margem_direita: number | null
          margem_esquerda: number | null
          margem_inferior: number | null
          margem_superior: number | null
          tamanho_fonte: number | null
          titulo: string
          uso_count: number
          variaveis_usadas: string[] | null
        }
        Insert: {
          area_direito?: Database["public"]["Enums"]["doc_area_direito"] | null
          ativo?: boolean
          atualizado_em?: string
          categoria: Database["public"]["Enums"]["doc_categoria"]
          conteudo_html?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          espacamento_entre_linhas?: number | null
          fonte?: string | null
          id?: string
          margem_direita?: number | null
          margem_esquerda?: number | null
          margem_inferior?: number | null
          margem_superior?: number | null
          tamanho_fonte?: number | null
          titulo: string
          uso_count?: number
          variaveis_usadas?: string[] | null
        }
        Update: {
          area_direito?: Database["public"]["Enums"]["doc_area_direito"] | null
          ativo?: boolean
          atualizado_em?: string
          categoria?: Database["public"]["Enums"]["doc_categoria"]
          conteudo_html?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          espacamento_entre_linhas?: number | null
          fonte?: string | null
          id?: string
          margem_direita?: number | null
          margem_esquerda?: number | null
          margem_inferior?: number | null
          margem_superior?: number | null
          tamanho_fonte?: number | null
          titulo?: string
          uso_count?: number
          variaveis_usadas?: string[] | null
        }
        Relationships: []
      }
      doc_pecas: {
        Row: {
          atualizado_em: string
          categoria: Database["public"]["Enums"]["doc_categoria"]
          cliente_id: string
          conteudo_html: string
          criado_em: string
          elaborado_por: string | null
          espacamento_entre_linhas: number | null
          finalizado_em: string | null
          finalizado_por: string | null
          fonte: string | null
          id: string
          margem_direita: number | null
          margem_esquerda: number | null
          margem_inferior: number | null
          margem_superior: number | null
          modelo_id: string | null
          processo_id: string | null
          protocolado_em: string | null
          revisado_por: string | null
          status: Database["public"]["Enums"]["doc_peca_status"]
          tamanho_fonte: number | null
          titulo: string
          url_docx: string | null
          url_pdf: string | null
          versao_atual: number
        }
        Insert: {
          atualizado_em?: string
          categoria: Database["public"]["Enums"]["doc_categoria"]
          cliente_id: string
          conteudo_html?: string
          criado_em?: string
          elaborado_por?: string | null
          espacamento_entre_linhas?: number | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          fonte?: string | null
          id?: string
          margem_direita?: number | null
          margem_esquerda?: number | null
          margem_inferior?: number | null
          margem_superior?: number | null
          modelo_id?: string | null
          processo_id?: string | null
          protocolado_em?: string | null
          revisado_por?: string | null
          status?: Database["public"]["Enums"]["doc_peca_status"]
          tamanho_fonte?: number | null
          titulo: string
          url_docx?: string | null
          url_pdf?: string | null
          versao_atual?: number
        }
        Update: {
          atualizado_em?: string
          categoria?: Database["public"]["Enums"]["doc_categoria"]
          cliente_id?: string
          conteudo_html?: string
          criado_em?: string
          elaborado_por?: string | null
          espacamento_entre_linhas?: number | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          fonte?: string | null
          id?: string
          margem_direita?: number | null
          margem_esquerda?: number | null
          margem_inferior?: number | null
          margem_superior?: number | null
          modelo_id?: string | null
          processo_id?: string | null
          protocolado_em?: string | null
          revisado_por?: string | null
          status?: Database["public"]["Enums"]["doc_peca_status"]
          tamanho_fonte?: number | null
          titulo?: string
          url_docx?: string | null
          url_pdf?: string | null
          versao_atual?: number
        }
        Relationships: [
          {
            foreignKeyName: "doc_pecas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_pecas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_pecas_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "doc_modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_pecas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_pecas_versoes: {
        Row: {
          conteudo_html: string
          id: string
          nome_versao: string | null
          numero_versao: number
          peca_id: string
          salvo_em: string
          salvo_por: string | null
        }
        Insert: {
          conteudo_html: string
          id?: string
          nome_versao?: string | null
          numero_versao: number
          peca_id: string
          salvo_em?: string
          salvo_por?: string | null
        }
        Update: {
          conteudo_html?: string
          id?: string
          nome_versao?: string | null
          numero_versao?: number
          peca_id?: string
          salvo_em?: string
          salvo_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_pecas_versoes_peca_id_fkey"
            columns: ["peca_id"]
            isOneToOne: false
            referencedRelation: "doc_pecas"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_variaveis_customizadas: {
        Row: {
          ativo: boolean
          campo_fonte: string | null
          chave: string
          criado_em: string
          fonte: Database["public"]["Enums"]["doc_variavel_fonte"]
          id: string
          nome_legivel: string
          valor_padrao: string | null
        }
        Insert: {
          ativo?: boolean
          campo_fonte?: string | null
          chave: string
          criado_em?: string
          fonte?: Database["public"]["Enums"]["doc_variavel_fonte"]
          id?: string
          nome_legivel: string
          valor_padrao?: string | null
        }
        Update: {
          ativo?: boolean
          campo_fonte?: string | null
          chave?: string
          criado_em?: string
          fonte?: Database["public"]["Enums"]["doc_variavel_fonte"]
          id?: string
          nome_legivel?: string
          valor_padrao?: string | null
        }
        Relationships: []
      }
      documentos: {
        Row: {
          categoria: string | null
          cliente_id: string | null
          compartilhar_com_parceiro: boolean
          criado_em: string
          documento_pai_id: string | null
          id: string
          mime_type: string | null
          nome: string
          processo_id: string | null
          tamanho_bytes: number | null
          upload_por: string | null
          url: string
          versao: number
        }
        Insert: {
          categoria?: string | null
          cliente_id?: string | null
          compartilhar_com_parceiro?: boolean
          criado_em?: string
          documento_pai_id?: string | null
          id?: string
          mime_type?: string | null
          nome: string
          processo_id?: string | null
          tamanho_bytes?: number | null
          upload_por?: string | null
          url: string
          versao?: number
        }
        Update: {
          categoria?: string | null
          cliente_id?: string | null
          compartilhar_com_parceiro?: boolean
          criado_em?: string
          documento_pai_id?: string | null
          id?: string
          mime_type?: string | null
          nome?: string
          processo_id?: string | null
          tamanho_bytes?: number | null
          upload_por?: string | null
          url?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_documento_pai_id_fkey"
            columns: ["documento_pai_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          assunto: string
          destinatario: string
          enviado_em: string
          erro: string | null
          evento: string | null
          id: string
          resend_id: string | null
          status: string
        }
        Insert: {
          assunto: string
          destinatario: string
          enviado_em?: string
          erro?: string | null
          evento?: string | null
          id?: string
          resend_id?: string | null
          status?: string
        }
        Update: {
          assunto?: string
          destinatario?: string
          enviado_em?: string
          erro?: string | null
          evento?: string | null
          id?: string
          resend_id?: string | null
          status?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          assunto: string
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          descricao: string | null
          html: string
          nome: string
          variaveis: Json
        }
        Insert: {
          assunto: string
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          descricao?: string | null
          html: string
          nome: string
          variaveis?: Json
        }
        Update: {
          assunto?: string
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          descricao?: string | null
          html?: string
          nome?: string
          variaveis?: Json
        }
        Relationships: []
      }
      equipe_beneficios: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          data_fim: string | null
          data_inicio: string
          descricao: string | null
          id: string
          membro_id: string
          natureza: string
          observacao: string | null
          tipo: string
          valor_mensal: number
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          descricao?: string | null
          id?: string
          membro_id: string
          natureza?: string
          observacao?: string | null
          tipo: string
          valor_mensal?: number
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          descricao?: string | null
          id?: string
          membro_id?: string
          natureza?: string
          observacao?: string | null
          tipo?: string
          valor_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipe_beneficios_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_comissoes_exito: {
        Row: {
          ano_referencia: number
          criado_em: string
          folha_id: string | null
          id: string
          incluida_folha: boolean
          membro_id: string
          mes_referencia: number
          pagamento_id: string | null
          percentual_comissao: number
          processo_id: string
          valor_comissao: number
          valor_honorario: number
        }
        Insert: {
          ano_referencia: number
          criado_em?: string
          folha_id?: string | null
          id?: string
          incluida_folha?: boolean
          membro_id: string
          mes_referencia: number
          pagamento_id?: string | null
          percentual_comissao: number
          processo_id: string
          valor_comissao: number
          valor_honorario: number
        }
        Update: {
          ano_referencia?: number
          criado_em?: string
          folha_id?: string | null
          id?: string
          incluida_folha?: boolean
          membro_id?: string
          mes_referencia?: number
          pagamento_id?: string | null
          percentual_comissao?: number
          processo_id?: string
          valor_comissao?: number
          valor_honorario?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipe_comissoes_exito_folha_id_fkey"
            columns: ["folha_id"]
            isOneToOne: false
            referencedRelation: "equipe_folha_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_comissoes_exito_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_comissoes_exito_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "honorarios_pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_comissoes_exito_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_desempenho: {
        Row: {
          ano: number
          atingimento_geral_pct: number | null
          atualizado_em: string
          avaliado_em: string | null
          avaliado_por: string | null
          gerado_em: string
          id: string
          membro_id: string
          mes: number
          meta_id: string | null
          metas_proximo_mes: string | null
          nota_avaliacao: number | null
          pecas_elaboradas: number
          pontos_fortes: string | null
          pontos_melhorar: string | null
          prazos_cumpridos: number
          prazos_perdidos: number
          processos_abertos: number
          processos_fechados: number
          receita_gerada: number
          tarefas_concluidas: number
          tarefas_fora_prazo: number
          tarefas_no_prazo: number
          tarefas_no_prazo_pct: number | null
        }
        Insert: {
          ano: number
          atingimento_geral_pct?: number | null
          atualizado_em?: string
          avaliado_em?: string | null
          avaliado_por?: string | null
          gerado_em?: string
          id?: string
          membro_id: string
          mes: number
          meta_id?: string | null
          metas_proximo_mes?: string | null
          nota_avaliacao?: number | null
          pecas_elaboradas?: number
          pontos_fortes?: string | null
          pontos_melhorar?: string | null
          prazos_cumpridos?: number
          prazos_perdidos?: number
          processos_abertos?: number
          processos_fechados?: number
          receita_gerada?: number
          tarefas_concluidas?: number
          tarefas_fora_prazo?: number
          tarefas_no_prazo?: number
          tarefas_no_prazo_pct?: number | null
        }
        Update: {
          ano?: number
          atingimento_geral_pct?: number | null
          atualizado_em?: string
          avaliado_em?: string | null
          avaliado_por?: string | null
          gerado_em?: string
          id?: string
          membro_id?: string
          mes?: number
          meta_id?: string | null
          metas_proximo_mes?: string | null
          nota_avaliacao?: number | null
          pecas_elaboradas?: number
          pontos_fortes?: string | null
          pontos_melhorar?: string | null
          prazos_cumpridos?: number
          prazos_perdidos?: number
          processos_abertos?: number
          processos_fechados?: number
          receita_gerada?: number
          tarefas_concluidas?: number
          tarefas_fora_prazo?: number
          tarefas_no_prazo?: number
          tarefas_no_prazo_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipe_desempenho_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_desempenho_meta_id_fkey"
            columns: ["meta_id"]
            isOneToOne: false
            referencedRelation: "equipe_metas"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_documentos: {
        Row: {
          categoria: string
          criado_em: string
          enviado_por: string | null
          id: string
          membro_id: string
          mime_type: string | null
          nome: string
          observacao: string | null
          storage_path: string
          tamanho_bytes: number | null
        }
        Insert: {
          categoria: string
          criado_em?: string
          enviado_por?: string | null
          id?: string
          membro_id: string
          mime_type?: string | null
          nome: string
          observacao?: string | null
          storage_path: string
          tamanho_bytes?: number | null
        }
        Update: {
          categoria?: string
          criado_em?: string
          enviado_por?: string | null
          id?: string
          membro_id?: string
          mime_type?: string | null
          nome?: string
          observacao?: string | null
          storage_path?: string
          tamanho_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipe_documentos_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_folha_pagamento: {
        Row: {
          ano: number
          bonus_manual: number
          comprovante_url: string | null
          data_pagamento: string | null
          desconto_manual: number
          forma_pagamento: string | null
          gerado_em: string
          id: string
          membro_id: string
          mes: number
          observacao_ajuste: string | null
          pago_em: string | null
          pago_por: string | null
          status: Database["public"]["Enums"]["status_folha"]
          valor_comissao_exito: number
          valor_comissao_producao: number
          valor_fixo: number
          valor_total: number | null
        }
        Insert: {
          ano: number
          bonus_manual?: number
          comprovante_url?: string | null
          data_pagamento?: string | null
          desconto_manual?: number
          forma_pagamento?: string | null
          gerado_em?: string
          id?: string
          membro_id: string
          mes: number
          observacao_ajuste?: string | null
          pago_em?: string | null
          pago_por?: string | null
          status?: Database["public"]["Enums"]["status_folha"]
          valor_comissao_exito?: number
          valor_comissao_producao?: number
          valor_fixo?: number
          valor_total?: number | null
        }
        Update: {
          ano?: number
          bonus_manual?: number
          comprovante_url?: string | null
          data_pagamento?: string | null
          desconto_manual?: number
          forma_pagamento?: string | null
          gerado_em?: string
          id?: string
          membro_id?: string
          mes?: number
          observacao_ajuste?: string | null
          pago_em?: string | null
          pago_por?: string | null
          status?: Database["public"]["Enums"]["status_folha"]
          valor_comissao_exito?: number
          valor_comissao_producao?: number
          valor_fixo?: number
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipe_folha_pagamento_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_horas_complementares: {
        Row: {
          ano: number
          criado_em: string
          data: string
          descricao: string
          horas: number
          id: string
          membro_id: string
          mes: number
        }
        Insert: {
          ano: number
          criado_em?: string
          data: string
          descricao: string
          horas: number
          id?: string
          membro_id: string
          mes: number
        }
        Update: {
          ano?: number
          criado_em?: string
          data?: string
          descricao?: string
          horas?: number
          id?: string
          membro_id?: string
          mes?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipe_horas_complementares_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_lancamentos_folha: {
        Row: {
          ano: number
          aplicado_folha: boolean
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          folha_id: string | null
          id: string
          membro_id: string
          mes: number
          motivo: string
          natureza: string
          observacao: string | null
          valor: number
        }
        Insert: {
          ano: number
          aplicado_folha?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          folha_id?: string | null
          id?: string
          membro_id: string
          mes: number
          motivo: string
          natureza: string
          observacao?: string | null
          valor?: number
        }
        Update: {
          ano?: number
          aplicado_folha?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          folha_id?: string | null
          id?: string
          membro_id?: string
          mes?: number
          motivo?: string
          natureza?: string
          observacao?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipe_lancamentos_folha_folha_id_fkey"
            columns: ["folha_id"]
            isOneToOne: false
            referencedRelation: "equipe_folha_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_lancamentos_folha_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_membros: {
        Row: {
          atualizado_em: string
          banco_agencia: string | null
          banco_conta: string | null
          banco_nome: string | null
          cargo: Database["public"]["Enums"]["cargo_equipe"]
          contato_emergencia_nome: string | null
          contato_emergencia_parentesco: string | null
          contato_emergencia_telefone: string | null
          cpf: string | null
          criado_em: string
          criado_por: string | null
          data_admissao: string
          data_desligamento: string | null
          data_nascimento: string | null
          dependentes: number
          email_pessoal: string | null
          endereco_bairro: string | null
          endereco_cep: string | null
          endereco_cidade: string | null
          endereco_complemento: string | null
          endereco_estado: string | null
          endereco_logradouro: string | null
          endereco_numero: string | null
          escolaridade: string | null
          estado_civil: string | null
          id: string
          nome: string
          oab_numero: string | null
          oab_seccional: string | null
          observacoes_internas: string | null
          percentual_comissao_fechamento: number | null
          pix_chave: string | null
          pix_tipo: string | null
          pode_concluir_controladoria: boolean
          rg: string | null
          status: Database["public"]["Enums"]["status_membro"]
          telefone: string | null
          tipo_vinculo: Database["public"]["Enums"]["tipo_vinculo_equipe"]
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_nome?: string | null
          cargo: Database["public"]["Enums"]["cargo_equipe"]
          contato_emergencia_nome?: string | null
          contato_emergencia_parentesco?: string | null
          contato_emergencia_telefone?: string | null
          cpf?: string | null
          criado_em?: string
          criado_por?: string | null
          data_admissao?: string
          data_desligamento?: string | null
          data_nascimento?: string | null
          dependentes?: number
          email_pessoal?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_complemento?: string | null
          endereco_estado?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          escolaridade?: string | null
          estado_civil?: string | null
          id?: string
          nome: string
          oab_numero?: string | null
          oab_seccional?: string | null
          observacoes_internas?: string | null
          percentual_comissao_fechamento?: number | null
          pix_chave?: string | null
          pix_tipo?: string | null
          pode_concluir_controladoria?: boolean
          rg?: string | null
          status?: Database["public"]["Enums"]["status_membro"]
          telefone?: string | null
          tipo_vinculo: Database["public"]["Enums"]["tipo_vinculo_equipe"]
          user_id: string
        }
        Update: {
          atualizado_em?: string
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_nome?: string | null
          cargo?: Database["public"]["Enums"]["cargo_equipe"]
          contato_emergencia_nome?: string | null
          contato_emergencia_parentesco?: string | null
          contato_emergencia_telefone?: string | null
          cpf?: string | null
          criado_em?: string
          criado_por?: string | null
          data_admissao?: string
          data_desligamento?: string | null
          data_nascimento?: string | null
          dependentes?: number
          email_pessoal?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_complemento?: string | null
          endereco_estado?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          escolaridade?: string | null
          estado_civil?: string | null
          id?: string
          nome?: string
          oab_numero?: string | null
          oab_seccional?: string | null
          observacoes_internas?: string | null
          percentual_comissao_fechamento?: number | null
          pix_chave?: string | null
          pix_tipo?: string | null
          pode_concluir_controladoria?: boolean
          rg?: string | null
          status?: Database["public"]["Enums"]["status_membro"]
          telefone?: string | null
          tipo_vinculo?: Database["public"]["Enums"]["tipo_vinculo_equipe"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_membros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_metas: {
        Row: {
          ano: number
          criado_em: string
          criado_por: string | null
          id: string
          membro_id: string
          mes: number
          meta_atendimentos: number | null
          meta_nota_minima: number | null
          meta_pecas_elaboradas: number | null
          meta_prazos_perdidos: number | null
          meta_processos_abertos: number | null
          meta_processos_fechados: number | null
          meta_receita_gerada: number | null
          meta_tarefas_concluidas: number | null
          meta_tarefas_no_prazo_pct: number | null
          observacao: string | null
        }
        Insert: {
          ano: number
          criado_em?: string
          criado_por?: string | null
          id?: string
          membro_id: string
          mes: number
          meta_atendimentos?: number | null
          meta_nota_minima?: number | null
          meta_pecas_elaboradas?: number | null
          meta_prazos_perdidos?: number | null
          meta_processos_abertos?: number | null
          meta_processos_fechados?: number | null
          meta_receita_gerada?: number | null
          meta_tarefas_concluidas?: number | null
          meta_tarefas_no_prazo_pct?: number | null
          observacao?: string | null
        }
        Update: {
          ano?: number
          criado_em?: string
          criado_por?: string | null
          id?: string
          membro_id?: string
          mes?: number
          meta_atendimentos?: number | null
          meta_nota_minima?: number | null
          meta_pecas_elaboradas?: number | null
          meta_prazos_perdidos?: number | null
          meta_processos_abertos?: number | null
          meta_processos_fechados?: number | null
          meta_receita_gerada?: number | null
          meta_tarefas_concluidas?: number | null
          meta_tarefas_no_prazo_pct?: number | null
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipe_metas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_metas_padrao: {
        Row: {
          atualizado_em: string
          cargo: Database["public"]["Enums"]["cargo_equipe"]
          id: string
          meta_atendimentos: number | null
          meta_nota_minima: number | null
          meta_pecas_elaboradas: number | null
          meta_processos_abertos: number | null
          meta_processos_fechados: number | null
          meta_receita_gerada: number | null
          meta_tarefas_concluidas: number | null
          meta_tarefas_no_prazo_pct: number | null
        }
        Insert: {
          atualizado_em?: string
          cargo: Database["public"]["Enums"]["cargo_equipe"]
          id?: string
          meta_atendimentos?: number | null
          meta_nota_minima?: number | null
          meta_pecas_elaboradas?: number | null
          meta_processos_abertos?: number | null
          meta_processos_fechados?: number | null
          meta_receita_gerada?: number | null
          meta_tarefas_concluidas?: number | null
          meta_tarefas_no_prazo_pct?: number | null
        }
        Update: {
          atualizado_em?: string
          cargo?: Database["public"]["Enums"]["cargo_equipe"]
          id?: string
          meta_atendimentos?: number | null
          meta_nota_minima?: number | null
          meta_pecas_elaboradas?: number | null
          meta_processos_abertos?: number | null
          meta_processos_fechados?: number | null
          meta_receita_gerada?: number | null
          meta_tarefas_concluidas?: number | null
          meta_tarefas_no_prazo_pct?: number | null
        }
        Relationships: []
      }
      equipe_remuneracao: {
        Row: {
          criado_em: string
          criado_por: string | null
          data_fim: string | null
          data_inicio: string
          dia_pagamento: number | null
          id: string
          membro_id: string
          observacao: string | null
          percentual_exito: number | null
          tipo: Database["public"]["Enums"]["tipo_remuneracao"]
          valor_fixo: number | null
          valor_por_processo: number | null
          valor_por_tarefa: number | null
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio: string
          dia_pagamento?: number | null
          id?: string
          membro_id: string
          observacao?: string | null
          percentual_exito?: number | null
          tipo: Database["public"]["Enums"]["tipo_remuneracao"]
          valor_fixo?: number | null
          valor_por_processo?: number | null
          valor_por_tarefa?: number | null
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          dia_pagamento?: number | null
          id?: string
          membro_id?: string
          observacao?: string | null
          percentual_exito?: number | null
          tipo?: Database["public"]["Enums"]["tipo_remuneracao"]
          valor_fixo?: number | null
          valor_por_processo?: number | null
          valor_por_tarefa?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipe_remuneracao_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      feriados: {
        Row: {
          cidade: string | null
          criado_em: string
          data: string
          descricao: string
          id: string
          tipo: string
          uf: string | null
        }
        Insert: {
          cidade?: string | null
          criado_em?: string
          data: string
          descricao: string
          id?: string
          tipo?: string
          uf?: string | null
        }
        Update: {
          cidade?: string | null
          criado_em?: string
          data?: string
          descricao?: string
          id?: string
          tipo?: string
          uf?: string | null
        }
        Relationships: []
      }
      ferramentas_analises_caso: {
        Row: {
          arquivo_nome: string | null
          arquivo_url: string | null
          atualizado_em: string
          cliente_id: string | null
          criado_em: string
          criado_por: string | null
          dados_extraidos: Json
          id: string
          processo_id: string | null
          texto_origem: string | null
          tipo_documento: string
          titulo: string | null
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          atualizado_em?: string
          cliente_id?: string | null
          criado_em?: string
          criado_por?: string | null
          dados_extraidos?: Json
          id?: string
          processo_id?: string | null
          texto_origem?: string | null
          tipo_documento?: string
          titulo?: string | null
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          atualizado_em?: string
          cliente_id?: string | null
          criado_em?: string
          criado_por?: string | null
          dados_extraidos?: Json
          id?: string
          processo_id?: string | null
          texto_origem?: string | null
          tipo_documento?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ferramentas_analises_caso_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_analises_caso_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_analises_caso_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      ferramentas_calculos_cnis: {
        Row: {
          arquivo_nome: string | null
          arquivo_url: string | null
          atualizado_em: string
          cliente_id: string | null
          criado_em: string
          criado_por: string | null
          dados_segurado: Json
          data_referencia: string
          desemprego_involuntario: boolean
          id: string
          processo_id: string | null
          resultado: Json
          titulo: string | null
          vinculos: Json
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          atualizado_em?: string
          cliente_id?: string | null
          criado_em?: string
          criado_por?: string | null
          dados_segurado?: Json
          data_referencia?: string
          desemprego_involuntario?: boolean
          id?: string
          processo_id?: string | null
          resultado?: Json
          titulo?: string | null
          vinculos?: Json
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          atualizado_em?: string
          cliente_id?: string | null
          criado_em?: string
          criado_por?: string | null
          dados_segurado?: Json
          data_referencia?: string
          desemprego_involuntario?: boolean
          id?: string
          processo_id?: string | null
          resultado?: Json
          titulo?: string | null
          vinculos?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ferramentas_calculos_cnis_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_calculos_cnis_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_calculos_cnis_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      ferramentas_calculos_salvos: {
        Row: {
          ano_tabela: number | null
          cliente_id: string | null
          criado_em: string
          criado_por: string | null
          estado: string | null
          ferramenta: string
          id: string
          inputs: Json
          processo_id: string | null
          proposta_url: string | null
          resultado: Json
          tipo_honorario: string | null
          titulo: string
        }
        Insert: {
          ano_tabela?: number | null
          cliente_id?: string | null
          criado_em?: string
          criado_por?: string | null
          estado?: string | null
          ferramenta?: string
          id?: string
          inputs?: Json
          processo_id?: string | null
          proposta_url?: string | null
          resultado?: Json
          tipo_honorario?: string | null
          titulo: string
        }
        Update: {
          ano_tabela?: number | null
          cliente_id?: string | null
          criado_em?: string
          criado_por?: string | null
          estado?: string | null
          ferramenta?: string
          id?: string
          inputs?: Json
          processo_id?: string | null
          proposta_url?: string | null
          resultado?: Json
          tipo_honorario?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ferramentas_calculos_salvos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_calculos_salvos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_calculos_salvos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      ferramentas_config: {
        Row: {
          atualizado_em: string
          chave: string
          descricao: string | null
          id: string
          valor: string | null
        }
        Insert: {
          atualizado_em?: string
          chave: string
          descricao?: string | null
          id?: string
          valor?: string | null
        }
        Update: {
          atualizado_em?: string
          chave?: string
          descricao?: string | null
          id?: string
          valor?: string | null
        }
        Relationships: []
      }
      ferramentas_modelos_notificacao: {
        Row: {
          ativo: boolean
          atualizado_em: string
          conteudo: string
          criado_em: string
          criado_por: string | null
          file_data: string | null
          file_mime: string | null
          file_name: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          conteudo: string
          criado_em?: string
          criado_por?: string | null
          file_data?: string | null
          file_mime?: string | null
          file_name?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          conteudo?: string
          criado_em?: string
          criado_por?: string | null
          file_data?: string | null
          file_mime?: string | null
          file_name?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      ferramentas_notificacoes: {
        Row: {
          atualizado_em: string
          cliente_id: string | null
          criado_em: string
          criado_por: string | null
          dados_completos: Json
          id: string
          notificado_cpf: string | null
          notificado_nome: string | null
          notificante_nome: string | null
          pdf_notificacao_url: string | null
          pdf_recibo_url: string | null
          processo_id: string | null
          referencia: string | null
          total_geral: number | null
        }
        Insert: {
          atualizado_em?: string
          cliente_id?: string | null
          criado_em?: string
          criado_por?: string | null
          dados_completos?: Json
          id?: string
          notificado_cpf?: string | null
          notificado_nome?: string | null
          notificante_nome?: string | null
          pdf_notificacao_url?: string | null
          pdf_recibo_url?: string | null
          processo_id?: string | null
          referencia?: string | null
          total_geral?: number | null
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string | null
          criado_em?: string
          criado_por?: string | null
          dados_completos?: Json
          id?: string
          notificado_cpf?: string | null
          notificado_nome?: string | null
          notificante_nome?: string | null
          pdf_notificacao_url?: string | null
          pdf_recibo_url?: string | null
          processo_id?: string | null
          referencia?: string | null
          total_geral?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ferramentas_notificacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_notificacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_notificacoes_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      ferramentas_oab_tabelas: {
        Row: {
          ano_vigencia: number
          arquivo_url: string | null
          ativo: boolean
          atualizado_em: string
          carregado_por: string | null
          criado_em: string
          estado: string
          estado_nome: string
          id: string
          oab_seccional: string
          observacoes: string | null
          tabela_json: Json
        }
        Insert: {
          ano_vigencia: number
          arquivo_url?: string | null
          ativo?: boolean
          atualizado_em?: string
          carregado_por?: string | null
          criado_em?: string
          estado: string
          estado_nome: string
          id?: string
          oab_seccional: string
          observacoes?: string | null
          tabela_json?: Json
        }
        Update: {
          ano_vigencia?: number
          arquivo_url?: string | null
          ativo?: boolean
          atualizado_em?: string
          carregado_por?: string | null
          criado_em?: string
          estado?: string
          estado_nome?: string
          id?: string
          oab_seccional?: string
          observacoes?: string | null
          tabela_json?: Json
        }
        Relationships: []
      }
      financeiro_config_tributaria: {
        Row: {
          anexo: string
          atualizado_em: string
          atualizado_por: string | null
          id: string
          observacao: string | null
          percentual_marketing_padrao: number
          rbt12_manual: number | null
          regime: string
        }
        Insert: {
          anexo?: string
          atualizado_em?: string
          atualizado_por?: string | null
          id?: string
          observacao?: string | null
          percentual_marketing_padrao?: number
          rbt12_manual?: number | null
          regime?: string
        }
        Update: {
          anexo?: string
          atualizado_em?: string
          atualizado_por?: string | null
          id?: string
          observacao?: string | null
          percentual_marketing_padrao?: number
          rbt12_manual?: number | null
          regime?: string
        }
        Relationships: []
      }
      financeiro_configuracoes: {
        Row: {
          alerta_d1: boolean
          alerta_d15: boolean
          alerta_d30_tarefa: boolean
          alerta_d5: boolean
          atualizado_em: string
          forma_padrao: string
          gerar_mensalidade_dia: number
          id: string
          incluir_exito_na_projecao: boolean
        }
        Insert: {
          alerta_d1?: boolean
          alerta_d15?: boolean
          alerta_d30_tarefa?: boolean
          alerta_d5?: boolean
          atualizado_em?: string
          forma_padrao?: string
          gerar_mensalidade_dia?: number
          id?: string
          incluir_exito_na_projecao?: boolean
        }
        Update: {
          alerta_d1?: boolean
          alerta_d15?: boolean
          alerta_d30_tarefa?: boolean
          alerta_d5?: boolean
          atualizado_em?: string
          forma_padrao?: string
          gerar_mensalidade_dia?: number
          id?: string
          incluir_exito_na_projecao?: boolean
        }
        Relationships: []
      }
      financeiro_fechamento: {
        Row: {
          aliquota_efetiva: number | null
          aliquota_nominal: number | null
          ano: number
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          detalhamento_tributos: Json | null
          detalhe_outras_despesas: Json | null
          faixa_simples: number | null
          fechado_em: string | null
          fechado_por: string | null
          id: string
          mes: number
          observacoes: string | null
          outras_despesas: number
          percentual_marketing: number
          rbt12: number
          receita_consultoria: number
          receita_honorarios_exito: number
          receita_honorarios_fixo: number
          receita_outros: number
          receita_total: number | null
          repasses_parceiros: number
          resultado_liquido: number | null
          status: string
          valor_marketing: number
          valor_pro_labore: number
          valor_simples: number
        }
        Insert: {
          aliquota_efetiva?: number | null
          aliquota_nominal?: number | null
          ano: number
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          detalhamento_tributos?: Json | null
          detalhe_outras_despesas?: Json | null
          faixa_simples?: number | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          mes: number
          observacoes?: string | null
          outras_despesas?: number
          percentual_marketing?: number
          rbt12?: number
          receita_consultoria?: number
          receita_honorarios_exito?: number
          receita_honorarios_fixo?: number
          receita_outros?: number
          receita_total?: number | null
          repasses_parceiros?: number
          resultado_liquido?: number | null
          status?: string
          valor_marketing?: number
          valor_pro_labore?: number
          valor_simples?: number
        }
        Update: {
          aliquota_efetiva?: number | null
          aliquota_nominal?: number | null
          ano?: number
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          detalhamento_tributos?: Json | null
          detalhe_outras_despesas?: Json | null
          faixa_simples?: number | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          mes?: number
          observacoes?: string | null
          outras_despesas?: number
          percentual_marketing?: number
          rbt12?: number
          receita_consultoria?: number
          receita_honorarios_exito?: number
          receita_honorarios_fixo?: number
          receita_outros?: number
          receita_total?: number | null
          repasses_parceiros?: number
          resultado_liquido?: number | null
          status?: string
          valor_marketing?: number
          valor_pro_labore?: number
          valor_simples?: number
        }
        Relationships: []
      }
      financeiro_marketing_lancamentos: {
        Row: {
          ano: number
          campanha_id: string | null
          categoria: string
          comprovante_url: string | null
          criado_em: string
          criado_por: string | null
          data: string
          descricao: string
          fornecedor: string | null
          id: string
          mes: number
          observacao: string | null
          valor: number
        }
        Insert: {
          ano: number
          campanha_id?: string | null
          categoria?: string
          comprovante_url?: string | null
          criado_em?: string
          criado_por?: string | null
          data?: string
          descricao: string
          fornecedor?: string | null
          id?: string
          mes: number
          observacao?: string | null
          valor: number
        }
        Update: {
          ano?: number
          campanha_id?: string | null
          categoria?: string
          comprovante_url?: string | null
          criado_em?: string
          criado_por?: string | null
          data?: string
          descricao?: string
          fornecedor?: string | null
          id?: string
          mes?: number
          observacao?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_marketing_lancamentos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "mkt_campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_pro_labore: {
        Row: {
          ano: number
          criado_em: string
          criado_por: string | null
          data_pagamento: string | null
          id: string
          mes: number
          observacao: string | null
          pago: boolean
          socio_nome: string
          socio_user_id: string | null
          valor: number
        }
        Insert: {
          ano: number
          criado_em?: string
          criado_por?: string | null
          data_pagamento?: string | null
          id?: string
          mes: number
          observacao?: string | null
          pago?: boolean
          socio_nome: string
          socio_user_id?: string | null
          valor: number
        }
        Update: {
          ano?: number
          criado_em?: string
          criado_por?: string | null
          data_pagamento?: string | null
          id?: string
          mes?: number
          observacao?: string | null
          pago?: boolean
          socio_nome?: string
          socio_user_id?: string | null
          valor?: number
        }
        Relationships: []
      }
      financeiro_saidas: {
        Row: {
          categoria: Database["public"]["Enums"]["saida_categoria"]
          created_at: string
          created_by: string | null
          data_competencia: string
          data_pagamento: string | null
          descricao: string
          forma_pagamento: string | null
          fornecedor: string | null
          id: string
          observacao: string | null
          origem: Database["public"]["Enums"]["saida_origem"]
          origem_id: string | null
          status: Database["public"]["Enums"]["saida_status"]
          suprimento_id: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["saida_categoria"]
          created_at?: string
          created_by?: string | null
          data_competencia?: string
          data_pagamento?: string | null
          descricao: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          id?: string
          observacao?: string | null
          origem?: Database["public"]["Enums"]["saida_origem"]
          origem_id?: string | null
          status?: Database["public"]["Enums"]["saida_status"]
          suprimento_id?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          categoria?: Database["public"]["Enums"]["saida_categoria"]
          created_at?: string
          created_by?: string | null
          data_competencia?: string
          data_pagamento?: string | null
          descricao?: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          id?: string
          observacao?: string | null
          origem?: Database["public"]["Enums"]["saida_origem"]
          origem_id?: string | null
          status?: Database["public"]["Enums"]["saida_status"]
          suprimento_id?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_saidas_suprimento_id_fkey"
            columns: ["suprimento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_suprimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_suprimentos: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          data_fim: string | null
          data_inicio: string | null
          dia_vencimento: number | null
          fornecedor: string | null
          id: string
          nome: string
          observacao: string | null
          parcelas_pagas: number
          parcelas_total: number | null
          recorrencia: Database["public"]["Enums"]["suprimento_recorrencia"]
          tipo: Database["public"]["Enums"]["suprimento_tipo"]
          updated_at: string
          valor_parcela: number | null
          valor_total: number | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          dia_vencimento?: number | null
          fornecedor?: string | null
          id?: string
          nome: string
          observacao?: string | null
          parcelas_pagas?: number
          parcelas_total?: number | null
          recorrencia?: Database["public"]["Enums"]["suprimento_recorrencia"]
          tipo?: Database["public"]["Enums"]["suprimento_tipo"]
          updated_at?: string
          valor_parcela?: number | null
          valor_total?: number | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          dia_vencimento?: number | null
          fornecedor?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          parcelas_pagas?: number
          parcelas_total?: number | null
          recorrencia?: Database["public"]["Enums"]["suprimento_recorrencia"]
          tipo?: Database["public"]["Enums"]["suprimento_tipo"]
          updated_at?: string
          valor_parcela?: number | null
          valor_total?: number | null
        }
        Relationships: []
      }
      fluxo_comentarios: {
        Row: {
          arquivos: Json
          criado_em: string
          etapa_id: string
          id: string
          instancia_id: string
          texto: string
          user_id: string
        }
        Insert: {
          arquivos?: Json
          criado_em?: string
          etapa_id: string
          id?: string
          instancia_id: string
          texto: string
          user_id: string
        }
        Update: {
          arquivos?: Json
          criado_em?: string
          etapa_id?: string
          id?: string
          instancia_id?: string
          texto?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_comentarios_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "fluxo_instancia_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_comentarios_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "fluxo_instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_etapas_template: {
        Row: {
          checklist_itens: Json
          criado_em: string
          descricao: string | null
          gera_alerta_gestor: boolean
          id: string
          obrigatorio: boolean
          ordem: number
          prazo_dias: number
          prazo_referencia: string
          prazo_tipo: string
          prioridade: Database["public"]["Enums"]["prioridade"]
          responsavel_padrao: string | null
          template_id: string
          template_texto: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          checklist_itens?: Json
          criado_em?: string
          descricao?: string | null
          gera_alerta_gestor?: boolean
          id?: string
          obrigatorio?: boolean
          ordem: number
          prazo_dias?: number
          prazo_referencia?: string
          prazo_tipo?: string
          prioridade?: Database["public"]["Enums"]["prioridade"]
          responsavel_padrao?: string | null
          template_id: string
          template_texto?: string | null
          tipo?: string
          titulo: string
        }
        Update: {
          checklist_itens?: Json
          criado_em?: string
          descricao?: string | null
          gera_alerta_gestor?: boolean
          id?: string
          obrigatorio?: boolean
          ordem?: number
          prazo_dias?: number
          prazo_referencia?: string
          prazo_tipo?: string
          prioridade?: Database["public"]["Enums"]["prioridade"]
          responsavel_padrao?: string | null
          template_id?: string
          template_texto?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_etapas_template_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "fluxos_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_instancia_etapas: {
        Row: {
          aceito_em: string | null
          aceito_por: string | null
          atualizado_em: string
          checklist_itens: Json
          checklist_pct: number
          comentario_conclusao: string | null
          concluido_em: string | null
          concluido_por: string | null
          criado_em: string
          data_vencimento: string | null
          data_vencimento_original: string | null
          descricao: string | null
          etapa_template_id: string | null
          gera_alerta_gestor: boolean
          id: string
          instancia_id: string
          item_controladoria_id: string | null
          obrigatorio: boolean
          ordem: number
          responsavel_id: string | null
          status: string
          template_texto: string | null
          texto_preenchido: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          aceito_em?: string | null
          aceito_por?: string | null
          atualizado_em?: string
          checklist_itens?: Json
          checklist_pct?: number
          comentario_conclusao?: string | null
          concluido_em?: string | null
          concluido_por?: string | null
          criado_em?: string
          data_vencimento?: string | null
          data_vencimento_original?: string | null
          descricao?: string | null
          etapa_template_id?: string | null
          gera_alerta_gestor?: boolean
          id?: string
          instancia_id: string
          item_controladoria_id?: string | null
          obrigatorio?: boolean
          ordem: number
          responsavel_id?: string | null
          status?: string
          template_texto?: string | null
          texto_preenchido?: string | null
          tipo?: string
          titulo: string
        }
        Update: {
          aceito_em?: string | null
          aceito_por?: string | null
          atualizado_em?: string
          checklist_itens?: Json
          checklist_pct?: number
          comentario_conclusao?: string | null
          concluido_em?: string | null
          concluido_por?: string | null
          criado_em?: string
          data_vencimento?: string | null
          data_vencimento_original?: string | null
          descricao?: string | null
          etapa_template_id?: string | null
          gera_alerta_gestor?: boolean
          id?: string
          instancia_id?: string
          item_controladoria_id?: string | null
          obrigatorio?: boolean
          ordem?: number
          responsavel_id?: string | null
          status?: string
          template_texto?: string | null
          texto_preenchido?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_instancia_etapas_etapa_template_id_fkey"
            columns: ["etapa_template_id"]
            isOneToOne: false
            referencedRelation: "fluxo_etapas_template"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_instancia_etapas_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "fluxo_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_instancia_etapas_item_controladoria_id_fkey"
            columns: ["item_controladoria_id"]
            isOneToOne: false
            referencedRelation: "controladoria_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_instancias: {
        Row: {
          atualizado_em: string
          cancelado_em: string | null
          cancelado_motivo: string | null
          cliente_id: string | null
          concluido_em: string | null
          criado_em: string
          criado_por: string | null
          data_gatilho: string
          id: string
          observacoes: string | null
          origem_id: string | null
          origem_tipo: string | null
          pausado_em: string | null
          processo_id: string | null
          progresso_pct: number
          responsavel_id: string | null
          status: string
          template_id: string
          template_nome: string | null
        }
        Insert: {
          atualizado_em?: string
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cliente_id?: string | null
          concluido_em?: string | null
          criado_em?: string
          criado_por?: string | null
          data_gatilho?: string
          id?: string
          observacoes?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          pausado_em?: string | null
          processo_id?: string | null
          progresso_pct?: number
          responsavel_id?: string | null
          status?: string
          template_id: string
          template_nome?: string | null
        }
        Update: {
          atualizado_em?: string
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cliente_id?: string | null
          concluido_em?: string | null
          criado_em?: string
          criado_por?: string | null
          data_gatilho?: string
          id?: string
          observacoes?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          pausado_em?: string | null
          processo_id?: string | null
          progresso_pct?: number
          responsavel_id?: string | null
          status?: string
          template_id?: string
          template_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_instancias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_instancias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_instancias_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_instancias_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "fluxos_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxos_templates: {
        Row: {
          area: string | null
          ativo: boolean
          atualizado_em: string
          cor: string | null
          criado_em: string
          criado_por: string | null
          descricao: string | null
          etapas: Json
          gatilho: string
          icone: string | null
          id: string
          nome: string
          uso_count: number
        }
        Insert: {
          area?: string | null
          ativo?: boolean
          atualizado_em?: string
          cor?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          etapas?: Json
          gatilho?: string
          icone?: string | null
          id?: string
          nome: string
          uso_count?: number
        }
        Update: {
          area?: string | null
          ativo?: boolean
          atualizado_em?: string
          cor?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          etapas?: Json
          gatilho?: string
          icone?: string | null
          id?: string
          nome?: string
          uso_count?: number
        }
        Relationships: []
      }
      gp_afastamentos: {
        Row: {
          atualizado_em: string
          cid: string | null
          criado_em: string
          data_fim: string | null
          data_inicio: string
          dias_afastamento: number | null
          documento_url: string | null
          id: string
          membro_id: string
          observacao: string | null
          registrado_por: string | null
          status: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          cid?: string | null
          criado_em?: string
          data_fim?: string | null
          data_inicio: string
          dias_afastamento?: number | null
          documento_url?: string | null
          id?: string
          membro_id: string
          observacao?: string | null
          registrado_por?: string | null
          status?: string
          tipo: string
        }
        Update: {
          atualizado_em?: string
          cid?: string | null
          criado_em?: string
          data_fim?: string | null
          data_inicio?: string
          dias_afastamento?: number | null
          documento_url?: string | null
          id?: string
          membro_id?: string
          observacao?: string | null
          registrado_por?: string | null
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "gp_afastamentos_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gp_afastamentos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gp_banco_horas: {
        Row: {
          aprovado_por: string | null
          criado_em: string
          criado_por: string | null
          data: string
          descricao: string | null
          horas: number
          id: string
          membro_id: string
          registro_ponto_id: string | null
          tipo: string
        }
        Insert: {
          aprovado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          data: string
          descricao?: string | null
          horas: number
          id?: string
          membro_id: string
          registro_ponto_id?: string | null
          tipo: string
        }
        Update: {
          aprovado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          data?: string
          descricao?: string | null
          horas?: number
          id?: string
          membro_id?: string
          registro_ponto_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "gp_banco_horas_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gp_banco_horas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gp_banco_horas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gp_banco_horas_registro_ponto_id_fkey"
            columns: ["registro_ponto_id"]
            isOneToOne: false
            referencedRelation: "gp_ponto_registros"
            referencedColumns: ["id"]
          },
        ]
      }
      gp_ferias: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          data_fim: string | null
          data_inicio: string | null
          dias_direito: number
          dias_gozados: number | null
          dias_vendidos: number
          id: string
          membro_id: string
          observacao: string | null
          periodo_aquisitivo_fim: string
          periodo_aquisitivo_inicio: string
          status: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          dias_direito?: number
          dias_gozados?: number | null
          dias_vendidos?: number
          id?: string
          membro_id: string
          observacao?: string | null
          periodo_aquisitivo_fim: string
          periodo_aquisitivo_inicio: string
          status?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          dias_direito?: number
          dias_gozados?: number | null
          dias_vendidos?: number
          id?: string
          membro_id?: string
          observacao?: string | null
          periodo_aquisitivo_fim?: string
          periodo_aquisitivo_inicio?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "gp_ferias_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gp_ferias_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gp_ferias_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      gp_ponto_config: {
        Row: {
          atualizado_em: string
          banco_horas_ativo: boolean
          criado_em: string
          dias_trabalho: string[]
          horario_entrada: string
          horario_saida: string
          horas_diarias: number
          id: string
          intervalo_almoco_minutos: number
          membro_id: string
          tolerancia_entrada_minutos: number
        }
        Insert: {
          atualizado_em?: string
          banco_horas_ativo?: boolean
          criado_em?: string
          dias_trabalho?: string[]
          horario_entrada?: string
          horario_saida?: string
          horas_diarias?: number
          id?: string
          intervalo_almoco_minutos?: number
          membro_id: string
          tolerancia_entrada_minutos?: number
        }
        Update: {
          atualizado_em?: string
          banco_horas_ativo?: boolean
          criado_em?: string
          dias_trabalho?: string[]
          horario_entrada?: string
          horario_saida?: string
          horas_diarias?: number
          id?: string
          intervalo_almoco_minutos?: number
          membro_id?: string
          tolerancia_entrada_minutos?: number
        }
        Relationships: [
          {
            foreignKeyName: "gp_ponto_config_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: true
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      gp_ponto_registros: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          atualizado_em: string
          criado_em: string
          data: string
          entrada: string | null
          horas_esperadas: number
          horas_extras: number
          horas_falta: number
          horas_trabalhadas: number | null
          id: string
          justificativa: string | null
          membro_id: string
          registrado_por: string | null
          retorno_almoco: string | null
          saida: string | null
          saida_almoco: string | null
          status: string
          tipo_registro: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          atualizado_em?: string
          criado_em?: string
          data: string
          entrada?: string | null
          horas_esperadas?: number
          horas_extras?: number
          horas_falta?: number
          horas_trabalhadas?: number | null
          id?: string
          justificativa?: string | null
          membro_id: string
          registrado_por?: string | null
          retorno_almoco?: string | null
          saida?: string | null
          saida_almoco?: string | null
          status?: string
          tipo_registro?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          atualizado_em?: string
          criado_em?: string
          data?: string
          entrada?: string | null
          horas_esperadas?: number
          horas_extras?: number
          horas_falta?: number
          horas_trabalhadas?: number | null
          id?: string
          justificativa?: string | null
          membro_id?: string
          registrado_por?: string | null
          retorno_almoco?: string | null
          saida?: string | null
          saida_almoco?: string | null
          status?: string
          tipo_registro?: string
        }
        Relationships: [
          {
            foreignKeyName: "gp_ponto_registros_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gp_ponto_registros_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gp_ponto_registros_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      honorarios_contratos: {
        Row: {
          advogado_responsavel_id: string | null
          alta_probabilidade_exito: boolean
          atualizado_em: string
          base_calculo_exito: string | null
          base_rateio: string | null
          cliente_id: string
          criado_em: string
          criado_por: string | null
          data_assinatura: string | null
          data_fim_mensalidade: string | null
          data_inicio_mensalidade: string | null
          dia_vencimento: number | null
          id: string
          observacoes: string | null
          parceiro_id: string | null
          percentual_exito: number | null
          percentual_parceiro: number | null
          processo_id: string | null
          status: string
          tem_rateio: boolean
          tipo: Database["public"]["Enums"]["tipo_honorario"]
          total_parcelas: number | null
          valor_exito_estimado: number | null
          valor_fixo: number | null
          valor_fixo_parceiro: number | null
        }
        Insert: {
          advogado_responsavel_id?: string | null
          alta_probabilidade_exito?: boolean
          atualizado_em?: string
          base_calculo_exito?: string | null
          base_rateio?: string | null
          cliente_id: string
          criado_em?: string
          criado_por?: string | null
          data_assinatura?: string | null
          data_fim_mensalidade?: string | null
          data_inicio_mensalidade?: string | null
          dia_vencimento?: number | null
          id?: string
          observacoes?: string | null
          parceiro_id?: string | null
          percentual_exito?: number | null
          percentual_parceiro?: number | null
          processo_id?: string | null
          status?: string
          tem_rateio?: boolean
          tipo: Database["public"]["Enums"]["tipo_honorario"]
          total_parcelas?: number | null
          valor_exito_estimado?: number | null
          valor_fixo?: number | null
          valor_fixo_parceiro?: number | null
        }
        Update: {
          advogado_responsavel_id?: string | null
          alta_probabilidade_exito?: boolean
          atualizado_em?: string
          base_calculo_exito?: string | null
          base_rateio?: string | null
          cliente_id?: string
          criado_em?: string
          criado_por?: string | null
          data_assinatura?: string | null
          data_fim_mensalidade?: string | null
          data_inicio_mensalidade?: string | null
          dia_vencimento?: number | null
          id?: string
          observacoes?: string | null
          parceiro_id?: string | null
          percentual_exito?: number | null
          percentual_parceiro?: number | null
          processo_id?: string | null
          status?: string
          tem_rateio?: boolean
          tipo?: Database["public"]["Enums"]["tipo_honorario"]
          total_parcelas?: number | null
          valor_exito_estimado?: number | null
          valor_fixo?: number | null
          valor_fixo_parceiro?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "honorarios_contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_contratos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_contratos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      honorarios_exito: {
        Row: {
          base_calculo: string
          cliente_id: string
          contrato_id: string
          criado_em: string
          data_resultado: string
          id: string
          observacao: string | null
          pagamento_id: string | null
          percentual: number
          processo_id: string
          status: string
          valor_base: number
          valor_exito: number
        }
        Insert: {
          base_calculo: string
          cliente_id: string
          contrato_id: string
          criado_em?: string
          data_resultado: string
          id?: string
          observacao?: string | null
          pagamento_id?: string | null
          percentual: number
          processo_id: string
          status?: string
          valor_base: number
          valor_exito: number
        }
        Update: {
          base_calculo?: string
          cliente_id?: string
          contrato_id?: string
          criado_em?: string
          data_resultado?: string
          id?: string
          observacao?: string | null
          pagamento_id?: string | null
          percentual?: number
          processo_id?: string
          status?: string
          valor_base?: number
          valor_exito?: number
        }
        Relationships: [
          {
            foreignKeyName: "honorarios_exito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_exito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_exito_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "honorarios_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_exito_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "honorarios_pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_exito_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      honorarios_legado: {
        Row: {
          atualizado_em: string
          cliente_id: string
          cliente_indicador_id: string | null
          criado_em: string
          id: string
          observacoes: string | null
          parceiro_id: string | null
          parcelas: number | null
          percentual_exito: number | null
          percentual_indicacao: number | null
          percentual_parceiro: number | null
          processo_id: string | null
          status: string
          tipo: Database["public"]["Enums"]["tipo_honorario"]
          valor_fixo: number | null
          valor_mensalidade: number | null
        }
        Insert: {
          atualizado_em?: string
          cliente_id: string
          cliente_indicador_id?: string | null
          criado_em?: string
          id?: string
          observacoes?: string | null
          parceiro_id?: string | null
          parcelas?: number | null
          percentual_exito?: number | null
          percentual_indicacao?: number | null
          percentual_parceiro?: number | null
          processo_id?: string | null
          status?: string
          tipo: Database["public"]["Enums"]["tipo_honorario"]
          valor_fixo?: number | null
          valor_mensalidade?: number | null
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string
          cliente_indicador_id?: string | null
          criado_em?: string
          id?: string
          observacoes?: string | null
          parceiro_id?: string | null
          parcelas?: number | null
          percentual_exito?: number | null
          percentual_indicacao?: number | null
          percentual_parceiro?: number | null
          processo_id?: string | null
          status?: string
          tipo?: Database["public"]["Enums"]["tipo_honorario"]
          valor_fixo?: number | null
          valor_mensalidade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "honorarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_cliente_indicador_id_fkey"
            columns: ["cliente_indicador_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_cliente_indicador_id_fkey"
            columns: ["cliente_indicador_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      honorarios_pagamentos: {
        Row: {
          cliente_id: string
          comprovante_url: string | null
          contrato_id: string
          criado_em: string
          data_pagamento: string
          forma_pagamento: string
          id: string
          observacao: string | null
          parcela_id: string | null
          rateio_gerado: boolean
          registrado_por: string | null
          tipo_pagamento: string
          valor_parceiro: number | null
          valor_recebido: number
        }
        Insert: {
          cliente_id: string
          comprovante_url?: string | null
          contrato_id: string
          criado_em?: string
          data_pagamento: string
          forma_pagamento: string
          id?: string
          observacao?: string | null
          parcela_id?: string | null
          rateio_gerado?: boolean
          registrado_por?: string | null
          tipo_pagamento?: string
          valor_parceiro?: number | null
          valor_recebido: number
        }
        Update: {
          cliente_id?: string
          comprovante_url?: string | null
          contrato_id?: string
          criado_em?: string
          data_pagamento?: string
          forma_pagamento?: string
          id?: string
          observacao?: string | null
          parcela_id?: string | null
          rateio_gerado?: boolean
          registrado_por?: string | null
          tipo_pagamento?: string
          valor_parceiro?: number | null
          valor_recebido?: number
        }
        Relationships: [
          {
            foreignKeyName: "honorarios_pagamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_pagamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_pagamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "honorarios_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_pagamentos_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: false
            referencedRelation: "honorarios_parcelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_pagamentos_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: false
            referencedRelation: "vw_honorarios_parcelas"
            referencedColumns: ["id"]
          },
        ]
      }
      honorarios_parcelas: {
        Row: {
          contrato_id: string
          criado_em: string
          data_vencimento: string
          id: string
          numero_parcela: number
          status: string
          valor: number
        }
        Insert: {
          contrato_id: string
          criado_em?: string
          data_vencimento: string
          id?: string
          numero_parcela: number
          status?: string
          valor: number
        }
        Update: {
          contrato_id?: string
          criado_em?: string
          data_vencimento?: string
          id?: string
          numero_parcela?: number
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "honorarios_parcelas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "honorarios_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      honorarios_repasses: {
        Row: {
          atualizado_em: string
          base_calculo: string | null
          cliente_id: string
          comprovante_repasse_url: string | null
          contrato_id: string
          criado_em: string
          data_repasse: string | null
          forma_repasse: string | null
          id: string
          observacao: string | null
          pagamento_id: string
          parceiro_id: string
          percentual_aplicado: number | null
          status: string
          valor_repasse: number
        }
        Insert: {
          atualizado_em?: string
          base_calculo?: string | null
          cliente_id: string
          comprovante_repasse_url?: string | null
          contrato_id: string
          criado_em?: string
          data_repasse?: string | null
          forma_repasse?: string | null
          id?: string
          observacao?: string | null
          pagamento_id: string
          parceiro_id: string
          percentual_aplicado?: number | null
          status?: string
          valor_repasse: number
        }
        Update: {
          atualizado_em?: string
          base_calculo?: string | null
          cliente_id?: string
          comprovante_repasse_url?: string | null
          contrato_id?: string
          criado_em?: string
          data_repasse?: string | null
          forma_repasse?: string | null
          id?: string
          observacao?: string | null
          pagamento_id?: string
          parceiro_id?: string
          percentual_aplicado?: number | null
          status?: string
          valor_repasse?: number
        }
        Relationships: [
          {
            foreignKeyName: "honorarios_repasses_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_repasses_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_repasses_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "honorarios_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_repasses_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "honorarios_pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_repasses_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_analises_cliente: {
        Row: {
          cliente_id: string
          conteudo: string
          criado_em: string
          id: string
          modelo: string | null
          tipo: string
        }
        Insert: {
          cliente_id: string
          conteudo: string
          criado_em?: string
          id?: string
          modelo?: string | null
          tipo?: string
        }
        Update: {
          cliente_id?: string
          conteudo?: string
          criado_em?: string
          id?: string
          modelo?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_analises_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_analises_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_execucoes_log: {
        Row: {
          criado_em: string
          detalhes: Json | null
          erro: string | null
          funcao: string
          id: string
          status: string
        }
        Insert: {
          criado_em?: string
          detalhes?: Json | null
          erro?: string | null
          funcao: string
          id?: string
          status: string
        }
        Update: {
          criado_em?: string
          detalhes?: Json | null
          erro?: string | null
          funcao?: string
          id?: string
          status?: string
        }
        Relationships: []
      }
      ia_relatorios: {
        Row: {
          conteudo: string
          criado_em: string
          dados: Json | null
          id: string
          mes_referencia: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          conteudo: string
          criado_em?: string
          dados?: Json | null
          id?: string
          mes_referencia?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          conteudo?: string
          criado_em?: string
          dados?: Json | null
          id?: string
          mes_referencia?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      ie_jobs: {
        Row: {
          arquivo_entrada_nome: string | null
          arquivo_entrada_url: string | null
          arquivo_saida_nome: string | null
          arquivo_saida_url: string | null
          arquivo_tamanho_bytes: number | null
          concluido_em: string | null
          erros_json: Json
          expira_em: string | null
          filtros: Json
          id: string
          iniciado_em: string
          iniciado_por: string | null
          mensagem: string | null
          modulo: string
          registros_erro: number
          registros_ok: number
          status: string
          subtipo: string | null
          tipo: string
          total_registros: number
        }
        Insert: {
          arquivo_entrada_nome?: string | null
          arquivo_entrada_url?: string | null
          arquivo_saida_nome?: string | null
          arquivo_saida_url?: string | null
          arquivo_tamanho_bytes?: number | null
          concluido_em?: string | null
          erros_json?: Json
          expira_em?: string | null
          filtros?: Json
          id?: string
          iniciado_em?: string
          iniciado_por?: string | null
          mensagem?: string | null
          modulo: string
          registros_erro?: number
          registros_ok?: number
          status?: string
          subtipo?: string | null
          tipo: string
          total_registros?: number
        }
        Update: {
          arquivo_entrada_nome?: string | null
          arquivo_entrada_url?: string | null
          arquivo_saida_nome?: string | null
          arquivo_saida_url?: string | null
          arquivo_tamanho_bytes?: number | null
          concluido_em?: string | null
          erros_json?: Json
          expira_em?: string | null
          filtros?: Json
          id?: string
          iniciado_em?: string
          iniciado_por?: string | null
          mensagem?: string | null
          modulo?: string
          registros_erro?: number
          registros_ok?: number
          status?: string
          subtipo?: string | null
          tipo?: string
          total_registros?: number
        }
        Relationships: []
      }
      ie_mapeamentos_colunas: {
        Row: {
          criado_em: string
          id: string
          mapeamento: Json
          modulo: string
          nome: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          mapeamento: Json
          modulo: string
          nome: string
          user_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          mapeamento?: Json
          modulo?: string
          nome?: string
          user_id?: string
        }
        Relationships: []
      }
      logs_atividade: {
        Row: {
          acao: string
          criado_em: string
          detalhes: Json | null
          id: string
          ip: string | null
          registro_id: string | null
          tabela: string | null
          user_id: string | null
        }
        Insert: {
          acao: string
          criado_em?: string
          detalhes?: Json | null
          id?: string
          ip?: string | null
          registro_id?: string | null
          tabela?: string | null
          user_id?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string
          detalhes?: Json | null
          id?: string
          ip?: string | null
          registro_id?: string | null
          tabela?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      mcp_chamadas_log: {
        Row: {
          args: Json | null
          criado_em: string
          duracao_ms: number | null
          erro: string | null
          ferramenta: string
          id: string
          sucesso: boolean
          token_id: string | null
        }
        Insert: {
          args?: Json | null
          criado_em?: string
          duracao_ms?: number | null
          erro?: string | null
          ferramenta: string
          id?: string
          sucesso?: boolean
          token_id?: string | null
        }
        Update: {
          args?: Json | null
          criado_em?: string
          duracao_ms?: number | null
          erro?: string | null
          ferramenta?: string
          id?: string
          sucesso?: boolean
          token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_chamadas_log_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "mcp_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_tokens: {
        Row: {
          ativo: boolean
          criado_em: string
          expira_em: string | null
          id: string
          nome: string
          token_hash: string
          ultimo_uso_em: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          expira_em?: string | null
          id?: string
          nome: string
          token_hash: string
          ultimo_uso_em?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          expira_em?: string | null
          id?: string
          nome?: string
          token_hash?: string
          ultimo_uso_em?: string | null
          user_id?: string
        }
        Relationships: []
      }
      metas: {
        Row: {
          created_at: string
          created_by: string | null
          data_fim: string
          data_inicio: string
          descricao: string | null
          id: string
          nome: string
          periodo: Database["public"]["Enums"]["meta_periodo"]
          responsavel: string
          status: Database["public"]["Enums"]["meta_status"]
          tipo: Database["public"]["Enums"]["meta_tipo"]
          updated_at: string
          valor_alvo: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_fim: string
          data_inicio: string
          descricao?: string | null
          id?: string
          nome: string
          periodo: Database["public"]["Enums"]["meta_periodo"]
          responsavel: string
          status?: Database["public"]["Enums"]["meta_status"]
          tipo: Database["public"]["Enums"]["meta_tipo"]
          updated_at?: string
          valor_alvo: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_fim?: string
          data_inicio?: string
          descricao?: string | null
          id?: string
          nome?: string
          periodo?: Database["public"]["Enums"]["meta_periodo"]
          responsavel?: string
          status?: Database["public"]["Enums"]["meta_status"]
          tipo?: Database["public"]["Enums"]["meta_tipo"]
          updated_at?: string
          valor_alvo?: number
        }
        Relationships: []
      }
      mkt_campanhas: {
        Row: {
          area_direito: string | null
          atualizado_em: string
          canal: string
          cliques: number | null
          criado_em: string
          criado_por: string | null
          data_fim: string | null
          data_inicio: string
          gasto_realizado: number | null
          id: string
          impressoes: number | null
          leads_gerados: number | null
          nome: string
          objetivo: string | null
          observacoes: string | null
          orcamento_total: number | null
          status: string
        }
        Insert: {
          area_direito?: string | null
          atualizado_em?: string
          canal: string
          cliques?: number | null
          criado_em?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio: string
          gasto_realizado?: number | null
          id?: string
          impressoes?: number | null
          leads_gerados?: number | null
          nome: string
          objetivo?: string | null
          observacoes?: string | null
          orcamento_total?: number | null
          status?: string
        }
        Update: {
          area_direito?: string | null
          atualizado_em?: string
          canal?: string
          cliques?: number | null
          criado_em?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          gasto_realizado?: number | null
          id?: string
          impressoes?: number | null
          leads_gerados?: number | null
          nome?: string
          objetivo?: string | null
          observacoes?: string | null
          orcamento_total?: number | null
          status?: string
        }
        Relationships: []
      }
      mkt_conteudo: {
        Row: {
          alcance: number | null
          area_direito: string | null
          atualizado_em: string
          canal: string
          comentarios: number | null
          compartilhamentos: number | null
          criado_em: string
          criado_por: string | null
          curtidas: number | null
          data_planejada: string
          data_publicacao: string | null
          formato: string | null
          hashtags: string | null
          id: string
          leads_gerados: number | null
          legenda: string | null
          link_material: string | null
          pauta: string | null
          responsavel_id: string | null
          salvamentos: number | null
          status: string
          titulo: string
        }
        Insert: {
          alcance?: number | null
          area_direito?: string | null
          atualizado_em?: string
          canal: string
          comentarios?: number | null
          compartilhamentos?: number | null
          criado_em?: string
          criado_por?: string | null
          curtidas?: number | null
          data_planejada: string
          data_publicacao?: string | null
          formato?: string | null
          hashtags?: string | null
          id?: string
          leads_gerados?: number | null
          legenda?: string | null
          link_material?: string | null
          pauta?: string | null
          responsavel_id?: string | null
          salvamentos?: number | null
          status?: string
          titulo: string
        }
        Update: {
          alcance?: number | null
          area_direito?: string | null
          atualizado_em?: string
          canal?: string
          comentarios?: number | null
          compartilhamentos?: number | null
          criado_em?: string
          criado_por?: string | null
          curtidas?: number | null
          data_planejada?: string
          data_publicacao?: string | null
          formato?: string | null
          hashtags?: string | null
          id?: string
          leads_gerados?: number | null
          legenda?: string | null
          link_material?: string | null
          pauta?: string | null
          responsavel_id?: string | null
          salvamentos?: number | null
          status?: string
          titulo?: string
        }
        Relationships: []
      }
      mkt_leads: {
        Row: {
          area_direito: string | null
          atualizado_em: string
          campanha_id: string | null
          canal: string
          cidade: string | null
          cliente_id: string | null
          criado_em: string
          data_conversao: string | null
          descricao_interesse: string | null
          email: string | null
          estado: string | null
          id: string
          motivo_perda: string | null
          nome: string
          observacao_perda: string | null
          parceiro_id: string | null
          registrado_por: string | null
          responsavel_id: string | null
          status: string
          valor_contrato: number | null
          whatsapp: string | null
        }
        Insert: {
          area_direito?: string | null
          atualizado_em?: string
          campanha_id?: string | null
          canal: string
          cidade?: string | null
          cliente_id?: string | null
          criado_em?: string
          data_conversao?: string | null
          descricao_interesse?: string | null
          email?: string | null
          estado?: string | null
          id?: string
          motivo_perda?: string | null
          nome: string
          observacao_perda?: string | null
          parceiro_id?: string | null
          registrado_por?: string | null
          responsavel_id?: string | null
          status?: string
          valor_contrato?: number | null
          whatsapp?: string | null
        }
        Update: {
          area_direito?: string | null
          atualizado_em?: string
          campanha_id?: string | null
          canal?: string
          cidade?: string | null
          cliente_id?: string | null
          criado_em?: string
          data_conversao?: string | null
          descricao_interesse?: string | null
          email?: string | null
          estado?: string | null
          id?: string
          motivo_perda?: string | null
          nome?: string
          observacao_perda?: string | null
          parceiro_id?: string | null
          registrado_por?: string | null
          responsavel_id?: string | null
          status?: string
          valor_contrato?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_leads_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "mkt_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_leads_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_leads_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_leads_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      mural_avisos: {
        Row: {
          conteudo: string
          criado_em: string
          criado_por: string | null
          destinatarias: string[]
          expira_em: string | null
          fixado: boolean
          id: string
          leituras: Json
          prioridade: string
          titulo: string
        }
        Insert: {
          conteudo: string
          criado_em?: string
          criado_por?: string | null
          destinatarias?: string[]
          expira_em?: string | null
          fixado?: boolean
          id?: string
          leituras?: Json
          prioridade?: string
          titulo: string
        }
        Update: {
          conteudo?: string
          criado_em?: string
          criado_por?: string | null
          destinatarias?: string[]
          expira_em?: string | null
          fixado?: boolean
          id?: string
          leituras?: Json
          prioridade?: string
          titulo?: string
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          criado_em: string
          descricao: string | null
          dia_chave: string
          id: string
          item_id: string | null
          lida: boolean
          lida_em: string | null
          link: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          descricao?: string | null
          dia_chave?: string
          id?: string
          item_id?: string | null
          lida?: boolean
          lida_em?: string | null
          link?: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          criado_em?: string
          descricao?: string | null
          dia_chave?: string
          id?: string
          item_id?: string | null
          lida?: boolean
          lida_em?: string | null
          link?: string | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "controladoria_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes_config_eventos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          criado_em: string
          descricao: string | null
          enviar_email: boolean
          id: string
          modulo: string
          nome: string
          papeis_destino: string[]
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          criado_em?: string
          descricao?: string | null
          enviar_email?: boolean
          id?: string
          modulo: string
          nome: string
          papeis_destino?: string[]
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          criado_em?: string
          descricao?: string | null
          enviar_email?: boolean
          id?: string
          modulo?: string
          nome?: string
          papeis_destino?: string[]
        }
        Relationships: []
      }
      pagamentos_legado: {
        Row: {
          comprovante_url: string | null
          criado_em: string
          data_pagamento: string | null
          data_vencimento: string | null
          forma_pagamento: string | null
          honorario_id: string
          id: string
          observacoes: string | null
          status: string
          valor: number
        }
        Insert: {
          comprovante_url?: string | null
          criado_em?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          forma_pagamento?: string | null
          honorario_id: string
          id?: string
          observacoes?: string | null
          status?: string
          valor: number
        }
        Update: {
          comprovante_url?: string | null
          criado_em?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          forma_pagamento?: string | null
          honorario_id?: string
          id?: string
          observacoes?: string | null
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_honorario_id_fkey"
            columns: ["honorario_id"]
            isOneToOne: false
            referencedRelation: "honorarios_legado"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiro_acesso_log: {
        Row: {
          acao: string
          contexto: Json | null
          criado_em: string
          descricao: string | null
          id: string
          ip_aprox: string | null
          parceiro_id: string
          recurso_id: string | null
          recurso_tipo: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          acao: string
          contexto?: Json | null
          criado_em?: string
          descricao?: string | null
          id?: string
          ip_aprox?: string | null
          parceiro_id: string
          recurso_id?: string | null
          recurso_tipo?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          acao?: string
          contexto?: Json | null
          criado_em?: string
          descricao?: string | null
          id?: string
          ip_aprox?: string | null
          parceiro_id?: string
          recurso_id?: string | null
          recurso_tipo?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parceiro_acesso_log_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiro_documento_acesso_log: {
        Row: {
          acao: string
          criado_em: string
          documento_id: string
          id: string
          parceiro_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          acao?: string
          criado_em?: string
          documento_id: string
          id?: string
          parceiro_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          acao?: string
          criado_em?: string
          documento_id?: string
          id?: string
          parceiro_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parceiro_documento_acesso_log_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiro_documento_acesso_log_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiro_log_acesso: {
        Row: {
          acao: string
          criado_em: string
          id: string
          ip: string | null
          parceiro_id: string
          processo_id: string | null
          user_agent: string | null
        }
        Insert: {
          acao: string
          criado_em?: string
          id?: string
          ip?: string | null
          parceiro_id: string
          processo_id?: string | null
          user_agent?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string
          id?: string
          ip?: string | null
          parceiro_id?: string
          processo_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiro_log_acesso_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiro_log_acesso_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiro_permissoes_processo: {
        Row: {
          comentar_chat: boolean
          criado_em: string
          enviar_documentos: boolean
          id: string
          parceiro_id: string
          processo_id: string
          ver_andamentos: boolean
          ver_documentos: boolean
          ver_financeiro_proprio: boolean
          ver_prazos: boolean
          ver_tarefas_proprias: boolean
        }
        Insert: {
          comentar_chat?: boolean
          criado_em?: string
          enviar_documentos?: boolean
          id?: string
          parceiro_id: string
          processo_id: string
          ver_andamentos?: boolean
          ver_documentos?: boolean
          ver_financeiro_proprio?: boolean
          ver_prazos?: boolean
          ver_tarefas_proprias?: boolean
        }
        Update: {
          comentar_chat?: boolean
          criado_em?: string
          enviar_documentos?: boolean
          id?: string
          parceiro_id?: string
          processo_id?: string
          ver_andamentos?: boolean
          ver_documentos?: boolean
          ver_financeiro_proprio?: boolean
          ver_prazos?: boolean
          ver_tarefas_proprias?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "parceiro_permissoes_processo_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiro_permissoes_processo_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiro_submissoes: {
        Row: {
          atualizado_em: string
          cliente_id: string | null
          criado_em: string
          id: string
          motivo_rejeicao: string | null
          observacoes_parceiro: string | null
          parceiro_id: string
          payload: Json
          processo_id: string | null
          registro_criado_id: string | null
          revisado_em: string | null
          revisado_por: string | null
          status: Database["public"]["Enums"]["parceiro_submissao_status"]
          tipo: Database["public"]["Enums"]["parceiro_submissao_tipo"]
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          cliente_id?: string | null
          criado_em?: string
          id?: string
          motivo_rejeicao?: string | null
          observacoes_parceiro?: string | null
          parceiro_id: string
          payload?: Json
          processo_id?: string | null
          registro_criado_id?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: Database["public"]["Enums"]["parceiro_submissao_status"]
          tipo: Database["public"]["Enums"]["parceiro_submissao_tipo"]
          titulo: string
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string | null
          criado_em?: string
          id?: string
          motivo_rejeicao?: string | null
          observacoes_parceiro?: string | null
          parceiro_id?: string
          payload?: Json
          processo_id?: string | null
          registro_criado_id?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: Database["public"]["Enums"]["parceiro_submissao_status"]
          tipo?: Database["public"]["Enums"]["parceiro_submissao_tipo"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "parceiro_submissoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiro_submissoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiro_submissoes_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiro_submissoes_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros: {
        Row: {
          ativo: boolean
          atualizado_em: string
          banco_agencia: string | null
          banco_conta: string | null
          banco_nome: string | null
          banco_tipo: string | null
          cidade: string | null
          cnpj: string | null
          cpf: string | null
          criado_em: string
          criado_por: string | null
          email: string | null
          escritorio_parceiro_id: string | null
          especialidades: string[] | null
          estado: string | null
          id: string
          nome: string
          nome_social: string | null
          oab: string | null
          oab_completo: string | null
          oab_numero: string | null
          oab_seccional: string | null
          observacoes: string | null
          observacoes_internas: string | null
          percentual_padrao: number | null
          pix_chave: string | null
          pix_tipo: string | null
          portal_ativo: boolean
          portal_convite_expira_em: string | null
          portal_senha_hash: string | null
          portal_token_convite: string | null
          portal_ultimo_acesso: string | null
          status: string
          telefone: string | null
          tipo: string
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_nome?: string | null
          banco_tipo?: string | null
          cidade?: string | null
          cnpj?: string | null
          cpf?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          escritorio_parceiro_id?: string | null
          especialidades?: string[] | null
          estado?: string | null
          id?: string
          nome: string
          nome_social?: string | null
          oab?: string | null
          oab_completo?: string | null
          oab_numero?: string | null
          oab_seccional?: string | null
          observacoes?: string | null
          observacoes_internas?: string | null
          percentual_padrao?: number | null
          pix_chave?: string | null
          pix_tipo?: string | null
          portal_ativo?: boolean
          portal_convite_expira_em?: string | null
          portal_senha_hash?: string | null
          portal_token_convite?: string | null
          portal_ultimo_acesso?: string | null
          status?: string
          telefone?: string | null
          tipo?: string
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_nome?: string | null
          banco_tipo?: string | null
          cidade?: string | null
          cnpj?: string | null
          cpf?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          escritorio_parceiro_id?: string | null
          especialidades?: string[] | null
          estado?: string | null
          id?: string
          nome?: string
          nome_social?: string | null
          oab?: string | null
          oab_completo?: string | null
          oab_numero?: string | null
          oab_seccional?: string | null
          observacoes?: string | null
          observacoes_internas?: string | null
          percentual_padrao?: number | null
          pix_chave?: string | null
          pix_tipo?: string | null
          portal_ativo?: boolean
          portal_convite_expira_em?: string | null
          portal_senha_hash?: string | null
          portal_token_convite?: string | null
          portal_ultimo_acesso?: string | null
          status?: string
          telefone?: string | null
          tipo?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_escritorio_parceiro_id_fkey"
            columns: ["escritorio_parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      pje_monitoramentos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cliente_id: string | null
          criado_em: string
          criado_por: string | null
          id: string
          membro_id: string | null
          oab_legacy_id: string | null
          observacoes: string | null
          rotulo: string | null
          tipo: Database["public"]["Enums"]["pje_monitoramento_tipo"]
          uf_oab: string | null
          ultima_sync_em: string | null
          ultima_sync_qtd: number
          valor: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cliente_id?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          membro_id?: string | null
          oab_legacy_id?: string | null
          observacoes?: string | null
          rotulo?: string | null
          tipo: Database["public"]["Enums"]["pje_monitoramento_tipo"]
          uf_oab?: string | null
          ultima_sync_em?: string | null
          ultima_sync_qtd?: number
          valor: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cliente_id?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          membro_id?: string | null
          oab_legacy_id?: string | null
          observacoes?: string | null
          rotulo?: string | null
          tipo?: Database["public"]["Enums"]["pje_monitoramento_tipo"]
          uf_oab?: string | null
          ultima_sync_em?: string | null
          ultima_sync_qtd?: number
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "pje_monitoramentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pje_monitoramentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pje_monitoramentos_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pje_monitoramentos_oab_legacy_id_fkey"
            columns: ["oab_legacy_id"]
            isOneToOne: false
            referencedRelation: "pje_oabs_monitoradas"
            referencedColumns: ["id"]
          },
        ]
      }
      pje_oabs_monitoradas: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          id: string
          membro_id: string | null
          nome_advogado: string
          numero_oab: string
          observacoes: string | null
          uf_oab: string
          ultima_sync_em: string | null
          ultima_sync_qtd: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          membro_id?: string | null
          nome_advogado: string
          numero_oab: string
          observacoes?: string | null
          uf_oab: string
          ultima_sync_em?: string | null
          ultima_sync_qtd?: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          membro_id?: string | null
          nome_advogado?: string
          numero_oab?: string
          observacoes?: string | null
          uf_oab?: string
          ultima_sync_em?: string | null
          ultima_sync_qtd?: number
        }
        Relationships: [
          {
            foreignKeyName: "pje_oabs_monitoradas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      pje_publicacoes: {
        Row: {
          andamento_id: string | null
          capturada_em: string
          data_disponibilizacao: string | null
          data_publicacao: string | null
          destinatario_advogados: Json
          destinatarios: Json
          hash_dedup: string
          hash_pje: string | null
          id: string
          item_controladoria_id: string | null
          link_certidao: string | null
          meio: string | null
          monitoramento_id: string | null
          nome_orgao: string | null
          numero_processo: string | null
          numero_processo_limpo: string | null
          oab_monitorada_id: string | null
          payload_bruto: Json | null
          pje_id: string | null
          processo_id: string | null
          sigla_tribunal: string | null
          status_leitura: string
          texto_publicacao: string | null
          tipo_comunicacao: string | null
          vista_em: string | null
          vista_por: string | null
        }
        Insert: {
          andamento_id?: string | null
          capturada_em?: string
          data_disponibilizacao?: string | null
          data_publicacao?: string | null
          destinatario_advogados?: Json
          destinatarios?: Json
          hash_dedup: string
          hash_pje?: string | null
          id?: string
          item_controladoria_id?: string | null
          link_certidao?: string | null
          meio?: string | null
          monitoramento_id?: string | null
          nome_orgao?: string | null
          numero_processo?: string | null
          numero_processo_limpo?: string | null
          oab_monitorada_id?: string | null
          payload_bruto?: Json | null
          pje_id?: string | null
          processo_id?: string | null
          sigla_tribunal?: string | null
          status_leitura?: string
          texto_publicacao?: string | null
          tipo_comunicacao?: string | null
          vista_em?: string | null
          vista_por?: string | null
        }
        Update: {
          andamento_id?: string | null
          capturada_em?: string
          data_disponibilizacao?: string | null
          data_publicacao?: string | null
          destinatario_advogados?: Json
          destinatarios?: Json
          hash_dedup?: string
          hash_pje?: string | null
          id?: string
          item_controladoria_id?: string | null
          link_certidao?: string | null
          meio?: string | null
          monitoramento_id?: string | null
          nome_orgao?: string | null
          numero_processo?: string | null
          numero_processo_limpo?: string | null
          oab_monitorada_id?: string | null
          payload_bruto?: Json | null
          pje_id?: string | null
          processo_id?: string | null
          sigla_tribunal?: string | null
          status_leitura?: string
          texto_publicacao?: string | null
          tipo_comunicacao?: string | null
          vista_em?: string | null
          vista_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pje_publicacoes_andamento_id_fkey"
            columns: ["andamento_id"]
            isOneToOne: false
            referencedRelation: "andamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pje_publicacoes_item_controladoria_id_fkey"
            columns: ["item_controladoria_id"]
            isOneToOne: false
            referencedRelation: "controladoria_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pje_publicacoes_monitoramento_id_fkey"
            columns: ["monitoramento_id"]
            isOneToOne: false
            referencedRelation: "pje_monitoramentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pje_publicacoes_oab_monitorada_id_fkey"
            columns: ["oab_monitorada_id"]
            isOneToOne: false
            referencedRelation: "pje_oabs_monitoradas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pje_publicacoes_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      pje_sync_log: {
        Row: {
          data_fim: string | null
          data_inicio: string | null
          detalhes: Json | null
          disparado_por: string | null
          duracao_ms: number | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          mensagem: string | null
          modo: string
          oab_id: string | null
          status: string
          total_consultadas: number
          total_duplicadas: number
          total_erros: number
          total_novas: number
          total_vinculadas: number
        }
        Insert: {
          data_fim?: string | null
          data_inicio?: string | null
          detalhes?: Json | null
          disparado_por?: string | null
          duracao_ms?: number | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          mensagem?: string | null
          modo?: string
          oab_id?: string | null
          status?: string
          total_consultadas?: number
          total_duplicadas?: number
          total_erros?: number
          total_novas?: number
          total_vinculadas?: number
        }
        Update: {
          data_fim?: string | null
          data_inicio?: string | null
          detalhes?: Json | null
          disparado_por?: string | null
          duracao_ms?: number | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          mensagem?: string | null
          modo?: string
          oab_id?: string | null
          status?: string
          total_consultadas?: number
          total_duplicadas?: number
          total_erros?: number
          total_novas?: number
          total_vinculadas?: number
        }
        Relationships: [
          {
            foreignKeyName: "pje_sync_log_oab_id_fkey"
            columns: ["oab_id"]
            isOneToOne: false
            referencedRelation: "pje_oabs_monitoradas"
            referencedColumns: ["id"]
          },
        ]
      }
      processo_fases_padrao: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cor: string
          criado_em: string
          descricao: string | null
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cor?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cor?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      processo_parceiros: {
        Row: {
          ativo: boolean
          atualizado_em: string
          base_comissao: string | null
          base_rateio: string | null
          cliente_id: string
          criado_em: string
          criado_por: string | null
          id: string
          observacao: string | null
          parceiro_id: string
          percentual_atuacao: number | null
          percentual_indicacao: number | null
          processo_id: string
          substabelecimento_com_reserva: boolean | null
          tem_comissao_indicacao: boolean
          tem_rateio_atuacao: boolean
          tipo_participacao: string
          valor_fixo_atuacao: number | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          base_comissao?: string | null
          base_rateio?: string | null
          cliente_id: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          observacao?: string | null
          parceiro_id: string
          percentual_atuacao?: number | null
          percentual_indicacao?: number | null
          processo_id: string
          substabelecimento_com_reserva?: boolean | null
          tem_comissao_indicacao?: boolean
          tem_rateio_atuacao?: boolean
          tipo_participacao: string
          valor_fixo_atuacao?: number | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          base_comissao?: string | null
          base_rateio?: string | null
          cliente_id?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          observacao?: string | null
          parceiro_id?: string
          percentual_atuacao?: number | null
          percentual_indicacao?: number | null
          processo_id?: string
          substabelecimento_com_reserva?: boolean | null
          tem_comissao_indicacao?: boolean
          tem_rateio_atuacao?: boolean
          tipo_participacao?: string
          valor_fixo_atuacao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "processo_parceiros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processo_parceiros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processo_parceiros_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processo_parceiros_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      processo_partes: {
        Row: {
          advogado_nome: string | null
          advogado_oab: string | null
          cpf_cnpj: string | null
          criado_em: string
          id: string
          nome: string
          origem: string
          processo_id: string
          tipo: string
        }
        Insert: {
          advogado_nome?: string | null
          advogado_oab?: string | null
          cpf_cnpj?: string | null
          criado_em?: string
          id?: string
          nome: string
          origem?: string
          processo_id: string
          tipo: string
        }
        Update: {
          advogado_nome?: string | null
          advogado_oab?: string | null
          cpf_cnpj?: string | null
          criado_em?: string
          id?: string
          nome?: string
          origem?: string
          processo_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "processo_partes_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      processo_status: {
        Row: {
          ativo: boolean
          cor: string
          criado_em: string
          id: string
          nome: string
          ordem: number
          tipo_processo: string
        }
        Insert: {
          ativo?: boolean
          cor?: string
          criado_em?: string
          id?: string
          nome: string
          ordem?: number
          tipo_processo?: string
        }
        Update: {
          ativo?: boolean
          cor?: string
          criado_em?: string
          id?: string
          nome?: string
          ordem?: number
          tipo_processo?: string
        }
        Relationships: []
      }
      processos: {
        Row: {
          area_direito: string | null
          atualizado_em: string
          cliente_id: string
          comarca: string | null
          criado_em: string
          criado_por: string | null
          data_der: string | null
          data_distribuicao: string | null
          data_encerramento: string | null
          datajud_alias: string | null
          datajud_ativo: boolean
          datajud_ultima_consulta: string | null
          datajud_ultimo_andamento_id: string | null
          datajud_ultimo_erro: string | null
          dcb: string | null
          dib: string | null
          fase_administrativa: string | null
          fase_atual: string | null
          fase_padrao_id: string | null
          ia_peticao_pendente: string | null
          id: string
          instancia: string | null
          juiz: string | null
          nb_inss: string | null
          numero_cnj: string | null
          numero_cnj_limpo: string | null
          observacoes_internas: string | null
          parceiro_id: string | null
          responsavel_id: string | null
          status: string
          tipo: Database["public"]["Enums"]["tipo_processo"]
          tipo_acao: string | null
          tribunal: string | null
          tribunal_nome: string | null
          tribunal_sigla: string | null
          ultima_atualizacao_andamento: string | null
          valor_causa: number | null
          vara: string | null
        }
        Insert: {
          area_direito?: string | null
          atualizado_em?: string
          cliente_id: string
          comarca?: string | null
          criado_em?: string
          criado_por?: string | null
          data_der?: string | null
          data_distribuicao?: string | null
          data_encerramento?: string | null
          datajud_alias?: string | null
          datajud_ativo?: boolean
          datajud_ultima_consulta?: string | null
          datajud_ultimo_andamento_id?: string | null
          datajud_ultimo_erro?: string | null
          dcb?: string | null
          dib?: string | null
          fase_administrativa?: string | null
          fase_atual?: string | null
          fase_padrao_id?: string | null
          ia_peticao_pendente?: string | null
          id?: string
          instancia?: string | null
          juiz?: string | null
          nb_inss?: string | null
          numero_cnj?: string | null
          numero_cnj_limpo?: string | null
          observacoes_internas?: string | null
          parceiro_id?: string | null
          responsavel_id?: string | null
          status?: string
          tipo?: Database["public"]["Enums"]["tipo_processo"]
          tipo_acao?: string | null
          tribunal?: string | null
          tribunal_nome?: string | null
          tribunal_sigla?: string | null
          ultima_atualizacao_andamento?: string | null
          valor_causa?: number | null
          vara?: string | null
        }
        Update: {
          area_direito?: string | null
          atualizado_em?: string
          cliente_id?: string
          comarca?: string | null
          criado_em?: string
          criado_por?: string | null
          data_der?: string | null
          data_distribuicao?: string | null
          data_encerramento?: string | null
          datajud_alias?: string | null
          datajud_ativo?: boolean
          datajud_ultima_consulta?: string | null
          datajud_ultimo_andamento_id?: string | null
          datajud_ultimo_erro?: string | null
          dcb?: string | null
          dib?: string | null
          fase_administrativa?: string | null
          fase_atual?: string | null
          fase_padrao_id?: string | null
          ia_peticao_pendente?: string | null
          id?: string
          instancia?: string | null
          juiz?: string | null
          nb_inss?: string | null
          numero_cnj?: string | null
          numero_cnj_limpo?: string | null
          observacoes_internas?: string | null
          parceiro_id?: string | null
          responsavel_id?: string | null
          status?: string
          tipo?: Database["public"]["Enums"]["tipo_processo"]
          tipo_acao?: string | null
          tribunal?: string | null
          tribunal_nome?: string | null
          tribunal_sigla?: string | null
          ultima_atualizacao_andamento?: string | null
          valor_causa?: number | null
          vara?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_fase_padrao_id_fkey"
            columns: ["fase_padrao_id"]
            isOneToOne: false
            referencedRelation: "processo_fases_padrao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_tags: {
        Row: {
          criado_em: string
          processo_id: string
          tag_id: string
        }
        Insert: {
          criado_em?: string
          processo_id: string
          tag_id: string
        }
        Update: {
          criado_em?: string
          processo_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_tags_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      producao_juridica_pendencias: {
        Row: {
          atualizado_em: string
          cliente_id: string | null
          codigo: string
          contexto: Json
          criado_em: string
          criado_por: string | null
          id: string
          origem_id: string
          origem_tipo: string
          resolvido_em: string | null
          resolvido_por: string | null
          status: string
        }
        Insert: {
          atualizado_em?: string
          cliente_id?: string | null
          codigo: string
          contexto?: Json
          criado_em?: string
          criado_por?: string | null
          id?: string
          origem_id: string
          origem_tipo?: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string | null
          codigo?: string
          contexto?: Json
          criado_em?: string
          criado_por?: string | null
          id?: string
          origem_id?: string
          origem_tipo?: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
        }
        Relationships: []
      }
      producao_juridica_servicos: {
        Row: {
          area: string
          area_norm: string | null
          ativo: boolean
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          id: string
          metadados: Json
          responsavel_id: string | null
          subtipo: string | null
          subtipo_norm: string | null
          template_id: string | null
        }
        Insert: {
          area: string
          area_norm?: string | null
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          metadados?: Json
          responsavel_id?: string | null
          subtipo?: string | null
          subtipo_norm?: string | null
          template_id?: string | null
        }
        Update: {
          area?: string
          area_norm?: string | null
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          metadados?: Json
          responsavel_id?: string | null
          subtipo?: string | null
          subtipo_norm?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producao_juridica_servicos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producao_juridica_servicos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producao_juridica_servicos_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "fluxos_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          atualizado_em: string
          avatar_url: string | null
          criado_em: string
          email: string
          id: string
          nome: string
          oab: string | null
          primeiro_acesso: boolean
          telefone: string | null
          tipo_portal: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          avatar_url?: string | null
          criado_em?: string
          email: string
          id: string
          nome: string
          oab?: string | null
          primeiro_acesso?: boolean
          telefone?: string | null
          tipo_portal?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          avatar_url?: string | null
          criado_em?: string
          email?: string
          id?: string
          nome?: string
          oab?: string | null
          primeiro_acesso?: boolean
          telefone?: string | null
          tipo_portal?: string
        }
        Relationships: []
      }
      progresso_metas: {
        Row: {
          created_at: string
          created_by: string | null
          data_lancamento: string
          id: string
          meta_id: string
          observacao: string | null
          valor_lancado: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_lancamento?: string
          id?: string
          meta_id: string
          observacao?: string | null
          valor_lancado: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_lancamento?: string
          id?: string
          meta_id?: string
          observacao?: string | null
          valor_lancado?: number
        }
        Relationships: [
          {
            foreignKeyName: "progresso_metas_meta_id_fkey"
            columns: ["meta_id"]
            isOneToOne: false
            referencedRelation: "metas"
            referencedColumns: ["id"]
          },
        ]
      }
      publijus_config: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          auth_header: string
          auth_prefix: string
          base_url: string
          criado_em: string
          endpoint_busca_oab: string
          endpoint_detalhe: string
          exemplo_json: string | null
          id: string
          lista_path: string
          map_cnj: string
          map_data: string
          map_descricao: string
          map_id: string
          map_orgao: string
          map_tipo: string
          observacoes: string | null
          param_oab: string
          param_seccional: string
          ultima_sincronizacao: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          auth_header?: string
          auth_prefix?: string
          base_url?: string
          criado_em?: string
          endpoint_busca_oab?: string
          endpoint_detalhe?: string
          exemplo_json?: string | null
          id?: string
          lista_path?: string
          map_cnj?: string
          map_data?: string
          map_descricao?: string
          map_id?: string
          map_orgao?: string
          map_tipo?: string
          observacoes?: string | null
          param_oab?: string
          param_seccional?: string
          ultima_sincronizacao?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          auth_header?: string
          auth_prefix?: string
          base_url?: string
          criado_em?: string
          endpoint_busca_oab?: string
          endpoint_detalhe?: string
          exemplo_json?: string | null
          id?: string
          lista_path?: string
          map_cnj?: string
          map_data?: string
          map_descricao?: string
          map_id?: string
          map_orgao?: string
          map_tipo?: string
          observacoes?: string | null
          param_oab?: string
          param_seccional?: string
          ultima_sincronizacao?: string | null
        }
        Relationships: []
      }
      regras_comissao: {
        Row: {
          ativo: boolean
          base_calculo: Database["public"]["Enums"]["comissao_base"]
          beneficiario: string
          created_at: string
          created_by: string | null
          id: string
          observacao: string | null
          percentual: number | null
          tipo_beneficiario: Database["public"]["Enums"]["comissao_beneficiario_tipo"]
          tipo_evento: Database["public"]["Enums"]["comissao_evento"]
          updated_at: string
          valor_fixo: number | null
        }
        Insert: {
          ativo?: boolean
          base_calculo?: Database["public"]["Enums"]["comissao_base"]
          beneficiario: string
          created_at?: string
          created_by?: string | null
          id?: string
          observacao?: string | null
          percentual?: number | null
          tipo_beneficiario: Database["public"]["Enums"]["comissao_beneficiario_tipo"]
          tipo_evento: Database["public"]["Enums"]["comissao_evento"]
          updated_at?: string
          valor_fixo?: number | null
        }
        Update: {
          ativo?: boolean
          base_calculo?: Database["public"]["Enums"]["comissao_base"]
          beneficiario?: string
          created_at?: string
          created_by?: string | null
          id?: string
          observacao?: string | null
          percentual?: number | null
          tipo_beneficiario?: Database["public"]["Enums"]["comissao_beneficiario_tipo"]
          tipo_evento?: Database["public"]["Enums"]["comissao_evento"]
          updated_at?: string
          valor_fixo?: number | null
        }
        Relationships: []
      }
      seguranca_eventos: {
        Row: {
          contexto: Json | null
          criado_em: string
          detalhe: string | null
          email: string | null
          id: string
          recurso: string | null
          rota: string | null
          tipo: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          contexto?: Json | null
          criado_em?: string
          detalhe?: string | null
          email?: string | null
          id?: string
          recurso?: string | null
          rota?: string | null
          tipo: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          contexto?: Json | null
          criado_em?: string
          detalhe?: string | null
          email?: string | null
          id?: string
          recurso?: string | null
          rota?: string | null
          tipo?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      status_processo: {
        Row: {
          ativo: boolean
          cor: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          cor?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          cor?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          erro_mensagem: string | null
          executado_em: string
          fonte: string
          id: string
          novos_andamentos: number
          numero_cnj: string | null
          processo_id: string | null
          status: string
          tribunal: string | null
        }
        Insert: {
          erro_mensagem?: string | null
          executado_em?: string
          fonte?: string
          id?: string
          novos_andamentos?: number
          numero_cnj?: string | null
          processo_id?: string | null
          status: string
          tribunal?: string | null
        }
        Update: {
          erro_mensagem?: string | null
          executado_em?: string
          fonte?: string
          id?: string
          novos_andamentos?: number
          numero_cnj?: string | null
          processo_id?: string | null
          status?: string
          tribunal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          cor: string
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          cor?: string
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          cor?: string
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      tipos_prazo: {
        Row: {
          ativo: boolean
          descricao: string | null
          dias: number
          dias_uteis: boolean
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          descricao?: string | null
          dias: number
          dias_uteis?: boolean
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          descricao?: string | null
          dias?: number
          dias_uteis?: boolean
          id?: string
          nome?: string
        }
        Relationships: []
      }
      triagem_atendimentos: {
        Row: {
          assunto: string
          atendente_nome: string | null
          atendido_por: string | null
          atualizado_em: string
          canal: string
          cliente_id: string | null
          contato_email: string | null
          contato_nome: string | null
          contato_telefone: string | null
          criado_em: string
          criado_por: string | null
          data_atendimento: string
          descricao: string | null
          id: string
          observacoes: string | null
          proximo_passo: string
        }
        Insert: {
          assunto: string
          atendente_nome?: string | null
          atendido_por?: string | null
          atualizado_em?: string
          canal?: string
          cliente_id?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          criado_em?: string
          criado_por?: string | null
          data_atendimento?: string
          descricao?: string | null
          id?: string
          observacoes?: string | null
          proximo_passo?: string
        }
        Update: {
          assunto?: string
          atendente_nome?: string | null
          atendido_por?: string | null
          atualizado_em?: string
          canal?: string
          cliente_id?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          criado_em?: string
          criado_por?: string | null
          data_atendimento?: string
          descricao?: string | null
          id?: string
          observacoes?: string | null
          proximo_passo?: string
        }
        Relationships: [
          {
            foreignKeyName: "triagem_atendimentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "triagem_atendimentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_duplicados"
            referencedColumns: ["id"]
          },
        ]
      }
      ui_error_logs: {
        Row: {
          component_stack: string | null
          contexto: Json | null
          criado_em: string
          endpoint: string | null
          id: string
          mensagem: string
          modulo: string | null
          rota: string
          stack: string | null
          status_http: number | null
          tipo: string
          user_agent: string | null
          user_id: string | null
          viewport: string | null
        }
        Insert: {
          component_stack?: string | null
          contexto?: Json | null
          criado_em?: string
          endpoint?: string | null
          id?: string
          mensagem: string
          modulo?: string | null
          rota: string
          stack?: string | null
          status_http?: number | null
          tipo?: string
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Update: {
          component_stack?: string | null
          contexto?: Json | null
          criado_em?: string
          endpoint?: string | null
          id?: string
          mensagem?: string
          modulo?: string | null
          rota?: string
          stack?: string | null
          status_http?: number | null
          tipo?: string
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Relationships: []
      }
      user_log_atividade: {
        Row: {
          acao: string
          criado_em: string
          dados_antes: Json | null
          dados_depois: Json | null
          id: string
          ip: string | null
          modulo: string | null
          registro_id: string | null
          registro_titulo: string | null
          user_id: string | null
        }
        Insert: {
          acao: string
          criado_em?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          ip?: string | null
          modulo?: string | null
          registro_id?: string | null
          registro_titulo?: string | null
          user_id?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          ip?: string | null
          modulo?: string | null
          registro_id?: string | null
          registro_titulo?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_log_atividade_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          acao: Database["public"]["Enums"]["acao_permissao"]
          id: string
          modulo: Database["public"]["Enums"]["modulo"]
          permitido: boolean
          user_id: string
        }
        Insert: {
          acao: Database["public"]["Enums"]["acao_permissao"]
          id?: string
          modulo: Database["public"]["Enums"]["modulo"]
          permitido?: boolean
          user_id: string
        }
        Update: {
          acao?: Database["public"]["Enums"]["acao_permissao"]
          id?: string
          modulo?: Database["public"]["Enums"]["modulo"]
          permitido?: boolean
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          criado_em: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      usuario_ativacao_tokens: {
        Row: {
          bloqueado_ate: string | null
          codigo_ultimo4: string
          criado_em: string
          criado_por: string | null
          expira_em: string
          id: string
          observacao: string | null
          tentativas: number
          token_hash: string
          usado_em: string | null
          usado_por: string | null
          user_id: string
        }
        Insert: {
          bloqueado_ate?: string | null
          codigo_ultimo4: string
          criado_em?: string
          criado_por?: string | null
          expira_em?: string
          id?: string
          observacao?: string | null
          tentativas?: number
          token_hash: string
          usado_em?: string | null
          usado_por?: string | null
          user_id: string
        }
        Update: {
          bloqueado_ate?: string | null
          codigo_ultimo4?: string
          criado_em?: string
          criado_por?: string | null
          expira_em?: string
          id?: string
          observacao?: string | null
          tentativas?: number
          token_hash?: string
          usado_em?: string | null
          usado_por?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_ativacao_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visualizar_como_sessoes: {
        Row: {
          alvo_id: string
          alvo_tipo: string
          alvo_user_id: string | null
          ativa: boolean
          encerrado_em: string | null
          gestor_id: string
          id: string
          iniciado_em: string
          ip_origem: string | null
          user_agent: string | null
        }
        Insert: {
          alvo_id: string
          alvo_tipo: string
          alvo_user_id?: string | null
          ativa?: boolean
          encerrado_em?: string | null
          gestor_id: string
          id?: string
          iniciado_em?: string
          ip_origem?: string | null
          user_agent?: string | null
        }
        Update: {
          alvo_id?: string
          alvo_tipo?: string
          alvo_user_id?: string | null
          ativa?: boolean
          encerrado_em?: string | null
          gestor_id?: string
          id?: string
          iniciado_em?: string
          ip_origem?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      gp_banco_horas_saldo: {
        Row: {
          membro_id: string | null
          saldo_total: number | null
          total_creditos: number | null
          total_debitos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gp_banco_horas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      v_clientes_duplicados: {
        Row: {
          ativo: boolean | null
          cpf_cnpj: string | null
          criado_em: string | null
          doc_norm: string | null
          email: string | null
          id: string | null
          nome: string | null
          qtd: number | null
          whatsapp: string | null
        }
        Relationships: []
      }
      vw_honorarios_parcelas: {
        Row: {
          contrato_id: string | null
          criado_em: string | null
          data_vencimento: string | null
          dias_atraso: number | null
          id: string | null
          numero_parcela: number | null
          status: string | null
          valor: number | null
        }
        Insert: {
          contrato_id?: string | null
          criado_em?: string | null
          data_vencimento?: string | null
          dias_atraso?: never
          id?: string | null
          numero_parcela?: number | null
          status?: string | null
          valor?: number | null
        }
        Update: {
          contrato_id?: string | null
          criado_em?: string | null
          data_vencimento?: string | null
          dias_atraso?: never
          id?: string | null
          numero_parcela?: number | null
          status?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "honorarios_parcelas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "honorarios_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adicionar_dias_corridos: {
        Args: { _data_inicio: string; _dias: number }
        Returns: string
      }
      adicionar_dias_uteis: {
        Args: { _data_inicio: string; _dias: number }
        Returns: string
      }
      aprovar_submissao_parceiro: { Args: { _id: string }; Returns: string }
      atualizar_parcelas_atrasadas: { Args: never; Returns: number }
      calcular_rbt12: { Args: { _ano: number; _mes: number }; Returns: number }
      can_manage_controladoria_responsaveis: {
        Args: { _item_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_controladoria_item: {
        Args: { _item_id: string; _user_id: string }
        Returns: boolean
      }
      cancelar_instancia_fluxo: {
        Args: { _instancia_id: string; _motivo: string }
        Returns: undefined
      }
      catalogo_homologacao_controlada: { Args: never; Returns: Json }
      catalogo_norm: { Args: { _t: string }; Returns: string }
      catalogo_seed_levantamento: { Args: never; Returns: Json }
      catalogo_sugerir_homologacao: { Args: never; Returns: Json }
      cliente_completude: { Args: { _id: string }; Returns: number }
      cliente_id_do_usuario: { Args: { _user_id: string }; Returns: string }
      cliente_id_por_cpf: { Args: { _cpf: string }; Returns: string }
      clientes_por_documento: {
        Args: { _doc: string }
        Returns: {
          cpf_cnpj: string
          criado_em: string
          email: string
          id: string
          nome: string
          status: string
          whatsapp: string
        }[]
      }
      comercial_responsavel_comunicacao: { Args: never; Returns: Json }
      comunicacao_marcar_comunicada: {
        Args: { _id: string; _observacao?: string }
        Returns: {
          atualizado_em: string
          cliente_id: string | null
          comunicado_em: string | null
          comunicado_por: string | null
          criado_em: string
          id: string
          item_id: string
          observacao: string | null
          origem: string
          processo_id: string | null
          responsavel_id: string | null
          sla_limite_em: string | null
          sla_preferencial_em: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "comunicacoes_cliente"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      concluir_etapa_fluxo: {
        Args: { _checklist?: Json; _comentario?: string; _etapa_id: string }
        Returns: string
      }
      confirmar_ativacao_conta: { Args: { _codigo: string }; Returns: Json }
      controladoria_transicionar_etapa: {
        Args: {
          _item_id: string
          _nova_etapa: string
          _observacao?: string
          _responsavel_id?: string
        }
        Returns: {
          alerta_1dia_enviado: boolean
          alerta_3dias_enviado: boolean
          alerta_atraso_enviado: boolean
          anotacoes_revisao: string | null
          atualizado_em: string
          cancelado_motivo: string | null
          cliente_confirmado: boolean
          cliente_id: string | null
          coluna_kanban: string
          comentario_revisao: string | null
          concluido_em: string | null
          concluido_por: string | null
          corretor_id: string | null
          criado_em: string
          criado_por: string | null
          data_inicio: string | null
          data_intimacao: string | null
          data_vencimento: string
          descricao: string | null
          documentos_entregues: string | null
          documentos_recebidos: string | null
          etapa_atualizada_em: string
          etapa_workflow: string
          executor_id: string | null
          exige_revisao: boolean
          id: string
          juiz: string | null
          link_virtual: string | null
          local: string | null
          o_que_levar: string | null
          orientacoes: string | null
          origem: string
          origem_atendimento_id: string | null
          prioridade: Database["public"]["Enums"]["prioridade"]
          processo_id: string | null
          protocolador_id: string | null
          proximo_passo: string | null
          responsavel_id: string | null
          resultado: string | null
          revisor_id: string | null
          sla_entrada_em: string | null
          sla_minutos_pausados: number
          sla_pausa_motivo: string | null
          sla_pausado_em: string | null
          sla_previsto_em: string | null
          sla_status: string
          status: Database["public"]["Enums"]["status_item"]
          tarefa_origem_id: string | null
          tipo: Database["public"]["Enums"]["tipo_item_controladoria"]
          tipo_prazo_id: string | null
          titulo: string
          vara: string | null
          visivel_parceiro: boolean
        }
        SetofOptions: {
          from: "*"
          to: "controladoria_itens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      converter_lead_em_cliente: {
        Args: {
          _advogado_responsavel?: string
          _lead_id: string
          _valor_contrato?: number
        }
        Returns: string
      }
      criar_token_mcp: {
        Args: { _expira_em?: string; _nome: string }
        Returns: Json
      }
      disparar_email_evento: { Args: { _payload: Json }; Returns: undefined }
      gerar_parcelas_contrato: {
        Args: { _contrato_id: string }
        Returns: number
      }
      gerar_senha_padrao_cliente: { Args: { _nome: string }; Returns: string }
      gerar_token_ativacao: {
        Args: { _observacao?: string; _user_id: string }
        Returns: {
          codigo: string
          expira_em: string
        }[]
      }
      gp_membro_id_do_usuario: { Args: { _user_id: string }; Returns: string }
      has_permission: {
        Args: {
          _acao: Database["public"]["Enums"]["acao_permissao"]
          _modulo: Database["public"]["Enums"]["modulo"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      iniciar_producao_juridica: {
        Args: { _atendimento_id: string; _processo_id?: string }
        Returns: Json
      }
      instanciar_fluxo:
        | {
            Args: {
              _cliente_id?: string
              _data_gatilho?: string
              _observacoes?: string
              _processo_id?: string
              _responsavel_id?: string
              _template_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _cliente_id?: string
              _data_audiencia?: string
              _data_gatilho?: string
              _data_intimacao?: string
              _observacoes?: string
              _processo_id?: string
              _responsavel_id?: string
              _template_id: string
            }
            Returns: string
          }
      is_authenticated_active: { Args: never; Returns: boolean }
      is_gestor: { Args: { _user_id: string }; Returns: boolean }
      is_interno_ativo: { Args: { _user_id: string }; Returns: boolean }
      marcar_etapas_fluxo_atrasadas: { Args: never; Returns: number }
      mural_marcar_lido: { Args: { _aviso_id: string }; Returns: undefined }
      mural_marcar_todos_lidos: { Args: never; Returns: number }
      notificar_comentario_controladoria: {
        Args: {
          _descricao: string
          _item_id: string
          _link: string
          _titulo: string
          _user_id: string
        }
        Returns: undefined
      }
      notificar_mencoes_controladoria: {
        Args: { _item_id: string; _user_ids: string[] }
        Returns: undefined
      }
      parceiro_id_do_usuario: { Args: { _user_id: string }; Returns: string }
      parceiro_ve_processo: {
        Args: { _processo_id: string; _user_id: string }
        Returns: boolean
      }
      pausar_instancia_fluxo: {
        Args: { _instancia_id: string }
        Returns: undefined
      }
      pje_vincular_publicacao_a_processo: {
        Args: {
          _criar_item_controladoria?: boolean
          _prazo_dias?: number
          _processo_id: string
          _publicacao_id: string
        }
        Returns: string
      }
      pode_ver_andamento_no_portal: {
        Args: { _andamento_id: string }
        Returns: boolean
      }
      pode_ver_contrato_no_portal: {
        Args: { _contrato_id: string }
        Returns: boolean
      }
      pode_ver_processo_no_portal: {
        Args: { _processo_id: string }
        Returns: boolean
      }
      ponto_registrar_evento: {
        Args: { _evento: string }
        Returns: {
          aprovado_em: string | null
          aprovado_por: string | null
          atualizado_em: string
          criado_em: string
          data: string
          entrada: string | null
          horas_esperadas: number
          horas_extras: number
          horas_falta: number
          horas_trabalhadas: number | null
          id: string
          justificativa: string | null
          membro_id: string
          registrado_por: string | null
          retorno_almoco: string | null
          saida: string | null
          saida_almoco: string | null
          status: string
          tipo_registro: string
        }
        SetofOptions: {
          from: "*"
          to: "gp_ponto_registros"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ponto_verificar_vinculo: { Args: never; Returns: Json }
      producao_aguardar_documentos: {
        Args: { _item_id: string; _motivo: string }
        Returns: {
          alerta_1dia_enviado: boolean
          alerta_3dias_enviado: boolean
          alerta_atraso_enviado: boolean
          anotacoes_revisao: string | null
          atualizado_em: string
          cancelado_motivo: string | null
          cliente_confirmado: boolean
          cliente_id: string | null
          coluna_kanban: string
          comentario_revisao: string | null
          concluido_em: string | null
          concluido_por: string | null
          corretor_id: string | null
          criado_em: string
          criado_por: string | null
          data_inicio: string | null
          data_intimacao: string | null
          data_vencimento: string
          descricao: string | null
          documentos_entregues: string | null
          documentos_recebidos: string | null
          etapa_atualizada_em: string
          etapa_workflow: string
          executor_id: string | null
          exige_revisao: boolean
          id: string
          juiz: string | null
          link_virtual: string | null
          local: string | null
          o_que_levar: string | null
          orientacoes: string | null
          origem: string
          origem_atendimento_id: string | null
          prioridade: Database["public"]["Enums"]["prioridade"]
          processo_id: string | null
          protocolador_id: string | null
          proximo_passo: string | null
          responsavel_id: string | null
          resultado: string | null
          revisor_id: string | null
          sla_entrada_em: string | null
          sla_minutos_pausados: number
          sla_pausa_motivo: string | null
          sla_pausado_em: string | null
          sla_previsto_em: string | null
          sla_status: string
          status: Database["public"]["Enums"]["status_item"]
          tarefa_origem_id: string | null
          tipo: Database["public"]["Enums"]["tipo_item_controladoria"]
          tipo_prazo_id: string | null
          titulo: string
          vara: string | null
          visivel_parceiro: boolean
        }
        SetofOptions: {
          from: "*"
          to: "controladoria_itens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      producao_retomar_producao: {
        Args: {
          _documento_recebido: string
          _item_id: string
          _observacao: string
        }
        Returns: {
          alerta_1dia_enviado: boolean
          alerta_3dias_enviado: boolean
          alerta_atraso_enviado: boolean
          anotacoes_revisao: string | null
          atualizado_em: string
          cancelado_motivo: string | null
          cliente_confirmado: boolean
          cliente_id: string | null
          coluna_kanban: string
          comentario_revisao: string | null
          concluido_em: string | null
          concluido_por: string | null
          corretor_id: string | null
          criado_em: string
          criado_por: string | null
          data_inicio: string | null
          data_intimacao: string | null
          data_vencimento: string
          descricao: string | null
          documentos_entregues: string | null
          documentos_recebidos: string | null
          etapa_atualizada_em: string
          etapa_workflow: string
          executor_id: string | null
          exige_revisao: boolean
          id: string
          juiz: string | null
          link_virtual: string | null
          local: string | null
          o_que_levar: string | null
          orientacoes: string | null
          origem: string
          origem_atendimento_id: string | null
          prioridade: Database["public"]["Enums"]["prioridade"]
          processo_id: string | null
          protocolador_id: string | null
          proximo_passo: string | null
          responsavel_id: string | null
          resultado: string | null
          revisor_id: string | null
          sla_entrada_em: string | null
          sla_minutos_pausados: number
          sla_pausa_motivo: string | null
          sla_pausado_em: string | null
          sla_previsto_em: string | null
          sla_status: string
          status: Database["public"]["Enums"]["status_item"]
          tarefa_origem_id: string | null
          tipo: Database["public"]["Enums"]["tipo_item_controladoria"]
          tipo_prazo_id: string | null
          titulo: string
          vara: string | null
          visivel_parceiro: boolean
        }
        SetofOptions: {
          from: "*"
          to: "controladoria_itens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      producao_revisor_padrao: { Args: never; Returns: Json }
      recalcular_progresso_fluxo: {
        Args: { _instancia_id: string }
        Returns: number
      }
      registrar_evento_seguranca: {
        Args: {
          _contexto?: Json
          _detalhe?: string
          _recurso?: string
          _rota?: string
          _tipo: string
          _user_agent?: string
        }
        Returns: undefined
      }
      rejeitar_submissao_parceiro: {
        Args: { _id: string; _motivo: string }
        Returns: undefined
      }
      retomar_instancia_fluxo: {
        Args: { _instancia_id: string }
        Returns: undefined
      }
      revogar_token_mcp: { Args: { _id: string }; Returns: undefined }
      seguranca_resumo: { Args: never; Returns: Json }
      seguranca_verificar_alertas: { Args: never; Returns: Json }
      unificar_clientes: {
        Args: { _id_a: string; _id_b: string }
        Returns: string
      }
      usuario_ve_cliente: {
        Args: { _cliente_id: string; _user_id: string }
        Returns: boolean
      }
      usuario_ve_contrato_financeiro: {
        Args: { _contrato_id: string; _user_id: string }
        Returns: boolean
      }
      usuario_ve_processo: {
        Args: { _processo_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      acao_permissao: "visualizar" | "criar" | "editar" | "excluir" | "exportar"
      app_role:
        | "gestor"
        | "advogado"
        | "controladoria"
        | "administrativo"
        | "estagiario"
      cargo_equipe:
        | "gestor"
        | "advogado"
        | "estagiario"
        | "administrativo"
        | "socio"
        | "outro"
      comissao_base: "honorarios_brutos" | "valor_recebido"
      comissao_beneficiario_tipo: "estagiaria" | "parceiro"
      comissao_evento:
        | "indicacao_fechada"
        | "contrato_assinado"
        | "caso_encaminhado"
      comissao_status: "a_pagar" | "pago"
      doc_area_direito:
        | "previdenciario"
        | "familia"
        | "civil"
        | "trabalhista"
        | "tributario"
        | "consumidor"
        | "geral"
      doc_categoria:
        | "peticao_inicial"
        | "recurso"
        | "manifestacao"
        | "contrato"
        | "procuracao"
        | "administrativo_inss"
        | "quesitos"
        | "notificacao"
        | "outro"
      doc_peca_status:
        | "rascunho"
        | "em_revisao"
        | "revisado"
        | "finalizado"
        | "protocolado"
      doc_variavel_fonte:
        | "fixo"
        | "processo"
        | "cliente"
        | "advogado"
        | "manual"
      meta_periodo: "mensal" | "trimestral" | "anual"
      meta_status: "ativa" | "pausada" | "concluida"
      meta_tipo:
        | "faturamento_mensal"
        | "contratos_fechados"
        | "atendimentos"
        | "casos_por_area"
        | "personalizada"
      modulo:
        | "clientes"
        | "processos"
        | "controladoria"
        | "financeiro"
        | "documentos"
        | "relatorios"
        | "usuarios"
        | "parceiros"
        | "equipe"
        | "dashboard"
        | "marketing"
      papel_responsavel: "principal" | "apoio"
      parceiro_submissao_status:
        | "pendente"
        | "aprovado"
        | "rejeitado"
        | "cancelado"
      parceiro_submissao_tipo:
        | "cliente"
        | "processo"
        | "andamento"
        | "documento"
      pje_monitoramento_tipo: "oab" | "nome" | "cpf_cnpj" | "cnj"
      prioridade: "baixa" | "media" | "alta" | "urgente"
      saida_categoria:
        | "suprimentos"
        | "equipamentos"
        | "aluguel"
        | "servicos"
        | "impostos"
        | "salarios"
        | "marketing"
        | "tecnologia"
        | "viagem"
        | "manutencao"
        | "outros"
      saida_origem: "manual" | "repasse" | "comissao"
      saida_status: "pendente" | "pago" | "cancelado"
      status_comissao_fechamento:
        | "pendente"
        | "calculada"
        | "confirmada"
        | "cancelada"
      status_folha: "pendente" | "revisado" | "pago"
      status_item:
        | "pendente"
        | "em_andamento"
        | "aguardando"
        | "aguardando_revisao"
        | "concluido"
        | "cancelado"
      status_membro: "ativo" | "inativo" | "afastado"
      suprimento_recorrencia: "unico" | "mensal" | "parcelado"
      suprimento_tipo:
        | "produto"
        | "equipamento"
        | "servico"
        | "assinatura"
        | "outro"
      tipo_honorario: "fixo" | "exito" | "misto" | "mensalidade"
      tipo_item_controladoria:
        | "prazo_fatal"
        | "prazo_processual"
        | "audiencia"
        | "reuniao"
        | "diligencia"
        | "tarefa"
        | "despacho"
        | "decisao"
        | "sentenca"
        | "recurso"
        | "peticao"
        | "intimacao"
        | "protocolo"
        | "pericia"
        | "conciliacao"
      tipo_processo: "judicial" | "administrativo"
      tipo_remuneracao: "fixo" | "comissao" | "misto" | "producao"
      tipo_vinculo_equipe:
        | "clt"
        | "autonomo"
        | "estagio"
        | "socio"
        | "prestador"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      acao_permissao: ["visualizar", "criar", "editar", "excluir", "exportar"],
      app_role: [
        "gestor",
        "advogado",
        "controladoria",
        "administrativo",
        "estagiario",
      ],
      cargo_equipe: [
        "gestor",
        "advogado",
        "estagiario",
        "administrativo",
        "socio",
        "outro",
      ],
      comissao_base: ["honorarios_brutos", "valor_recebido"],
      comissao_beneficiario_tipo: ["estagiaria", "parceiro"],
      comissao_evento: [
        "indicacao_fechada",
        "contrato_assinado",
        "caso_encaminhado",
      ],
      comissao_status: ["a_pagar", "pago"],
      doc_area_direito: [
        "previdenciario",
        "familia",
        "civil",
        "trabalhista",
        "tributario",
        "consumidor",
        "geral",
      ],
      doc_categoria: [
        "peticao_inicial",
        "recurso",
        "manifestacao",
        "contrato",
        "procuracao",
        "administrativo_inss",
        "quesitos",
        "notificacao",
        "outro",
      ],
      doc_peca_status: [
        "rascunho",
        "em_revisao",
        "revisado",
        "finalizado",
        "protocolado",
      ],
      doc_variavel_fonte: ["fixo", "processo", "cliente", "advogado", "manual"],
      meta_periodo: ["mensal", "trimestral", "anual"],
      meta_status: ["ativa", "pausada", "concluida"],
      meta_tipo: [
        "faturamento_mensal",
        "contratos_fechados",
        "atendimentos",
        "casos_por_area",
        "personalizada",
      ],
      modulo: [
        "clientes",
        "processos",
        "controladoria",
        "financeiro",
        "documentos",
        "relatorios",
        "usuarios",
        "parceiros",
        "equipe",
        "dashboard",
        "marketing",
      ],
      papel_responsavel: ["principal", "apoio"],
      parceiro_submissao_status: [
        "pendente",
        "aprovado",
        "rejeitado",
        "cancelado",
      ],
      parceiro_submissao_tipo: [
        "cliente",
        "processo",
        "andamento",
        "documento",
      ],
      pje_monitoramento_tipo: ["oab", "nome", "cpf_cnpj", "cnj"],
      prioridade: ["baixa", "media", "alta", "urgente"],
      saida_categoria: [
        "suprimentos",
        "equipamentos",
        "aluguel",
        "servicos",
        "impostos",
        "salarios",
        "marketing",
        "tecnologia",
        "viagem",
        "manutencao",
        "outros",
      ],
      saida_origem: ["manual", "repasse", "comissao"],
      saida_status: ["pendente", "pago", "cancelado"],
      status_comissao_fechamento: [
        "pendente",
        "calculada",
        "confirmada",
        "cancelada",
      ],
      status_folha: ["pendente", "revisado", "pago"],
      status_item: [
        "pendente",
        "em_andamento",
        "aguardando",
        "aguardando_revisao",
        "concluido",
        "cancelado",
      ],
      status_membro: ["ativo", "inativo", "afastado"],
      suprimento_recorrencia: ["unico", "mensal", "parcelado"],
      suprimento_tipo: [
        "produto",
        "equipamento",
        "servico",
        "assinatura",
        "outro",
      ],
      tipo_honorario: ["fixo", "exito", "misto", "mensalidade"],
      tipo_item_controladoria: [
        "prazo_fatal",
        "prazo_processual",
        "audiencia",
        "reuniao",
        "diligencia",
        "tarefa",
        "despacho",
        "decisao",
        "sentenca",
        "recurso",
        "peticao",
        "intimacao",
        "protocolo",
        "pericia",
        "conciliacao",
      ],
      tipo_processo: ["judicial", "administrativo"],
      tipo_remuneracao: ["fixo", "comissao", "misto", "producao"],
      tipo_vinculo_equipe: ["clt", "autonomo", "estagio", "socio", "prestador"],
    },
  },
} as const

