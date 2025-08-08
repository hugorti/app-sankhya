// app/almoxarifado.tsx
import { View, Text, StyleSheet, ActivityIndicator, TextInput, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { queryJson } from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { Ionicons } from '@expo/vector-icons';

interface DadosAlmoxarifado {
  IDIPROC: number;
  REFERENCIA: string;
  PRODUTOPA: string;
  LOTE: string;
  COD_MP: number;
  PRODUTOMP: string;
  QUANTIDADE: string;
  SEQUENCIA: number;
  FASE: string;
  TEMPERATURA: string;
  OBSERVACAO: string;
  EXECUTANTE: string;
}

export default function AlmoxarifadoScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [dados, setDados] = useState<DadosAlmoxarifado[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idiproc, setIdiproc] = useState('');

  const buscarDados = async () => {
    if (!session?.jsessionid || !idiproc.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setDados([]);
      
      const sqlQuery = `
        WITH RankedData AS (
          SELECT
            P.IDIPROC,
            PRO.REFERENCIA,
            PRO.DESCRPROD AS PRODUTOPA,
            P.NROLOTE AS LOTE,
            MP.CODPRODMP AS COD_MP,
            MP2.DESCRPROD AS PRODUTOMP,
            CASE
              WHEN (MP.QTDMISTURA * PA.QTDPRODUZIR) < 0.999
                THEN FORMAT((MP.QTDMISTURA * PA.QTDPRODUZIR) * 1000, '0.#######') + ' g'
              ELSE
                FORMAT((MP.QTDMISTURA * PA.QTDPRODUZIR), '0.#######') + ' kg'
            END AS QUANTIDADE,
            MP.AD_SEQUENCIAMP AS SEQUENCIA,
            MP.AD_FASEMP AS FASE,
            MP.AD_TEMPMP AS TEMPERATURA,
            MP.AD_OBS AS OBSERVACAO,
            U.NOMEUSU AS EXECUTANTE,
            ROW_NUMBER() OVER (
              PARTITION BY MP.CODPRODMP
              ORDER BY
                CASE
                  WHEN MP.AD_SEQUENCIAMP IS NULL THEN 1 ELSE 0
                END,
                MP.AD_SEQUENCIAMP DESC
            ) AS rn
          FROM
            TPRIPROC P
          JOIN TPRIPA PA ON P.IDIPROC = PA.IDIPROC
          JOIN (
            SELECT LMP.*
            FROM TPRLMP LMP
            INNER JOIN TPREFX EFX ON EFX.IDEFX = LMP.IDEFX
            WHERE EFX.IDPROC = (
              SELECT MAX(P.IDPROC)
              FROM TPRLPA P
              INNER JOIN TPRPRC PRC2 ON PRC2.IDPROC = P.IDPROC
              WHERE P.CODPRODPA = LMP.CODPRODPA
              AND PRC2.CODUSUALT <> 13
            )
            AND EFX.DESCRICAO = 'EMBALAGEM'
          ) MP ON PA.CODPRODPA = MP.CODPRODPA
          JOIN TGFPRO MP2 ON MP.CODPRODMP = MP2.CODPROD
          JOIN TGFPRO PRO ON PA.CODPRODPA = PRO.CODPROD
          LEFT JOIN TPRIATV A ON P.IDIPROC = A.IDIPROC
          LEFT JOIN TPREFX RF ON A.IDEFX = RF.IDEFX
          LEFT JOIN TSIUSU U ON A.CODEXEC = U.CODUSU
          WHERE
            P.IDIPROC = ${idiproc}
            AND MP.CODPRODMP <> 355
            AND P.STATUSPROC <> 'C'
            AND RF.DESCRICAO IN ('EMBALAGEM')
        )
        SELECT
          IDIPROC, REFERENCIA, PRODUTOPA, LOTE, COD_MP, PRODUTOMP, QUANTIDADE, 
          SEQUENCIA, FASE, TEMPERATURA, OBSERVACAO, EXECUTANTE
        FROM RankedData
        WHERE rn = 1
        ORDER BY SEQUENCIA
      `;

      const result = await queryJson('DbExplorerSP.executeQuery', {
        sql: sqlQuery
      });

      if (result.rows.length > 0) {
        const dadosFormatados = result.rows.map((row: any) => ({
          IDIPROC: row[0],
          REFERENCIA: row[1],
          PRODUTOPA: row[2],
          LOTE: row[3],
          COD_MP: row[4],
          PRODUTOMP: row[5],
          QUANTIDADE: row[6],
          SEQUENCIA: row[7],
          FASE: row[8],
          TEMPERATURA: row[9],
          OBSERVACAO: row[10],
          EXECUTANTE: row[11]
        }));
        setDados(dadosFormatados);
      } else {
        setError('Nenhum registro encontrado para a OP informada');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar dados');
      console.error('Erro na consulta:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Cabeçalho */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Consulta de Ordem de Produção</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Conteúdo principal */}
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Formulário de busca */}
        <View style={styles.formContainer}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Número da OP</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite o número da OP"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={idiproc}
              onChangeText={setIdiproc}
            />
          </View>
          
          <TouchableOpacity 
            style={styles.searchButton}
            onPress={buscarDados}
            disabled={loading || !idiproc}
          >
            <Ionicons name="search" size={24} color="white" />
            <Text style={styles.searchButtonText}>
              {loading ? 'Buscando...' : 'Consultar OP'}
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

        {dados.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Dados da Ordem de Produção</Text>
            
            <View style={styles.cardRow}>
              <Ionicons name="barcode-outline" size={20} color="#4CAF50" />
              <Text style={styles.cardLabel}>OP:</Text>
              <Text style={styles.cardValue}>{dados[0].IDIPROC}</Text>
            </View>
            
            <View style={styles.cardRow}>
              <Ionicons name="cube-outline" size={20} color="#4CAF50" />
              <Text style={styles.cardLabel}>Produto:</Text>
              <Text style={styles.cardValue}>{dados[0].PRODUTOPA}</Text>
            </View>
            
            <View style={styles.cardRow}>
              <Ionicons name="pricetag-outline" size={20} color="#4CAF50" />
              <Text style={styles.cardLabel}>Referência:</Text>
              <Text style={styles.cardValue}>{dados[0].REFERENCIA}</Text>
            </View>
            
            <View style={styles.cardRow}>
              <Ionicons name="albums-outline" size={20} color="#4CAF50" />
              <Text style={styles.cardLabel}>Lote:</Text>
              <Text style={styles.cardValue}>{dados[0].LOTE}</Text>
            </View>

            <Text style={[styles.cardTitle, { marginTop: 20 }]}>Materiais Necessários</Text>
            
            {dados.map((item, index) => (
              <View key={index} style={styles.materialCard}>
                <View style={styles.materialRow}>
                  <Ionicons name="list-outline" size={16} color="#2196F3" />
                  <Text style={styles.materialLabel}>Item:</Text>
                  <Text style={styles.materialValue}>{item.SEQUENCIA}</Text>
                </View>
                
                <View style={styles.materialRow}>
                  <Ionicons name="barcode-outline" size={16} color="#2196F3" />
                  <Text style={styles.materialLabel}>Código:</Text>
                  <Text style={styles.materialValue}>{item.COD_MP}</Text>
                </View>
                
                <View style={styles.materialRow}>
                  <Ionicons name="cube-outline" size={16} color="#2196F3" />
                  <Text style={styles.materialLabel}>Material:</Text>
                  <Text style={styles.materialValue}>{item.PRODUTOMP}</Text>
                </View>
                
                <View style={styles.materialRow}>
                  <Ionicons name="scale-outline" size={16} color="#2196F3" />
                  <Text style={styles.materialLabel}>Quantidade:</Text>
                  <Text style={styles.materialValue}>{item.QUANTIDADE}</Text>
                </View>
                
                {item.FASE && (
                  <View style={styles.materialRow}>
                    <Ionicons name="git-merge-outline" size={16} color="#2196F3" />
                    <Text style={styles.materialLabel}>Fase:</Text>
                    <Text style={styles.materialValue}>{item.FASE}</Text>
                  </View>
                )}
                
                {item.TEMPERATURA && (
                  <View style={styles.materialRow}>
                    <Ionicons name="thermometer-outline" size={16} color="#2196F3" />
                    <Text style={styles.materialLabel}>Temperatura:</Text>
                    <Text style={styles.materialValue}>{item.TEMPERATURA}</Text>
                  </View>
                )}
                
                {item.OBSERVACAO && (
                  <View style={styles.materialRow}>
                    <Ionicons name="document-text-outline" size={16} color="#2196F3" />
                    <Text style={styles.materialLabel}>Observação:</Text>
                    <Text style={styles.materialValue}>{item.OBSERVACAO}</Text>
                  </View>
                )}
                
                {item.EXECUTANTE && (
                  <View style={styles.materialRow}>
                    <Ionicons name="person-outline" size={16} color="#2196F3" />
                    <Text style={styles.materialLabel}>Executante:</Text>
                    <Text style={styles.materialValue}>{item.EXECUTANTE}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#4CAF50',
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
    backgroundColor: '#4CAF50',
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
  materialCard: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  materialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  materialLabel: {
    fontWeight: '600',
    color: '#555',
    marginLeft: 8,
    width: 100,
    fontSize: 14,
  },
  materialValue: {
    fontWeight: '500',
    color: '#333',
    flex: 1,
    fontSize: 14,
  },
});