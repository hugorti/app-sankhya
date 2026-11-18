// app/separacaoItem.tsx

import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
} from 'react-native';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  carregarItensSeparacao,
  ItemSeparacao,
  registerUserActivity,
} from '@/services/api';
import { Ionicons } from '@expo/vector-icons';

interface ItemComBipe extends ItemSeparacao {
  BIPADO: number;
}

function formatarEndereco(endereco: string): string {
  if (!endereco) return '';
  const digits = endereco.replace(/\D/g, '');
  const partes = [
    digits.slice(0, 2),
    digits.slice(2, 4),
    digits.slice(4, 6),
    digits.slice(6, 8),
    digits.slice(8, 11),
  ].filter(Boolean);
  return partes.join('.');
}

export default function SeparacaoItemScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    nutarefa: string;
    nunota: string;
    ordemCarga: string;
  }>();

  const nutarefa = Number(params.nutarefa) || 0;

  const [itens, setItens] = useState<ItemComBipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [itemAtivoIndex, setItemAtivoIndex] = useState(0);

  // Campos digitáveis
  const [produto, setProduto] = useState('');
  const [endereco, setEndereco] = useState('');
  const [lote, setLote] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');

  const inputProdutoRef = useRef<TextInput>(null);
  const inputEnderecoRef = useRef<TextInput>(null);
  const inputLoteRef = useRef<TextInput>(null);
  const inputCodigoRef = useRef<TextInput>(null);

  const carregar = useCallback(async () => {
    if (!nutarefa) {
      setError('Tarefa inválida');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const validacao = await carregarItensSeparacao(nutarefa);

      if (!validacao.podeSeparar) {
        setError(
          'Estoque insuficiente. Faça ressuprimento ou ajuste antes de separar.'
        );
        return;
      }

      setItens(
        validacao.itens.map((i) => ({
          ...i,
          BIPADO: 0,
        }))
      );
      setItemAtivoIndex(0);
    } catch (err) {
      console.error('❌ Erro ao carregar itens:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar itens');
    } finally {
      setLoading(false);
      setTimeout(() => inputProdutoRef.current?.focus(), 300);
    }
  }, [nutarefa]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const itemAtivo = itens[itemAtivoIndex];

  const limparApenasCodigo = () => {
    setCodigoBarras('');
  };

  const avançarItem = useCallback(() => {
    const próximoIndex = itens.findIndex(
      (it, idx) => idx > itemAtivoIndex && it.BIPADO < it.QTD_BIPAR
    );

    if (próximoIndex === -1) {
      const todosCompletos = itens.every((it) => it.BIPADO >= it.QTD_BIPAR);
      if (todosCompletos) {
        Alert.alert(
          'Separação concluída',
          'Todos os itens foram separados.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
      return;
    }

    setItemAtivoIndex(próximoIndex);
    // Só limpa o código de barras; os demais campos permanecem
    limparApenasCodigo();
    setTimeout(() => inputCodigoRef.current?.focus(), 200);
  }, [itens, itemAtivoIndex, router]);

  const validarEIncrementar = () => {
    registerUserActivity();

    if (!itemAtivo) {
      Alert.alert('Atenção', 'Nenhum item ativo para separar.');
      return;
    }

    const produtoOk =
      produto.trim().toUpperCase() === itemAtivo.REFERENCIA.trim().toUpperCase();
    const enderecoOk =
      formatarEndereco(endereco) === formatarEndereco(itemAtivo.ENDERECO);
    const loteOk =
      lote.trim().toUpperCase() === itemAtivo.LOTE.trim().toUpperCase();
    const codigoOk =
      codigoBarras.trim() === itemAtivo.CODBARRA.trim();

    if (!produtoOk) {
      Alert.alert(
        'Produto inválido',
        `Esperado: ${itemAtivo.REFERENCIA}\nDigitado: ${produto}`
      );
      inputProdutoRef.current?.focus();
      return;
    }

    if (!enderecoOk) {
      Alert.alert(
        'Endereço inválido',
        `Esperado: ${formatarEndereco(itemAtivo.ENDERECO)}\nDigitado: ${formatarEndereco(endereco)}`
      );
      inputEnderecoRef.current?.focus();
      return;
    }

    if (!loteOk) {
      Alert.alert(
        'Lote inválido',
        `Esperado: ${itemAtivo.LOTE}\nDigitado: ${lote}`
      );
      inputLoteRef.current?.focus();
      return;
    }

    if (!codigoOk) {
      Alert.alert(
        'Código de barras inválido',
        `Esperado: ${itemAtivo.CODBARRA}\nBipado: ${codigoBarras}`
      );
      inputCodigoRef.current?.focus();
      return;
    }

    // Tudo OK → incrementa
    setItens((prev) =>
      prev.map((it, idx) =>
        idx === itemAtivoIndex ? { ...it, BIPADO: it.BIPADO + 1 } : it
      )
    );

    const novoBipado = itemAtivo.BIPADO + 1;

    if (novoBipado >= itemAtivo.QTD_BIPAR) {
      Alert.alert(
        'Item completo ✅',
        `Ref ${itemAtivo.REFERENCIA} / Lote ${itemAtivo.LOTE} finalizado.`
      );
      // Item completo: limpa só o código e avança
      limparApenasCodigo();
      setTimeout(() => avançarItem(), 200);
    } else {
      // Ainda falta bipar: limpa SÓ o código e volta o foco para ele
      limparApenasCodigo();
      inputCodigoRef.current?.focus();
    }
  };

  const renderItem = ({ item, index }: { item: ItemComBipe; index: number }) => {
    const ativo = index === itemAtivoIndex;
    const completo = item.BIPADO >= item.QTD_BIPAR;

    return (
      <View
        style={[
          styles.card,
          ativo && styles.cardAtivo,
          completo && styles.cardCompleto,
        ]}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Ref: {item.REFERENCIA}</Text>
          {completo ? (
            <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />
          ) : ativo ? (
            <Ionicons name="radio-button-on" size={22} color="#FF9800" />
          ) : null}
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="cube-outline" size={16} color="#666" />
          <Text style={styles.cardLabel}>Produto:</Text>
          <Text style={styles.cardValue} numberOfLines={1}>
            {item.REFERENCIA}
          </Text>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="location-outline" size={16} color="#666" />
          <Text style={styles.cardLabel}>Endereço:</Text>
          <Text style={styles.cardValue}>
            {formatarEndereco(item.ENDERECO)}
          </Text>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="barcode-outline" size={16} color="#666" />
          <Text style={styles.cardLabel}>Lote:</Text>
          <Text style={styles.cardValue}>{item.LOTE}</Text>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="qr-code-outline" size={16} color="#666" />
          <Text style={styles.cardLabel}>Cód. Barras:</Text>
          <Text style={styles.cardValue}>{item.CODBARRA}</Text>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="layers-outline" size={16} color="#666" />
          <Text style={styles.cardLabel}>Qtd. bipar:</Text>
          <Text style={styles.qtdBipar}>
            {item.BIPADO} / {item.QTD_BIPAR}
          </Text>
        </View>

        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${
                  item.QTD_BIPAR > 0
                    ? Math.min(100, (item.BIPADO / item.QTD_BIPAR) * 100)
                    : 0
                }%`,
              },
            ]}
          />
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF9800" />
        <Text style={styles.loadingText}>Carregando itens...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="warning" size={40} color="#D32F2F" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.retryButtonText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          Separar Tarefa #{nutarefa}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.infoBar}>
        <Text style={styles.infoText}>
          Pedido: {params.nunota} · OC: {params.ordemCarga}
        </Text>
        <Text style={styles.infoText}>
          {itens.filter((i) => i.BIPADO >= i.QTD_BIPAR).length} / {itens.length} itens
        </Text>
      </View>

      {/* FORMULÁRIO DE DIGITAÇÃO */}
      <View style={styles.formContainer}>
        <View style={styles.formRow}>
          <Ionicons name="cube-outline" size={18} color="#FF9800" />
          <Text style={styles.formLabel}>Produto:</Text>
          <TextInput
            ref={inputProdutoRef}
            style={styles.formInput}
            placeholder="Referência"
            placeholderTextColor="#999"
            value={produto}
            onChangeText={setProduto}
            autoCorrect={false}
            autoCapitalize="characters"
            returnKeyType="next"
            onSubmitEditing={() => inputEnderecoRef.current?.focus()}
          />
        </View>

        <View style={styles.formRow}>
          <Ionicons name="location-outline" size={18} color="#FF9800" />
          <Text style={styles.formLabel}>Endereço:</Text>
          <TextInput
            ref={inputEnderecoRef}
            style={styles.formInput}
            placeholder="xx.xx.xx.xx.xxx"
            placeholderTextColor="#999"
            value={endereco}
            onChangeText={(t) => setEndereco(formatarEndereco(t))}
            keyboardType="numeric"
            maxLength={15}
            returnKeyType="next"
            onSubmitEditing={() => inputLoteRef.current?.focus()}
          />
        </View>

        <View style={styles.formRow}>
          <Ionicons name="barcode-outline" size={18} color="#FF9800" />
          <Text style={styles.formLabel}>Lote:</Text>
          <TextInput
            ref={inputLoteRef}
            style={styles.formInput}
            placeholder="Controle"
            placeholderTextColor="#999"
            value={lote}
            onChangeText={setLote}
            autoCorrect={false}
            autoCapitalize="characters"
            returnKeyType="next"
            onSubmitEditing={() => inputCodigoRef.current?.focus()}
          />
        </View>

        <View style={styles.formRow}>
          <Ionicons name="qr-code-outline" size={18} color="#FF9800" />
          <Text style={styles.formLabel}>Cód. Barras:</Text>
          <TextInput
            ref={inputCodigoRef}
            style={styles.formInput}
            placeholder="Bipe o código..."
            placeholderTextColor="#999"
            value={codigoBarras}
            onChangeText={setCodigoBarras}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={validarEIncrementar}
          />
        </View>

        <TouchableOpacity
          style={styles.confirmarButton}
          activeOpacity={0.8}
          onPress={validarEIncrementar}
        >
          <Ionicons name="checkmark-circle" size={20} color="white" />
          <Text style={styles.confirmarButtonText}>Confirmar</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={itens}
        renderItem={renderItem}
        keyExtractor={(item, idx) => `${item.CODPROD}-${item.LOTE}-${idx}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingTop: 38,
    backgroundColor: '#FF9800',
  },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: 'white' },
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF3E0',
  },
  infoText: { fontSize: 12, color: '#E65100', fontWeight: '600' },

  formContainer: {
    backgroundColor: 'white',
    marginHorizontal: 8,
    marginVertical: 8,
    borderRadius: 8,
    padding: 10,
    elevation: 3,
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  formLabel: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
    marginLeft: 6,
    width: 88,
  },
  formInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#f8f8f8',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    fontWeight: '500',
  },
  confirmarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 4,
  },
  confirmarButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 15,
    marginLeft: 6,
  },

  listContent: { paddingHorizontal: 8, paddingBottom: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#D32F2F',
    marginTop: 10,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 15,
    backgroundColor: '#FF9800',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  card: {
    backgroundColor: 'white',
    padding: 12,
    marginHorizontal: 4,
    marginVertical: 5,
    borderRadius: 8,
    elevation: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardAtivo: {
    borderColor: '#FF9800',
    elevation: 4,
  },
  cardCompleto: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    minHeight: 22,
  },
  cardLabel: { fontSize: 13, color: '#666', marginLeft: 6, width: 90 },
  cardValue: { fontSize: 13, color: '#333', fontWeight: '500', flex: 1 },
  qtdBipar: {
    fontSize: 16,
    color: '#FF9800',
    fontWeight: 'bold',
    flex: 1,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#eee',
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
});