// app/conferenciaLista.tsx

import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  FlatList,
} from 'react-native';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { queryJson, registerUserActivity } from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { Ionicons } from '@expo/vector-icons';

interface DadosConferencia {
  ORDEMCARGA: number;
  NOMEPARC: string;
  VOLUMES: string;
  VOLUMETOTAL: number;
  DESCRICAO: string;
  STATUS: string;
  CONFERENTE: string;
  NUNOTA: number;
}

export default function ConferenciaListaScreen() {
  const { session } = useSession();
  const router = useRouter();

  const [dados, setDados] = useState<DadosConferencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  /**
   * Busca todas as conferências
   */
  const buscarTodasConferencias = useCallback(async () => {
    if (!session?.jsessionid) {
      setError('Sessão não disponível');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const sqlQuery = `
        WITH EXP_ULTIMO AS (
          SELECT
            CODIGO,
            ORDEMCARGA,
            NUNOTA,
            VOLUMES,
            DESCRICAO,
            SITUACAO,
            CONFERENTE,
            ROW_NUMBER() OVER (
              PARTITION BY NUNOTA
              ORDER BY CODIGO DESC
            ) AS RN
          FROM SANKHYA.AD_EXPEDICAODASH
          WHERE SITUACAO IS NOT NULL
        )

        SELECT TOP 20
          EXP.ORDEMCARGA,
          ISNULL(PAR.NOMEPARC, '') AS NOMEPARC,

          -- TRAZ DIRETAMENTE O CAMPO VOLUMES
          -- EXEMPLO: 52 / 52
          ISNULL(EXP.VOLUMES, '0 / 0') AS VOLUMES,

          (
            SELECT COUNT(*)
            FROM SANKHYA.TGWREV REV
            WHERE REV.NUSEPARACAO IN (
              SELECT SEP.NUSEPARACAO
              FROM SANKHYA.TGWSEP SEP
              WHERE SEP.NUNOTA = EXP.NUNOTA
            )
          ) AS VOLUMETOTAL,

          ISNULL(EXP.DESCRICAO, '') AS DESCRICAO,
          ISNULL(EXP.SITUACAO, 'PENDENTE') AS STATUS,
          ISNULL(EXP.CONFERENTE, 'PENDENTE') AS CONFERENTE,
          EXP.NUNOTA

        FROM EXP_ULTIMO EXP

        LEFT JOIN SANKHYA.TGFCAB CAB
          ON EXP.NUNOTA = CAB.NUNOTA

        LEFT JOIN SANKHYA.TGFPAR PAR
          ON CAB.CODPARC = PAR.CODPARC

        WHERE EXP.RN = 1

        ORDER BY
          EXP.ORDEMCARGA DESC,
          EXP.NUNOTA DESC
      `;

      console.log('🔎 Buscando lista de conferências...');

      const result = await queryJson('DbExplorerSP.executeQuery', {
        sql: sqlQuery,
      });

      console.log(
        '📦 Resultado conferências:',
        result?.rows?.length || 0
      );

      if (result?.rows && result.rows.length > 0) {
        const conferencias: DadosConferencia[] = result.rows.map(
          (row: any[]) => ({
            ORDEMCARGA: Number(row[0]) || 0,

            NOMEPARC: row[1] || '',

            // IMPORTANTE:
            // NÃO converte para número.
            // O banco já possui "52 / 52".
            VOLUMES: String(row[2] ?? '0 / 0'),

            VOLUMETOTAL: Number(row[3]) || 0,

            DESCRICAO: row[4] || '',

            STATUS: row[5] || 'PENDENTE',

            CONFERENTE: row[6] || 'PENDENTE',

            NUNOTA: Number(row[7]) || 0,
          })
        );

        console.log(
          '📋 Conferências carregadas:',
          JSON.stringify(conferencias, null, 2)
        );

        setDados(conferencias);
      } else {
        setDados([]);
        setError('Nenhuma conferência encontrada');
      }
    } catch (err) {
      console.error('❌ Erro na consulta:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao buscar conferências'
      );
    } finally {
      setLoading(false);
    }
  }, [session?.jsessionid]);

  /**
   * Carrega ao abrir a tela
   */
  useEffect(() => {
    buscarTodasConferencias();
  }, [buscarTodasConferencias]);

  /**
   * Filtro
   */
  const filteredConferencias = dados.filter((conf) => {
    const termo = searchTerm.trim().toLowerCase();

    if (!termo) {
      return true;
    }

    return (
      String(conf.NUNOTA).includes(termo) ||
      String(conf.ORDEMCARGA).includes(termo) ||
      conf.NOMEPARC.toLowerCase().includes(termo) ||
      conf.DESCRICAO.toLowerCase().includes(termo) ||
      conf.VOLUMES.toLowerCase().includes(termo)
    );
  });

  /**
   * Retorna cor do status
   */
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FINALIZADO':
      case 'Conferência completa':
      case 'CONFERIDO':
        return '#4CAF50';

      case 'Conferência com divergência':
        return '#FF9800';

      default:
        return '#F44336';
    }
  };

  /**
   * Renderização de cada item
   */
  const renderItem = ({
    item,
  }: {
    item: DadosConferencia;
  }) => {
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => {
          // Apenas registra atividade.
          // Não navega e não executa lógica pesada.
          registerUserActivity();
        }}
      >
        {/* CABEÇALHO */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            Pedido: {item.NUNOTA}
          </Text>
        </View>

        {/* STATUS */}
        <View style={styles.cardRow}>
          <Text
            style={[
              styles.cardStatus,
              {
                backgroundColor: getStatusColor(item.STATUS),
              },
            ]}
          >
            {item.STATUS}
          </Text>
        </View>

        {/* ORDEM DE CARGA */}
        <View style={styles.cardRow}>
          <Ionicons
            name="list-outline"
            size={18}
            color="#666"
          />

          <Text style={styles.cardLabel}>
            Ordem Carga:
          </Text>

          <Text style={styles.cardValue}>
            {item.ORDEMCARGA}
          </Text>
        </View>

        {/* CLIENTE */}
        <View style={styles.cardRow}>
          <Ionicons
            name="person-outline"
            size={18}
            color="#666"
          />

          <Text style={styles.cardLabel}>
            Cliente:
          </Text>

          <Text
            style={styles.cardValue}
            numberOfLines={1}
          >
            {item.NOMEPARC}
          </Text>
        </View>

        {/* VOLUMES */}
        <View style={styles.cardRow}>
          <Ionicons
            name="cube-outline"
            size={18}
            color="#666"
          />

          <Text style={styles.cardLabel}>
            Volumes:
          </Text>

          <Text style={styles.volumeValue}>
            {item.VOLUMES}
          </Text>
        </View>

        {/* DESCRIÇÃO */}
        {item.DESCRICAO ? (
          <View style={styles.cardRow}>
            <Ionicons
              name="document-text-outline"
              size={18}
              color="#666"
            />

            <Text style={styles.cardLabel}>
              Descrição:
            </Text>

            <Text
              style={styles.cardValue}
              numberOfLines={2}
            >
              {item.DESCRICAO}
            </Text>
          </View>
        ) : null}

        {/* CONFERENTE */}
        <View style={styles.cardFooter}>
          <Ionicons
            name="person-circle-outline"
            size={16}
            color="#666"
          />

          <Text style={styles.cardConferente}>
            {item.CONFERENTE}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  /**
   * TELA
   */
  return (
    <View style={styles.container}>

      {/* CABEÇALHO */}
      <View style={styles.header}>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            registerUserActivity();
            router.back();
          }}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color="white"
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Lista de Conferências
        </Text>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            registerUserActivity();
            buscarTodasConferencias();
          }}
        >
          <Ionicons
            name="refresh"
            size={23}
            color="white"
          />
        </TouchableOpacity>

      </View>

      {/* PESQUISA */}
      <View style={styles.searchContainer}>

        <Ionicons
          name="search"
          size={20}
          color="#999"
          style={styles.searchIcon}
        />

        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por pedido ou OC"
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
            <Ionicons
              name="close-circle"
              size={20}
              color="#999"
            />
          </TouchableOpacity>
        )}

      </View>

      {/* CONTEÚDO */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color="#4CAF50"
          />

          <Text style={styles.loadingText}>
            Carregando conferências...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>

          <Ionicons
            name="warning"
            size={30}
            color="#D32F2F"
          />

          <Text style={styles.errorText}>
            {error}
          </Text>

          <TouchableOpacity
            style={styles.retryButton}
            activeOpacity={0.7}
            onPress={() => {
              registerUserActivity();
              buscarTodasConferencias();
            }}
          >
            <Text style={styles.retryButtonText}>
              Tentar novamente
            </Text>
          </TouchableOpacity>

        </View>
      ) : (
        <FlatList
          data={filteredConferencias}
          renderItem={renderItem}
          keyExtractor={(item, index) =>
            `${item.ORDEMCARGA}-${item.NUNOTA}-${index}`
          }
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
          removeClippedSubviews={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>

              <Ionicons
                name="folder-open-outline"
                size={48}
                color="#999"
              />

              <Text style={styles.emptyText}>
                Nenhuma conferência encontrada
              </Text>

            </View>
          }
          refreshing={loading}
          onRefresh={() => {
            registerUserActivity();
            buscarTodasConferencias();
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

    backgroundColor: '#2196F3',

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

    width: 88,
  },

  cardValue: {
    fontSize: 13,

    color: '#333',

    fontWeight: '500',

    flex: 1,
  },

  volumeValue: {
    fontSize: 15,

    color: '#2196F3',

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
});