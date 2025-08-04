import { View, Text, StyleSheet, ImageBackground, SafeAreaView } from 'react-native';

export default function ExploreScreen() {
  const currentDate = new Date().toLocaleDateString();
  const currentYear = new Date().getFullYear();

  return (
    <ImageBackground 
      source={{uri: 'https://images.unsplash.com/photo-1620121692029-d088224ddc74?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1632&q=80'}}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Explorar</Text>
          <Text style={styles.subtitle}>Funcionalidades adicionais do Sankhya</Text>
          
          {/* Conteúdo adicional pode ser adicionado aqui */}
          <View style={styles.card}>
            <Text style={styles.cardText}>Em breve novas funcionalidades!</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Desenvolvido por: Hugo Rodrigues - {currentDate}</Text>
          <Text style={styles.footerText}>Copyright © Labotrat {currentYear}</Text>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10
  },
  subtitle: {
    fontSize: 18,
    color: 'white',
    marginBottom: 30,
    textAlign: 'center',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
  },
  cardText: {
    fontSize: 16,
    color: '#333',
  },
  footer: {
    padding: 15,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  footerText: {
    color: 'white',
    fontSize: 12,
    marginVertical: 2,
  },
});