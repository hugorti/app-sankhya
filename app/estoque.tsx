// app/estoque.tsx
import { View, Text, StyleSheet } from 'react-native';

export default function EstoqueScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Estoque</Text>
      <Text style={styles.subtitle}>Em desenvolvimento..</Text>
      <Text>By: Hugo Rodrigues</Text>
      <Text>TI LABOTRAT</Text>
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
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});