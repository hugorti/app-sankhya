// app/separacao.tsx

import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { queryJson, registerUserActivity, carregarItensSeparacao } from '@/services/api';
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
}

export default function SeparacaoScreen() {
  const { session } = useSession();
  const router = useRouter();

  const [dados, setDados] = useState<DadosSeparacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [validando, setValidando] = useState<number | null>(null);

  const buscarSeparacoes = useCallback(async () => {
    if (!session?.jsessionid || !session?.username) {
      setError('Sessão não disponível');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setDados([]);

      const usuarioLogado = session.username.replace(/'/g, "''");

      const sqlQuery = `
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

                CASE
                    WHEN ISNULL(TSEP.SITUACAO, -1) = -1
                        THEN 'Não enviado'
                    WHEN TSEP.SITUACAO = 1
                        THEN 'Enviado para separação'
                    WHEN TSEP.SITUACAO = 2
                        THEN 'Em processo de separação'
                    WHEN TSEP.SITUACAO = 3
                        THEN 'Aguardando conferência'
                    WHEN TSEP.SITUACAO = 9
                        THEN 'Conferência validada'
                    WHEN TSEP.SITUACAO = 16
                        THEN 'Concluído'
                    ELSE
                        'Situação desconhecida (' +
                        CAST(TSEP.SITUACAO AS VARCHAR(10)) + ')'
                END AS SITUACAOWMS,

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
            SITUACAOWMS,
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

      const result = await queryJson('DbExplorerSP.executeQuery', {
        sql: sqlQuery,
      });

      if (result?.rows && result.rows.length > 0) {
        const separacoes: DadosSeparacao[] = result.rows.map((row: any[]) => ({
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
          COD_SITUACAO: Number(row[18]) || -1,
        }));

        setDados(separacoes);
      } else {
        setDados([]);
        setError('Nenhuma separação encontrada');
      }
    } catch (err) {
      console.error('❌ Erro na consulta:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar separações');
    } finally {
      setLoading(false);
    }
  }, [session?.jsessionid, session?.username]);

  useEffect(() => {
    buscarSeparacoes();
  }, [buscarSeparacoes]);

  const filteredSeparacoes = dados.filter((s) => {
    const termo = searchTerm.trim().toLowerCase();
    if (!termo) return true;
    return (
      String(s.NUTAREFA).includes(termo) ||
      String(s.NUNOTA).includes(termo) ||
      String(s.OC).includes(termo) ||
      s.DESCRPROD.toLowerCase().includes(termo) ||
      s.ENDORIG.toLowerCase().includes(termo) ||
      s.ENDDESTINO.toLowerCase().includes(termo)
    );
  });

  const getStatusLabel = (cod: number) => {
    switch (cod) {
      case 1: return 'Enviado para separação';
      case 2: return 'Em processo de separação';
      case 3: return 'Aguardando conferência';
      case 9: return 'Conferência validada';
      case 16: return 'Concluído';
      default: return 'Não enviado';
    }
  };

  const getStatusColor = (cod: number) => {
    switch (cod) {
      case 1: return '#2196F3';
      case 2: return '#FF9800';
      case 3: return '#9C27B0';
      case 9: return '#4CAF50';
      case 16: return '#2E7D32';
      default: return '#F44336';
    }
  };

  const handlePressCard = async (item: DadosSeparacao) => {
    registerUserActivity();

    if (validando !== null) return;
    setValidando(item.NUTAREFA);

    try {
      const validacao = await carregarItensSeparacao(item.NUTAREFA);

      if (!validacao.podeSeparar) {
        const itens = validacao.bloqueados
          .slice(0, 5)
          .map(
            (b) =>
              `• Ref ${b.REFERENCIA} / Lote ${b.LOTE}\n` +
              `  Estoque: ${b.ESTOQUE} | Saída pend.: ${b.SAIDASPEND}`
          )
          .join('\n\n');

        const extra =
          validacao.bloqueados.length > 5
            ? `\n\n...e mais ${validacao.bloqueados.length - 5} item(ns).`
            : '';

        Alert.alert(
          'Estoque insuficiente',
          `Não é possível efetuar esta separação.\n\n` +
            `Estoque menor que a saída para:\n\n${itens}${extra}\n\n` +
            `Faça um ressuprimento ou ajuste de estoque.`,
          [{ text: 'Entendi' }]
        );
        return;
      }

      router.push({
        pathname: '/separacaoItem',
        params: {
          nutarefa: String(item.NUTAREFA),
          nunota: String(item.NUNOTA),
          ordemCarga: String(item.OC),
        },
      });
    } catch (err) {
      console.error('❌ Erro na validação de estoque:', err);
      Alert.alert('Erro', 'Não foi possível validar o estoque. Tente novamente.');
    } finally {
      setValidando(null);
    }
  };

  const renderItem = ({ item }: { item: DadosSeparacao }) => {
    const carregando = validando === item.NUTAREFA;

    return (
      <TouchableOpacity
        style={[styles.card, carregando && styles.cardCarregando]}
        activeOpacity={0.8}
        onPress={() => handlePressCard(item)}
        disabled={validando !== null}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Tarefa: {item.NUTAREFA}</Text>
          <Text style={styles.cardTitle}>Pedido: {item.NUNOTA}</Text>
        </View>

        <View style={styles.cardRow}>
          <Text
            style={[
              styles.cardStatus,
              { backgroundColor: getStatusColor(item.COD_SITUACAO) },
            ]}
          >
            {getStatusLabel(item.COD_SITUACAO)}
          </Text>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="list-outline" size={18} color="#666" />
          <Text style={styles.cardLabel}>Ordem Carga:</Text>
          <Text style={styles.cardValue}>{item.OC}</Text>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="cube-outline" size={18} color="#666" />
          <Text style={styles.cardLabel}>Produto:</Text>
          <Text style={styles.cardValue} numberOfLines={1}>
            {item.CODPROD} - {item.DESCRPROD}
          </Text>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="barcode-outline" size={18} color="#666" />
          <Text style={styles.cardLabel}>Controle:</Text>
          <Text style={styles.cardValue}>{item.CONTROLE}</Text>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="log-out-outline" size={18} color="#E91E63" />
          <Text style={styles.cardLabel}>End. Origem:</Text>
          <Text style={styles.cardValue} numberOfLines={1}>
            {item.ENDORIG || '—'}
          </Text>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="log-in-outline" size={18} color="#4CAF50" />
          <Text style={styles.cardLabel}>End. Destino:</Text>
          <Text style={styles.cardValue} numberOfLines={1}>
            {item.ENDDESTINO || '—'}
          </Text>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="cube-outline" size={18} color="#666" />
          <Text style={styles.cardLabel}>Caixas:</Text>
          <Text style={styles.volumeValue}>{item.QTD_CAIXAS}</Text>
        </View>

        <View style={styles.cardFooter}>
          <Ionicons name="person-circle-outline" size={16} color="#666" />
          <Text
            style={[
              styles.cardConferente,
              !item.NOMEUSU && styles.cardSemResponsavel,
            ]}
          >
            {item.NOMEUSU || 'SEM RESPONSÁVEL'}
          </Text>
          {carregando && (
            <ActivityIndicator
              size="small"
              color="#FF9800"
              style={{ marginLeft: 8 }}
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            registerUserActivity();
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Minhas Separações</Text>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            registerUserActivity();
            buscarSeparacoes();
          }}
        >
          <Ionicons name="refresh" size={23} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por tarefa, pedido ou endereço"
          placeholderTextColor="#999"
          value={searchTerm}
          onChangeText={(text) => {
            registerUserActivity();
            setSearchTerm(text);
          }}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchTerm.length > 0 && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              registerUserActivity();
              setSearchTerm('');
            }}
          >
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF9800" />
          <Text style={styles.loadingText}>Carregando separações...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={30} color="#D32F2F" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            activeOpacity={0.7}
            onPress={() => {
              registerUserActivity();
              buscarSeparacoes();
            }}
          >
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredSeparacoes}
          renderItem={renderItem}
          keyExtractor={(item, index) =>
            `${item.NUTAREFA}-${item.NUNOTA}-${index}`
          }
          extraData={searchTerm}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
          removeClippedSubviews={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={48} color="#999" />
              <Text style={styles.emptyText}>Nenhuma separação encontrada</Text>
            </View>
          }
          refreshing={loading}
          onRefresh={() => {
            registerUserActivity();
            buscarSeparacoes();
          }}
        />
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    marginHorizontal: 10,
    marginVertical: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    paddingVertical: 8,
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 20,
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 15,
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
  },
  card: {
    backgroundColor: 'white',
    padding: 12,
    marginHorizontal: 4,
    marginVertical: 5,
    borderRadius: 8,
    elevation: 2,
  },
  cardCarregando: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  cardStatus: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    minHeight: 22,
  },
  cardLabel: {
    fontSize: 13,
    color: '#666',
    marginLeft: 6,
    width: 98,
  },
  cardValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  volumeValue: {
    fontSize: 15,
    color: '#FF9800',
    fontWeight: 'bold',
    flex: 1,
  },
  cardFooter: {
    marginTop: 5,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  cardConferente: {
    fontSize: 11,
    color: '#666',
    marginLeft: 4,
  },
  cardSemResponsavel: {
    color: '#E65100',
    fontWeight: 'bold',
    fontStyle: 'italic',
  },
});