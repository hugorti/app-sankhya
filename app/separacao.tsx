// app/separacao.tsx
import { View, Text, StyleSheet } from 'react-native';

export default function SeparacaoScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Separação</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4CAF50', // Cor correspondente ao card
  },
});