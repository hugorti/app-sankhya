// components/ServerConfigModal.tsx

import { useState, useEffect } from 'react';

import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

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
  getConfigDetails,
} from '../services/api';

const SERVER_URL_KEY = 'saved_server_url';
const ENVIRONMENT_KEY = 'selected_environment';

interface ServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (ipPort: string) => Promise<void> | void;
}

export default function ServerConfigModal({
  visible,
  onClose,
  onSave,
}: ServerConfigModalProps) {

  const [ip, setIp] = useState('');
  const [port, setPort] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedEnvironment, setSelectedEnvironment] =
    useState<EnvironmentType>('PRODUCTION');
  const [changingEnvironment, setChangingEnvironment] =
    useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [isManualConfig, setIsManualConfig] = useState(false);

  // ============================================================
  // ATUALIZAR URL ATUAL
  // ============================================================

  const updateCurrentUrl = () => {
    const url = getCurrentApiURL();

    setCurrentUrl(url);

    console.log(`📍 URL atual: ${url}`);
  };

  // ============================================================
  // CARREGAR CONFIGURAÇÃO
  // ============================================================

  useEffect(() => {

    const loadSavedConfig = async () => {

      try {

        // Carregar ambiente atual
        const currentEnv = await getCurrentEnvironment();

        setSelectedEnvironment(currentEnv);

        console.log(`📌 Ambiente atual: ${currentEnv}`);

        // Verificar se é configuração manual
        const details = getConfigDetails();

        setIsManualConfig(details.isManual);

        // ======================================================
        // PRODUÇÃO
        // ======================================================

        if (currentEnv === 'PRODUCTION') {

          setIp('179.127.28.188');
          setPort('55180');

          console.log(
            '📍 Configuração de PRODUÇÃO: 179.127.28.188:55180'
          );

        } else {

          // ====================================================
          // TESTE
          // ====================================================

          const saved =
            await AsyncStorage.getItem(SERVER_URL_KEY);

          if (saved && details.isManual) {

            const cleanValue = saved
              .replace(/^https?:\/\//, '')
              .replace(/\/mge\/?$/, '');

            const [savedIp, savedPort] =
              cleanValue.split(':');

            setIp(savedIp || '');
            setPort(savedPort || '');

            console.log(
              `📍 Configuração manual carregada: ${savedIp}:${savedPort}`
            );

          } else {

            setIp('192.168.0.106');
            setPort('8280');

            console.log(
              '📍 Configuração padrão do TESTE: 192.168.0.106:8280'
            );
          }
        }

        // Atualizar URL
        updateCurrentUrl();

      } catch (error) {

        console.error(
          '❌ Erro ao carregar configuração:',
          error
        );
      }
    };

    if (visible) {

      loadSavedConfig();

      setError('');
    }

  }, [visible]);

  // ============================================================
  // ALTERAR AMBIENTE
  // ============================================================

  const handleEnvironmentSelect = async (
    environment: EnvironmentType
  ) => {

    setChangingEnvironment(true);
    setError('');

    try {

      console.log(
        `🔄 Mudando para ambiente: ${environment}`
      );

      // Mudar ambiente
      await setEnvironment(environment);

      setSelectedEnvironment(environment);

      setIsManualConfig(false);

      const config = ENVIRONMENTS[environment];

      // ========================================================
      // PRODUÇÃO
      // ========================================================

      if (environment === 'PRODUCTION') {

        setIp('179.127.28.188');
        setPort('55180');

        console.log(
          '📍 Configuração de PRODUÇÃO: 179.127.28.188:55180'
        );

      } else {

        // ======================================================
        // TESTE
        // ======================================================

        const saved =
          await AsyncStorage.getItem(SERVER_URL_KEY);

        if (saved) {

          const cleanValue = saved
            .replace(/^https?:\/\//, '')
            .replace(/\/mge\/?$/, '');

          const [savedIp, savedPort] =
            cleanValue.split(':');

          setIp(savedIp || '');
          setPort(savedPort || '');

          console.log(
            `📍 Configuração manual carregada: ${savedIp}:${savedPort}`
          );

        } else {

          setIp('192.168.0.106');
          setPort('8280');

          console.log(
            '📍 Configuração padrão do TESTE: 192.168.0.106:8280'
          );
        }
      }

      // Atualizar URL
      updateCurrentUrl();

      Alert.alert(
        'Ambiente Alterado',
        `${config.name} selecionado!\n\n` +
        `IP: ${
          environment === 'PRODUCTION'
            ? '179.127.28.188'
            : ip
        }\n` +
        `Porta: ${
          environment === 'PRODUCTION'
            ? '55180'
            : port
        }\n\n` +
        `📍 URL: ${getCurrentApiURL()}`,
        [
          {
            text: 'OK',
            style: 'default',
          },
        ]
      );

    } catch (error) {

      console.error(
        '❌ Erro ao mudar ambiente:',
        error
      );

      Alert.alert(
        'Erro',
        'Não foi possível alterar o ambiente.'
      );

    } finally {

      setChangingEnvironment(false);
    }
  };

  // ============================================================
  // SALVAR CONFIGURAÇÃO
  // ============================================================

  const handleSave = async () => {

    // Produção não pode ser alterada
    if (selectedEnvironment === 'PRODUCTION') {

      Alert.alert(
        'Aviso',
        'O ambiente de Produção já está configurado com IP e Porta fixos.\n\n' +
        'IP: 179.127.28.188\n' +
        'Porta: 55180\n\n' +
        'Para usar um servidor personalizado, selecione o ambiente TESTE.'
      );

      return;
    }

    // Validar IP
    if (!ip.trim()) {

      setError(
        'Informe o endereço do servidor'
      );

      return;
    }

    // Validar IP ou domínio
    if (
      !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
      !/^[a-zA-Z0-9\-\.]+$/.test(ip)
    ) {

      setError(
        'IP ou domínio inválido'
      );

      return;
    }

    // Validar porta
    if (!/^\d+$/.test(port)) {

      setError(
        'Porta inválida'
      );

      return;
    }

    setLoading(true);
    setError('');

    try {

      const fullUrl = `${ip}:${port}`;

      console.log(
        `🔧 Configurando URL manual: ${fullUrl}`
      );

      // Configurar URL manual
      const success =
        await setManualURL(fullUrl);

      if (success) {

        setIsManualConfig(true);

        await onSave(fullUrl);

        // Atualizar URL
        updateCurrentUrl();

        Alert.alert(
          'Sucesso',
          `Configuração salva com sucesso!\n\n` +
          `IP: ${ip}\n` +
          `Porta: ${port}\n\n` +
          `📍 URL: ${getCurrentApiURL()}`
        );

        onClose();
      }

    } catch (err) {

      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Erro ao salvar';

      setError(errorMsg);

      Alert.alert(
        'Erro',
        errorMsg
      );

    } finally {

      setLoading(false);
    }
  };

  // ============================================================
  // RESETAR PARA AMBIENTE
  // ============================================================

  const handleResetToEnvironment = async () => {

    Alert.alert(
      'Resetar para Ambiente',

      `Deseja resetar para a URL do ambiente ${
        selectedEnvironment === 'PRODUCTION'
          ? 'PRODUÇÃO'
          : 'TESTE'
      }?\n\n` +

      `URL: ${
        ENVIRONMENTS[selectedEnvironment].BASE_URL
      }`,

      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },

        {
          text: 'Resetar',
          style: 'destructive',

          onPress: async () => {

            try {

              console.log(
                `🔄 Resetando para URL do ambiente: ${selectedEnvironment}`
              );

              resetToEnvironmentURL();

              setIsManualConfig(false);

              if (
                selectedEnvironment === 'PRODUCTION'
              ) {

                setIp('179.127.28.188');
                setPort('55180');

              } else {

                setIp('192.168.0.106');
                setPort('8280');
              }

              // Atualizar URL
              updateCurrentUrl();

              Alert.alert(
                'Sucesso',

                `Resetado para URL do ambiente ${
                  selectedEnvironment === 'PRODUCTION'
                    ? 'PRODUÇÃO'
                    : 'TESTE'
                }!\n\n` +

                `📍 URL: ${getCurrentApiURL()}`
              );

            } catch (error) {

              console.error(
                '❌ Erro ao resetar:',
                error
              );

              Alert.alert(
                'Erro',
                'Não foi possível resetar a URL'
              );
            }
          },
        },
      ]
    );
  };

  // ============================================================
  // CONTROLE DOS CAMPOS
  // ============================================================

  const isInputDisabled =
    selectedEnvironment === 'PRODUCTION' ||
    loading ||
    changingEnvironment;

  // ============================================================
  // TELA
  // ============================================================

  return (

    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >

      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >

        <View style={styles.modalContainer}>

          {/* ==================================================
              CABEÇALHO
          ================================================== */}

          <View style={styles.modalHeader}>

            <Text style={styles.modalTitle}>
              Configurações
            </Text>

            <TouchableOpacity
              onPress={onClose}
              disabled={
                loading ||
                changingEnvironment
              }
            >

              <MaterialIcons
                name="close"
                size={22}
                color="#6a1b9a"
              />

            </TouchableOpacity>

          </View>

          {/* ==================================================
              CONTEÚDO COM SCROLL
          ================================================== */}

          <ScrollView
            style={styles.scrollContent}

            contentContainerStyle={
              styles.scrollContentContainer
            }

            showsVerticalScrollIndicator={true}

            keyboardShouldPersistTaps="handled"

            nestedScrollEnabled={true}
          >

            {/* =================================================
                URL ATUAL
            ================================================= */}

            <View
              style={styles.currentUrlContainer}
            >

              <Text
                style={styles.currentUrlLabel}
              >
                📍 URL em uso:
              </Text>

              <Text
                style={styles.currentUrlValue}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {currentUrl ||
                  getCurrentApiURL()}
              </Text>

              {isManualConfig &&
                selectedEnvironment === 'TEST' && (

                  <View
                    style={styles.manualBadge}
                  >

                    <Text
                      style={
                        styles.manualBadgeText
                      }
                    >
                      🔧 Configuração Manual
                    </Text>

                  </View>
                )}

            </View>

            {/* =================================================
                ERRO
            ================================================= */}

            {error ? (

              <View
                style={styles.errorContainer}
              >

                <Text
                  style={styles.errorText}
                >
                  {error}
                </Text>

              </View>

            ) : null}

            {/* =================================================
                SELEÇÃO DE AMBIENTE
            ================================================= */}

            <View
              style={styles.environmentContainer}
            >

              {/* TESTE */}

              <TouchableOpacity
                style={[
                  styles.environmentCard,

                  selectedEnvironment === 'TEST' &&
                    styles.environmentCardSelectedTest,
                ]}

                onPress={() =>
                  handleEnvironmentSelect('TEST')
                }

                disabled={
                  changingEnvironment
                }
              >

                <MaterialIcons
                  name="science"
                  size={22}

                  color={
                    selectedEnvironment === 'TEST'
                      ? '#4caf50'
                      : '#999'
                  }
                />

                <Text
                  style={[
                    styles.environmentText,

                    selectedEnvironment === 'TEST' &&
                      styles.environmentTextSelected,
                  ]}
                >
                  Teste
                </Text>

                {selectedEnvironment ===
                  'TEST' && (

                  <MaterialIcons
                    name="check-circle"
                    size={17}
                    color="#4caf50"
                    style={styles.checkIcon}
                  />

                )}

              </TouchableOpacity>

              {/* PRODUÇÃO */}

              <TouchableOpacity
                style={[
                  styles.environmentCard,

                  selectedEnvironment ===
                    'PRODUCTION' &&
                    styles.environmentCardSelectedProd,
                ]}

                onPress={() =>
                  handleEnvironmentSelect(
                    'PRODUCTION'
                  )
                }

                disabled={
                  changingEnvironment
                }
              >

                <MaterialIcons
                  name="cloud-queue"
                  size={22}

                  color={
                    selectedEnvironment ===
                    'PRODUCTION'
                      ? '#ff9800'
                      : '#999'
                  }
                />

                <Text
                  style={[
                    styles.environmentText,

                    selectedEnvironment ===
                      'PRODUCTION' &&
                      styles.environmentTextSelected,
                  ]}
                >
                  Produção
                </Text>

                {selectedEnvironment ===
                  'PRODUCTION' && (

                  <MaterialIcons
                    name="check-circle"
                    size={17}
                    color="#ff9800"
                    style={styles.checkIcon}
                  />

                )}

              </TouchableOpacity>

            </View>

            {/* =================================================
                ALTERANDO AMBIENTE
            ================================================= */}

            {changingEnvironment && (

              <View
                style={
                  styles.changingContainer
                }
              >

                <ActivityIndicator
                  size="small"
                  color="#6a1b9a"
                />

                <Text
                  style={styles.changingText}
                >
                  Alterando ambiente...
                </Text>

              </View>

            )}

            {/* =================================================
                CONFIGURAÇÃO DO SERVIDOR
            ================================================= */}

            <View
              style={styles.serverSection}
            >

              <Text
                style={styles.sectionLabel}
              >

                Servidor Local

                {selectedEnvironment ===
                  'PRODUCTION' && (

                  <Text
                    style={styles.fixedLabel}
                  >
                    {' '}(Fixos)
                  </Text>

                )}

                {selectedEnvironment ===
                  'TEST' && (

                  <Text
                    style={
                      styles.editableLabel
                    }
                  >
                    {' '}(Editável)
                  </Text>

                )}

              </Text>

              {/* =================================================
                  IP / DOMÍNIO
              ================================================= */}

              <View
                style={[
                  styles.inputWrapper,

                  isInputDisabled &&
                    styles.inputWrapperDisabled,
                ]}
              >

                <MaterialIcons
                  name="dns"
                  size={18}

                  color={
                    isInputDisabled
                      ? '#999'
                      : '#6a1b9a'
                  }
                />

                <TextInput
                  style={[
                    styles.input,

                    isInputDisabled &&
                      styles.inputDisabled,
                  ]}

                  placeholder="IP ou domínio"

                  placeholderTextColor={
                    isInputDisabled
                      ? '#ccc'
                      : '#ce93d8'
                  }

                  value={ip}

                  onChangeText={setIp}

                  editable={
                    !isInputDisabled
                  }

                  autoCapitalize="none"

                  autoCorrect={false}
                />

              </View>

              {/* =================================================
                  PORTA
              ================================================= */}

              <View
                style={[
                  styles.inputWrapper,

                  isInputDisabled &&
                    styles.inputWrapperDisabled,
                ]}
              >

                <MaterialIcons
                  name="settings-ethernet"
                  size={18}

                  color={
                    isInputDisabled
                      ? '#999'
                      : '#6a1b9a'
                  }
                />

                <TextInput
                  style={[
                    styles.input,

                    isInputDisabled &&
                      styles.inputDisabled,
                  ]}

                  placeholder="Porta"

                  placeholderTextColor={
                    isInputDisabled
                      ? '#ccc'
                      : '#ce93d8'
                  }

                  value={port}

                  onChangeText={setPort}

                  keyboardType="numeric"

                  editable={
                    !isInputDisabled
                  }
                />

              </View>

              {/* =================================================
                  INFORMAÇÃO PRODUÇÃO
              ================================================= */}

              {selectedEnvironment ===
                'PRODUCTION' && (

                <View
                  style={styles.infoBox}
                >

                  <MaterialIcons
                    name="lock"
                    size={15}
                    color="#ff9800"
                  />

                  <Text
                    style={styles.infoText}
                  >
                    Produção - IP e Porta
                    são fixos.
                  </Text>

                </View>

              )}

              {/* =================================================
                  INFORMAÇÃO TESTE
              ================================================= */}

              {selectedEnvironment ===
                'TEST' && (

                <View
                  style={styles.infoBoxTest}
                >

                  <MaterialIcons
                    name="edit"
                    size={15}
                    color="#4caf50"
                  />

                  <Text
                    style={styles.infoTextTest}
                  >
                    Teste - IP e Porta podem
                    ser alterados.
                  </Text>

                </View>

              )}

            </View>

          </ScrollView>

          {/* ==================================================
              BOTÕES FIXOS
          ================================================== */}

          <View
            style={styles.buttonContainer}
          >

            {/* SALVAR */}

            <TouchableOpacity
              style={[
                styles.saveButton,

                (
                  loading ||
                  changingEnvironment ||
                  selectedEnvironment ===
                    'PRODUCTION'
                ) &&
                  styles.disabledButton,
              ]}

              onPress={handleSave}

              disabled={
                loading ||
                changingEnvironment ||
                selectedEnvironment ===
                  'PRODUCTION'
              }
            >

              {loading ? (

                <ActivityIndicator
                  color="#fff"
                  size="small"
                />

              ) : (

                <Text
                  style={
                    styles.saveButtonText
                  }
                >
                  {selectedEnvironment ===
                    'PRODUCTION'
                    ? 'CONFIGURAÇÃO FIXA'
                    : 'SALVAR'}
                </Text>

              )}

            </TouchableOpacity>

            {/* RESETAR */}

            <TouchableOpacity
              style={styles.resetButton}

              onPress={
                handleResetToEnvironment
              }

              disabled={
                loading ||
                changingEnvironment
              }
            >

              <MaterialIcons
                name="refresh"
                size={17}
                color="#6a1b9a"
              />

              <Text
                style={
                  styles.resetButtonText
                }
              >
                Resetar para Ambiente
              </Text>

            </TouchableOpacity>

          </View>

        </View>

      </KeyboardAvoidingView>

    </Modal>
  );
}

// ============================================================
// ESTILOS PARA COLETOR
// ============================================================

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

    // Limita o tamanho para coletores
    maxHeight: '88%',

    width: '100%',
    alignSelf: 'center',
  },

  // ==========================================================
  // CABEÇALHO
  // ==========================================================

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

  // ==========================================================
  // SCROLL
  // ==========================================================

  scrollContent: {
    flexGrow: 0,
  },

  scrollContentContainer: {
    paddingBottom: 5,
  },

  // ==========================================================
  // URL
  // ==========================================================

  currentUrlContainer: {
    backgroundColor: '#f5f5f5',

    borderRadius: 6,

    padding: 7,

    marginBottom: 8,
  },

  currentUrlLabel: {
    fontSize: 10,

    color: '#666',

    fontWeight: '500',
  },

  currentUrlValue: {
    fontSize: 11,

    color: '#333',

    marginTop: 2,

    fontWeight: '600',
  },

  manualBadge: {
    marginTop: 3,

    backgroundColor: '#e3f2fd',

    paddingHorizontal: 6,

    paddingVertical: 2,

    borderRadius: 3,

    alignSelf: 'flex-start',
  },

  manualBadgeText: {
    fontSize: 9,

    color: '#1565c0',

    fontWeight: '600',
  },

  // ==========================================================
  // ERRO
  // ==========================================================

  errorContainer: {
    backgroundColor: '#ffebee',

    padding: 7,

    borderRadius: 6,

    marginBottom: 8,
  },

  errorText: {
    color: '#c62828',

    fontSize: 11,
  },

  // ==========================================================
  // AMBIENTE
  // ==========================================================

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

  environmentTextSelected: {
    color: '#6a1b9a',
  },

  checkIcon: {
    position: 'absolute',

    right: 4,

    top: 4,
  },

  // ==========================================================
  // ALTERANDO AMBIENTE
  // ==========================================================

  changingContainer: {
    alignItems: 'center',

    marginBottom: 8,

    flexDirection: 'row',

    justifyContent: 'center',

    gap: 6,
  },

  changingText: {
    fontSize: 11,

    color: '#6a1b9a',
  },

  // ==========================================================
  // SERVIDOR
  // ==========================================================

  serverSection: {
    marginBottom: 7,
  },

  sectionLabel: {
    fontSize: 12,

    fontWeight: '600',

    color: '#6a1b9a',

    marginBottom: 6,
  },

  fixedLabel: {
    fontSize: 10,

    fontWeight: 'normal',

    color: '#ff9800',
  },

  editableLabel: {
    fontSize: 10,

    fontWeight: 'normal',

    color: '#4caf50',
  },

  // ==========================================================
  // INPUT
  // ==========================================================

  inputWrapper: {
    flexDirection: 'row',

    alignItems: 'center',

    borderWidth: 1,

    borderColor: '#ce93d8',

    borderRadius: 6,

    backgroundColor: '#fff',

    marginBottom: 7,

    paddingHorizontal: 8,

    minHeight: 40,
  },

  inputWrapperDisabled: {
    backgroundColor: '#f5f5f5',

    borderColor: '#ddd',
  },

  input: {
    flex: 1,

    paddingVertical: 7,

    paddingHorizontal: 8,

    fontSize: 13,

    color: '#4a148c',
  },

  inputDisabled: {
    color: '#999',
  },

  // ==========================================================
  // INFORMAÇÕES
  // ==========================================================

  infoBox: {
    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: '#fff3e0',

    padding: 7,

    borderRadius: 6,

    marginTop: 3,

    gap: 6,
  },

  infoText: {
    flex: 1,

    fontSize: 10,

    color: '#ff9800',
  },

  infoBoxTest: {
    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: '#e8f5e9',

    padding: 7,

    borderRadius: 6,

    marginTop: 3,

    gap: 6,
  },

  infoTextTest: {
    flex: 1,

    fontSize: 10,

    color: '#4caf50',
  },

  // ==========================================================
  // BOTÕES
  // ==========================================================

  buttonContainer: {
    gap: 5,

    paddingTop: 7,

    borderTopWidth: 1,

    borderTopColor: '#eee',
  },

  saveButton: {
    backgroundColor: '#4a148c',

    borderRadius: 7,

    paddingVertical: 10,

    alignItems: 'center',

    minHeight: 40,
  },

  disabledButton: {
    backgroundColor: '#ccc',
  },

  saveButtonText: {
    color: '#fff',

    fontWeight: 'bold',

    fontSize: 12,
  },

  resetButton: {
    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    paddingVertical: 6,

    gap: 5,
  },

  resetButtonText: {
    color: '#6a1b9a',

    fontSize: 11,

    fontWeight: '500',
  },

});