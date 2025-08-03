// app/conferenciaLista.tsx
import { View, Text, StyleSheet, ActivityIndicator, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { queryJson } from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { Ionicons } from '@expo/vector-icons';

interface DadosConferencia {
  ORDEMCARGA: number;
  NOMEPARC: string;
  VOLUMES: number;
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
  const [loading, setLoading] = useState(true); // Inicia como true para carregar automaticamente
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const loadData = async () => {
      await buscarTodasConferencias();
    };
    loadData();
  }, [session]);

  

  const buscarTodasConferencias = async () => {
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
            *, 
            ROW_NUMBER() OVER (PARTITION BY NUNOTA ORDER BY CODIGO DESC) AS rn
          FROM AD_EXPEDICAODASH
          WHERE SITUACAO IS NOT NULL
        )

        SELECT
          EXP.ORDEMCARGA,
          PAR.NOMEPARC,
          ISNULL(EXP.VOLUMES, 0) AS VOLUMES,
          (SELECT COUNT(*) FROM TGWREV WHERE NUSEPARACAO IN 
            (SELECT NUSEPARACAO FROM TGWSEP WHERE NUNOTA = EXP.NUNOTA)) AS VOLUMETOTAL,
          EXP.DESCRICAO,
          ISNULL(EXP.SITUACAO, 'PENDENTE') AS STATUS,
          ISNULL(EXP.CONFERENTE, 'PENDENTE') AS CONFERENTE,
          EXP.NUNOTA
        FROM EXP_ULTIMO EXP
        LEFT JOIN TGFCAB CAB ON EXP.NUNOTA = CAB.NUNOTA
        LEFT JOIN TGFPAR PAR ON CAB.CODPARC = PAR.CODPARC
        WHERE EXP.rn = 1
        ORDER BY EXP.ORDEMCARGA DESC, EXP.NUNOTA DESC
      `;

      const result = await queryJson('DbExplorerSP.executeQuery', {
        sql: sqlQuery
      });

      if (result.rows.length > 0) {
        const conferencias: DadosConferencia[] = result.rows.map((row: any[]) => ({
          ORDEMCARGA: row[0],
          NOMEPARC: row[1],
          VOLUMES: row[2] || 0,
          VOLUMETOTAL: row[3] || 0,
          DESCRICAO: row[4] || '',
          STATUS: row[5] || 'PENDENTE',
          CONFERENTE: row[6] || 'PENDENTE',
          NUNOTA: row[7]
        }));
        
        setDados(conferencias);
      } else {
        setError('Nenhuma conferência encontrada');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar conferências');
      console.error('Erro na consulta:', err);
    } finally {
      setLoading(false);
    }
  };


  const filteredConferencias = dados.filter(conf => {
    const matchesSearch = searchTerm === '' || 
      conf.NUNOTA.toString().includes(searchTerm) ||
      conf.ORDEMCARGA.toString().includes(searchTerm) ||
      conf.NOMEPARC.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (conf.DESCRICAO && conf.DESCRICAO.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return conf.STATUS !== null && matchesSearch;
  });

  const getStatusColor = (volumes: number, volumeTotal: number) => {

    return volumes === volumeTotal ? '#2196F3' : '#F44336'; // Azul se igual, Vermelho se diferente
  };

  const renderItem = ({ item }: { item: DadosConferencia }) => (
    <TouchableOpacity 
      style={styles.card} 
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Nota: {item.NUNOTA}</Text>
      </View>
      
      <View style={[styles.cardRow, { marginBottom: 4 }]}>
        <Text style={[
          styles.cardStatus,
          { 
            backgroundColor: getStatusColor(item.VOLUMES, item.VOLUMETOTAL),
            color: 'white',
            alignSelf: 'flex-start'
          }
        ]}>
          {item.STATUS}
        </Text>
      </View>
      
      <View style={styles.cardRow}>
        <Ionicons name="list-outline" size={18} color="#666" />
        <Text style={styles.cardLabel}>Ordem Carga:</Text>
        <Text style={styles.cardValue}>{item.ORDEMCARGA}</Text>
      </View>
      
      <View style={styles.cardRow}>
        <Ionicons name="person-outline" size={18} color="#666" />
        <Text style={styles.cardLabel}>Cliente:</Text>
        <Text style={[styles.cardValue, { flexShrink: 1 }]} numberOfLines={1}>
          {item.NOMEPARC}
        </Text>
      </View>
      
      <View style={styles.cardRow}>
        <Ionicons name="cube-outline" size={18} color="#666" />
        <Text style={styles.cardLabel}>Volumes:</Text>
        <Text style={styles.cardValue}>
          {item.VOLUMES}
        </Text>
      </View>
      
      {item.DESCRICAO && (
        <View style={styles.cardRow}>
          <Ionicons name="document-text-outline" size={18} color="#666" />
          <Text style={styles.cardLabel}>Descrição:</Text>
          <Text style={[styles.cardValue, { flexShrink: 1 }]} numberOfLines={2}>
            {item.DESCRICAO}
          </Text>
        </View>
      )}
      
      <View style={styles.cardFooter}>
        <Text style={styles.cardConferente}>
          <Ionicons name="person-circle-outline" size={16} />
          {item.CONFERENTE}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lista de Conferências</Text>
        <TouchableOpacity onPress={buscarTodasConferencias}>
          <Ionicons name="refresh" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nota ou oc"
          placeholderTextColor="#999"
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {searchTerm ? (
          <TouchableOpacity onPress={() => setSearchTerm('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Carregando conferências...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={24} color="#D32F2F" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={buscarTodasConferencias}
          >
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredConferencias}
          renderItem={renderItem}
          keyExtractor={(item) => `${item.ORDEMCARGA}-${item.NUNOTA}`}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={48} color="#999" />
              <Text style={styles.emptyText}>Nenhuma conferência encontrada</Text>
            </View>
          }
          refreshing={loading}
          onRefresh={buscarTodasConferencias}
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
    padding: 16,
    backgroundColor: '#2196F3',
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  listContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  errorText: {
    color: '#D32F2F',
    marginTop: 8,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#FF9800',
    padding: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 16,
    color: '#999',
    fontSize: 16,
  },
  card: {
    backgroundColor: 'white',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  cardStatus: {
    fontSize: 14,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    width: 100,
  },
  cardValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  cardFooter: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cardConferente: {
    fontSize: 12,
    color: '#666',
  },
});