// components/ServerConfigModal.tsx
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import {
  setEnvironment,
  getCurrentEnvironment,
  getCurrentApiURL,
  ENVIRONMENTS,
  EnvironmentType,
} from '../services/api';

interface ServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onSave?: () => Promise<void> | void;
}

export default function ServerConfigModal({
  visible,
  onClose,
  onSave,
}: ServerConfigModalProps) {
  const [selectedEnvironment, setSelectedEnvironment] =
    useState<EnvironmentType>('TEST');
  const [changingEnvironment, setChangingEnvironment] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [error, setError] = useState('');

  const updateCurrentUrl = () => {
    const url = getCurrentApiURL();
    setCurrentUrl(url);
    console.log(`📍 URL atual: ${url}`);
  };

  useEffect(() => {
    if (!visible) return;
    const load = async () => {
      try {
        const currentEnv = await getCurrentEnvironment();
        setSelectedEnvironment(currentEnv);
        updateCurrentUrl();
        setError('');
        console.log(`📌 Ambiente atual: ${currentEnv}`);
      } catch (err) {
        console.error('❌ Erro ao carregar configuração:', err);
        setError('Não foi possível carregar a configuração.');
      }
    };
    load();
  }, [visible]);

  const handleEnvironmentSelect = async (environment: EnvironmentType) => {
    if (environment === selectedEnvironment || changingEnvironment) return;

    setChangingEnvironment(true);
    setError('');

    try {
      console.log(`🔄 Mudando para ambiente: ${environment}`);
      await setEnvironment(environment);
      setSelectedEnvironment(environment);
      updateCurrentUrl();

      if (onSave) await onSave();

      Alert.alert(
        'Ambiente Alterado',
        `${ENVIRONMENTS[environment].name} selecionado!\n\n📍 URL: ${getCurrentApiURL()}\n\n⚠️ Faça login novamente.`,
        [{ text: 'OK' }]
      );
    } catch (err) {
      console.error('❌ Erro ao mudar ambiente:', err);
      const msg =
        err instanceof Error ? err.message : 'Não foi possível alterar o ambiente.';
      setError(msg);
      Alert.alert('Erro', msg);
    } finally {
      setChangingEnvironment(false);
    }
  };

  const isProd = selectedEnvironment === 'PRODUCTION';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Configurações</Text>
            <TouchableOpacity onPress={onClose} disabled={changingEnvironment}>
              <MaterialIcons name="close" size={22} color="#6a1b9a" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContentContainer}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.currentUrlContainer}>
              <Text style={styles.currentUrlLabel}>📍 URL em uso:</Text>
              <Text style={styles.currentUrlValue} numberOfLines={2}>
                {currentUrl || getCurrentApiURL()}
              </Text>
            </View>

            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>Ambiente</Text>

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
                  size={22}
                  color={selectedEnvironment === 'TEST' ? '#4caf50' : '#999'}
                />
                <Text
                  style={[
                    styles.environmentText,
                    selectedEnvironment === 'TEST' && styles.environmentTextSelected,
                  ]}
                >
                  Teste
                </Text>
                {selectedEnvironment === 'TEST' && (
                  <MaterialIcons
                    name="check-circle"
                    size={17}
                    color="#4caf50"
                    style={styles.checkIcon}
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.environmentCard,
                  isProd && styles.environmentCardSelectedProd,
                ]}
                onPress={() => handleEnvironmentSelect('PRODUCTION')}
                disabled={changingEnvironment}
              >
                <MaterialIcons
                  name="cloud-queue"
                  size={22}
                  color={isProd ? '#ff9800' : '#999'}
                />
                <Text
                  style={[
                    styles.environmentText,
                    isProd && styles.environmentTextSelected,
                  ]}
                >
                  Produção
                </Text>
                {isProd && (
                  <MaterialIcons
                    name="check-circle"
                    size={17}
                    color="#ff9800"
                    style={styles.checkIcon}
                  />
                )}
              </TouchableOpacity>
            </View>

            {changingEnvironment && (
              <View style={styles.changingContainer}>
                <ActivityIndicator size="small" color="#6a1b9a" />
                <Text style={styles.changingText}>Alterando ambiente...</Text>
              </View>
            )}

            <View style={[styles.infoBox, isProd && styles.infoBoxProd]}>
              <MaterialIcons
                name={isProd ? 'cloud' : 'science'}
                size={15}
                color={isProd ? '#ff9800' : '#4caf50'}
              />
              <Text style={[styles.infoText, isProd && styles.infoTextProd]}>
                {isProd
                  ? 'Produção: usa o gateway oficial da Sankhya (https://api.sankhya.com.br).'
                  : 'Teste: usa o gateway sandbox da Sankhya (https://api.sandbox.sankhya.com.br).'}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              disabled={changingEnvironment}
            >
              <Text style={styles.closeButtonText}>FECHAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    maxHeight: '88%',
    width: '100%',
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    minHeight: 32,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#6a1b9a',
  },
  scrollContent: { flexGrow: 0 },
  scrollContentContainer: { paddingBottom: 5 },
  currentUrlContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    padding: 7,
    marginBottom: 8,
  },
  currentUrlLabel: { fontSize: 10, color: '#666', fontWeight: '500' },
  currentUrlValue: {
    fontSize: 11,
    color: '#333',
    marginTop: 2,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 7,
    borderRadius: 6,
    marginBottom: 8,
  },
  errorText: { color: '#c62828', fontSize: 11 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6a1b9a',
    marginBottom: 6,
  },
  environmentContainer: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 9,
  },
  environmentCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 7,
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: 'transparent',
    position: 'relative',
    minHeight: 40,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginLeft: 5,
  },
  environmentTextSelected: { color: '#6a1b9a' },
  checkIcon: { position: 'absolute', right: 4, top: 4 },
  changingContainer: {
    alignItems: 'center',
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  changingText: { fontSize: 11, color: '#6a1b9a' },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 7,
    borderRadius: 6,
    marginTop: 3,
    gap: 6,
  },
  infoBoxProd: { backgroundColor: '#fff3e0' },
  infoText: { flex: 1, fontSize: 10, color: '#4caf50' },
  infoTextProd: { color: '#ff9800' },
  buttonContainer: {
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  closeButton: {
    backgroundColor: '#4a148c',
    borderRadius: 7,
    paddingVertical: 10,
    alignItems: 'center',
    minHeight: 40,
  },
  closeButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
});