// app/conferencia.tsx
import { View, Text, StyleSheet } from 'react-native';

export default function ConferenciaScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Conferência</Text>
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
    color: '#2196F3', // Cor correspondente ao card
  },
});