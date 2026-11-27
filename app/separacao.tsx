// app/separacao.tsx

import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  queryJson,
  registerUserActivity,
  verificarTarefasConcluidas,
} from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { Ionicons } from '@expo/vector-icons';

interface DadosSeparacao {
  NUTAREFA: number;
  NUNOTA: number;
  OC: number;
  CODPROD: number;
  DESCRPROD: string;
  CONTROLE: string;
  CODENDORIGEM: number;
  ENDORIG: string;
  CODENDDESTINO: number;
  ENDDESTINO: string;
  QTD_CAIXAS: number;
  ESTOQUEVOLPAD: number;
  COD_SITUACAO: number;
  CODUSU: number | null;
  NOMEUSU: string;
  CONCLUIDA: boolean;
}

interface TarefaElegivel {
  tarefa: DadosSeparacao;
  prioridade: number; // 1 = em andamento (usuário), 2 = não iniciada (usuário), 3 = sem vínculo
  temEstoque: boolean;
  bloqueios: {
    REFERENCIA: string;
    LOTE: string;
    ESTOQUE: number;
    SAIDASPEND: number;
  }[];
}

const SQL_VALIDACAO_ESTOQUE = (nutarefa: number) => `
  SELECT
      ITT.NUTAREFA,
      ISNULL(TSEP.NUNOTA, 0)                 AS NUNOTA,
      ISNULL(TSEP.ORDEMCARGA, 0)             AS OC,
      ISNULL(TSEP.NUSEPARACAO, 0)            AS NUSEPARACAO,
      ITT.CODPROD,
      ISNULL(P.DESCRPROD, '')                AS DESCRPROD,
      ISNULL(P.REFERENCIA, '')               AS REFERENCIA,
      ITT.CONTROLE                           AS LOTE,
      ITT.CODENDORIGEM,
      ISNULL(ENDORIG.ENDERECO, '')           AS ENDERECO,
      ISNULL(EST.CODVOL, '')                 AS UNIDADE_ESTOQUE,
      ISNULL(EST.ESTOQUE, 0)                 AS ESTOQUE,
      ISNULL(EST.SAIDASPEND, 0)              AS SAIDASPEND,
      ISNULL(VOA.CODBARRA, '')               AS CODBARRA,
      ISNULL(VOA.QUANTIDADE, 1)              AS QTD_POR_CAIXA,
      CASE
          WHEN ISNULL(EST.SAIDASPEND, 0) <= 0 THEN 0
          WHEN EST.CODVOL = 'CX' THEN EST.SAIDASPEND
          WHEN EST.CODVOL = 'UN' AND ISNULL(VOA.QUANTIDADE, 0) > 0
              THEN CAST(EST.SAIDASPEND AS DECIMAL(10,2)) / VOA.QUANTIDADE
          ELSE EST.SAIDASPEND
      END AS QTD_BIPAR,
      CASE
          WHEN EST.CODEND IS NULL THEN 1
          WHEN ISNULL(EST.SAIDASPEND, 0) > ISNULL(EST.ESTOQUE, 0) THEN 1
          ELSE 0
      END AS BLOQUEADO
  FROM SANKHYA.TGWITT ITT
  INNER JOIN SANKHYA.TGWSEP TSEP
      ON TSEP.NUTAREFA = ITT.NUTAREFA
  LEFT JOIN SANKHYA.TGWEST EST
      ON EST.CODEND   = ITT.CODENDORIGEM
     AND EST.CODPROD  = ITT.CODPROD
     AND EST.CONTROLE = ITT.CONTROLE
  LEFT JOIN SANKHYA.TGFPRO P
      ON P.CODPROD = ITT.CODPROD
  LEFT JOIN SANKHYA.TGWEND ENDORIG
      ON ENDORIG.CODEND = ITT.CODENDORIGEM
  LEFT JOIN SANKHYA.TGFVOA VOA
      ON VOA.CODPROD = ITT.CODPROD
     AND VOA.CODVOL  = 'CX'
  WHERE ITT.NUTAREFA = ${Number(nutarefa)}
  ORDER BY ITT.CODPROD, ITT.CONTROLE
`;

const SQL_LISTA_SEPARACOES = (usuarioLogado: string) => `
  WITH ESTOQUE_AGRUPADO AS (
      SELECT
          CODEND,
          CODPROD,
          CONTROLE,
          SUM(ESTOQUEVOLPAD) AS ESTOQUEVOLPAD
      FROM SANKHYA.TGWEST
      GROUP BY
          CODEND,
          CODPROD,
          CONTROLE
  ),
  BASE AS (
      SELECT
          TSEP.NUNOTA,
          ITT.NUTAREFA,
          TSEP.ORDEMCARGA AS OC,

          ITT.CODPROD,
          P.DESCRPROD,
          ITT.CONTROLE,

          ITT.CODENDORIGEM,
          ENDORIG.ENDERECO AS ENDORIG,

          ITT.CODENDDESTINO,
          ENDDEST.ENDERECO AS ENDDESTINO,

          ITT.QTDORIG AS QUANTIDADE,
          ITT.CODVOLORIG,

          ISNULL(EST.ESTOQUEVOLPAD, 0) AS ESTOQUEVOLPAD,

          CASE
              WHEN V.QUANTIDADE IS NULL OR V.QUANTIDADE = 0
                  THEN 0
              ELSE CAST(
                  ISNULL(EST.ESTOQUEVOLPAD, 0) / V.QUANTIDADE
                  AS DECIMAL(10,2)
              )
          END AS QTD_CAIXAS,

          TSEP.NUSEPARACAO,

          ITT.CODUSUEXEC AS CODUSU,
          USUEXEC.NOMEUSU,

          TSEP.SITUACAO AS COD_SITUACAO,

          ROW_NUMBER() OVER (
              PARTITION BY ITT.NUTAREFA
              ORDER BY ITT.NUTAREFA DESC
          ) AS RN

      FROM SANKHYA.TGWITT ITT

      INNER JOIN SANKHYA.TGWSEP TSEP
          ON TSEP.NUTAREFA = ITT.NUTAREFA

      LEFT JOIN SANKHYA.TGWEND ENDORIG
          ON ENDORIG.CODEND = ITT.CODENDORIGEM

      INNER JOIN SANKHYA.TGWEND ENDDEST
          ON ENDDEST.CODEND = ITT.CODENDDESTINO

      LEFT JOIN ESTOQUE_AGRUPADO EST
          ON EST.CODEND = ITT.CODENDDESTINO
         AND EST.CODPROD = ITT.CODPROD
         AND EST.CONTROLE = ITT.CONTROLE

      LEFT JOIN SANKHYA.TGFPRO P
          ON P.CODPROD = ITT.CODPROD

      LEFT JOIN SANKHYA.TGFVOA V
          ON V.CODPROD = ITT.CODPROD
         AND V.CODVOL = 'CX'

      LEFT JOIN SANKHYA.TSIUSU USUEXEC
          ON USUEXEC.CODUSU = ITT.CODUSUEXEC

      WHERE
          SUBSTRING(ENDDEST.ENDERECO, 1, 5) = '03.70'
          AND TSEP.NUNOTA IS NOT NULL
          AND TSEP.SITUACAO IN (1, 2)
          AND ITT.SITUACAO IN ('A', 'E')
          AND (
              ITT.CODUSUEXEC = (
                  SELECT CODUSU
                  FROM SANKHYA.TSIUSU
                  WHERE NOMEUSU = '${usuarioLogado}'
              )
              OR ITT.CODUSUEXEC IS NULL
          )
  )
  SELECT
      NUTAREFA,
      NUNOTA,
      OC,
      CODPROD,
      DESCRPROD,
      CONTROLE,
      CODENDORIGEM,
      ENDORIG,
      CODENDDESTINO,
      ENDDESTINO,
      QUANTIDADE,
      CODVOLORIG,
      ESTOQUEVOLPAD,
      QTD_CAIXAS,
      NUSEPARACAO,
      CODUSU,
      NOMEUSU,
      COD_SITUACAO
  FROM BASE
  WHERE RN = 1
  ORDER BY
      CASE
          WHEN CODUSU = (
              SELECT CODUSU
              FROM SANKHYA.TSIUSU
              WHERE NOMEUSU = '${usuarioLogado}'
          ) THEN 0
          ELSE 1
      END,
      NUTAREFA DESC
`;

export default function SeparacaoScreen() {
  const { session } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [semTarefasElegiveis, setSemTarefasElegiveis] = useState(false);

  const buscarSeparacoes = useCallback(async () => {
    if (!session?.jsessionid || !session?.username) {
      setError('Sessão não disponível');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSemTarefasElegiveis(false);

      const usuarioLogado = session.username.replace(/'/g, "''");

      const result = await queryJson('DbExplorerSP.executeQuery', {
        sql: SQL_LISTA_SEPARACOES(usuarioLogado),
      });

      if (!result?.rows || result.rows.length === 0) {
        setError('Nenhuma separação encontrada');
        return;
      }

      const separacoesBase: DadosSeparacao[] = result.rows.map(
        (row: any[]) => ({
          NUTAREFA: Number(row[0]) || 0,
          NUNOTA: Number(row[1]) || 0,
          OC: Number(row[2]) || 0,
          CODPROD: Number(row[3]) || 0,
          DESCRPROD: row[4] || '',
          CONTROLE: row[5] || '',
          CODENDORIGEM: Number(row[6]) || 0,
          ENDORIG: row[7] || '',
          CODENDDESTINO: Number(row[8]) || 0,
          ENDDESTINO: row[9] || '',
          ESTOQUEVOLPAD: Number(row[12]) || 0,
          QTD_CAIXAS: Number(row[13]) || 0,
          CODUSU: row[15] === null ? null : Number(row[15]),
          NOMEUSU: row[16] || '',
          COD_SITUACAO: Number(row[17]) || -1,
          CONCLUIDA: false,
        })
      );

      // Remove as já concluídas (AD_SEPARACAOWMS com STATUS='S')
      const concluidas = await verificarTarefasConcluidas(
        separacoesBase.map((s) => s.NUTAREFA)
      );

      const semConcluidas = separacoesBase
        .map((s) => ({ ...s, CONCLUIDA: concluidas.has(s.NUTAREFA) }))
        .filter((s) => !s.CONCLUIDA);

      if (semConcluidas.length === 0) {
        setError('Todas as separações já foram concluídas');
        return;
      }

      // Priorização:
      //  1 = em andamento do usuário (SITUACAO 2 + CODUSU = usuário)
      //  2 = não iniciada do usuário (SITUACAO 1 + CODUSU = usuário)
      //  3 = sem vínculo com usuário (CODUSU null)
      const priorizadas: TarefaElegivel[] = semConcluidas
        .map((tarefa) => {
          let prioridade = 99;

          const nomeUsuarioOk =
            tarefa.CODUSU !== null &&
            tarefa.NOMEUSU?.toUpperCase() === session.username.toUpperCase();

          if (tarefa.COD_SITUACAO === 2 && nomeUsuarioOk) {
            prioridade = 1;
          } else if (tarefa.COD_SITUACAO === 1 && nomeUsuarioOk) {
            prioridade = 2;
          } else if (tarefa.CODUSU === null) {
            prioridade = 3;
          }

          return {
            tarefa,
            prioridade,
            temEstoque: true,
            bloqueios: [],
          };
        })
        .sort((a, b) => {
          if (a.prioridade !== b.prioridade) {
            return a.prioridade - b.prioridade;
          }
          return b.tarefa.NUTAREFA - a.tarefa.NUTAREFA;
        });

      // Valida estoque na ordem de prioridade
      let escolhida: TarefaElegivel | null = null;

      for (const tarefa of priorizadas) {
        try {
          const validacao = await queryJson('DbExplorerSP.executeQuery', {
            sql: SQL_VALIDACAO_ESTOQUE(tarefa.tarefa.NUTAREFA),
          });

          const rows: any[] = validacao?.rows ?? [];

          const bloqueios = rows
            .map((row) => ({
              REFERENCIA: row[6] || '',
              LOTE: row[7] || '',
              ESTOQUE: Number(row[11]) || 0,
              SAIDASPEND: Number(row[12]) || 0,
              BLOQUEADO: Number(row[16]) || 0,
            }))
            .filter((b) => b.BLOQUEADO === 1)
            .map(({ BLOQUEADO, ...rest }) => rest);

          if (bloqueios.length === 0) {
            tarefa.temEstoque = true;
            escolhida = tarefa;
            break;
          } else {
            tarefa.temEstoque = false;
            tarefa.bloqueios = bloqueios;
          }
        } catch (err) {
          console.error(
            `❌ Erro na validação de estoque da tarefa ${tarefa.tarefa.NUTAREFA}:`,
            err
          );
          tarefa.temEstoque = false;
          tarefa.bloqueios = [];
        }
      }

      if (escolhida) {
        router.replace({
          pathname: '/separacaoItem',
          params: {
            nutarefa: String(escolhida.tarefa.NUTAREFA),
            nunota: String(escolhida.tarefa.NUNOTA),
            ordemCarga: String(escolhida.tarefa.OC),
          },
        });
        return;
      }

      const bloqueada = priorizadas.find((t) => !t.temEstoque);
      if (bloqueada) {
        const lista = bloqueada.bloqueios
          .slice(0, 5)
          .map(
            (b) =>
              `• Ref ${b.REFERENCIA} / Lote ${b.LOTE}\n` +
              `  Estoque: ${b.ESTOQUE} | Saída pend.: ${b.SAIDASPEND}`
          )
          .join('\n\n');

        const extra =
          bloqueada.bloqueios.length > 5
            ? `\n\n...e mais ${bloqueada.bloqueios.length - 5} item(ns).`
            : '';

        Alert.alert(
          'Estoque insuficiente',
          `Não é possível efetuar a separação da tarefa ${bloqueada.tarefa.NUTAREFA}.\n\n` +
            `Estoque menor que a saída para:\n\n${lista}${extra}\n\n` +
            `Faça um ressuprimento ou ajuste de estoque.`,
          [
            {
              text: 'Voltar',
              onPress: () => router.replace('/(tabs)'),
            },
          ]
        );
      } else {
        setSemTarefasElegiveis(true);
      }
    } catch (err) {
      console.error('❌ Erro na consulta:', err);
      setError(
        err instanceof Error ? err.message : 'Erro ao buscar separações'
      );
    } finally {
      setLoading(false);
    }
  }, [session?.jsessionid, session?.username, router]);

  useEffect(() => {
    buscarSeparacoes();
  }, [buscarSeparacoes]);

  const handleVoltar = () => {
    registerUserActivity();
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity activeOpacity={0.7} onPress={handleVoltar}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Separação</Text>
        <TouchableOpacity activeOpacity={0.7} onPress={handleVoltar}>
          <Ionicons name="home-outline" size={23} color="white" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF9800" />
          <Text style={styles.loadingText}>Buscando próxima tarefa...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={40} color="#D32F2F" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            activeOpacity={0.7}
            onPress={handleVoltar}
          >
            <Text style={styles.retryButtonText}>Voltar para início</Text>
          </TouchableOpacity>
        </View>
      ) : semTarefasElegiveis ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="folder-open-outline" size={48} color="#999" />
          <Text style={styles.emptyText}>
            Nenhuma tarefa disponível para separação no momento.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            activeOpacity={0.7}
            onPress={handleVoltar}
          >
            <Text style={styles.retryButtonText}>Voltar para início</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF9800" />
          <Text style={styles.loadingText}>Abrindo tarefa...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FF9800',
    paddingTop: 38,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: 'white',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#D32F2F',
    marginTop: 10,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 15,
    backgroundColor: '#FF9800',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyText: {
    marginTop: 15,
    color: '#666',
    fontSize: 15,
    textAlign: 'center',
  },
});