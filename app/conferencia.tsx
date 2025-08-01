// app/conferencia.tsx
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { queryJson, salvarConferenciaAPI } from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';

interface Volume {
  IDREV: number;
  SEQETIQUETA: number;
}

interface ApiRow {
  0: number; // IDREV
  1: number; // SEQETIQUETA
}

interface ConferenciaData {
  volumes: Volume[];
  conferidos: number[];
  ultimoConferido: Volume | null;
}

interface FinalizacaoData {
  nuseparacao: number;
  nunota: string;
  ordemCarga: number;
  usuario: string;
  dataFinalizacao: string;
  volumesConferidos: number[];
  volumesFaltantes: number[];
  motivo?: string;
  completa: boolean;
}

export default function ConferenciaScreen() {
  const { session } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Extrai e converte os parâmetros
  const nuseparacao = Number(params.nuseparacao);
  const totalVolumes = Number(params.totalVolumes);
  const ordemCarga = Number(params.ordemCarga);
  const nunota = params.nunota as string;
  
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [conferidos, setConferidos] = useState<number[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimoConferido, setUltimoConferido] = useState<Volume | null>(null);
  const [showMotivoModal, setShowMotivoModal] = useState(false);
  const [showVolumesModal, setShowVolumesModal] = useState(false);
  const [motivo, setMotivo] = useState('');

  // Chave para armazenamento local
  const storageKey = `conferencia_${nuseparacao}`;
  const finalizacoesKey = 'conferencia_finalizacoes';

  // Opções de motivo para o Picker
  const opcoesMotivo = [
    { label: 'Selecione um motivo...', value: '' },
    { label: 'Faltando volumes', value: 'Faltando volumes' },
    { label: 'Caixa sem etiqueta', value: 'Caixa sem etiqueta' },
    { label: 'Não bipando volumes', value: 'Não bipando volumes' },
    { label: 'Troca de turno', value: 'Troca de turno' }
  ];

  useEffect(() => {
    const carregarDados = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Tenta carregar dados salvos localmente primeiro
        const savedData = await AsyncStorage.getItem(storageKey);
        if (savedData) {
          const parsedData: ConferenciaData = JSON.parse(savedData);
          setVolumes(parsedData.volumes);
          setConferidos(parsedData.conferidos);
          setUltimoConferido(parsedData.ultimoConferido);
          
          if (parsedData.volumes.length > 0) {
            setLoading(false);
            return;
          }
        }

        // Busca volumes no servidor se não tiver dados locais
        const result = await queryJson('DbExplorerSP.executeQuery', {
          sql: `SELECT IDREV, SEQETIQUETA FROM TGWREV 
                WHERE NUSEPARACAO = ${nuseparacao}
                ORDER BY SEQETIQUETA`
        });

        const volumesData: Volume[] = result.rows.map((row: ApiRow) => ({
          IDREV: row[0],
          SEQETIQUETA: row[1]
        }));

        setVolumes(volumesData);
        
        await saveConferenciaData({
          volumes: volumesData,
          conferidos: savedData ? JSON.parse(savedData).conferidos : [],
          ultimoConferido: savedData ? JSON.parse(savedData).ultimoConferido : null
        });
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar volumes');
      } finally {
        setLoading(false);
      }
    };

    carregarDados();
  }, []);

  const saveConferenciaData = async (data: ConferenciaData) => {
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(data));
    } catch (err) {
      console.error('Erro ao salvar dados da conferência:', err);
    }
  };

  const saveFinalizacaoData = async (data: FinalizacaoData) => {
    try {
      const finalizacoesExistentes = await AsyncStorage.getItem(finalizacoesKey);
      const finalizacoes: FinalizacaoData[] = finalizacoesExistentes 
        ? JSON.parse(finalizacoesExistentes)
        : [];
      
      finalizacoes.push(data);
      await AsyncStorage.setItem(finalizacoesKey, JSON.stringify(finalizacoes));
    } catch (err) {
      console.error('Erro ao salvar dados de finalização:', err);
    }
  };

  const handleConferir = () => {
    const id = parseInt(inputValue);
    if (isNaN(id)) {
      Alert.alert('Valor inválido', 'Digite um número válido');
      return;
    }

    if (conferidos.includes(id)) {
      Alert.alert('Já conferido', 'Este volume já foi conferido');
      setInputValue('');
      return;
    }

    const volumeExistente = volumes.find(v => v.IDREV === id);
    if (!volumeExistente) {
      Alert.alert('Não encontrado', 'IDREV não corresponde a nenhum volume');
      setInputValue('');
      return;
    }

    const novosConferidos = [...conferidos, id];
    setConferidos(novosConferidos);
    setUltimoConferido(volumeExistente);
    
    saveConferenciaData({
      volumes,
      conferidos: novosConferidos,
      ultimoConferido: volumeExistente
    });
    
    setInputValue('');
    
    const volumePorEtiqueta = volumes.find(v => v.SEQETIQUETA.toString() === inputValue);
    if (volumePorEtiqueta && volumePorEtiqueta.IDREV !== id) {
      const novosConferidosComEtiqueta = [...novosConferidos, volumePorEtiqueta.IDREV];
      setConferidos(novosConferidosComEtiqueta);
      setUltimoConferido(volumePorEtiqueta);
      
      saveConferenciaData({
        volumes,
        conferidos: novosConferidosComEtiqueta,
        ultimoConferido: volumePorEtiqueta
      });
      
      Alert.alert(
        'Confirmação automática', 
        `Volume ${volumePorEtiqueta.IDREV} (etiqueta ${volumePorEtiqueta.SEQETIQUETA}) confirmado automaticamente`
      );
    }
  };

  const mostrarVolumesFaltantes = () => {
    const faltantesCount = totalVolumes - conferidos.length;
    
    if (faltantesCount === 0) {
      Alert.alert('Conferência Completa', 'Todos os volumes foram conferidos!');
    } else {
      setShowVolumesModal(true);
    }
  };

  const confirmarFinalizacao = async () => {
    const faltantes = volumes
      .filter(v => !conferidos.includes(v.IDREV))
      .map(v => v.IDREV);

    const completa = faltantes.length === 0;
    
    try {
      // Salva na API
      await salvarConferenciaAPI({
        NUNOTA: Number(nunota),
        ORDEMCARGA: ordemCarga,
        CONFERENTE: session?.username || 'Usuário desconhecido',
        DESCRICAO: completa ? 'CONFERENCIA COMPLETA' : motivo,
        VOLUMES: conferidos.length
      });

      // Salva localmente
      const finalizacaoLocal: FinalizacaoData = {
        nuseparacao,
        nunota,
        ordemCarga,
        usuario: session?.username || 'Usuário desconhecido',
        dataFinalizacao: new Date().toISOString(),
        volumesConferidos: [...conferidos],
        volumesFaltantes: [...faltantes],
        motivo: completa ? undefined : motivo,
        completa
      };
      await saveFinalizacaoData(finalizacaoLocal);

      await AsyncStorage.removeItem(storageKey);
      setShowMotivoModal(false);
      setMotivo('');

      if (completa) {
        Alert.alert(
          'Conferência completa!',
          `Todos os ${totalVolumes} volumes foram conferidos`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          'Conferência finalizada',
          `Conferência finalizada com ${faltantes.length} volumes faltantes.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Erro',
        'Ocorreu um erro ao salvar a conferência. Tente novamente.',
        [{ text: 'OK' }]
      );
      console.error('Erro ao salvar conferência:', error);
    }
  };

  const solicitarMotivo = () => {
    setShowMotivoModal(true);
  };

  const finalizarConferencia = () => {
    const faltantes = volumes
      .filter(v => !conferidos.includes(v.IDREV))
      .map(v => v.IDREV);

    if (faltantes.length === 0) {
      confirmarFinalizacao();
    } else {
      solicitarMotivo();
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Carregando volumes...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.scrollContainer}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Cabeçalho */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          saveConferenciaData({ volumes, conferidos, ultimoConferido });
          router.back();
        }}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conferência de Volumes</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Informações da carga */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>Ordem: {ordemCarga}</Text>
        <Text style={styles.infoText}>Nota: {nunota}</Text>
        <Text style={styles.infoText}>Separação: {nuseparacao}</Text>
        <Text style={styles.infoText}>Usuário: {session?.username || 'Não identificado'}</Text>
      </View>

      {/* Progresso */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          {conferidos.length}/{totalVolumes} volumes conferidos
        </Text>
        <View style={styles.progressBar}>
          <View style={[
            styles.progressFill,
            { width: `${(conferidos.length / totalVolumes) * 100}%` }
          ]} />
        </View>
      </View>

      {/* Último conferido */}
      {ultimoConferido && (
        <View style={styles.lastChecked}>
          <Text style={styles.lastCheckedText}>Último conferido:</Text>
          <Text style={styles.lastCheckedId}>ID: {ultimoConferido.IDREV}</Text>
          <Text style={styles.lastCheckedSeq}>Etiqueta: {ultimoConferido.SEQETIQUETA}</Text>
        </View>
      )}

      {/* Input para conferência */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Digite o IDREV ou número da etiqueta"
          placeholderTextColor="#999"
          keyboardType="numeric"
          value={inputValue}
          onChangeText={setInputValue}
          onSubmitEditing={handleConferir}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.confirmButton} 
          onPress={handleConferir}
          disabled={!inputValue}
        >
          <Ionicons name="checkmark" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Botões de ação */}
      <View style={styles.footerButtons}>
        <TouchableOpacity
          style={[styles.volumesButton, { backgroundColor: '#FFA500' }]}
          onPress={mostrarVolumesFaltantes}
        >
          <Text style={styles.finishButtonText}>Volumes</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.finishButton,
            { backgroundColor: conferidos.length === totalVolumes ? '#4CAF50' : '#2196F3' }
          ]}
          onPress={finalizarConferencia}
        >
          <Text style={styles.finishButtonText}>
            {conferidos.length === totalVolumes ? 'Conferência Completa!' : 'Finalizar Conferência'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modal de motivo (com Picker) */}
      <Modal
        visible={showMotivoModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMotivoModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Selecione o motivo</Text>
            <Text style={styles.modalSubtitle}>
              {volumes.length - conferidos.length} volumes não foram conferidos
            </Text>
            
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={motivo}
                onValueChange={(itemValue) => setMotivo(itemValue)}
                style={styles.picker}
                dropdownIconColor="#333"
              >
                {opcoesMotivo.map((opcao, index) => (
                  <Picker.Item 
                    key={index} 
                    label={opcao.label} 
                    value={opcao.value} 
                  />
                ))}
              </Picker>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setMotivo('');
                  setShowMotivoModal(false);
                }}
              >
                <Text style={styles.modalButtonText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton]}
                onPress={confirmarFinalizacao}
                disabled={!motivo}
              >
                <Text style={styles.modalButtonText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de volumes faltantes */}
    <Modal
      visible={showVolumesModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowVolumesModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Volumes Faltantes</Text>
          <Text style={styles.modalSubtitle}>
            {totalVolumes - conferidos.length} volumes não conferidos (de um total de {totalVolumes})
          </Text>
          
          <ScrollView style={styles.volumesList}>
            {volumes
              .filter(v => !conferidos.includes(v.IDREV))
              .slice(0, totalVolumes - conferidos.length) // Garante que só mostre a quantidade correta
              .map((volume, index) => (
                <View key={index} style={styles.volumeItem}>
                  <Text style={styles.volumeText}>ID: {volume.IDREV}</Text>
                </View>
              ))
            }
          </ScrollView>
          
          <TouchableOpacity
            style={[styles.modalButton, styles.confirmModalButton]}
            onPress={() => setShowVolumesModal(false)}
          >
            <Text style={styles.modalButtonText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#6200EE',
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  infoContainer: {
    padding: 16,
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  infoText: {
    fontSize: 16,
    marginBottom: 4,
  },
  progressContainer: {
    padding: 16,
    backgroundColor: 'white',
    marginHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  progressText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    color: '#333',
  },
  progressBar: {
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  lastChecked: {
    padding: 16,
    backgroundColor: '#E3F2FD',
    margin: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  lastCheckedText: {
    fontSize: 14,
    color: '#0D47A1',
    marginBottom: 4,
  },
  lastCheckedId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0D47A1',
  },
  lastCheckedSeq: {
    fontSize: 14,
    color: '#0D47A1',
  },
  inputContainer: {
    flexDirection: 'row',
    margin: 16,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
    width: 60,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  footerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 16,
  },
  volumesButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  finishButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 10,
    textAlign: 'center',
    color: '#666',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    marginBottom: 20,
    overflow: 'hidden',
  },
  picker: {
    width: '100%',
    backgroundColor: 'white',
  },
  volumesList: {
    marginBottom: 10,
    maxHeight: '67%', // Altura máxima da lista
  },
  volumeItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  volumeText: {
    fontSize: 30,
    color: '#333',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#f44336',
  },
  confirmModalButton: {
    backgroundColor: '#4CAF50',
  },
  modalButtonText: {
    color: 'white',
    
    fontWeight: 'bold',
  },
});