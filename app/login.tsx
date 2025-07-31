import { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, Text, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../hooks/useSession';
import { MaterialIcons } from '@expo/vector-icons';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [isFormValid, setIsFormValid] = useState(false);
  const router = useRouter();
  const { login, loading, error } = useSession();

  // Validação do formulário
  useEffect(() => {
    setIsFormValid(username.trim().length > 0 && password.trim().length > 0);
  }, [username, password]);

  // Formata o username para maiúsculas
  const handleUsernameChange = (text: string) => {
    setUsername(text.toUpperCase());
  };

  const handleLogin = async () => {
    if (!isFormValid) {
      showValidationError();
      return;
    }

    try {
      await login(username, password);
    } catch (error: any) {
      handleLoginError(error);
    }
  };

  const showValidationError = () => {
    let message = 'Por favor, preencha ';
    if (!username.trim() && !password.trim()) {
      message += 'o usuário e a senha';
    } else if (!username.trim()) {
      message += 'o usuário';
    } else {
      message += 'a senha';
    }
    
    Alert.alert('Campos obrigatórios', message, [
      { text: 'OK', style: 'default' }
    ]);
  };

  const handleLoginError = (error: Error) => {
    let errorMessage = 'Não foi possível fazer login:\n\n';
    
    if (error.message.includes('Timeout')) {
      errorMessage += '• Verifique sua conexão com a internet\n';
      errorMessage += '• O servidor pode estar indisponível\n';
    } else if (error.message.includes('Credenciais')) {
      errorMessage += '• Usuário ou senha incorretos\n';
    } else {
      errorMessage += `• ${error.message}\n`;
    }

    Alert.alert('Erro no Login', errorMessage, [
      { text: 'Entendi', style: 'cancel' }
    ]);
  };

  const toggleSecureEntry = () => {
    setSecureTextEntry(!secureTextEntry);
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Text style={styles.title}>SANKHYA</Text>
        <Text style={styles.subtitle}>Acesso ao Sistema</Text>
      </View>
      
      {/* Campo de Usuário */}
      <View style={styles.inputContainer}>
        <Text style={styles.label}>USUÁRIO</Text>
        <View style={styles.inputWrapper}>
          <MaterialIcons name="person" size={24} color="#9c27b0" style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Digite seu usuário"
            placeholderTextColor="#b39ddb"
            value={username}
            onChangeText={handleUsernameChange}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!loading}
            selectionColor="#9c27b0"
          />
        </View>
      </View>
      
      {/* Campo de Senha */}
      <View style={styles.inputContainer}>
        <Text style={styles.label}>SENHA</Text>
        <View style={styles.inputWrapper}>
          <MaterialIcons name="lock" size={24} color="#9c27b0" style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Digite sua senha"
            placeholderTextColor="#b39ddb"
            secureTextEntry={secureTextEntry}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
            editable={!loading}
            selectionColor="#9c27b0"
          />
          <TouchableOpacity onPress={toggleSecureEntry} style={styles.eyeButton}>
            <MaterialIcons 
              name={secureTextEntry ? 'visibility-off' : 'visibility'} 
              size={24} 
              color="#9c27b0" 
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Botão de Login */}
      <TouchableOpacity 
        style={[
          styles.button, 
          !isFormValid && styles.buttonDisabled,
          loading && styles.buttonLoading
        ]}
        onPress={handleLogin}
        disabled={!isFormValid || loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.buttonText}>ENTRAR</Text>
        )}
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Versão 1.0.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    backgroundColor: '#f3e5f5',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#6a1b9a',
    textAlign: 'center',
    marginBottom: 5,
    letterSpacing: 1,
    textShadowColor: 'rgba(156, 39, 176, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#9c27b0',
    textAlign: 'center',
    fontWeight: '500',
  },
  inputContainer: {
    marginBottom: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6a1b9a',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ce93d8',
    borderRadius: 12,
    backgroundColor: '#fafafa',
    overflow: 'hidden',
  },
  icon: {
    marginLeft: 15,
  },
  input: {
    flex: 1,
    height: 52,
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#4a148c',
    backgroundColor: 'transparent',
  },
  eyeButton: {
    padding: 15,
  },
  button: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#9c27b0',
    marginTop: 30,
    shadowColor: '#6a1b9a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  buttonDisabled: {
    backgroundColor: '#ba68c8',
    shadowColor: 'transparent',
  },
  buttonLoading: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#ab47bc',
  },
});