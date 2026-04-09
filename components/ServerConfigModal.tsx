// components/ServerConfigModal.tsx
import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Modal, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { setBaseURL, setEnvironment, getCurrentEnvironment, ENVIRONMENTS, EnvironmentType } from '../services/api';

const SERVER_URL_KEY = 'saved_server_url';
const ENVIRONMENT_KEY = 'selected_environment';

export default function ServerConfigModal({ visible, onClose, onSave }: {
  visible: boolean;
  onClose: () => void;
  onSave: (ip: string) => void;
}) {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('8180');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedEnvironment, setSelectedEnvironment] = useState<EnvironmentType>('TEST');
  const [changingEnvironment, setChangingEnvironment] = useState(false);

  useEffect(() => {
    const loadSavedConfig = async () => {
      try {
        const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
        if (saved) {
          const cleanValue = saved.replace(/^https?:\/\//, '').replace(/\/mge\/?$/, '');
          const [savedIp, savedPort] = cleanValue.split(':');
          setIp(savedIp || '');
          setPort(savedPort || '8180');
        }
        
        const currentEnv = await getCurrentEnvironment();
        setSelectedEnvironment(currentEnv);
        
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
      // Mudar o ambiente
      await setEnvironment(environment);
      setSelectedEnvironment(environment);
      
      // Preencher IP e Porta automaticamente baseado no ambiente
      if (environment === 'PRODUCTION') {
        setIp('179.127.28.188');
        setPort('55180');
      } else {
        setIp('192.168.0.106');
        setPort('8280');
      }
      
      const config = ENVIRONMENTS[environment];
      
      Alert.alert(
        'Ambiente Alterado',
        `${config.name} selecionado!${environment === 'PRODUCTION' ? '\n\nIP e Porta são fixos e não podem ser alterados.' : ''}`,
        [{ text: 'OK', style: 'default' }]
      );
      
    } catch (error) {
      console.error('Erro ao mudar ambiente:', error);
      Alert.alert('Erro', 'Não foi possível alterar o ambiente.');
    } finally {
      setChangingEnvironment(false);
    }
  };

  const handleSave = async () => {
    // Se for produção, não permite salvar (já está configurado)
    if (selectedEnvironment === 'PRODUCTION') {
      Alert.alert('Aviso', 'O ambiente de Produção já está configurado com IP e Porta fixos.');
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
      const success = await setBaseURL(fullUrl);
      
      if (success) {
        onSave(fullUrl);
        onClose();
        Alert.alert('Sucesso', 'Configuração salva!');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  // Verifica se os inputs devem estar desabilitados (apenas produção desabilita)
  const isInputDisabled = selectedEnvironment === 'PRODUCTION' || loading;

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

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Cards de Ambiente */}
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
            </View>
          )}

          {/* Configuração do Servidor */}
          <View style={styles.serverSection}>
            <Text style={styles.sectionLabel}>
              Servidor Local
              {selectedEnvironment === 'PRODUCTION' && (
                <Text style={styles.fixedLabel}> (Fixos - Não editável)</Text>
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
          </View>

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
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6a1b9a',
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
  },
  serverSection: {
    marginBottom: 20,
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
});