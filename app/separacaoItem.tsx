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
  Modal,
} from 'react-native';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  queryJson,
  iniciarSeparacaoWMS,
  rejeitarSeparacaoWMS,
  buscarCodEndPorEndereco,
  buscarItemTarefaWMS,
  moverEstoqueItemWMS,
  verificarTodosItensFinalizadosWMS,
  finalizarTarefaWMS,
  verificarEnderecoLivre,
  ItemSeparacao,
  registerUserActivity,
  // ↓ Controle de STATUS em AD_SEPARACAOWMS
  marcarSeparacaoIniciada,
  marcarSeparacaoFinalizada,
  limparSeparacao,
} from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ItemComBipe extends ItemSeparacao {
  BIPADO: number;
}

interface ProgressoSalvo {
  nutarefa: number;
  itens: {
    key: string;
    BIPADO: number;
    etapa?: string;
    idsUnicos?: string[];
  }[];
  salvoEm: number;
}

type Etapa = 'PRODUTO' | 'ENDERECO' | 'LOTE' | 'CODIGO' | 'IDUNICO';

type StatusDestino =
  | 'IDLE'
  | 'VERIFICANDO'
  | 'LIVRE'
  | 'OCUPADO'
  | 'NAO_ENCONTRADO'
  | 'ERRO';

const ID_UNICO_MIN_LEN = 18;

const PROGRESSO_KEY = (nutarefa: number) =>
  `@separacao_progresso_${nutarefa}`;

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
      ISNULL(ITT.QTDORIG, 0)                 AS QTD_BIPAR,
      CASE
          WHEN EST.CODEND IS NULL THEN 1
          WHEN ISNULL(ITT.QTDORIG, 0) > ISNULL(EST.ESTOQUE, 0) THEN 1
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

async function carregarItensSeparacaoLocal(nutarefa: number): Promise<{
  podeSeparar: boolean;
  itens: ItemSeparacao[];
  bloqueados: ItemSeparacao[];
}> {
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

  const [etapa, setEtapa] = useState<Etapa>('PRODUTO');

  const [produto, setProduto] = useState('');
  const [endereco, setEndereco] = useState('');
  const [lote, setLote] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [idUnico, setIdUnico] = useState('');

  const [enderecoDestino, setEnderecoDestino] = useState('');
  const [modalDestinoVisivel, setModalDestinoVisivel] = useState(false);

  // ===== Verificação do endereço de destino =====
  const [statusDestino, setStatusDestino] = useState<StatusDestino>('IDLE');
  const [descrDestino, setDescrDestino] = useState<string>('');
  const [erroVerificacao, setErroVerificacao] = useState<string | null>(null);

  // Histórico de IDs únicos bipados por item
  const [idsUnicosPorItem, setIdsUnicosPorItem] = useState<
    Record<string, string[]>
  >({});

  const inputProdutoRef = useRef<TextInput>(null);
  const inputEnderecoRef = useRef<TextInput>(null);
  const inputLoteRef = useRef<TextInput>(null);
  const inputCaptureRef = useRef<TextInput>(null);
  const inputIdUnicoRef = useRef<TextInput>(null);

  // Buffers síncronos
  const bufferRef = useRef('');
  const bufferProdutoRef = useRef('');
  const bufferEnderecoRef = useRef('');
  const bufferLoteRef = useRef('');
  const bufferIdUnicoRef = useRef('');

  // Timers por etapa (debounce do leitor HID)
  const bipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferProdutoTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferEnderecoTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferLoteTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferIdUnicoTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref para a etapa atual (evita closure obsoleto em handlers assíncronos)
  const etapaRef = useRef<Etapa>('PRODUTO');
  useEffect(() => {
    etapaRef.current = etapa;
  }, [etapa]);

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

  const itemKey = useCallback(
    (it: ItemComBipe) => `${it.CODPROD}-${it.LOTE}`,
    []
  );

  const salvarProgresso = useCallback(
    async (
      itensAtuais: ItemComBipe[],
      etapaAtual: Etapa,
      idsAtuais: Record<string, string[]>
    ) => {
      if (!nutarefa) return;
      try {
        const progresso: ProgressoSalvo = {
          nutarefa,
          itens: itensAtuais.map((it) => ({
            key: itemKey(it),
            BIPADO: it.BIPADO,
            etapa: etapaAtual,
            idsUnicos: idsAtuais[itemKey(it)] ?? [],
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
    [nutarefa, itemKey]
  );

  const carregarProgresso = useCallback(async (): Promise<{
    mapaBipados: Record<string, number>;
    mapaEtapas: Record<string, Etapa>;
    mapaIds: Record<string, string[]>;
  }> => {
    if (!nutarefa) return { mapaBipados: {}, mapaEtapas: {}, mapaIds: {} };
    try {
      const raw = await AsyncStorage.getItem(PROGRESSO_KEY(nutarefa));
      if (!raw) return { mapaBipados: {}, mapaEtapas: {}, mapaIds: {} };
      const parsed: ProgressoSalvo = JSON.parse(raw);
      const mapaBipados: Record<string, number> = {};
      const mapaEtapas: Record<string, Etapa> = {};
      const mapaIds: Record<string, string[]> = {};
      for (const i of parsed.itens) {
        mapaBipados[i.key] = i.BIPADO;
        if (i.etapa) mapaEtapas[i.key] = i.etapa as Etapa;
        if (i.idsUnicos) mapaIds[i.key] = i.idsUnicos;
      }
      console.log('📂 Progresso carregado:', mapaBipados);
      return { mapaBipados, mapaEtapas, mapaIds };
    } catch (err) {
      console.warn('⚠️ Não foi possível carregar progresso:', err);
      return { mapaBipados: {}, mapaEtapas: {}, mapaIds: {} };
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

  // ==================== FOCO DOS INPUTS ====================

  const focarCapture = useCallback(() => {
    setTimeout(() => {
      inputCaptureRef.current?.focus();
    }, 50);
  }, []);

  const focarEtapaAtual = useCallback((etapaAtual: Etapa) => {
    setTimeout(() => {
      if (etapaAtual === 'PRODUTO') inputProdutoRef.current?.focus();
      else if (etapaAtual === 'ENDERECO') inputEnderecoRef.current?.focus();
      else if (etapaAtual === 'LOTE') inputLoteRef.current?.focus();
      else if (etapaAtual === 'CODIGO') inputCaptureRef.current?.focus();
      else inputIdUnicoRef.current?.focus();
    }, 100);
  }, []);

  // ==================== CARREGAR ====================

  const carregar = useCallback(async () => {
    if (!nutarefa) {
      setError('Tarefa inválida');
      setLoading(false);
      return;
    }

    if (!session?.username) {
      setError('Sessão não disponível');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // =========================================================
      // ⚠️ ORDEM OBRIGATÓRIA:
      // 1) marcarSeparacaoIniciada  → grava a linha COMPLETA de cada item
      //    em AD_SEPARACAOWMS com STATUS='A' (NUNOTA, NUTAREFA, NUSEPARACAO,
      //    ORDEMCARGA, CODPROD, DESCRPROD, REFERENCIA, CONTROLE, USUARIO).
      // 2) iniciarSeparacaoWMS      → UPDATE TGWITT SITUACAO='E'
      //    (a trigger SEPARACAO_LABOTRAT só dispara se STATUS='A' existir)
      // =========================================================
      try {
        await marcarSeparacaoIniciada(nutarefa, session.username);
        console.log(
          `🅰️ Linhas de controle criadas com STATUS='A' para NUTAREFA ${nutarefa}`
        );

        await iniciarSeparacaoWMS(nutarefa);
        console.log(
          `▶️ Tarefa ${nutarefa} marcada como em separação (SITUACAO='E')`
        );
      } catch (errIni) {
        console.warn(
          '⚠️ Não foi possível marcar tarefa como em separação:',
          errIni
        );
      }

      const validacao = await carregarItensSeparacaoLocal(nutarefa);

      if (!validacao.podeSeparar) {
        setError(
          'Estoque insuficiente. Faça ressuprimento ou ajuste antes de separar.'
        );
        return;
      }

      const { mapaBipados, mapaEtapas, mapaIds } = await carregarProgresso();

      const itensComProgresso: ItemComBipe[] = validacao.itens.map((i) => {
        const key = `${i.CODPROD}-${i.LOTE}`;
        const bipadoSalvo = mapaBipados[key] ?? 0;
        const bipado = Math.min(bipadoSalvo, i.QTD_BIPAR);
        return { ...i, BIPADO: bipado };
      });

      setItens(itensComProgresso);
      setIdsUnicosPorItem(mapaIds);

      const primeiroPendente = itensComProgresso.findIndex(
        (it) => it.BIPADO < it.QTD_BIPAR
      );
      const idx = primeiroPendente >= 0 ? primeiroPendente : 0;
      setItemAtivoIndex(idx);

      const key = `${itensComProgresso[idx]?.CODPROD}-${itensComProgresso[idx]?.LOTE}`;
      const etapaSalva = mapaEtapas[key] as Etapa | undefined;

      const itemPendente =
        itensComProgresso[idx] &&
        itensComProgresso[idx].BIPADO < itensComProgresso[idx].QTD_BIPAR;

      if (itemPendente && etapaSalva) {
        setEtapa(etapaSalva);
      } else {
        setEtapa('PRODUTO');
      }
    } catch (err) {
      console.error('❌ Erro ao carregar itens:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar itens');
    } finally {
      setLoading(false);
      bufferRef.current = '';
      bufferProdutoRef.current = '';
      bufferEnderecoRef.current = '';
      bufferLoteRef.current = '';
      bufferIdUnicoRef.current = '';
    }
  }, [nutarefa, session?.username, carregarProgresso]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    return () => {
      if (bipTimerRef.current) clearTimeout(bipTimerRef.current);
      if (bufferProdutoTimerRef.current)
        clearTimeout(bufferProdutoTimerRef.current);
      if (bufferEnderecoTimerRef.current)
        clearTimeout(bufferEnderecoTimerRef.current);
      if (bufferLoteTimerRef.current)
        clearTimeout(bufferLoteTimerRef.current);
      if (bufferIdUnicoTimerRef.current)
        clearTimeout(bufferIdUnicoTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (loading || error) return;
    focarEtapaAtual(etapa);
  }, [loading, error, etapa, itemAtivoIndex, focarEtapaAtual]);

  useFocusEffect(
    useCallback(() => {
      if (!loading && !error) {
        focarEtapaAtual(etapa);
      }
    }, [loading, error, etapa, focarEtapaAtual])
  );

  const itemAtivo = itens[itemAtivoIndex];

  const todosConcluidos =
    itens.length > 0 && itens.every((it) => it.BIPADO >= it.QTD_BIPAR);

  const itemAtivoCompleto =
    !!itemAtivo && itemAtivo.BIPADO >= itemAtivo.QTD_BIPAR;

  const proximaEtapa = (etapaAtual: Etapa) => {
    switch (etapaAtual) {
      case 'PRODUTO':
        setEtapa('ENDERECO');
        break;
      case 'ENDERECO':
        setEtapa('LOTE');
        break;
      case 'LOTE':
        setEtapa('CODIGO');
        break;
      case 'CODIGO':
        setEtapa('IDUNICO');
        break;
      default:
        break;
    }
  };

  const avançarItem = useCallback(() => {
    const próximoIndex = itens.findIndex(
      (it, idx) => idx > itemAtivoIndex && it.BIPADO < it.QTD_BIPAR
    );

    if (próximoIndex === -1) {
      Alert.alert(
        'Todos os itens foram bipados ✅',
        'A tarefa está completa. Confirme a separação.'
      );
      return;
    }

    setItemAtivoIndex(próximoIndex);
    setEtapa('PRODUTO');
    setProduto('');
    setEndereco('');
    setLote('');
    setCodigoBarras('');
    setIdUnico('');
    bufferProdutoRef.current = '';
    bufferEnderecoRef.current = '';
    bufferLoteRef.current = '';
    bufferRef.current = '';
    bufferIdUnicoRef.current = '';

    if (bipTimerRef.current) {
      clearTimeout(bipTimerRef.current);
      bipTimerRef.current = null;
    }
    setTimeout(() => inputProdutoRef.current?.focus(), 100);
  }, [itens, itemAtivoIndex]);

  // ==================== HANDLERS DE BIPE (padrão HID com debounce) ====================

  const onChangeProduto = (texto: string) => {
    const limpo = texto.replace(/\s/g, '');
    setProduto(limpo);
    bufferProdutoRef.current = limpo;

    if (bufferProdutoTimerRef.current)
      clearTimeout(bufferProdutoTimerRef.current);
    if (!limpo) return;

    bufferProdutoTimerRef.current = setTimeout(() => {
      const valor = bufferProdutoRef.current;
      bufferProdutoRef.current = '';
      confirmarProduto(valor);
      setTimeout(() => inputProdutoRef.current?.focus(), 50);
    }, 120);
  };

  const onChangeEndereco = (texto: string) => {
    const fmt = formatarEndereco(texto);
    setEndereco(fmt);
    bufferEnderecoRef.current = fmt;

    if (bufferEnderecoTimerRef.current)
      clearTimeout(bufferEnderecoTimerRef.current);
    if (!fmt) return;

    bufferEnderecoTimerRef.current = setTimeout(() => {
      const valor = bufferEnderecoRef.current;
      bufferEnderecoRef.current = '';
      confirmarEndereco(valor);
      setTimeout(() => inputEnderecoRef.current?.focus(), 50);
    }, 120);
  };

  const onChangeLote = (texto: string) => {
    const limpo = texto.replace(/\s/g, '');
    setLote(limpo);
    bufferLoteRef.current = limpo;

    if (bufferLoteTimerRef.current) clearTimeout(bufferLoteTimerRef.current);
    if (!limpo) return;

    bufferLoteTimerRef.current = setTimeout(() => {
      const valor = bufferLoteRef.current;
      bufferLoteRef.current = '';
      confirmarLote(valor);
      setTimeout(() => inputLoteRef.current?.focus(), 50);
    }, 120);
  };

  const onChangeIdUnico = (texto: string) => {
    const limpo = texto.replace(/\s/g, '');
    setIdUnico(limpo);
    bufferIdUnicoRef.current = limpo;

    if (bufferIdUnicoTimerRef.current)
      clearTimeout(bufferIdUnicoTimerRef.current);
    if (!limpo) return;

    bufferIdUnicoTimerRef.current = setTimeout(() => {
      const valor = bufferIdUnicoRef.current;
      bufferIdUnicoRef.current = '';
      confirmarIdUnico(valor);
      setTimeout(() => inputIdUnicoRef.current?.focus(), 50);
    }, 120);
  };

  // ==================== ETAPA 1: PRODUTO ====================

  const confirmarProduto = (valorInformado?: string) => {
    registerUserActivity();

    if (!itemAtivo) {
      Alert.alert('Atenção', 'Nenhum item ativo para separar.');
      return;
    }

    if (itemAtivoCompleto) {
      Alert.alert(
        'Item já completo',
        'Este item já foi bipado completamente. Avance para o próximo.'
      );
      return;
    }

    const valorBruto = (
      valorInformado ??
      bufferProdutoRef.current ??
      produto
    ).trim();
    const valor = valorBruto.toUpperCase();
    const esperado = (itemAtivo.REFERENCIA || '').trim().toUpperCase();

    if (!valor) {
      Alert.alert('Produto', 'Bipe a referência do produto.');
      inputProdutoRef.current?.focus();
      return;
    }

    if (!esperado) {
      Alert.alert(
        'Produto sem referência',
        'Este item está sem REFERENCIA no cadastro (TGFPRO). Verifique no Sankhya.'
      );
      return;
    }

    if (valor !== esperado) {
      Alert.alert(
        'Produto inválido',
        `Esperado: ${itemAtivo.REFERENCIA}\nBipado: ${valorBruto}`
      );
      setProduto('');
      bufferProdutoRef.current = '';
      setTimeout(() => inputProdutoRef.current?.focus(), 100);
      return;
    }

    bufferProdutoRef.current = '';
    proximaEtapa('PRODUTO');
  };

  // ==================== ETAPA 2: ENDEREÇO ====================

  const confirmarEndereco = (valorInformado?: string) => {
    registerUserActivity();

    if (!itemAtivo) {
      Alert.alert('Atenção', 'Nenhum item ativo para separar.');
      return;
    }

    if (itemAtivoCompleto) {
      Alert.alert(
        'Item já completo',
        'Este item já foi bipado completamente. Avance para o próximo.'
      );
      return;
    }

    const valorDigitado = (
      valorInformado ??
      bufferEnderecoRef.current ??
      endereco
    ).trim();
    const esperado = (itemAtivo.ENDERECO || '').trim();

    if (!valorDigitado) {
      Alert.alert('Endereço', 'Bipe o endereço.');
      inputEnderecoRef.current?.focus();
      return;
    }

    if (!esperado) {
      Alert.alert(
        'Endereço sem cadastro',
        'Este item está sem ENDERECO no cadastro (TGWEND). Verifique no Sankhya.'
      );
      return;
    }

    const ok =
      formatarEndereco(valorDigitado) === formatarEndereco(esperado);

    if (!ok) {
      Alert.alert(
        'Endereço inválido',
        `Esperado: ${formatarEndereco(esperado)}\nBipado: ${formatarEndereco(
          valorDigitado
        )}`
      );
      setEndereco('');
      bufferEnderecoRef.current = '';
      setTimeout(() => inputEnderecoRef.current?.focus(), 100);
      return;
    }

    bufferEnderecoRef.current = '';
    proximaEtapa('ENDERECO');
  };

  // ==================== ETAPA 3: LOTE ====================

  const confirmarLote = (valorInformado?: string) => {
    registerUserActivity();

    if (!itemAtivo) {
      Alert.alert('Atenção', 'Nenhum item ativo para separar.');
      return;
    }

    if (itemAtivoCompleto) {
      Alert.alert(
        'Item já completo',
        'Este item já foi bipado completamente. Avance para o próximo.'
      );
      return;
    }

    const valorBruto = (
      valorInformado ??
      bufferLoteRef.current ??
      lote
    ).trim();
    const valor = valorBruto.toUpperCase();
    const esperado = (itemAtivo.LOTE || '').trim().toUpperCase();

    if (!valor) {
      Alert.alert('Lote', 'Bipe o lote.');
      inputLoteRef.current?.focus();
      return;
    }

    if (!esperado) {
      Alert.alert(
        'Lote sem cadastro',
        'Este item está sem CONTROLE na TGWITT. Verifique no Sankhya.'
      );
      return;
    }

    if (valor !== esperado) {
      Alert.alert(
        'Lote inválido',
        `Esperado: ${itemAtivo.LOTE}\nBipado: ${valorBruto}`
      );
      setLote('');
      bufferLoteRef.current = '';
      setTimeout(() => inputLoteRef.current?.focus(), 100);
      return;
    }

    bufferLoteRef.current = '';
    proximaEtapa('LOTE');
  };

  // ==================== ETAPA 4: CÓDIGO DE BARRAS ====================

  const confirmarCodigo = (codigoInformado?: string) => {
    registerUserActivity();

    if (bipTimerRef.current) {
      clearTimeout(bipTimerRef.current);
      bipTimerRef.current = null;
    }

    if (!itemAtivo) {
      setCodigoBarras('');
      bufferRef.current = '';
      Alert.alert('Atenção', 'Nenhum item ativo para separar.');
      focarCapture();
      return;
    }

    if (itemAtivoCompleto) {
      setCodigoBarras('');
      bufferRef.current = '';
      Alert.alert(
        'Item já completo',
        `Ref ${itemAtivo.REFERENCIA} / Lote ${itemAtivo.LOTE} já foi bipado (${itemAtivo.BIPADO}/${itemAtivo.QTD_BIPAR}).`
      );
      focarCapture();
      return;
    }

    const codigo = (
      codigoInformado ??
      bufferRef.current ??
      codigoBarras
    ).trim();
    const esperado = (itemAtivo.CODBARRA || '').trim();

    setCodigoBarras('');
    bufferRef.current = '';

    if (!codigo) {
      Alert.alert('Código de barras', 'Bipe o código de barras.');
      focarCapture();
      return;
    }

    if (!esperado) {
      Alert.alert(
        'Produto sem código de barras',
        'Este item está sem CODBARRA no cadastro (TGFVOA). Verifique no Sankhya.'
      );
      focarCapture();
      return;
    }

    if (codigo !== esperado) {
      Alert.alert(
        'Código de barras inválido',
        `Esperado: ${itemAtivo.CODBARRA}\nBipado: ${codigo}`
      );
      focarCapture();
      return;
    }

    proximaEtapa('CODIGO');
  };

  // ==================== ETAPA 5: ID ÚNICO ====================

  const registrarBipagemIdUnico = useCallback(
    (id: string, permitirRepetido: boolean) => {
      if (!itemAtivo) return;

      const key = itemKey(itemAtivo);
      const ids = idsUnicosPorItem[key] ?? [];

      if (!permitirRepetido && ids.includes(id)) {
        Alert.alert(
          'Sequencial já bipado',
          `O ID Único "${id}" já foi bipado para este item.\n\nDeseja continuar mesmo assim (contar a bipagem repetida)?`,
          [
            { text: 'Não', style: 'cancel' },
            {
              text: 'Sim',
              onPress: () => {
                registrarBipagemIdUnico(id, true);
              },
            },
          ]
        );
        return;
      }

      const novosItens = itens.map((it, idx) =>
        idx === itemAtivoIndex
          ? { ...it, BIPADO: Math.min(it.BIPADO + 1, it.QTD_BIPAR) }
          : it
      );

      const novosIds: Record<string, string[]> = {
        ...idsUnicosPorItem,
        [key]: [...ids, id],
      };

      setItens(novosItens);
      setIdsUnicosPorItem(novosIds);

      const novoBipado = Math.min(itemAtivo.BIPADO + 1, itemAtivo.QTD_BIPAR);

      salvarProgresso(novosItens, etapaRef.current, novosIds);

      setIdUnico('');
      bufferIdUnicoRef.current = '';
      setTimeout(() => inputIdUnicoRef.current?.focus(), 50);

      if (novoBipado >= itemAtivo.QTD_BIPAR) {
        Alert.alert(
          'Item completo ✅',
          `Ref ${itemAtivo.REFERENCIA} / Lote ${itemAtivo.LOTE} finalizado (${novoBipado}/${itemAtivo.QTD_BIPAR}).`
        );
        setTimeout(() => avançarItem(), 200);
      }
    },
    [
      itemAtivo,
      itens,
      itemAtivoIndex,
      idsUnicosPorItem,
      itemKey,
      salvarProgresso,
      avançarItem,
    ]
  );

  const confirmarIdUnico = (idInformado?: string) => {
    registerUserActivity();

    if (bufferIdUnicoTimerRef.current) {
      clearTimeout(bufferIdUnicoTimerRef.current);
      bufferIdUnicoTimerRef.current = null;
    }

    if (!itemAtivo) {
      setIdUnico('');
      bufferIdUnicoRef.current = '';
      Alert.alert('Atenção', 'Nenhum item ativo para separar.');
      inputIdUnicoRef.current?.focus();
      return;
    }

    if (itemAtivoCompleto) {
      setIdUnico('');
      bufferIdUnicoRef.current = '';
      Alert.alert(
        'Item já completo',
        `Ref ${itemAtivo.REFERENCIA} / Lote ${itemAtivo.LOTE} já foi bipado (${itemAtivo.BIPADO}/${itemAtivo.QTD_BIPAR}).`
      );
      inputIdUnicoRef.current?.focus();
      return;
    }

    const id = (
      idInformado ??
      bufferIdUnicoRef.current ??
      idUnico
    ).trim();

    setIdUnico('');
    bufferIdUnicoRef.current = '';

    if (!id) {
      Alert.alert('ID Único', 'Bipe o ID Único.');
      inputIdUnicoRef.current?.focus();
      return;
    }

    if (id.length < ID_UNICO_MIN_LEN) {
      Alert.alert(
        'ID Único inválido',
        `O ID Único precisa ter no mínimo ${ID_UNICO_MIN_LEN} caracteres.\n\nBipado: "${id}" (${id.length} caracteres).`
      );
      inputIdUnicoRef.current?.focus();
      return;
    }

    registrarBipagemIdUnico(id, false);
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

    setEnderecoDestino('');
    setStatusDestino('IDLE');
    setDescrDestino('');
    setErroVerificacao(null);
    setModalDestinoVisivel(true);
  };

  const confirmarConclusao = async () => {
    const digitos = enderecoDestino.replace(/\D/g, '');
    if (digitos.length !== 6) {
      Alert.alert('Endereço inválido', 'Digite 6 dígitos (XX.XX.XX).');
      return;
    }

    const enderecoFormatado = `${digitos.slice(0, 2)}.${digitos.slice(
      2,
      4
    )}.${digitos.slice(4, 6)}`;

    try {
      setStatusDestino('VERIFICANDO');
      setErroVerificacao(null);
      setDescrDestino('');

      const check = await verificarEnderecoLivre(enderecoFormatado);

      if (check.codend === null) {
        setStatusDestino('NAO_ENCONTRADO');
        Alert.alert(
          'Endereço não encontrado',
          `O endereço ${enderecoFormatado} não existe na TGWEND (ou não está ativo/analítico). Digite outro endereço.`
        );
        return;
      }

      if (!check.livre) {
        setStatusDestino('OCUPADO');
        setDescrDestino(check.descr);
        Alert.alert(
          'Endereço ocupado',
          `O endereço ${enderecoFormatado}${
            check.descr ? ` (${check.descr})` : ''
          } já está ocupado (estoque, pendência ou tarefa em andamento).\n\nDigite outro endereço de destino.`
        );
        return;
      }

      setStatusDestino('LIVRE');
      setDescrDestino(check.descr);

      setModalDestinoVisivel(false);
      await executarConclusao(enderecoFormatado, check.codend);
    } catch (err) {
      console.error(
        '❌ Erro ao verificar/concluir endereço de destino:',
        err
      );
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível verificar o endereço de destino.';
      setStatusDestino('ERRO');
      setErroVerificacao(msg);
      Alert.alert('Erro', msg);
    }
  };

  const executarConclusao = async (
    enderecoFormatado: string,
    codendJaResolvido?: number
  ) => {
    try {
      setConcluindo(true);

      const codendNovo =
        codendJaResolvido ??
        (await buscarCodEndPorEndereco(enderecoFormatado));

      if (!codendNovo) {
        Alert.alert(
          'Endereço não encontrado',
          `Não encontrei o endereço ${enderecoFormatado} na TGWEND. Verifique e tente novamente.`
        );
        setConcluindo(false);
        return;
      }

      // Monta o mapa de VOLUMES por item (chave = CODPROD-CONTROLE)
      const volumesPorItem: Record<string, string> = {};
      for (const it of itens) {
        const key = `${it.CODPROD}-${(it.LOTE || '').trim()}`;
        volumesPorItem[key] = `${it.BIPADO} / ${it.QTD_BIPAR}`;
      }

      // =========================================================
      // ⚠️ ORDEM OBRIGATÓRIA:
      // 1) marcarSeparacaoFinalizada → atualiza VOLUMES + STATUS='S'
      //    nas linhas já existentes de AD_SEPARACAOWMS.
      //    Precisa vir ANTES dos moverEstoqueItemWMS, senão as
      //    triggers MOVESTOQUE_LABOTRAT e FINALIZA_LABOTRAT não disparam.
      // =========================================================
      await marcarSeparacaoFinalizada(itens[0].NUTAREFA, volumesPorItem);
      console.log(
        `🅢 STATUS='S' + VOLUMES gravados para NUTAREFA ${itens[0].NUTAREFA}`
      );

      const sqlSeq = `
        SELECT SEQUENCIA
        FROM SANKHYA.TGWITT
        WHERE NUTAREFA = ${Number(itens[0].NUTAREFA)}
          AND SITUACAO <> 'F'
      `;
      const resSeq = await queryJson('DbExplorerSP.executeQuery', {
        sql: sqlSeq,
      });
      const sequencias: number[] = (resSeq?.rows ?? [])
        .map((r: any[]) => Number(r[0]) || 0)
        .filter((n: number) => n > 0);

      if (sequencias.length === 0) {
        console.warn('⚠️ Nenhuma sequência pendente encontrada.');
        setConcluindo(false);
        return;
      }

      // 3) Move estoque item a item (dispara MOVESTOQUE + FINALIZA)
      for (const sequencia of sequencias) {
        const item = await buscarItemTarefaWMS(
          itens[0].NUTAREFA,
          sequencia
        );
        if (!item) continue;

        await moverEstoqueItemWMS({
          NUTAREFA: itens[0].NUTAREFA,
          SEQUENCIA: sequencia,
          CODPROD: item.CODPROD,
          CONTROLE: item.CONTROLE,
          CODEND_ANTERIOR: item.CODENDDESTINO,
          CODEND_NOVO: codendNovo,
          QTDDEST: item.QTDDEST,
        });
      }

      const todosOk = await verificarTodosItensFinalizadosWMS(
        itens[0].NUTAREFA
      );

      if (todosOk) {
        await finalizarTarefaWMS({
          NUTAREFA: itens[0].NUTAREFA,
          NUSEPARACAO: itens[0].NUSEPARACAO,
        });
      }

      await limparProgresso();

      Alert.alert(
        'Separação concluída ✅',
        todosOk
          ? 'Estoque movimentado. Tarefa e Separação finalizadas.'
          : 'Itens finalizados. Ainda restam itens em outras conferências.',
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
  };

  // ==================== SAIR / REJEITAR ====================

  const handleSair = () => {
    if (rejeitando) return;

    Alert.alert(
      'Sair da separação?',
      'Ao sair, a tarefa será devolvida para a fila (rejeitada) e o progresso dos bipes será apagado. Deseja continuar?',
      [
        { text: 'Ficar', style: 'cancel' },
        {
          text: 'Rejeitar',
          style: 'destructive',
          onPress: async () => {
            try {
              setRejeitando(true);

              // =========================================================
              // ⚠️ ORDEM OBRIGATÓRIA:
              // 1) rejeitarSeparacaoWMS → UPDATE TGWITT SITUACAO='A'
              //    (a trigger de rejeição dentro da SEPARACAO_LABOTRAT
              //     precisa que STATUS='A' ainda exista em AD_SEPARACAOWMS)
              // 2) limparSeparacao → STATUS='X' (Sankhya não permite DELETE)
              // =========================================================
              await rejeitarSeparacaoWMS(nutarefa);
              console.log(`◀️ Tarefa ${nutarefa} rejeitada (SITUACAO='A')`);

              await limparSeparacao(nutarefa);
              console.log(
                `🅧 STATUS='X' gravado nas linhas de controle da NUTAREFA ${nutarefa}`
              );

              await limparProgresso();
              console.log(`🗑️ Progresso da tarefa ${nutarefa} apagado`);
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

  const etapaNumero =
    etapa === 'PRODUTO'
      ? '1'
      : etapa === 'ENDERECO'
      ? '2'
      : etapa === 'LOTE'
      ? '3'
      : etapa === 'CODIGO'
      ? '4'
      : '5';

  const etapaNome =
    etapa === 'PRODUTO'
      ? 'Produto'
      : etapa === 'ENDERECO'
      ? 'Endereço'
      : etapa === 'LOTE'
      ? 'Lote'
      : etapa === 'CODIGO'
      ? 'Código de Barras'
      : 'ID Único';

  return (
    <View style={styles.container}>
      {/* Input invisível que captura o bipe do leitor HID (etapa CODIGO) */}
      {etapa === 'CODIGO' && (
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

            if (!limpo) return;

            bipTimerRef.current = setTimeout(() => {
              const valor = bufferRef.current;
              bufferRef.current = '';
              confirmarCodigo(valor);
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
      )}

      <View style={styles.header}>
        <View style={{ width: 24 }} />
        <Text style={styles.headerTitle}>Separar Tarefa #{nutarefa}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* BOTÕES REJEITAR / CONCLUIR */}
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
              <Ionicons
                name="close-circle-outline"
                size={20}
                color="white"
              />
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
              <Ionicons
                name="checkmark-done-circle"
                size={20}
                color="white"
              />
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
            {itemAtivo
              ? `${itemAtivo.BIPADO}/${itemAtivo.QTD_BIPAR} ${
                  itemAtivo.UNIDADE_ESTOQUE || ''
                }`
              : '-'}
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

      {/* ETAPAS */}
      <View style={styles.formContainer}>
        <View style={styles.etapaHeader}>
          <Text style={styles.etapaLabel}>Etapa {etapaNumero} de 5</Text>
          <Text style={styles.etapaNome}>{etapaNome}</Text>
        </View>

        {/* ETAPA 1: PRODUTO */}
        {etapa === 'PRODUTO' && (
          <View style={styles.formRow}>
            <Ionicons name="cube-outline" size={18} color="#FF9800" />
            <Text style={styles.formLabel}>Produto:</Text>
            <TextInput
              ref={inputProdutoRef}
              style={styles.formInputLote}
              placeholder="Bipe a referência"
              placeholderTextColor="#999"
              value={produto}
              onChangeText={onChangeProduto}
              autoCorrect={false}
              autoCapitalize="characters"
              showSoftInputOnFocus={false}
              caretHidden
              contextMenuHidden
              selectTextOnFocus={false}
              blurOnSubmit={false}
              editable={!itemAtivoCompleto}
            />
          </View>
        )}

        {/* ETAPA 2: ENDEREÇO */}
        {etapa === 'ENDERECO' && (
          <View style={styles.formRow}>
            <Ionicons name="location-outline" size={18} color="#FF9800" />
            <Text style={styles.formLabel}>Endereço:</Text>
            <TextInput
              ref={inputEnderecoRef}
              style={styles.formInputLote}
              placeholder="Bipe o endereço"
              placeholderTextColor="#999"
              value={endereco}
              onChangeText={onChangeEndereco}
              autoCorrect={false}
              autoCapitalize="none"
              showSoftInputOnFocus={false}
              caretHidden
              contextMenuHidden
              selectTextOnFocus={false}
              blurOnSubmit={false}
              editable={!itemAtivoCompleto}
            />
          </View>
        )}

        {/* ETAPA 3: LOTE */}
        {etapa === 'LOTE' && (
          <View style={styles.formRow}>
            <Ionicons name="barcode-outline" size={18} color="#FF9800" />
            <Text style={styles.formLabel}>Lote:</Text>
            <TextInput
              ref={inputLoteRef}
              style={styles.formInputLote}
              placeholder="Bipe o lote"
              placeholderTextColor="#999"
              value={lote}
              onChangeText={onChangeLote}
              autoCorrect={false}
              autoCapitalize="characters"
              showSoftInputOnFocus={false}
              caretHidden
              contextMenuHidden
              selectTextOnFocus={false}
              blurOnSubmit={false}
              editable={!itemAtivoCompleto}
            />
          </View>
        )}

        {/* ETAPA 4: CÓDIGO DE BARRAS */}
        {etapa === 'CODIGO' && (
          <View style={styles.formRow}>
            <Ionicons name="qr-code-outline" size={18} color="#FF9800" />
            <Text style={styles.formLabel}>Cód. Barras:</Text>
            <View style={styles.formInputBipeDisplay}>
              <Text style={styles.formInputBipeText} numberOfLines={1}>
                {codigoBarras || 'Aguardando bipe...'}
              </Text>
            </View>
          </View>
        )}

        {/* ETAPA 5: ID ÚNICO */}
        {etapa === 'IDUNICO' && (
          <View style={styles.formRow}>
            <Ionicons name="finger-print" size={18} color="#FF9800" />
            <Text style={styles.formLabel}>ID Único:</Text>
            <TextInput
              ref={inputIdUnicoRef}
              style={styles.formInputLote}
              placeholder="Bipe o ID Único"
              placeholderTextColor="#999"
              value={idUnico}
              onChangeText={onChangeIdUnico}
              autoCorrect={false}
              autoCapitalize="none"
              showSoftInputOnFocus={false}
              caretHidden
              contextMenuHidden
              selectTextOnFocus={false}
              blurOnSubmit={false}
              editable={!itemAtivoCompleto}
            />
          </View>
        )}

        <TouchableOpacity
          style={styles.confirmarButton}
          activeOpacity={0.8}
          focusable={false}
          disabled={itemAtivoCompleto}
          onPress={() => {
            if (etapa === 'PRODUTO') confirmarProduto();
            else if (etapa === 'ENDERECO') confirmarEndereco();
            else if (etapa === 'LOTE') confirmarLote();
            else if (etapa === 'CODIGO') confirmarCodigo();
            else confirmarIdUnico();
          }}
        >
          <Ionicons name="checkmark-circle" size={20} color="white" />
          <Text style={styles.confirmarButtonText}>
            {etapa === 'CODIGO'
              ? 'Confirmar bipe'
              : etapa === 'IDUNICO'
              ? 'Confirmar ID Único'
              : 'Confirmar'}
          </Text>
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

      {/* Modal: endereço de destino */}
      <Modal
        visible={modalDestinoVisivel}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (statusDestino === 'VERIFICANDO') return;
          setModalDestinoVisivel(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Endereço de destino</Text>
            <Text style={styles.modalSubtitle}>
              Digite 6 dígitos (XX.XX.XX) — o endereço precisa estar livre
            </Text>

            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              maxLength={8}
              value={enderecoDestino}
              onChangeText={(t) => {
                const d = t.replace(/\D/g, '').slice(0, 6);
                const fmt = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)]
                  .filter(Boolean)
                  .join('.');
                setEnderecoDestino(fmt);

                if (statusDestino !== 'IDLE') {
                  setStatusDestino('IDLE');
                  setDescrDestino('');
                  setErroVerificacao(null);
                }
              }}
              placeholder="00.00.00"
              autoFocus
              editable={statusDestino !== 'VERIFICANDO'}
            />

            {statusDestino === 'OCUPADO' && (
              <View style={styles.statusBoxOcupado}>
                <Ionicons name="close-circle" size={18} color="#C62828" />
                <Text style={styles.statusTextOcupado}>
                  Endereço OCUPADO
                  {descrDestino ? ` (${descrDestino})` : ''}. Digite outro.
                </Text>
              </View>
            )}

            {statusDestino === 'NAO_ENCONTRADO' && (
              <View style={styles.statusBoxOcupado}>
                <Ionicons name="alert-circle" size={18} color="#C62828" />
                <Text style={styles.statusTextOcupado}>
                  Endereço não encontrado na TGWEND. Digite outro.
                </Text>
              </View>
            )}

            {statusDestino === 'ERRO' && (
              <View style={styles.statusBoxOcupado}>
                <Ionicons name="alert-circle" size={18} color="#C62828" />
                <Text style={styles.statusTextOcupado}>
                  {erroVerificacao ||
                    'Falha ao verificar o endereço. Tente novamente.'}
                </Text>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                disabled={statusDestino === 'VERIFICANDO'}
                onPress={() => setModalDestinoVisivel(false)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnOk,
                  statusDestino === 'VERIFICANDO' && styles.modalBtnDisabled,
                ]}
                disabled={statusDestino === 'VERIFICANDO'}
                onPress={confirmarConclusao}
              >
                {statusDestino === 'VERIFICANDO' ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-done-circle"
                      size={18}
                      color="white"
                    />
                    <Text style={styles.modalBtnText}>  Confirmar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

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
  infoCol: { flex: 1, paddingHorizontal: 2 },
  infoLabel: {
    fontSize: 10,
    color: '#E65100',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoValue: { fontSize: 13, color: '#333', fontWeight: '700' },
  infoValueQtd: { color: '#FF9800' },

  itemInfoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF3E0',
    borderTopWidth: 1,
    borderTopColor: '#FFE0B2',
  },
  itemInfoCol: { flex: 1, paddingHorizontal: 2 },
  itemInfoColEndereco: { flex: 1.6 },
  itemInfoLabel: {
    fontSize: 10,
    color: '#E65100',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  itemInfoValue: { fontSize: 13, color: '#333', fontWeight: '700' },

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
  indicadorTextDestaque: { color: '#333' },

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
  etapaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0B2',
  },
  etapaLabel: {
    fontSize: 11,
    color: '#E65100',
    fontWeight: '600',
  },
  etapaNome: {
    fontSize: 13,
    color: '#FF9800',
    fontWeight: 'bold',
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
  formInputLote: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#FFF3E0',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FF9800',
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

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  modalInput: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 2,
    borderColor: '#FF9800',
    borderRadius: 8,
    backgroundColor: '#FFF3E0',
    marginBottom: 12,
  },

  statusBoxOcupado: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#D32F2F',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
    gap: 6,
  },
  statusTextOcupado: {
    color: '#C62828',
    fontWeight: '600',
    fontSize: 13,
    flex: 1,
  },

  modalButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  modalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  modalBtnCancel: {
    backgroundColor: '#9E9E9E',
  },
  modalBtnOk: {
    backgroundColor: '#4CAF50',
  },
  modalBtnDisabled: {
    backgroundColor: '#BDBDBD',
  },
  modalBtnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 15,
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