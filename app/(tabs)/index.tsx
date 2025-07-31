import { useLocalSearchParams } from 'expo-router';
import { View, Text, StyleSheet, Button } from 'react-native';

export default function HomeScreen() {
  const { sessionData } = useLocalSearchParams();
  const parsedData = sessionData ? JSON.parse(sessionData as string) : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bem-vindo ao Sankhya App</Text>
      {parsedData && (
        <>
          <Text>ID do Usuário: {parsedData.idusu}</Text>
          <Text>Sessão: {parsedData.jsessionid}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
});