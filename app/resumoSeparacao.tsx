import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { criarNotaFiscal, adicionarItemNotaFiscal } from '../services/api';

interface ItemSeparado {
  COD_MP: number;
  PRODUTOMP: string;
  QUANTIDADE: number;
  LOTE: string;
  separado: {
    QTDSEPARADA: number;
    UNIDADE: string;
    USUARIO: string;
    LOTE: string;
  };
}

export default function ResumoSeparacaoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Recupera os dados dos parâmetros
  const itensSeparados = JSON.parse(params.itensSeparados as string || '[]') as ItemSeparado[];
  const idiproc = params.idiproc as string;
  const codemp = params.codemp as string;
  const referencia = params.referencia as string || '';
  const produto = params.produto as string || '';
  
  const [loading, setLoading] = useState(false);

  const handleCriarMovimento = async () => {
  setLoading(true);
  try {
    // 1. Criar a nota fiscal com valores válidos
    const notaFiscalData = {
      IDIPROC: parseInt(idiproc),
      CODEMP: 1, // Valor fixo conforme mencionado
      NUMNOTA: 0, // Valor fixo conforme mencionado
      CODCENCUS: 109002, // Valor fixo conforme mencionado
      CODTIPOPER: 1242, // Ajuste conforme necessário - valor comum para operações
      TIPMOV: 'T', // Transferencia
      CODTIPVENDA: 0, // Valor padrão
      CODNAT: 3010103 // Valor fixo conforme mencionado
    };

    console.log('Criando nota fiscal com dados:', notaFiscalData);

    const notaFiscalResponse = await criarNotaFiscal(notaFiscalData);
    const nunota = notaFiscalResponse.nunota;

    console.log('Nota fiscal criada com NUNOTA:', nunota);

    // 2. Adicionar itens à nota fiscal
    for (let i = 0; i < itensSeparados.length; i++) {
      const item = itensSeparados[i];
      const itemData = {
        NUNOTA: nunota,
        CODPROD: item.COD_MP,
        QTDNEG: item.separado.QTDSEPARADA,
        SEQUENCIA: i + 1,
        CODVOL: 'KG', // Unidade
        CODLOCALORIG: 50000000, // Valor padrão - ajuste se necessário
        CODLOCALDEST: 60000000 // Valor padrão - ajuste se necessário
      };

      console.log('Adicionando item:', itemData);
      await adicionarItemNotaFiscal(itemData);
    }

    Alert.alert('Sucesso', 'Movimento criado com sucesso!');
    router.back();
    
  }  catch (error: any) {
    // console.error('Erro ao criar movimento:', error);
    
    // Tratamento específico para erro de estoque insuficiente
    if (error.message && error.message.includes('ESTOQUE INSUFICIENTE')) {
      // Extrair o código do produto da mensagem de erro
      const codProdMatch = error.message.match(/Produto: (\d+)/);
      const quantidadeMatch = error.message.match(/Quantidade: (\d+)/);
      
      let mensagemErro = 'Estoque insuficiente!';
      
      if (codProdMatch && codProdMatch[1]) {
        const codProd = codProdMatch[1];
        
        // Encontrar o nome do produto pelo código
        const produtoComErro = itensSeparados.find(item => item.COD_MP.toString() === codProd);
        const nomeProduto = produtoComErro ? produtoComErro.PRODUTOMP : `Código: ${codProd}`;
        
        mensagemErro = `Produto: ${nomeProduto}\nCódigo: ${codProd}`;
        
        if (quantidadeMatch && quantidadeMatch[1]) {
          mensagemErro += `\nQuantidade solicitada: ${quantidadeMatch[1]}`;
        }
      }
      
      Alert.alert('Estoque insuficiente!', mensagemErro);
    } else if (error.message && error.message.includes('NUNOTA')) {
      Alert.alert('Erro', 'Não foi possível criar a nota fiscal.');
    } else {
      Alert.alert('Erro', 'Não foi possível criar o movimento. Verifique os logs para mais detalhes.');
    }
  } finally {
    setLoading(false);
  }
};


  const totalItens = itensSeparados.length;
  const totalQuantidade = itensSeparados.reduce((total, item) => total + item.separado.QTDSEPARADA, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Resumo da Separação</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>OP: {idiproc}</Text>
          {referencia && <Text style={styles.summaryText}>Referência: {referencia}</Text>}
          {produto && <Text style={styles.summaryText}>Produto: {produto}</Text>}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total de Itens:</Text>
            <Text style={styles.summaryValue}>{totalItens}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Quantidade Total:</Text>
            <Text style={styles.summaryValue}>{totalQuantidade}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Itens Separados</Text>
        
        {itensSeparados.map((item, index) => (
          <View key={index} style={styles.itemCard}>
            <Text style={styles.itemName}>{item.PRODUTOMP}</Text>
            <View style={styles.itemDetails}>
              <Text style={styles.itemDetail}>Lote OP: {item.LOTE}</Text>
              <Text style={styles.itemDetail}>Lote Sep: {item.separado.LOTE}</Text>
            </View>
            <View style={styles.itemDetails}>
              <Text style={styles.itemDetail}>Quantidade: {item.separado.QTDSEPARADA} {item.separado.UNIDADE}</Text>
              <Text style={styles.itemDetail}>Por: {item.separado.USUARIO}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.createButton, loading && styles.buttonDisabled]}
          onPress={handleCriarMovimento}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.createButtonText}>Criar Movimento</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#4CAF50',
    paddingTop: 50,
  },
  backButton: {
    color: 'white',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  summaryText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#666',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  itemCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  itemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  itemDetail: {
    fontSize: 14,
    color: '#666',
  },
  footer: {
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  createButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#cccccc',
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});