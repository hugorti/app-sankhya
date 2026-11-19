// app/separacaoItem.tsx

import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
  BackHandler,
} from 'react-native';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  queryJson,
  salvarSeparacaoWMS,
  iniciarSeparacaoWMS,
  rejeitarSeparacaoWMS,
  ItemSeparacao,
  registerUserActivity,
} from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ItemComBipe extends ItemSeparacao {
  BIPADO: number;
}

interface ProgressoSalvo {
  nutarefa: number;
  itens: { key: string; BIPADO: number }[];
  salvoEm: number;
}

const PROGRESSO_KEY = (nutarefa: number) => `@separacao_progresso_${nutarefa}`;

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

const SQL_ITENS_SEPARACAO = (nutarefa: number) => `
  SELECT
      ITT.NUTAREFA,
      ISNULL(TSEP.NUNOTA, 0)                 AS NUNOTA,
      ISNULL(TSEP.ORDEMCARGA, 0)             AS OC,
      ISNULL(TSEP.NUSEPARACAO, 0)            AS NUSEPARACAO,
      ITT.CODPROD,
      ISNULL(P.DESCRPROD, '')                AS DESCRPROD,
      ISNULL(P.REFERENCIA, '')               AS REFERENCIA,
      ITT.CONTROLE                           AS LOTE,
      ITT.CODENDORIGEM,
      ISNULL(ENDORIG.ENDERECO, '')           AS ENDERECO,
      ISNULL(EST.CODVOL, '')                 AS UNIDADE_ESTOQUE,
      ISNULL(EST.ESTOQUE, 0)                 AS ESTOQUE,
      ISNULL(EST.SAIDASPEND, 0)              AS SAIDASPEND,
      ISNULL(VOA.CODBARRA, '')               AS CODBARRA,
      ISNULL(VOA.QUANTIDADE, 1)              AS QTD_POR_CAIXA,
      CASE
          WHEN ISNULL(EST.SAIDASPEND, 0) <= 0 THEN 0
          WHEN EST.CODVOL = 'CX' THEN EST.SAIDASPEND
          WHEN EST.CODVOL = 'UN' AND ISNULL(VOA.QUANTIDADE, 0) > 0
              THEN CAST(EST.SAIDASPEND AS DECIMAL(10,2)) / VOA.QUANTIDADE
          ELSE EST.SAIDASPEND
      END AS QTD_BIPAR,
      CASE
          WHEN EST.CODEND IS NULL THEN 1
          WHEN ISNULL(EST.SAIDASPEND, 0) > ISNULL(EST.ESTOQUE, 0) THEN 1
          ELSE 0
      END AS BLOQUEADO
  FROM SANKHYA.TGWITT ITT
  INNER JOIN SANKHYA.TGWSEP TSEP
      ON TSEP.NUTAREFA = ITT.NUTAREFA
  LEFT JOIN SANKHYA.TGWEST EST
      ON EST.CODEND   = ITT.CODENDORIGEM
     AND EST.CODPROD  = ITT.CODPROD
     AND EST.CONTROLE = ITT.CONTROLE
  LEFT JOIN SANKHYA.TGFPRO P
      ON P.CODPROD = ITT.CODPROD
  LEFT JOIN SANKHYA.TGWEND ENDORIG
      ON ENDORIG.CODEND = ITT.CODENDORIGEM
  LEFT JOIN SANKHYA.TGFVOA VOA
      ON VOA.CODPROD = ITT.CODPROD
     AND VOA.CODVOL  = 'CX'
  WHERE ITT.NUTAREFA = ${Number(nutarefa)}
  ORDER BY ITT.CODPROD, ITT.CONTROLE
`;

async function carregarItensSeparacaoLocal(
  nutarefa: number
): Promise<{ podeSeparar: boolean; itens: ItemSeparacao[]; bloqueados: ItemSeparacao[] }> {
  const result = await queryJson('DbExplorerSP.executeQuery', {
    sql: SQL_ITENS_SEPARACAO(nutarefa),
  });

  const rows: any[] = result?.rows ?? [];

  const itens: ItemSeparacao[] = rows.map((row) => ({
    NUTAREFA: Number(row[0]) || 0,
    NUNOTA: Number(row[1]) || 0,
    OC: Number(row[2]) || 0,
    NUSEPARACAO: Number(row[3]) || 0,
    CODPROD: Number(row[4]) || 0,
    DESCRPROD: row[5] || '',
    REFERENCIA: row[6] || '',
    LOTE: row[7] || '',
    CODENDORIGEM: Number(row[8]) || 0,
    ENDERECO: row[9] || '',
    UNIDADE_ESTOQUE: row[10] || '',
    ESTOQUE: Number(row[11]) || 0,
    SAIDASPEND: Number(row[12]) || 0,
    CODBARRA: row[13] || '',
    QTD_POR_CAIXA: Number(row[14]) || 1,
    QTD_BIPAR: Number(row[15]) || 0,
    BLOQUEADO: Number(row[16]) || 0,
  }));

  const bloqueados = itens.filter((i) => i.BLOQUEADO === 1);

  return {
    podeSeparar: bloqueados.length === 0,
    itens,
    bloqueados,
  };
}

export default function SeparacaoItemScreen() {
  const router = useRouter();
  const { session } = useSession();
  const params = useLocalSearchParams<{
    nutarefa: string;
    nunota: string;
    ordemCarga: string;
  }>();

  const nutarefa = Number(params.nutarefa) || 0;

  const [itens, setItens] = useState<ItemComBipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);
  const [rejeitando, setRejeitando] = useState(false);

  const [itemAtivoIndex, setItemAtivoIndex] = useState(0);

  const [produto, setProduto] = useState('');
  const [endereco, setEndereco] = useState('');
  const [lote, setLote] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');

  const inputProdutoRef = useRef<TextInput>(null);
  const inputEnderecoRef = useRef<TextInput>(null);
  const inputLoteRef = useRef<TextInput>(null);
  const inputCaptureRef = useRef<TextInput>(null);

  const bufferRef = useRef('');
  const bipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ==================== BLOQUEIO DO BOTÃO VOLTAR (ANDROID) ====================

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        Alert.alert(
          'Atenção',
          'Para sair da separação, use o botão Rejeitar.',
          [{ text: 'OK', style: 'default' }]
        );
        return true;
      };

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress
      );

      return () => subscription.remove();
    }, [])
  );

  // ==================== PERSISTÊNCIA ====================

  const salvarProgresso = useCallback(
    async (itensAtuais: ItemComBipe[]) => {
      if (!nutarefa) return;
      try {
        const progresso: ProgressoSalvo = {
          nutarefa,
          itens: itensAtuais.map((it) => ({
            key: `${it.CODPROD}-${it.LOTE}`,
            BIPADO: it.BIPADO,
          })),
          salvoEm: Date.now(),
        };
        await AsyncStorage.setItem(
          PROGRESSO_KEY(nutarefa),
          JSON.stringify(progresso)
        );
        console.log('💾 Progresso salvo:', progresso.itens);
      } catch (err) {
        console.warn('⚠️ Não foi possível salvar progresso:', err);
      }
    },
    [nutarefa]
  );

  const carregarProgresso = useCallback(async (): Promise<Record<string, number>> => {
    if (!nutarefa) return {};
    try {
      const raw = await AsyncStorage.getItem(PROGRESSO_KEY(nutarefa));
      if (!raw) return {};
      const parsed: ProgressoSalvo = JSON.parse(raw);
      const mapa: Record<string, number> = {};
      for (const i of parsed.itens) {
        mapa[i.key] = i.BIPADO;
      }
      console.log('📂 Progresso carregado:', mapa);
      return mapa;
    } catch (err) {
      console.warn('⚠️ Não foi possível carregar progresso:', err);
      return {};
    }
  }, [nutarefa]);

  const limparProgresso = useCallback(async () => {
    if (!nutarefa) return;
    try {
      await AsyncStorage.removeItem(PROGRESSO_KEY(nutarefa));
      console.log('🗑️ Progresso removido');
    } catch (err) {
      console.warn('⚠️ Não foi possível limpar progresso:', err);
    }
  }, [nutarefa]);

  // ==================== FOCO DO CAPTURE ====================

  const focarCapture = useCallback(() => {
    setTimeout(() => {
      inputCaptureRef.current?.focus();
    }, 50);
  }, []);

  // ==================== CARREGAR ====================

  const carregar = useCallback(async () => {
    if (!nutarefa) {
      setError('Tarefa inválida');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 🔹 Marca a tarefa como "em separação" no TGWITT.
      //    A trigger preenche CODUSUEXEC e DHINICIALEXEC.
      try {
        await iniciarSeparacaoWMS(nutarefa);
        console.log(`▶️ Tarefa ${nutarefa} marcada como em separação (SITUACAO='E')`);
      } catch (errIni) {
        console.warn('⚠️ Não foi possível marcar tarefa como em separação:', errIni);
        // não aborta: usuário ainda consegue trabalhar
      }

      const validacao = await carregarItensSeparacaoLocal(nutarefa);

      if (!validacao.podeSeparar) {
        setError(
          'Estoque insuficiente. Faça ressuprimento ou ajuste antes de separar.'
        );
        return;
      }

      const progressoSalvo = await carregarProgresso();

      const itensComProgresso: ItemComBipe[] = validacao.itens.map((i) => {
        const key = `${i.CODPROD}-${i.LOTE}`;
        const bipadoSalvo = progressoSalvo[key] ?? 0;
        const bipado = Math.min(bipadoSalvo, i.QTD_BIPAR);
        return { ...i, BIPADO: bipado };
      });

      setItens(itensComProgresso);

      const primeiroPendente = itensComProgresso.findIndex(
        (it) => it.BIPADO < it.QTD_BIPAR
      );
      setItemAtivoIndex(primeiroPendente >= 0 ? primeiroPendente : 0);
    } catch (err) {
      console.error('❌ Erro ao carregar itens:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar itens');
    } finally {
      setLoading(false);
      bufferRef.current = '';
      focarCapture();
    }
  }, [nutarefa, carregarProgresso, focarCapture]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    return () => {
      if (bipTimerRef.current) {
        clearTimeout(bipTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (loading || error) return;
    focarCapture();
  }, [loading, error, itemAtivoIndex, focarCapture]);

  useFocusEffect(
    useCallback(() => {
      if (!loading && !error) {
        focarCapture();
      }
    }, [loading, error, focarCapture])
  );

  const itemAtivo = itens[itemAtivoIndex];

  const todosConcluidos =
    itens.length > 0 && itens.every((it) => it.BIPADO >= it.QTD_BIPAR);

  const limparApenasCodigo = () => {
    setCodigoBarras('');
    bufferRef.current = '';
    if (bipTimerRef.current) {
      clearTimeout(bipTimerRef.current);
      bipTimerRef.current = null;
    }
    focarCapture();
  };

  const avançarItem = useCallback(() => {
    const próximoIndex = itens.findIndex(
      (it, idx) => idx > itemAtivoIndex && it.BIPADO < it.QTD_BIPAR
    );

    if (próximoIndex === -1) {
      return;
    }

    setItemAtivoIndex(próximoIndex);
    limparApenasCodigo();
  }, [itens, itemAtivoIndex]);

  // ==================== VALIDAR E INCREMENTAR ====================

  const validarEIncrementar = (codigoInformado?: string) => {
    registerUserActivity();

    if (bipTimerRef.current) {
      clearTimeout(bipTimerRef.current);
      bipTimerRef.current = null;
    }

    // Limpa SEMPRE antes de validar — o próximo bipe sempre começa do zero
    const codigo = (codigoInformado ?? codigoBarras).trim();
    setCodigoBarras('');
    bufferRef.current = '';

    if (!itemAtivo) {
      Alert.alert('Atenção', 'Nenhum item ativo para separar.');
      focarCapture();
      return;
    }

    const produtoOk =
      produto.trim().toUpperCase() === itemAtivo.REFERENCIA.trim().toUpperCase();
    const enderecoOk =
      formatarEndereco(endereco) === formatarEndereco(itemAtivo.ENDERECO);
    const loteOk =
      lote.trim().toUpperCase() === itemAtivo.LOTE.trim().toUpperCase();
    const codigoOk = codigo === itemAtivo.CODBARRA.trim();

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
        `Esperado: ${itemAtivo.CODBARRA}\nBipado: ${codigo}`
      );
      focarCapture();
      return;
    }

    const novosItens = itens.map((it, idx) =>
      idx === itemAtivoIndex ? { ...it, BIPADO: it.BIPADO + 1 } : it
    );

    setItens(novosItens);
    salvarProgresso(novosItens);

    const novoBipado = itemAtivo.BIPADO + 1;

    if (novoBipado >= itemAtivo.QTD_BIPAR) {
      Alert.alert(
        'Item completo ✅',
        `Ref ${itemAtivo.REFERENCIA} / Lote ${itemAtivo.LOTE} finalizado.`
      );
      limparApenasCodigo();
      setTimeout(() => avançarItem(), 200);
    } else {
      limparApenasCodigo();
    }
  };

  // ==================== CONCLUIR ====================

  const handleConcluir = async () => {
    if (!todosConcluidos || concluindo) return;

    if (!session?.username) {
      Alert.alert('Erro', 'Sessão inválida. Faça login novamente.');
      return;
    }

    const itensInvalidos = itens.filter(
      (it) =>
        !it.NUNOTA ||
        !it.NUTAREFA ||
        !it.NUSEPARACAO ||
        !it.OC ||
        !it.CODPROD
    );

    if (itensInvalidos.length > 0) {
      const lista = itensInvalidos
        .slice(0, 5)
        .map(
          (it) =>
            `• Ref ${it.REFERENCIA}: ` +
            `NUNOTA=${it.NUNOTA ?? 'NULL'}, ` +
            `NUSEPARACAO=${it.NUSEPARACAO ?? 'NULL'}, ` +
            `OC=${it.OC ?? 'NULL'}`
        )
        .join('\n');

      Alert.alert(
        'Dados incompletos',
        `Alguns itens estão sem NUNOTA/NUSEPARACAO/ORDEMCARGA (TGWSEP):\n\n${lista}\n\n` +
          `Verifique a separação no Sankhya antes de concluir.`
      );
      return;
    }

    Alert.alert(
      'Concluir separação',
      'Deseja finalizar a separação desta tarefa?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Concluir',
          style: 'default',
          onPress: async () => {
            try {
              setConcluindo(true);

              const usuario = session.username;

              for (const it of itens) {
                await salvarSeparacaoWMS({
                  NUNOTA: it.NUNOTA,
                  NUTAREFA: it.NUTAREFA,
                  NUSEPARACAO: it.NUSEPARACAO,
                  ORDEMCARGA: it.OC,
                  CODPROD: it.CODPROD,
                  DESCRPROD: it.DESCRPROD,
                  REFERENCIA: it.REFERENCIA,
                  CONTROLE: it.LOTE,
                  VOLUMES: `${it.BIPADO} / ${it.QTD_BIPAR}`,
                  USUARIO: usuario,
                });
              }

              await limparProgresso();

              Alert.alert(
                'Separação concluída ✅',
                'Os registros foram salvos com sucesso.',
                [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
              );
            } catch (err) {
              console.error('❌ Erro ao concluir separação:', err);
              Alert.alert(
                'Erro',
                err instanceof Error
                  ? err.message
                  : 'Não foi possível concluir a separação.'
              );
            } finally {
              setConcluindo(false);
            }
          },
        },
      ]
    );
  };

  // ==================== SAIR / REJEITAR ====================

  const handleSair = () => {
    if (rejeitando) return;

    Alert.alert(
      'Sair da separação?',
      'Ao sair, a tarefa será devolvida para a fila (rejeitada). Deseja continuar?',
      [
        { text: 'Ficar', style: 'cancel' },
        {
          text: 'Rejeitar',
          style: 'destructive',
          onPress: async () => {
            try {
              setRejeitando(true);

              // 🔹 Rejeita no TGWITT — a trigger limpa CODUSUEXEC/DHINICIALEXEC
              await rejeitarSeparacaoWMS(nutarefa);
              console.log(`◀️ Tarefa ${nutarefa} rejeitada (SITUACAO='A')`);
            } catch (err) {
              console.error('❌ Erro ao rejeitar no TGWITT:', err);
              Alert.alert(
                'Erro',
                err instanceof Error
                  ? err.message
                  : 'Não foi possível rejeitar a tarefa. Tente novamente.'
              );
              setRejeitando(false);
              return;
            }

            router.replace('/(tabs)');
          },
        },
      ]
    );
  };

  // ==================== RENDER ====================

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
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.retryButtonText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Input invisível que captura o bipe do leitor HID */}
      <TextInput
        ref={inputCaptureRef}
        style={styles.captureInput}
        value={codigoBarras}
        onChangeText={(texto) => {
          const limpo = texto.replace(/\s/g, '');
          setCodigoBarras(limpo);
          bufferRef.current = limpo;

          if (bipTimerRef.current) {
            clearTimeout(bipTimerRef.current);
          }

          if (!limpo) {
            return;
          }

          bipTimerRef.current = setTimeout(() => {
            const valor = bufferRef.current;
            bufferRef.current = '';
            validarEIncrementar(valor);
            focarCapture();
          }, 120);
        }}
        autoCorrect={false}
        autoCapitalize="none"
        showSoftInputOnFocus={false}
        caretHidden
        contextMenuHidden
        selectTextOnFocus={false}
        blurOnSubmit={false}
        returnKeyType="done"
        onSubmitEditing={() => focarCapture()}
      />

      <View style={styles.header}>
        <View style={{ width: 24 }} />
        <Text style={styles.headerTitle}>Separar Tarefa #{nutarefa}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* BOTÕES REJEITAR / CONCLUIR LADO A LADO */}
      <View style={styles.acoesContainer}>
        <TouchableOpacity
          style={styles.rejeitarButton}
          activeOpacity={0.8}
          disabled={rejeitando || concluindo}
          onPress={handleSair}
          focusable={false}
          accessible={false}
        >
          {rejeitando ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Ionicons name="close-circle-outline" size={20} color="white" />
              <Text style={styles.acaoButtonText}>Rejeitar</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.concluirButtonTop,
            (!todosConcluidos || concluindo) && styles.concluirButtonDisabled,
          ]}
          activeOpacity={0.8}
          disabled={!todosConcluidos || concluindo}
          onPress={handleConcluir}
          focusable={false}
          accessible={false}
        >
          {concluindo ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Ionicons name="checkmark-done-circle" size={20} color="white" />
              <Text style={styles.acaoButtonText}>Concluir</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* LINHA 1: Pedido · OC · Qtd. bipar */}
      <View style={styles.infoBar}>
        <View style={styles.infoCol}>
          <Text style={styles.infoLabel}>Pedido</Text>
          <Text style={styles.infoValue}>{params.nunota}</Text>
        </View>
        <View style={styles.infoCol}>
          <Text style={styles.infoLabel}>OC</Text>
          <Text style={styles.infoValue}>{params.ordemCarga}</Text>
        </View>
        <View style={styles.infoCol}>
          <Text style={styles.infoLabel}>Qtd. bipar</Text>
          <Text style={[styles.infoValue, styles.infoValueQtd]}>
            {itemAtivo ? `${itemAtivo.BIPADO}/${itemAtivo.QTD_BIPAR}` : '-'}
          </Text>
        </View>
      </View>

      {/* LINHA 2: Produto · Lote · Endereço */}
      {itemAtivo && (
        <View style={styles.itemInfoBar}>
          <View style={styles.itemInfoCol}>
            <Text style={styles.itemInfoLabel}>Produto</Text>
            <Text style={styles.itemInfoValue} numberOfLines={1}>
              {itemAtivo.REFERENCIA}
            </Text>
          </View>
          <View style={styles.itemInfoCol}>
            <Text style={styles.itemInfoLabel}>Lote</Text>
            <Text style={styles.itemInfoValue} numberOfLines={1}>
              {itemAtivo.LOTE || '-'}
            </Text>
          </View>
          <View style={[styles.itemInfoCol, styles.itemInfoColEndereco]}>
            <Text style={styles.itemInfoLabel}>Endereço</Text>
            <Text style={styles.itemInfoValue}>
              {formatarEndereco(itemAtivo.ENDERECO) || '-'}
            </Text>
          </View>
        </View>
      )}

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
            onBlur={() => {
              setTimeout(() => {
                if (!endereco && !lote) focarCapture();
              }, 100);
            }}
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
            onBlur={() => {
              setTimeout(() => {
                if (!lote) focarCapture();
              }, 100);
            }}
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
            returnKeyType="done"
            onSubmitEditing={() => {
              inputLoteRef.current?.blur();
              focarCapture();
            }}
            onBlur={() => {
              setTimeout(() => focarCapture(), 100);
            }}
          />
        </View>

        <View style={styles.formRow}>
          <Ionicons name="qr-code-outline" size={18} color="#FF9800" />
          <Text style={styles.formLabel}>Cód. Barras:</Text>
          <View style={styles.formInputBipeDisplay}>
            <Text style={styles.formInputBipeText} numberOfLines={1}>
              {codigoBarras || 'Aguardando bipe...'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.confirmarButton}
          activeOpacity={0.8}
          onPress={() => validarEIncrementar()}
          focusable={false}
        >
          <Ionicons name="checkmark-circle" size={20} color="white" />
          <Text style={styles.confirmarButtonText}>Confirmar bipe</Text>
        </TouchableOpacity>
      </View>

      {/* Indicadores de progresso dos itens */}
      {itens.length > 1 && (
        <View style={styles.indicadoresContainer}>
          <Text style={styles.indicadoresLabel}>Itens da tarefa:</Text>
          <View style={styles.indicadoresRow}>
            {itens.map((it, idx) => {
              const completo = it.BIPADO >= it.QTD_BIPAR;
              const ativo = idx === itemAtivoIndex;
              return (
                <View
                  key={`${it.CODPROD}-${it.LOTE}-${idx}`}
                  style={[
                    styles.indicador,
                    completo && styles.indicadorCompleto,
                    ativo && styles.indicadorAtivo,
                  ]}
                >
                  <Text
                    style={[
                      styles.indicadorText,
                      (completo || ativo) && styles.indicadorTextDestaque,
                    ]}
                  >
                    {idx + 1}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  // Input invisível de captura do bipe
  captureInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    left: -10,
    top: -10,
  },

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

  acoesContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFEBEE',
    gap: 8,
  },
  rejeitarButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D32F2F',
    paddingVertical: 10,
    borderRadius: 8,
  },
  concluirButtonTop: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    borderRadius: 8,
  },
  concluirButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  acaoButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 6,
  },

  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF3E0',
  },
  infoCol: {
    flex: 1,
    paddingHorizontal: 2,
  },
  infoLabel: {
    fontSize: 10,
    color: '#E65100',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '700',
  },
  infoValueQtd: {
    color: '#FF9800',
  },

  itemInfoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF3E0',
    borderTopWidth: 1,
    borderTopColor: '#FFE0B2',
  },
  itemInfoCol: {
    flex: 1,
    paddingHorizontal: 2,
  },
  itemInfoColEndereco: {
    flex: 1.6,
  },
  itemInfoLabel: {
    fontSize: 10,
    color: '#E65100',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  itemInfoValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '700',
  },

  indicadoresContainer: {
    marginHorizontal: 8,
    marginTop: 8,
    padding: 10,
    backgroundColor: 'white',
    borderRadius: 8,
    elevation: 2,
  },
  indicadoresLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 6,
  },
  indicadoresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  indicador: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  indicadorAtivo: {
    borderColor: '#FF9800',
    backgroundColor: '#FFF3E0',
  },
  indicadorCompleto: {
    backgroundColor: '#E8F5E9',
  },
  indicadorText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
  },
  indicadorTextDestaque: {
    color: '#333',
  },

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
  formInputBipeDisplay: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4CAF50',
    justifyContent: 'center',
  },
  formInputBipeText: {
    fontSize: 15,
    color: '#333',
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
});