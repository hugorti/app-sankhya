// app/lotes-parceiro.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Modal,
  Alert,
  FlatList
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { queryJson, salvarLoteAPI } from '@/services/api';

interface NotaParceiro {
  NUNOTA: number;
  CODPARC: number;
  NOMEPARC: string;
  DHALTER: string;
  CODPROD: number;
  DESCRPROD: string;
  QTDCONF: number;
  REFERENCIA: string;
  CODEMP: number;
  loteVinculado?: string; // Novo campo para armazenar o lote
}

export default function LotesParceiroScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [notas, setNotas] = useState<NotaParceiro[]>([]);
  const [notasFiltradas, setNotasFiltradas] = useState<NotaParceiro[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [notaSelecionada, setNotaSelecionada] = useState<NotaParceiro | null>(null);
  const [lote, setLote] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [lotesSalvos, setLotesSalvos] = useState<{[nunota: number]: string}>({});

  // Buscar notas ao carregar a tela
  useEffect(() => {
    buscarNotas();
  }, []);

  // Filtrar notas conforme o texto de busca
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setNotasFiltradas(notas);
    } else {
      const query = searchQuery.toLowerCase();
      const filtradas = notas.filter(item => {
        // Verificar cada campo antes de chamar toLowerCase()
        const nunotaStr = item.NUNOTA ? item.NUNOTA.toString() : '';
        const nomeParc = item.NOMEPARC ? item.NOMEPARC.toLowerCase() : '';
        const descrProd = item.DESCRPROD ? item.DESCRPROD.toLowerCase() : '';
        const referencia = item.REFERENCIA ? item.REFERENCIA.toLowerCase() : '';
        const loteVinculado = item.loteVinculado ? item.loteVinculado.toLowerCase() : '';
        
        return (
          nunotaStr.includes(query) ||
          nomeParc.includes(query) ||
          descrProd.includes(query) ||
          referencia.includes(query) ||
          loteVinculado.includes(query)
        );
      });
      setNotasFiltradas(filtradas);
    }
  }, [searchQuery, notas]);

const buscarNotas = async () => {
  try {
    setLoading(true);
    const sql = `
      SELECT
        CAB.NUNOTA, 
        CAB.CODPARC,
        PAR.NOMEPARC,
        COI2.DHALTER,
        COI2.CODPROD,
        PRO.DESCRPROD,
        COI2.QTDCONF,
        PRO.REFERENCIA,
        CAB.CODEMP,
        LA.LOTE
      FROM
        TGFCAB CAB
        INNER JOIN TGFCON2 CON2 ON (CAB.NUCONFATUAL = CON2.NUCONF)
        INNER JOIN TGFCOI2 COI2 ON (CON2.NUCONF = COI2.NUCONF)
        INNER JOIN TGFPRO PRO ON (COI2.CODPROD = PRO.CODPROD)
        INNER JOIN TGFPAR PAR ON (CAB.CODPARC = PAR.CODPARC)
        LEFT JOIN AD_LOTESALMOX LA ON LA.NUNOTA = CAB.NUNOTA
      ORDER BY CAB.NUNOTA DESC
    `;
    
    const result = await queryJson('DbExplorerSP.executeQuery', { sql });
    
    if (result.rows.length > 0) {
      const notasData = result.rows.map((row: any) => ({
        NUNOTA: row[0] || 0,
        CODPARC: row[1] || 0,
        NOMEPARC: row[2] || '',
        DHALTER: row[3] || '',
        CODPROD: row[4] || 0,
        DESCRPROD: row[5] || '',
        QTDCONF: row[6] || 0,
        REFERENCIA: row[7] || '',
        CODEMP: row[8] || 0,
        loteVinculado: row[9] || '' // Lote da tabela AD_LOTESALMOX
      }));
      
      setNotas(notasData);
      setNotasFiltradas(notasData);
      
      // Também atualizar o estado de lotes salvos
      const novosLotesSalvos: {[nunota: number]: string} = {};
      notasData.forEach((nota: any) => {
        if (nota.loteVinculado) {
          novosLotesSalvos[nota.NUNOTA] = nota.loteVinculado;
        }
      });
      setLotesSalvos(novosLotesSalvos);
      
    } else {
      setNotas([]);
      setNotasFiltradas([]);
    }
  } catch (error) {
    console.error('Erro ao buscar notas:', error);
    Alert.alert('Erro', 'Falha ao carregar as notas');
  } finally {
    setLoading(false);
  }
};

const salvarLote = async () => {
  if (!notaSelecionada || !lote.trim()) {
    Alert.alert('Atenção', 'Por favor, informe o lote');
    return;
  }

  try {
    setSalvando(true);
    console.log('🔄 Iniciando salvamento do lote:', lote, 'para nota:', notaSelecionada.NUNOTA);
    
    // Usar a função da API
    const resultado = await salvarLoteAPI(notaSelecionada.NUNOTA, lote);
    
    console.log('✅ Lote salvo com sucesso:', resultado);
    
    // Recarregar as notas para buscar os dados atualizados do banco
    await buscarNotas();
    
    Alert.alert('Sucesso', 'Lote vinculado com sucesso!');
    
    setModalVisible(false);
    setNotaSelecionada(null);
    setLote('');
    
  } catch (error: any) {
    console.error('❌ Erro ao salvar lote:', error);
    Alert.alert('Erro', error.message || 'Falha ao vincular o lote');
  } finally {
    setSalvando(false);
  }
};

const abrirModalLote = (nota: NotaParceiro) => {
  if (nota.loteVinculado) {
    Alert.alert(
      'Lote já vinculado',
      `Esta nota já possui o lote: ${nota.loteVinculado}\n\nDeseja editar o lote?`,
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Editar',
          onPress: () => {
            setNotaSelecionada(nota);
            setLote(nota.loteVinculado || ''); // Garantir que sempre seja string
            setModalVisible(true);
          }
        }
      ]
    );
  } else {
    setNotaSelecionada(nota);
    setLote('');
    setModalVisible(true);
  }
};

// Atualize a renderização para mostrar que já tem lote e desabilitar o clique
const renderItem = ({ item }: { item: NotaParceiro }) => (
  <TouchableOpacity
    style={[
      styles.notaCard,
      item.loteVinculado && styles.notaComLote // Estilo diferente para notas com lote
    ]}
    onPress={() => abrirModalLote(item)}
    // disabled={item.loteVinculado} // Descomente se quiser desabilitar completamente o clique
  >
    <View style={styles.notaHeader}>
      <Text style={styles.notaNumero}>Nota: {item.NUNOTA || 'N/A'}</Text>
      <Text style={styles.parceiroNome}>{item.NOMEPARC || 'Parceiro não informado'}</Text>
    </View>
    
    <View style={styles.notaBody}>
      <Text style={styles.produtoTexto}>{item.DESCRPROD || 'Produto não informado'}</Text>
      <Text style={styles.referencia}>Ref: {item.REFERENCIA || 'N/A'}</Text>
      <Text style={styles.quantidade}>Qtd: {item.QTDCONF || 0}</Text>
      
      {/* Mostrar lote vinculado se existir - DESTAQUE */}
      {item.loteVinculado && (
        <View style={styles.loteContainer}>
          <Ionicons name="pricetag" size={16} color="#2e7d32" />
          <Text style={styles.loteText}>LOTE VINCULADO: {item.loteVinculado}</Text>
          <Ionicons name="checkmark-circle" size={16} color="#2e7d32" style={styles.checkIcon} />
        </View>
      )}
    </View>
  </TouchableOpacity>
);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vinculação de Lotes</Text>
        <TouchableOpacity onPress={buscarNotas}>
          <Ionicons name="refresh" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nota, parceiro ou produto..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Carregando notas...</Text>
        </View>
      ) : notasFiltradas.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>Nenhuma nota encontrada</Text>
        </View>
      ) : (
        <FlatList
          data={notasFiltradas}
          keyExtractor={(item, index) => `${item.NUNOTA}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
        />
      )}

      {/* Modal para inserir lote */}
       <Modal visible={modalVisible} animationType="slide" transparent>
  <View style={styles.modalOverlay}>
    <View style={styles.modalContent}>
      <Text style={styles.modalTitle}>
        {notaSelecionada?.loteVinculado ? 'EDITAR Lote Vinculado' : 'Vincular Lote'}
      </Text>
      
      {notaSelecionada && (
        <>
          <View style={styles.modalInfo}>
            <Text style={styles.modalLabel}>Nota:</Text>
            <Text style={styles.modalValue}>{notaSelecionada.NUNOTA}</Text>
          </View>
          
          <View style={styles.modalInfo}>
            <Text style={styles.modalLabel}>Parceiro:</Text>
            <Text style={styles.modalValue}>{notaSelecionada.NOMEPARC}</Text>
          </View>
          
          <View style={styles.modalInfo}>
            <Text style={styles.modalLabel}>Produto:</Text>
            <Text style={styles.modalValue}>{notaSelecionada.DESCRPROD}</Text>
          </View>

          {notaSelecionada.loteVinculado && (
            <View style={styles.loteAtualContainer}>
              <Ionicons name="information-circle" size={20} color="#1976d2" />
              <Text style={styles.loteAtualInfo}>
                Lote atual: <Text style={styles.loteAtualDestaque}>{notaSelecionada.loteVinculado}</Text>
              </Text>
            </View>
          )}

          <TextInput
            style={styles.loteInput}
            placeholder="Digite o lote"
            placeholderTextColor="#999"
            value={lote}
            onChangeText={setLote}
            autoCapitalize="characters"
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.buttonText}>Cancelar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.modalButton, 
                styles.saveButton, 
                (!lote.trim() || lote === notaSelecionada.loteVinculado) && styles.disabledButton
              ]}
              onPress={salvarLote}
              disabled={!lote.trim() || lote === notaSelecionada.loteVinculado || salvando}
            >
              {salvando ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.buttonText}>
                  {notaSelecionada.loteVinculado ? 'Atualizar' : 'Salvar'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {notaSelecionada.loteVinculado && lote === notaSelecionada.loteVinculado && (
            <Text style={styles.avisoTexto}>
              ⚠️ O lote digitado é igual ao atual
            </Text>
          )}
        </>
      )}
    </View>
  </View>
</Modal>
    </SafeAreaView>
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
    backgroundColor: '#4CAF50',
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
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
  },
  listContainer: {
    padding: 16,
  },
  notaCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  notaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  notaNumero: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#333',
  },
  parceiroNome: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 8,
  },
  notaBody: {
    marginTop: 4,
  },
  produtoTexto: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  referencia: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  quantidade: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  modalInfo: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  modalLabel: {
    fontWeight: '600',
    width: 80,
    color: '#333',
  },
  modalValue: {
    flex: 1,
    color: '#666',
  },
  loteInput: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
    marginBottom: 20,
    marginTop: 10,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#ccc',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  disabledButton: {
    backgroundColor: '#cccccc',
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
    notaComLote: {
    borderLeftColor: '#2e7d32', // Verde mais escuro
    backgroundColor: '#e8f5e9', // Fundo verde claro
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  
  loteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 10,
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1b5e20',
  },
  
  loteText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 6,
    marginRight: 6,
    fontSize: 14,
  },
  
  checkIcon: {
    marginLeft: 'auto',
    color: 'white',
  },
  
  loteAtualInfo: {
    color: '#2e7d32',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '600',
    backgroundColor: '#e8f5e9',
    padding: 8,
    borderRadius: 6,
  },
   loteAtualContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bbdefb',
  },
  

  
  loteAtualDestaque: {
    fontWeight: 'bold',
    color: '#0d47a1',
  },
  
  avisoTexto: {
    color: '#f57c00',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  
 
});