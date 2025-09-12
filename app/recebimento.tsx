// app/lotes-parceiro.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  Alert,
  FlatList,
  ScrollView
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
  dataValidade?: string;
  loteVinculado?: string;
}

type FiltroLote = 'todos' | 'comLote' | 'semLote';

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
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroLote>('todos');
  const [dataValidade, setDataValidade] = useState('');
  const [showDateSelector, setShowDateSelector] = useState(false);

  // Estados para o seletor de data
  const [dia, setDia] = useState('');
  const [mes, setMes] = useState('');
  const [ano, setAno] = useState('');

  // Buscar notas ao carregar a tela
  useEffect(() => {
    buscarNotas();
  }, []);

  // Filtrar notas conforme o texto de busca e filtro de lote
  useEffect(() => {
    let notasFiltradasTemp = notas;

    // Aplicar filtro de lote
    if (filtroAtivo === 'comLote') {
      notasFiltradasTemp = notas.filter(item => item.loteVinculado);
    } else if (filtroAtivo === 'semLote') {
      notasFiltradasTemp = notas.filter(item => !item.loteVinculado);
    }

    // Aplicar filtro de busca
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      notasFiltradasTemp = notasFiltradasTemp.filter(item => {
        const nunotaStr = item.NUNOTA ? item.NUNOTA.toString() : '';
        const nomeParc = item.NOMEPARC ? item.NOMEPARC.toLowerCase() : '';
        const descrProd = item.DESCRPROD ? item.DESCRPROD.toLowerCase() : '';
        const referencia = item.REFERENCIA ? item.REFERENCIA.toLowerCase() : '';
        const loteVinculado = item.loteVinculado ? item.loteVinculado.toLowerCase() : '';
        const codprodStr = item.CODPROD ? item.CODPROD.toString() : '';
        
        return (
          nunotaStr.includes(query) ||
          nomeParc.includes(query) ||
          descrProd.includes(query) ||
          referencia.includes(query) ||
          loteVinculado.includes(query) ||
          codprodStr.includes(query)
        );
      });
    }

    setNotasFiltradas(notasFiltradasTemp);
  }, [searchQuery, notas, filtroAtivo]);

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
          LP.LOTE,
          CONVERT(VARCHAR(10), LP.DATAVAL, 103) AS DATAVAL

        FROM
          TGFCAB CAB
          INNER JOIN TGFCON2 CON2 ON (CAB.NUCONFATUAL = CON2.NUCONF)
          INNER JOIN TGFCOI2 COI2 ON (CON2.NUCONF = COI2.NUCONF)
          INNER JOIN TGFPRO PRO ON (COI2.CODPROD = PRO.CODPROD)
          INNER JOIN TGFPAR PAR ON (CAB.CODPARC = PAR.CODPARC)
          LEFT JOIN AD_LOTESPROD LP ON LP.NUNOTA = CAB.NUNOTA AND LP.CODPROD = COI2.CODPROD
        ORDER BY CAB.NUNOTA DESC, COI2.CODPROD
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
          loteVinculado: row[9] || '',
          dataValidade: row[10] || ''
        }));
        
        setNotas(notasData);
        
        const novosLotesSalvos: {[nunota: number]: string} = {};
        notasData.forEach((nota: any) => {
          if (nota.loteVinculado) {
            novosLotesSalvos[nota.NUNOTA] = nota.loteVinculado;
          }
        });
        setLotesSalvos(novosLotesSalvos);
        
      } else {
        setNotas([]);
      }
    } catch (error) {
      console.error('Erro ao buscar notas:', error);
      Alert.alert('Erro', 'Falha ao carregar as notas');
    } finally {
      setLoading(false);
    }
  };

  const abrirSeletorData = () => {
    // Preencher com data atual se não houver data selecionada
    const hoje = new Date();
    if (!dataValidade) {
      setDia(hoje.getDate().toString());
      setMes((hoje.getMonth() + 1).toString());
      setAno(hoje.getFullYear().toString());
    } else {
      // Se já tem data, separar nos campos
      const partes = dataValidade.split('-');
      if (partes.length === 3) {
        setAno(partes[0]);
        setMes(partes[1]);
        setDia(partes[2]);
      }
    }
    setShowDateSelector(true);
  };

// E também atualize a função confirmarData:
const confirmarData = () => {
  if (dia && mes && ano) {
    const diaFormatado = dia.padStart(2, '0');
    const mesFormatado = mes.padStart(2, '0');
    const dataFormatada = `${diaFormatado}/${mesFormatado}/${ano}`;
    setDataValidade(dataFormatada);
    setShowDateSelector(false);
  } else {
    Alert.alert('Atenção', 'Por favor, preencha todos os campos da data');
  }
};

const cancelarSelecaoData = () => {
    setShowDateSelector(false);
};

const salvarLote = async () => {
  if (!notaSelecionada || !lote.trim()) {
    Alert.alert('Atenção', 'Por favor, informe o lote');
    return;
  }

  if (!dataValidade) {
    Alert.alert('Atenção', 'Por favor, selecione a data de validade');
    return;
  }

  try {
    setSalvando(true);
    const resultado = await salvarLoteAPI(
      notaSelecionada.NUNOTA, 
      notaSelecionada.CODPROD, 
      lote,
      dataValidade
    );
    
    await buscarNotas();
    Alert.alert('Sucesso', 'Lote vinculado com sucesso!');
    
    setModalVisible(false);
    setNotaSelecionada(null);
    setLote('');
    setDataValidade('');
    
  } catch (error: any) {
    console.error('Erro ao salvar lote:', error);
    Alert.alert('Erro', error.message || 'Falha ao vincular o lote');
  } finally {
    setSalvando(false);
  }
};

const abrirModalLote = (nota: NotaParceiro) => {
  if (nota.loteVinculado) {
    Alert.alert(
      'Lote já vinculado',
      `Este produto já possui o lote: ${nota.loteVinculado}\n\nDeseja editar o lote?`,
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Editar',
          onPress: () => {
            setNotaSelecionada(nota);
            setLote(nota.loteVinculado || '');
            setDataValidade(nota.dataValidade || '');
            setModalVisible(true);
          }
        }
      ]
    );
  } else {
    setNotaSelecionada(nota);
    setLote('');
    setDataValidade('');
    setModalVisible(true);
  }
};

// Primeiro, crie uma função para formatar a data
const formatarDataExibicao = (dataString?: string | null): string => {
  if (!dataString) return '';

  try {
    const apenasData = dataString.split(/[T ]/)[0];

    // YYYY-MM-DD → DD/MM/YYYY
    if (/^\d{4}-\d{2}-\d{2}$/.test(apenasData)) {
      const [ano, mes, dia] = apenasData.split('-');
      return `${dia}/${mes}/${ano}`;
    }

    // DDMMYYYY → DD/MM/YYYY
    if (/^\d{8}$/.test(apenasData)) {
      const dia = apenasData.substring(0, 2);
      const mes = apenasData.substring(2, 4);
      const ano = apenasData.substring(4, 8);
      return `${dia}/${mes}/${ano}`;
    }

    return apenasData;
  } catch {
    return String(dataString);
  }
};


// No renderItem, use a função de formatação:
const renderItem = ({ item }: { item: NotaParceiro }) => (
  <TouchableOpacity
    style={[
      styles.notaCard,
      item.loteVinculado && styles.notaComLote
    ]}
    onPress={() => abrirModalLote(item)}
  >
    <View style={styles.notaHeader}>
      <Text style={styles.notaNumero}>Nota: {item.NUNOTA || 'N/A'}</Text>
      <Text style={styles.parceiroNome}>{item.NOMEPARC || 'Parceiro não informado'}</Text>
    </View>
    
    <View style={styles.notaBody}>
      <Text style={styles.codprod}>Cód. Produto: {item.CODPROD || 'N/A'}</Text>
      <Text style={styles.produtoTexto}>{item.DESCRPROD || 'Produto não informado'}</Text>
      <Text style={styles.referencia}>Ref: {item.REFERENCIA || 'N/A'}</Text>
      
      {/* Quantidade e Data de Validade na mesma linha */}
      <View style={styles.quantidadeContainer}>
        <Text style={styles.quantidade}>Qtd: {item.QTDCONF || 0}</Text>
        {item.dataValidade && (
          <Text style={styles.dataValidadeText}>
            VAL: {formatarDataExibicao(item.dataValidade)}
          </Text>
        )}
      </View>
      
      {/* Container do Lote (aparece apenas se tiver lote vinculado) */}
      {item.loteVinculado && (
        <View style={styles.loteContainer}>
          <Ionicons name="pricetag" size={16} color="#2e7d32" />
          <Text style={styles.loteText}>LOTE: {item.loteVinculado}</Text>
          <Ionicons name="checkmark-circle" size={16} color="#2e7d32" style={styles.checkIcon} />
        </View>
      )}
    </View>
  </TouchableOpacity>
);
  // Gerar arrays para dias, meses e anos
const dias = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
const meses = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
const anos = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() + i).toString());

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
          placeholder="Buscar por nota, parceiro, produto ou código..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.filtrosContainer}>
        <TouchableOpacity
          style={[
            styles.filtroButton,
            filtroAtivo === 'todos' && styles.filtroAtivo
          ]}
          onPress={() => setFiltroAtivo('todos')}
        >
          <Text style={[
            styles.filtroText,
            filtroAtivo === 'todos' && styles.filtroTextAtivo
          ]}>
            Todos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filtroButton,
            filtroAtivo === 'comLote' && styles.filtroAtivo
          ]}
          onPress={() => setFiltroAtivo('comLote')}
        >
          <Text style={[
            styles.filtroText,
            filtroAtivo === 'comLote' && styles.filtroTextAtivo
          ]}>
            Com Lote
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filtroButton,
            filtroAtivo === 'semLote' && styles.filtroAtivo
          ]}
          onPress={() => setFiltroAtivo('semLote')}
        >
          <Text style={[
            styles.filtroText,
            filtroAtivo === 'semLote' && styles.filtroTextAtivo
          ]}>
            Sem Lote
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Carregando notas...</Text>
        </View>
      ) : notasFiltradas.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>
            {filtroAtivo === 'comLote' 
              ? 'Nenhuma nota com lote encontrada' 
              : filtroAtivo === 'semLote'
              ? 'Todas as notas possuem lote vinculado'
              : 'Nenhuma nota encontrada'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={notasFiltradas}
          keyExtractor={(item, index) => `${item.NUNOTA}-${item.CODPROD}-${index}`}
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
                  <Text style={styles.modalLabel}>Cód. Produto:</Text>
                  <Text style={styles.modalValue}>{notaSelecionada.CODPROD}</Text>
                </View>
                
                <View style={styles.modalInfo}>
                  <Text style={styles.modalLabel}>Produto:</Text>
                  <Text style={styles.modalValue}>{notaSelecionada.DESCRPROD}</Text>
                </View>
                
                <View style={styles.modalInfo}>
                  <Text style={styles.modalLabel}>Parceiro:</Text>
                  <Text style={styles.modalValue}>{notaSelecionada.NOMEPARC}</Text>
                </View>

                {notaSelecionada.loteVinculado && (
                  <View style={styles.loteAtualContainer}>
                    <Ionicons name="information-circle" size={20} color="#1976d2" />
                    <Text style={styles.loteAtualInfo}>
                      Lote atual: <Text style={styles.loteAtualDestaque}>{notaSelecionada.loteVinculado}</Text>
                    </Text>
                  </View>
                )}

                {/* Botão para selecionar data */}
                <TouchableOpacity onPress={abrirSeletorData} style={styles.datePickerButton}>
                  <Text style={dataValidade ? styles.datePickerText : styles.datePickerPlaceholder}>
                    {dataValidade || 'Selecionar data de validade'}
                  </Text>
                  <Ionicons name="calendar" size={20} color="#666" />
                </TouchableOpacity>

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

      {/* Modal para selecionar data */}
      <Modal visible={showDateSelector} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.dateSelectorModal]}>
            <Text style={styles.modalTitle}>Selecionar Data de Validade</Text>
            
            <View style={styles.dateSelectorContainer}>
              <View style={styles.dateSelectorColumn}>
                <Text style={styles.dateSelectorLabel}>Dia</Text>
                <ScrollView style={styles.dateSelectorScroll} showsVerticalScrollIndicator={false}>
                  {dias.map((diaItem) => (
                    <TouchableOpacity
                      key={diaItem}
                      style={[
                        styles.dateSelectorItem,
                        dia === diaItem && styles.dateSelectorItemSelected
                      ]}
                      onPress={() => setDia(diaItem)}
                    >
                      <Text style={[
                        styles.dateSelectorItemText,
                        dia === diaItem && styles.dateSelectorItemTextSelected
                      ]}>
                        {diaItem}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.dateSelectorColumn}>
                <Text style={styles.dateSelectorLabel}>Mês</Text>
                <ScrollView style={styles.dateSelectorScroll} showsVerticalScrollIndicator={false}>
                  {meses.map((mesItem) => (
                    <TouchableOpacity
                      key={mesItem}
                      style={[
                        styles.dateSelectorItem,
                        mes === mesItem && styles.dateSelectorItemSelected
                      ]}
                      onPress={() => setMes(mesItem)}
                    >
                      <Text style={[
                        styles.dateSelectorItemText,
                        mes === mesItem && styles.dateSelectorItemTextSelected
                      ]}>
                        {mesItem}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.dateSelectorColumn}>
                <Text style={styles.dateSelectorLabel}>Ano</Text>
                <ScrollView style={styles.dateSelectorScroll} showsVerticalScrollIndicator={false}>
                  {anos.map((anoItem) => (
                    <TouchableOpacity
                      key={anoItem}
                      style={[
                        styles.dateSelectorItem,
                        ano === anoItem && styles.dateSelectorItemSelected
                      ]}
                      onPress={() => setAno(anoItem)}
                    >
                      <Text style={[
                        styles.dateSelectorItemText,
                        ano === anoItem && styles.dateSelectorItemTextSelected
                      ]}>
                        {anoItem}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.selectedDateContainer}>
              <Text style={styles.selectedDateText}>
                Data selecionada: {dia && mes && ano ? `${dia}/${mes}/${ano}` : 'Nenhuma'}
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={cancelarSelecaoData}
              >
                <Text style={styles.buttonText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={confirmarData}
              >
                <Text style={styles.buttonText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
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
  filtrosContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  filtroButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  filtroAtivo: {
    backgroundColor: '#4CAF50',
    borderColor: '#2E7D32',
  },
  filtroText: {
    color: '#666',
    fontWeight: '500',
  },
  filtroTextAtivo: {
    color: 'white',
    fontWeight: 'bold',
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
    padding: 20,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
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
  notaComLote: {
    borderLeftColor: '#2e7d32',
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#c8e6c9',
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
  codprod: {
    fontSize: 12,
    color: '#666',
    fontWeight: 'bold',
    marginBottom: 4,
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
   quantidadeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  quantidade: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  dataValidadeText: {
    fontSize: 12,
    color: '#2e7d32', // Verde para destacar
    fontWeight: '600',
  },
  checkIcon: {
    marginLeft: 'auto',
    color: 'white',
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
  dateSelectorModal: {
    width: '95%',
    maxWidth: 500,
    height: '80%',
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
    width: 100,
    color: '#333',
  },
  modalValue: {
    flex: 1,
    color: '#666',
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
  loteAtualInfo: {
    color: '#2e7d32',
    fontSize: 14,
    marginLeft: 8,
  },
  loteAtualDestaque: {
    fontWeight: 'bold',
    color: '#0d47a1',
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 20,
    marginTop: 10,
  },
  datePickerText: {
    fontSize: 16,
    color: '#333',
  },
  datePickerPlaceholder: {
    fontSize: 16,
    color: '#999',
  },
  loteInput: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
    marginBottom: 20,
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
  avisoTexto: {
    color: '#f57c00',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  dateSelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 300,
    marginBottom: 20,
  },
  dateSelectorColumn: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  dateSelectorLabel: {
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  dateSelectorScroll: {
    width: '100%',
  },
  dateSelectorItem: {
    padding: 10,
    marginVertical: 2,
    borderRadius: 5,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  dateSelectorItemSelected: {
    backgroundColor: '#4CAF50',
  },
  dateSelectorItemText: {
    color: '#333',
  },
  dateSelectorItemTextSelected: {
    color: 'white',
    fontWeight: 'bold',
  },
  selectedDateContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  selectedDateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
});