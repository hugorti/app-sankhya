// components/ServerConfigModal.tsx
import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Modal, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { 
  setEnvironment, 
  getCurrentEnvironment, 
  ENVIRONMENTS, 
  EnvironmentType, 
  getCurrentApiURL,
  setManualURL,
  resetToEnvironmentURL,
  getConfigDetails
} from '../services/api';

const SERVER_URL_KEY = 'saved_server_url';
const ENVIRONMENT_KEY = 'selected_environment';

interface ServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (ipPort: string) => Promise<void> | void;
}

export default function ServerConfigModal({ visible, onClose, onSave }: ServerConfigModalProps) {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedEnvironment, setSelectedEnvironment] = useState<EnvironmentType>('PRODUCTION');
  const [changingEnvironment, setChangingEnvironment] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [isManualConfig, setIsManualConfig] = useState(false);

  // Atualizar URL atual
  const updateCurrentUrl = () => {
    const url = getCurrentApiURL();
    setCurrentUrl(url);
    console.log(`📍 URL atual: ${url}`);
  };

  useEffect(() => {
    const loadSavedConfig = async () => {
      try {
        // Carregar ambiente atual
        const currentEnv = await getCurrentEnvironment();
        setSelectedEnvironment(currentEnv);
        console.log(`📌 Ambiente atual: ${currentEnv}`);
        
        // Verificar se é uma configuração manual
        const details = getConfigDetails();
        setIsManualConfig(details.isManual);
        
        // Se for PRODUÇÃO, sempre usar os valores fixos
        if (currentEnv === 'PRODUCTION') {
          setIp('179.127.28.188');
          setPort('55180');
          console.log(`📍 Configuração de PRODUÇÃO: 179.127.28.188:55180`);
        } else {
          // Se for TESTE, verificar se tem URL salva
          const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
          if (saved && details.isManual) {
            const cleanValue = saved.replace(/^https?:\/\//, '').replace(/\/mge\/?$/, '');
            const [savedIp, savedPort] = cleanValue.split(':');
            setIp(savedIp || '');
            setPort(savedPort || '');
            console.log(`📍 Configuração manual carregada: ${savedIp}:${savedPort}`);
          } else {
            // Usar valores padrão do TESTE
            setIp('192.168.0.106');
            setPort('8280');
            console.log(`📍 Configuração padrão do TESTE: 192.168.0.106:8280`);
          }
        }
        
        // Atualizar URL atual
        updateCurrentUrl();
        
      } catch (error) {
        console.error('Error loading saved config:', error);
      }
    };
    
    if (visible) {
      loadSavedConfig();
      setError('');
    }
  }, [visible]);

  const handleEnvironmentSelect = async (environment: EnvironmentType) => {
    setChangingEnvironment(true);
    setError('');
    
    try {
      console.log(`🔄 Mudando para ambiente: ${environment}`);
      
      // Mudar o ambiente - isso vai resetar a URL para a do ambiente
      await setEnvironment(environment);
      setSelectedEnvironment(environment);
      setIsManualConfig(false);
      
      const config = ENVIRONMENTS[environment];
      
      // Definir IP e Porta baseado no ambiente selecionado
      if (environment === 'PRODUCTION') {
        setIp('179.127.28.188');
        setPort('55180');
        console.log(`📍 Configuração de PRODUÇÃO: 179.127.28.188:55180`);
      } else {
        // Para TESTE, verificar se tem URL salva
        const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
        if (saved) {
          const cleanValue = saved.replace(/^https?:\/\//, '').replace(/\/mge\/?$/, '');
          const [savedIp, savedPort] = cleanValue.split(':');
          setIp(savedIp || '');
          setPort(savedPort || '');
          console.log(`📍 Configuração manual carregada: ${savedIp}:${savedPort}`);
        } else {
          setIp('192.168.0.106');
          setPort('8280');
          console.log(`📍 Configuração padrão do TESTE: 192.168.0.106:8280`);
        }
      }
      
      // Atualizar URL atual
      updateCurrentUrl();
      
      Alert.alert(
        'Ambiente Alterado',
        `${config.name} selecionado!\n\nIP: ${environment === 'PRODUCTION' ? '179.127.28.188' : ip}\nPorta: ${environment === 'PRODUCTION' ? '55180' : port}\n\n📍 URL: ${getCurrentApiURL()}`,
        [{ text: 'OK', style: 'default' }]
      );
      
    } catch (error) {
      console.error('❌ Erro ao mudar ambiente:', error);
      Alert.alert('Erro', 'Não foi possível alterar o ambiente.');
    } finally {
      setChangingEnvironment(false);
    }
  };

  const handleSave = async () => {
    // Se for produção, não permite salvar (já está configurado)
    if (selectedEnvironment === 'PRODUCTION') {
      Alert.alert(
        'Aviso', 
        'O ambiente de Produção já está configurado com IP e Porta fixos.\n\nIP: 179.127.28.188\nPorta: 55180\n\nPara usar um servidor personalizado, selecione o ambiente TESTE.'
      );
      return;
    }

    if (!ip.trim()) {
      setError('Informe o endereço do servidor');
      return;
    }

    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && !/^[a-zA-Z0-9\-\.]+$/.test(ip)) {
      setError('IP ou domínio inválido');
      return;
    }

    if (!/^\d+$/.test(port)) {
      setError('Porta inválida');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const fullUrl = `${ip}:${port}`;
      console.log(`🔧 Configurando URL manual: ${fullUrl}`);
      
      // Usar a função setManualURL
      const success = await setManualURL(fullUrl);
      
      if (success) {
        setIsManualConfig(true);
        await onSave(fullUrl);
        
        // Atualizar URL atual
        updateCurrentUrl();
        
        Alert.alert(
          'Sucesso', 
          `Configuração salva com sucesso!\n\nIP: ${ip}\nPorta: ${port}\n\n📍 URL: ${getCurrentApiURL()}`
        );
        
        onClose();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erro ao salvar';
      setError(errorMsg);
      Alert.alert('Erro', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetToEnvironment = async () => {
    Alert.alert(
      'Resetar para Ambiente',
      `Deseja resetar para a URL do ambiente ${selectedEnvironment === 'PRODUCTION' ? 'PRODUÇÃO' : 'TESTE'}?\n\nURL: ${ENVIRONMENTS[selectedEnvironment].BASE_URL}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Resetar', 
          style: 'destructive',
          onPress: async () => {
            try {
              console.log(`🔄 Resetando para URL do ambiente: ${selectedEnvironment}`);
              resetToEnvironmentURL();
              setIsManualConfig(false);
              
              const config = ENVIRONMENTS[selectedEnvironment];
              if (selectedEnvironment === 'PRODUCTION') {
                setIp('179.127.28.188');
                setPort('55180');
              } else {
                setIp('192.168.0.106');
                setPort('8280');
              }
              
              updateCurrentUrl();
              
              Alert.alert(
                'Sucesso',
                `Resetado para URL do ambiente ${selectedEnvironment === 'PRODUCTION' ? 'PRODUÇÃO' : 'TESTE'}!\n\n📍 URL: ${getCurrentApiURL()}`
              );
            } catch (error) {
              console.error('❌ Erro ao resetar:', error);
              Alert.alert('Erro', 'Não foi possível resetar a URL');
            }
          }
        }
      ]
    );
  };

  const isInputDisabled = selectedEnvironment === 'PRODUCTION' || loading || changingEnvironment;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Configurações</Text>
            <TouchableOpacity onPress={onClose} disabled={loading || changingEnvironment}>
              <MaterialIcons name="close" size={24} color="#6a1b9a" />
            </TouchableOpacity>
          </View>

          {/* URL atual */}
          <View style={styles.currentUrlContainer}>
            <Text style={styles.currentUrlLabel}>📍 URL em uso:</Text>
            <Text style={styles.currentUrlValue} numberOfLines={1}>
              {currentUrl || getCurrentApiURL()}
            </Text>
            {isManualConfig && selectedEnvironment === 'TEST' && (
              <View style={styles.manualBadge}>
                <Text style={styles.manualBadgeText}>🔧 Configuração Manual</Text>
              </View>
            )}
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Seleção de Ambiente */}
          <View style={styles.environmentContainer}>
            <TouchableOpacity
              style={[
                styles.environmentCard,
                selectedEnvironment === 'TEST' && styles.environmentCardSelectedTest,
              ]}
              onPress={() => handleEnvironmentSelect('TEST')}
              disabled={changingEnvironment}
            >
              <MaterialIcons 
                name="science" 
                size={28} 
                color={selectedEnvironment === 'TEST' ? '#4caf50' : '#999'} 
              />
              <Text style={[
                styles.environmentText,
                selectedEnvironment === 'TEST' && styles.environmentTextSelected
              ]}>
                Teste
              </Text>
              {selectedEnvironment === 'TEST' && (
                <MaterialIcons name="check-circle" size={20} color="#4caf50" style={styles.checkIcon} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.environmentCard,
                selectedEnvironment === 'PRODUCTION' && styles.environmentCardSelectedProd,
              ]}
              onPress={() => handleEnvironmentSelect('PRODUCTION')}
              disabled={changingEnvironment}
            >
              <MaterialIcons 
                name="cloud-queue" 
                size={28} 
                color={selectedEnvironment === 'PRODUCTION' ? '#ff9800' : '#999'} 
              />
              <Text style={[
                styles.environmentText,
                selectedEnvironment === 'PRODUCTION' && styles.environmentTextSelected
              ]}>
                Produção
              </Text>
              {selectedEnvironment === 'PRODUCTION' && (
                <MaterialIcons name="check-circle" size={20} color="#ff9800" style={styles.checkIcon} />
              )}
            </TouchableOpacity>
          </View>

          {changingEnvironment && (
            <View style={styles.changingContainer}>
              <ActivityIndicator size="small" color="#6a1b9a" />
              <Text style={styles.changingText}>Alterando ambiente...</Text>
            </View>
          )}

          {/* Configuração do Servidor */}
          <View style={styles.serverSection}>
            <Text style={styles.sectionLabel}>
              Servidor Local
              {selectedEnvironment === 'PRODUCTION' && (
                <Text style={styles.fixedLabel}> (Fixos - Não editável)</Text>
              )}
              {selectedEnvironment === 'TEST' && (
                <Text style={styles.editableLabel}> (Editável)</Text>
              )}
            </Text>
            
            <View style={[styles.inputWrapper, isInputDisabled && styles.inputWrapperDisabled]}>
              <MaterialIcons name="dns" size={20} color={isInputDisabled ? '#999' : '#6a1b9a'} />
              <TextInput
                style={[styles.input, isInputDisabled && styles.inputDisabled]}
                placeholder="IP ou domínio"
                placeholderTextColor={isInputDisabled ? '#ccc' : '#ce93d8'}
                value={ip}
                onChangeText={setIp}
                editable={!isInputDisabled}
              />
            </View>

            <View style={[styles.inputWrapper, isInputDisabled && styles.inputWrapperDisabled]}>
              <MaterialIcons name="settings-ethernet" size={20} color={isInputDisabled ? '#999' : '#6a1b9a'} />
              <TextInput
                style={[styles.input, isInputDisabled && styles.inputDisabled]}
                placeholder="Porta"
                placeholderTextColor={isInputDisabled ? '#ccc' : '#ce93d8'}
                value={port}
                onChangeText={setPort}
                keyboardType="numeric"
                editable={!isInputDisabled}
              />
            </View>

            {selectedEnvironment === 'PRODUCTION' && (
              <View style={styles.infoBox}>
                <MaterialIcons name="lock" size={16} color="#ff9800" />
                <Text style={styles.infoText}>
                  Ambiente de Produção - IP e Porta são fixos e não podem ser alterados
                </Text>
              </View>
            )}

            {selectedEnvironment === 'TEST' && (
              <View style={styles.infoBoxTest}>
                <MaterialIcons name="edit" size={16} color="#4caf50" />
                <Text style={styles.infoTextTest}>
                  Ambiente de Teste - Você pode alterar o IP e Porta manualmente
                </Text>
              </View>
            )}
          </View>

          {/* Botões */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[
                styles.saveButton, 
                (loading || changingEnvironment || selectedEnvironment === 'PRODUCTION') && styles.disabledButton
              ]}
              onPress={handleSave}
              disabled={loading || changingEnvironment || selectedEnvironment === 'PRODUCTION'}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {selectedEnvironment === 'PRODUCTION' ? 'CONFIGURAÇÃO FIXA' : 'SALVAR'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.resetButton}
              onPress={handleResetToEnvironment}
              disabled={loading || changingEnvironment}
            >
              <MaterialIcons name="refresh" size={18} color="#6a1b9a" />
              <Text style={styles.resetButtonText}>Resetar para Ambiente</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6a1b9a',
  },
  currentUrlContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
  currentUrlLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  currentUrlValue: {
    fontSize: 14,
    color: '#333',
    marginTop: 2,
    fontWeight: '600',
  },
  manualBadge: {
    marginTop: 4,
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  manualBadgeText: {
    fontSize: 10,
    color: '#1565c0',
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
  },
  errorText: {
    color: '#c62828',
    fontSize: 13,
  },
  environmentContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  environmentCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    position: 'relative',
  },
  environmentCardSelectedTest: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4caf50',
  },
  environmentCardSelectedProd: {
    backgroundColor: '#fff3e0',
    borderColor: '#ff9800',
  },
  environmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 8,
  },
  environmentTextSelected: {
    color: '#6a1b9a',
  },
  checkIcon: {
    position: 'absolute',
    right: 8,
    top: 8,
  },
  changingContainer: {
    alignItems: 'center',
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  changingText: {
    fontSize: 14,
    color: '#6a1b9a',
  },
  serverSection: {
    marginBottom: 15,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6a1b9a',
    marginBottom: 10,
  },
  fixedLabel: {
    fontSize: 12,
    fontWeight: 'normal',
    color: '#ff9800',
  },
  editableLabel: {
    fontSize: 12,
    fontWeight: 'normal',
    color: '#4caf50',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ce93d8',
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  inputWrapperDisabled: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ddd',
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: '#4a148c',
  },
  inputDisabled: {
    color: '#999',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#ff9800',
  },
  infoBoxTest: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  infoTextTest: {
    flex: 1,
    fontSize: 12,
    color: '#4caf50',
  },
  buttonContainer: {
    gap: 10,
  },
  saveButton: {
    backgroundColor: '#4a148c',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    gap: 8,
  },
  resetButtonText: {
    color: '#6a1b9a',
    fontSize: 14,
    fontWeight: '500',
  },
});