// app/expedução.tsx
import { View, Text, StyleSheet, ActivityIndicator, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { queryJson } from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { Ionicons } from '@expo/vector-icons';

interface DadosSeparacao {
  SEQETIQUETA: string;
  ORDEMCARGA: number;
  NUCONFERENCIA: number;
  NOMEPARC: string;
  TOTAL_VOLUMES: number;
  NUSEPARACAO: number;
}

export default function ExpedicaoScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [dados, setDados] = useState<DadosSeparacao | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ordemCarga, setOrdemCarga] = useState('');
  const [nunota, setNunota] = useState('');

  const buscarDados = async () => {
    if (!session?.jsessionid || !ordemCarga.trim() || !nunota.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setDados(null);
      
      const sqlQuery = `
        SELECT
          '1/' + CAST(MAX(REV.SEQETIQUETA) OVER () AS VARCHAR) AS SEQETIQUETA,
          SEP.ORDEMCARGA,
          COI.NUCONFERENCIA,
          PAR.NOMEPARC,
          COUNT(*) OVER () AS TOTAL_VOLUMES,
          SEP.NUSEPARACAO
        FROM TGWREV REV
        LEFT JOIN TGWSEP SEP ON REV.NUSEPARACAO = SEP.NUSEPARACAO
        OUTER APPLY (
          SELECT TOP 1 NUCONFERENCIA
          FROM TGWCOI
          WHERE SEP.NUCONFERENCIA = TGWCOI.NUCONFERENCIA
          ORDER BY NUCONFERENCIA DESC
        ) COI
        LEFT JOIN TGFCAB CAB ON SEP.NUNOTA = CAB.NUNOTA
        LEFT JOIN TGFPAR PAR ON CAB.CODPARC = PAR.CODPARC
        WHERE SEP.ORDEMCARGA = ${ordemCarga}
        AND CAB.NUNOTA = ${nunota}
        GROUP BY
          REV.SEQETIQUETA,
          SEP.ORDEMCARGA,
          COI.NUCONFERENCIA,
          PAR.NOMEPARC,
          SEP.NUSEPARACAO
      `;

      const result = await queryJson('DbExplorerSP.executeQuery', {
        sql: sqlQuery
      });

      if (result.rows.length > 0) {
        const primeiroRegistro = result.rows[0];
        setDados({
          SEQETIQUETA: primeiroRegistro[0],
          ORDEMCARGA: primeiroRegistro[1],
          NUCONFERENCIA: primeiroRegistro[2],
          NOMEPARC: primeiroRegistro[3],
          TOTAL_VOLUMES: primeiroRegistro[4],
          NUSEPARACAO: primeiroRegistro[5]
        });
      } else {
        setError('Nenhuma expedição encontrada para os filtros informados');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar dados');
      console.error('Erro na consulta:', err);
    } finally {
      setLoading(false);
    }
  };

  const abrirConferencia = () => {
    if (dados) {
      router.push({
        pathname: '/conferencia',
        params: {
          nuseparacao: dados.NUSEPARACAO,
          totalVolumes: dados.TOTAL_VOLUMES,
          ordemCarga: dados.ORDEMCARGA,
          nunota: nunota
        }
      });
    }
  };

  return (
    <View style={styles.container}>
      {/* Cabeçalho (mantido fora do ScrollView para ficar fixo) */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Expedição de Carga</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Conteúdo principal dentro de ScrollView */}
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Formulário de busca */}
        <View style={styles.formContainer}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Ordem de Carga</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite a ordem de carga"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={ordemCarga}
              onChangeText={setOrdemCarga}
            />
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nota Fiscal</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite o número da nota"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={nunota}
              onChangeText={setNunota}
            />
          </View>
          
          <TouchableOpacity 
            style={styles.searchButton}
            onPress={buscarDados}
            disabled={loading || !ordemCarga || !nunota}
          >
            <Ionicons name="search" size={24} color="white" />
            <Text style={styles.searchButtonText}>
              {loading ? 'Buscando...' : 'Buscar pedido'}
            </Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="warning" size={24} color="#D32F2F" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {dados && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Dados da Expedição</Text>
            
            <View style={styles.cardRow}>
              <Ionicons name="barcode-outline" size={20} color="#4CAF50" />
              <Text style={styles.cardLabel}>Etiqueta:</Text>
              <Text style={styles.cardValue}>{dados.SEQETIQUETA}</Text>
            </View>
            
            <View style={styles.cardRow}>
              <Ionicons name="list-outline" size={20} color="#4CAF50" />
              <Text style={styles.cardLabel}>Ordem Carga:</Text>
              <Text style={styles.cardValue}>{dados.ORDEMCARGA}</Text>
            </View>
            
            <View style={styles.cardRow}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#4CAF50" />
              <Text style={styles.cardLabel}>Conferência:</Text>
              <Text style={styles.cardValue}>{dados.NUCONFERENCIA}</Text>
            </View>
            
            <View style={styles.cardRow}>
              <Ionicons name="person-outline" size={20} color="#4CAF50" />
              <Text style={styles.cardLabel}>Cliente:</Text>
              <Text style={styles.cardValue}>{dados.NOMEPARC}</Text>
            </View>
            
            <View style={styles.cardRow}>
              <Ionicons name="cube-outline" size={20} color="#4CAF50" />
              <Text style={styles.cardLabel}>Total Volumes:</Text>
              <Text style={styles.cardValue}>{dados.TOTAL_VOLUMES}</Text>
            </View>

            <TouchableOpacity 
              style={styles.conferirButton}
              onPress={abrirConferencia}
            >
              <Ionicons name="checkmark-done-outline" size={24} color="white" />
              <Text style={styles.conferirButtonText}>Iniciar Conferência</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20, // Espaço extra no final
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FF9800',
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  formContainer: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
  searchButton: {
    flexDirection: 'row',
    backgroundColor: '#FF9800',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  searchButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFEBEE',
    padding: 16,
    borderRadius: 8,
    margin: 16,
    alignItems: 'center',
  },
  errorText: {
    color: '#D32F2F',
    marginLeft: 8,
    fontSize: 16,
  },
  card: {
    backgroundColor: 'white',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#4CAF50',
    textAlign: 'center',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLabel: {
    fontWeight: '600',
    color: '#555',
    marginLeft: 8,
    width: 100,
  },
  cardValue: {
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  conferirButton: {
    flexDirection: 'row',
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  conferirButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
});