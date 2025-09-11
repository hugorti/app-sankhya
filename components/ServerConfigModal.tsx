// components/ServerConfigModal.tsx
import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Modal, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { setBaseURL } from '../services/api';

const SERVER_URL_KEY = 'saved_server_url';

export default function ServerConfigModal({ visible, onClose, onSave }: {
  visible: boolean;
  onClose: () => void;
  onSave: (ip: string) => void;
}) {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('8180');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadSavedServer = async () => {
      try {
        const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
        if (saved) {
          // Handle both formats: "ip:port" and full URL
          const cleanValue = saved.replace(/^https?:\/\//, '').replace(/\/mge\/?$/, '');
          const [savedIp, savedPort] = cleanValue.split(':');
          setIp(savedIp || '');
          setPort(savedPort || '8180');
        }
      } catch (error) {
        console.error('Error loading saved server:', error);
      }
    };
    
    if (visible) {
      loadSavedServer();
      setError('');
    }
  }, [visible]);

  const handleSave = async () => {
    if (!ip.trim()) {
      setError('Por favor, informe o endereço do servidor');
      return;
    }

    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && !/^[a-zA-Z0-9\-\.]+$/.test(ip)) {
      setError('Endereço IP ou domínio inválido');
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
        Alert.alert('Sucesso', 'Configuração do servidor salva com sucesso!');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configuração');
    } finally {
      setLoading(false);
    }
  };

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
            <Text style={styles.modalTitle}>Configuração do Servidor</Text>
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <MaterialIcons name="close" size={24} color="#6a1b9a" />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Endereço IP/Domínio:</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 192.168.1.100"
              value={ip}
              onChangeText={setIp}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Porta:</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 8180"
              value={port}
              onChangeText={setPort}
              keyboardType="numeric"
              editable={!loading}
            />
          </View>

          <View style={styles.exampleContainer}>
            <Text style={styles.exampleText}>Exemplos:</Text>
            <Text style={styles.exampleItem}>• 45.186.217.65:8180</Text>
            <Text style={styles.exampleItem}>• meuservidor.com.br:8080</Text>
          </View>

          <TouchableOpacity 
            style={[styles.saveButton, loading && styles.disabledButton]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>SALVAR CONFIGURAÇÃO</Text>
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
    borderRadius: 12,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6a1b9a',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
  },
  inputGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    color: '#6a1b9a',
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ce93d8',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#4a148c',
    backgroundColor: '#fff',
  },
  exampleContainer: {
    marginTop: 10,
    marginBottom: 20,
  },
  exampleText: {
    fontSize: 14,
    color: '#9c27b0',
    marginBottom: 5,
    fontWeight: '500',
  },
  exampleItem: {
    fontSize: 13,
    color: '#4a148c',
    marginLeft: 10,
  },
  saveButton: {
    backgroundColor: '#4a148c',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  disabledButton: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});