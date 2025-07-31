import React, { useState } from 'react';
import { View, TextInput, StyleSheet, Text, ActivityIndicator, Alert, Platform, Button } from 'react-native';
import { useRouter } from 'expo-router';
import { login } from '../services/api';

export default function LoginScreen() {
  const [username, setUsername] = useState('HUGOTI');
  const [password, setPassword] = useState('Pal.135563');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos');
      return;
    }

    setLoading(true);
    try {
      const response = await login(username, password);
      
      if (Platform.OS === 'web') {
        localStorage.setItem('sankhya_session', JSON.stringify(response));
      }
      
      router.push({
        pathname: '/(tabs)',
        params: { 
          sessionData: JSON.stringify(response),
          username: username 
        }
      });
      
    } catch (error: any) {
      let errorMessage = error.message || 'Falha no login. Verifique suas credenciais e a conexão.';
      
      if (errorMessage.includes('Network Error') || errorMessage.includes('CORS')) {
        errorMessage = 'Problema de conexão com o servidor. Verifique se o servidor Sankhya está configurado para aceitar requisições do seu domínio.';
      }
      
      Alert.alert('Erro no Login', errorMessage);
      console.error('Detalhes do erro:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login Sankhya</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Usuário"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        editable={!loading}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Senha"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!loading}
        onSubmitEditing={handleLogin}
      />
      
      <Button 
        title="Entrar" 
        onPress={handleLogin}
        disabled={loading}
      />
      
      {loading && <ActivityIndicator size="large" style={styles.loader} />}
      
      {Platform.OS === 'web' && (
        <Text style={styles.note}>
          Nota: Se estiver com problemas de CORS, tente acessar via app mobile ou configure o proxy no servidor Sankhya.
        </Text>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 20,
    fontSize: 16,
  },
  button: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2E86C1',
  },
  loader: {
    marginTop: 20,
  },
  note: {
    marginTop: 20,
    color: '#666',
    textAlign: 'center',
    fontSize: 12,
  },
});