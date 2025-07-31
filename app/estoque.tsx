// app/estoque.tsx
import { View, Text, StyleSheet } from 'react-native';

export default function EstoqueScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Estoque</Text>
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
    color: '#FF9800', // Cor correspondente ao card
  },
});