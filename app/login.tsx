// app/login.tsx
import { useState } from 'react';
import { View, TextInput, StyleSheet, Text, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../hooks/useSession';

export default function LoginScreen() {
  const [username, setUsername] = useState('HUGOTI');
  const [password, setPassword] = useState('Pal.135563');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const router = useRouter();
  const { login, loading, error } = useSession();

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos');
      return;
    }

    try {
      await login(username, password);
      // O redirecionamento agora é tratado pelo hook useSession
    } catch (error: any) {
      handleLoginError(error);
    }
  };

  const handleLoginError = (error: Error) => {
    let errorMessage = 'Falha no login. Verifique:\n';
    
    if (error.message.includes('Timeout')) {
      errorMessage += '• O servidor demorou muito para responder\n';
      errorMessage += '• Sua conexão com a rede\n';
    } else if (error.message.includes('Credenciais inválidas')) {
      errorMessage += '• Seu usuário e senha\n';
    } else if (error.message.includes('conexão') || error.message.includes('servidor')) {
      errorMessage += '• Sua conexão com a internet\n';
      errorMessage += '• O endereço do servidor\n';
    } else {
      errorMessage += `• ${error.message}\n`;
    }

    Alert.alert('Erro no Login', errorMessage);
    console.error('Detalhes do erro:', error);
  };

  const toggleSecureEntry = () => {
    setSecureTextEntry(!secureTextEntry);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Acesso Sankhya</Text>
      
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Usuário</Text>
        <TextInput
          style={styles.input}
          placeholder="Digite seu usuário"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />
      </View>
      
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Senha</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            placeholder="Digite sua senha"
            secureTextEntry={secureTextEntry}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
            editable={!loading}
          />
          <TouchableOpacity onPress={toggleSecureEntry} style={styles.eyeButton}>
            <Text style={styles.eyeIcon}>{secureTextEntry ? '👁️' : '👁️‍🗨️'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Entrar</Text>
        )}
      </TouchableOpacity>

      {error && !loading && (
        <Text style={styles.errorText}>{error}</Text>
      )}

      <Text style={styles.helpText}>
        Problemas para acessar? Verifique:
        {'\n'}• Sua conexão com a internet
        {'\n'}• O endereço do servidor
        {'\n'}• Seu usuário e senha
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 32,
    textAlign: 'center',
    color: '#2c3e50',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    marginBottom: 8,
    fontSize: 16,
    color: '#34495e',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#bdc3c7',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
  },
  eyeButton: {
    position: 'absolute',
    right: 15,
  },
  eyeIcon: {
    fontSize: 20,
  },
  button: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#3498db',
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: '#95a5a6',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  errorText: {
    color: '#e74c3c',
    textAlign: 'center',
    marginTop: 15,
    fontSize: 14,
  },
  helpText: {
    marginTop: 30,
    color: '#7f8c8d',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
  },
});