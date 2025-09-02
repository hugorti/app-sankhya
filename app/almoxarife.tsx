// app/almoxarifado.tsx
import { View, Text, StyleSheet, ActivityIndicator, TextInput, TouchableOpacity, ScrollView, SafeAreaView, Modal, Alert, FlatList } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { queryJson, registrarRetiradaAlmoxarifado, iniciarSeparacao, finalizarSeparacao, criarNotaFiscal, adicionarItemNotaFiscal } from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { Ionicons } from '@expo/vector-icons';

interface DadosSeparacao {
  CODPROD: number;
  DESCRPROD: string;
  ESTOQUE: string;
  QTDSEPARADA: string;
  USUARIO: string;
  OP: number;
  UNIDADE: string;
  LOTE: string; // Adicionar campo LOTE
}

interface DadosAlmoxarifado {
  IDIPROC: number;
  REFERENCIA: string;
  PRODUTOPA: string;
  LOTE: string;
  COD_MP: number;
  PRODUTOMP: string;
  QUANTIDADE: string;
  UNIDADE: string;
  SEQUENCIA: number;
  FASE: string;
  TEMPERATURA: string;
  OBSERVACAO: string;
  EXECUTANTE: string;
  separado?: DadosSeparacao;
}

interface OPAberta {
  IDIPROC: number;
  REFERENCIA: string;
  PRODUTOPA: string;
  LOTE: string;
}

export default function AlmoxarifadoScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [dados, setDados] = useState<DadosAlmoxarifado[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idiproc, setIdiproc] = useState('');
  const [separacaoIniciada, setSeparacaoIniciada] = useState(false);
  const [separacaoFinalizada, setSeparacaoFinalizada] = useState(false);
  const [temAtividadeEmbalagem, setTemAtividadeEmbalagem] = useState(false);
  const [podeSepararItens, setPodeSepararItens] = useState(false);

  // Estados para busca de endereço
  const [endereco, setEndereco] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [dadosEndereco, setDadosEndereco] = useState<any[]>([]);
  const [codProdSelecionado, setCodProdSelecionado] = useState<number | null>(null);
  const [quantidadeRetirada, setQuantidadeRetirada] = useState('');
  const [modalMode, setModalMode] = useState<'lista' | 'confirmacao'>('lista');

  // Novos estados para a lista de OPs abertas
  const [opsAbertas, setOpsAbertas] = useState<OPAberta[]>([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [modalOpsVisible, setModalOpsVisible] = useState(false);
  const [detalhesEnderecoVisivel, setDetalhesEnderecoVisivel] = useState(false);
  const [enderecoSelecionado, setEnderecoSelecionado] = useState<any>(null);

  const [loteRetirada, setLoteRetirada] = useState('');

  // Buscar OPs abertas ao abrir a tela
  useEffect(() => {
    buscarOpsAbertas();
  }, []);

const handleItemPress = async (item: any) => {
  if (!item.separado && podeSepararItens) {
    setCodProdSelecionado(item.COD_MP);
    setEndereco('');
    setModalVisible(true);
    
    // Carrega os endereços diretamente
    await buscarEnderecosProduto(item.COD_MP);
  }
};

  const buscarOpsAbertas = async () => {
    try {
      setLoadingOps(true);
      const sql = `
        SELECT DISTINCT
          P.IDIPROC,
          PRO.REFERENCIA,
          PRO.DESCRPROD AS PRODUTOPA,
          P.NROLOTE AS LOTE
        FROM TPRIPROC P
        JOIN TPRIPA PA ON P.IDIPROC = PA.IDIPROC
        JOIN TGFPRO PRO ON PA.CODPRODPA = PRO.CODPROD
        JOIN TPRIATV ATV ON P.IDIPROC = ATV.IDIPROC
        JOIN TPREFX FX ON FX.IDEFX = ATV.IDEFX
        WHERE FX.DESCRICAO = 'EMBALAGEM' 
          AND ATV.DHACEITE IS NOT NULL
          AND ATV.DHINICIO IS NULL 
          AND ATV.DHFINAL IS NULL
          AND P.STATUSPROC <> 'C'
        ORDER BY P.IDIPROC DESC
      `;
      
      const result = await queryJson('DbExplorerSP.executeQuery', { sql });
      
      if (result.rows.length > 0) {
        const ops = result.rows.map((row: any) => ({
          IDIPROC: row[0],
          REFERENCIA: row[1],
          PRODUTOPA: row[2],
          LOTE: row[3]
        }));
        setOpsAbertas(ops);
      } else {
        setOpsAbertas([]);
      }
    } catch (error) {
      console.error('Erro ao buscar OPs abertas:', error);
      setError('Erro ao carregar OPs abertas');
    } finally {
      setLoadingOps(false);
      if (opsAbertas.length > 0) {
        setModalOpsVisible(true);
      }
    }
  };

  const selecionarOP = (op: OPAberta) => {
    setIdiproc(op.IDIPROC.toString());
    setModalOpsVisible(false);
    buscarDados();
  };

  const verificarAtividadeEmbalagem = async (idiproc: number): Promise<boolean> => {
    try {
      const sql = `
        SELECT ATV.IDIPROC, ATV.IDIATV, ATV.IDEFX, ATV.DHACEITE, ATV.DHINICIO, ATV.DHFINAL, FX.DESCRICAO
        FROM TPRIATV ATV
        JOIN TPREFX FX ON FX.IDEFX = ATV.IDEFX
        WHERE ATV.IDIPROC = ${idiproc} AND FX.DESCRICAO = 'EMBALAGEM' AND ATV.DHACEITE IS NOT NULL
      `;
      
      const result = await queryJson('DbExplorerSP.executeQuery', { sql });
      return result.rows.length > 0;
    } catch (error) {
      console.error('Erro ao verificar atividade de embalagem:', error);
      return false;
    }
  };

  const verificarStatusSeparacao = async (idiproc: number) => {
    try {
      const sql = `
        SELECT ATV.DHINICIO, ATV.DHFINAL
        FROM TPRIATV ATV
        JOIN TPREFX FX ON FX.IDEFX = ATV.IDEFX
        WHERE ATV.IDIPROC = ${idiproc} AND FX.DESCRICAO = 'EMBALAGEM'
      `;
      
      const result = await queryJson('DbExplorerSP.executeQuery', { sql });
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          dhInicio: row[0],
          dhFinal: row[1]
        };
      }
      return { dhInicio: null, dhFinal: null };
    } catch (error) {
      console.error('Erro ao verificar status da separação:', error);
      return { dhInicio: null, dhFinal: null };
    }
  };

  const handleIniciarSeparacao = async () => {
    if (!idiproc) {
      Alert.alert('Erro', 'Por favor, informe o número da OP primeiro');
      return;
    }

    Alert.alert(
      'Confirmação',
      'Tem certeza que deseja iniciar a separação?',
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              setLoading(true);
              await iniciarSeparacao({
                IDIPROC: Number(idiproc),
              });
              setSeparacaoIniciada(true);
              setPodeSepararItens(true);
              Alert.alert('Sucesso', 'Separação iniciada com sucesso!');
            } catch (error) {
              console.error('Erro ao iniciar separação:', error);
              Alert.alert('Erro', error instanceof Error ? error.message : 'Falha ao iniciar separação');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleFinalizarSeparacao = async () => {
  if (!idiproc) {
    Alert.alert('Erro', 'Por favor, informe o número da OP primeiro');
    return;
  }

  Alert.alert(
    'Confirmação',
    'Tem certeza que deseja finalizar a separação? O movimento será criado automaticamente.',
    [
      {
        text: 'Cancelar',
        style: 'cancel'
      },
      {
        text: 'Confirmar',
        onPress: async () => {
          try {
            setLoading(true);
            
            // 1. Primeiro criar o movimento (nota fiscal)
            const itensSeparados = dados.filter(item => item.separado);
            
            // Dados para criar a nota fiscal
            const notaFiscalData = {
              IDIPROC: Number(idiproc),
              CODEMP: 1,
              NUMNOTA: 0,
              CODCENCUS: 109002,
              CODTIPOPER: 1242,
              TIPMOV: 'T',
              CODTIPVENDA: 0,
              CODNAT: 3010103
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
                QTDNEG: parseFloat(item.separado!.QTDSEPARADA),
                SEQUENCIA: i + 1,
                CODVOL: item.separado!.UNIDADE,
                CODLOCALORIG: 50000000,
                CODLOCALDEST: 60000000
              };

              console.log('Adicionando item:', itemData);
              await adicionarItemNotaFiscal(itemData);
            }

            // 3. Só depois de criar o movimento com sucesso, finalizar a separação
            await finalizarSeparacao({
              IDIPROC: Number(idiproc),
            });
            
            // 4. Atualiza o estado local
            setSeparacaoFinalizada(true);
            setPodeSepararItens(false);
            
            Alert.alert('Sucesso', 'Movimento criado e separação finalizada com sucesso!');
            
            // 5. Voltar para tela anterior ou limpar dados
            setDados([]);
            setIdiproc('');

          } catch (error: any) {
            console.error('Erro ao finalizar separação:', error);
            
            // Tratamento específico para erro de estoque insuficiente
            if (error.message && error.message.includes('ESTOQUE INSUFICIENTE')) {
              const codProdMatch = error.message.match(/Produto: (\d+)/);
              const quantidadeMatch = error.message.match(/Quantidade: (\d+)/);
              
              let mensagemErro = 'Estoque insuficiente!';
              
              if (codProdMatch && codProdMatch[1]) {
                const codProd = codProdMatch[1];
                const produtoComErro = dados.find(item => item.COD_MP.toString() === codProd);
                const nomeProduto = produtoComErro ? produtoComErro.PRODUTOMP : `Código: ${codProd}`;
                
                mensagemErro = `Produto: ${nomeProduto}\nCódigo: ${codProd}`;
                
                if (quantidadeMatch && quantidadeMatch[1]) {
                  mensagemErro += `\nQuantidade solicitada: ${quantidadeMatch[1]}`;
                }
              }
              
              Alert.alert('Estoque insuficiente!', mensagemErro);
            } else {
              Alert.alert('Erro', error instanceof Error ? error.message : 'Falha ao finalizar separação');
            }
          } finally {
            setLoading(false);
          }
        }
      }
    ]
  );
};

  const buscarEnderecosProduto = async (codProd: number) => {
    try {
      setLoading(true);
      const sql = `
        SELECT 
          EXP.CODPROD,
          PRO.DESCRPROD,
          ED.ENDERECO,
          ED.CODEND,
          VOA.QUANTIDADE,
          EST.ESTOQUE,
          EST.ESTOQUEVOLPAD,
          EST.CODVOL
        FROM TGWEXP EXP
        LEFT JOIN TGWEND ED ON ED.CODEND = EXP.CODEND
        JOIN TGFPRO PRO ON PRO.CODPROD = EXP.CODPROD
        LEFT JOIN TGWEST EST ON EST.CODPROD = EXP.CODPROD AND EST.CODEND = EXP.CODEND
        LEFT JOIN TGFVOA VOA ON VOA.CODPROD = EXP.CODPROD AND VOA.CODVOL = EST.CODVOL
        WHERE EXP.CODPROD = ${codProd}
        ORDER BY ED.ENDERECO
      `;
      
      const res = await queryJson('DbExplorerSP.executeQuery', { sql });
      if (res.rows.length > 0) {
        setDadosEndereco(res.rows);
        setEndereco('');
        setModalMode('lista');
        setModalVisible(true);
        
        // Mostrar automaticamente os detalhes do primeiro endereço
        setEnderecoSelecionado(res.rows[0]);
        setDetalhesEnderecoVisivel(true);
      } else {
        Alert.alert('Aviso', 'Nenhum endereço encontrado para este produto');
      }
    } catch (err) {
      console.error('Erro ao buscar endereços:', err);
      Alert.alert('Erro', 'Erro ao buscar endereços do produto');
    } finally {
      setLoading(false);
    }
  };

  const buscarEnderecoEspecifico = async () => {
    if (!endereco.trim() || !codProdSelecionado) return;
    
    try {
      const sql = `
        SELECT 
          EXP.CODPROD,
          PRO.DESCRPROD,
          ED.ENDERECO,
          ED.CODEND,
          VOA.QUANTIDADE,
          EST.ESTOQUE,
          EST.ESTOQUEVOLPAD,
          EST.CODVOL
        FROM TGWEXP EXP
        LEFT JOIN TGWEND ED ON ED.CODEND = EXP.CODEND
        JOIN TGFPRO PRO ON PRO.CODPROD = EXP.CODPROD
        LEFT JOIN TGWEST EST ON EST.CODPROD = EXP.CODPROD AND EST.CODEND = EXP.CODEND
        LEFT JOIN TGFVOA VOA ON VOA.CODPROD = EXP.CODPROD AND VOA.CODVOL = EST.CODVOL
        WHERE EXP.CODPROD = ${codProdSelecionado}
          AND ED.ENDERECO = '${endereco.trim().toUpperCase()}'
      `;
      
      const res = await queryJson('DbExplorerSP.executeQuery', { sql });
      
      if (res.rows.length > 0) {
        setDadosEndereco(res.rows);
        setModalMode('confirmacao');
      } else {
        Alert.alert('Erro', 'Endereço não encontrado. Verifique si digitou corretamente.');
      }
    } catch (err) {
      console.error('Erro ao buscar endereço específico:', err);
      Alert.alert('Erro', 'Erro ao buscar endereço');
    }
  };

  const confirmarRetirada = async () => {
  if (!dadosEndereco.length || codProdSelecionado === null) return;

  // Encontrar o item correspondente na lista de dados
  const itemOP = dados.find(item => item.COD_MP === codProdSelecionado);
  if (!itemOP) {
    Alert.alert('Erro', 'Item não encontrado na OP');
    return;
  }

  const d = dadosEndereco[0];
  const codProd = d[0];
  const descricaoProduto = d[1];
  
  // Extrair a quantidade numérica
  const quantidadeMatch = itemOP.QUANTIDADE.match(/(\d+\.?\d*)/);
  const quantidadeOPNumerica = quantidadeMatch ? parseFloat(quantidadeMatch[1]) : 0;
  const quantidadeOP = quantidadeOPNumerica.toString();
  
  // Extrair a unidade
  const unidadeMatch = itemOP.QUANTIDADE.match(/[a-zA-Z]+$/);
  const codVol = unidadeMatch ? unidadeMatch[0] : itemOP.UNIDADE || 'UN';
  
  const qtdRetirar = quantidadeRetirada;
  const usuario = session?.username || "Usuário";
  const lote = loteRetirada || itemOP.LOTE; // Usar o lote digitado ou o lote da OP

  if (!qtdRetirar) {
    Alert.alert('Erro', 'Quantidade inválida');
    return;
  }

  if (!lote) {
    Alert.alert('Erro', 'Por favor, informe o lote');
    return;
  }

  const qtdRetirarNumerica = parseFloat(qtdRetirar);

  if (qtdRetirarNumerica <= 0) {
    Alert.alert('Erro', 'A quantidade deve ser maior que zero');
    return;
  }

  if (qtdRetirarNumerica < quantidadeOPNumerica) {
    Alert.alert('Erro', `Quantidade solicitada (${qtdRetirar}) é menor que a quantidade da OP (${quantidadeOPNumerica})`);
    return;
  }

  try {
    await registrarRetiradaAlmoxarifado({
      CODPROD: codProd,
      DESCRPROD: descricaoProduto,
      ESTOQUE: quantidadeOP,
      QTDSEPARADA: qtdRetirar,
      USUARIO: usuario,
      OP: Number(idiproc),
      UNIDADE: codVol,
      LOTE: lote // Usar o lote informado
    });

    setDados(prev => prev.map(item => {
      if (item.COD_MP === codProd) {
        return {
          ...item,
          separado: {
            CODPROD: codProd,
            DESCRPROD: descricaoProduto,
            ESTOQUE: quantidadeOP,
            QTDSEPARADA: qtdRetirar,
            USUARIO: usuario,
            OP: Number(idiproc),
            UNIDADE: codVol,
            LOTE: lote
          }
        };
      }
      return item;
    }));

    setModalVisible(false);
    setDadosEndereco([]);
    setEndereco('');
    setQuantidadeRetirada('');
    setLoteRetirada(''); // Limpar o campo do lote
    Alert.alert('Sucesso', 'Retirada registrada com sucesso!');
  } catch (error) {
    console.error('Erro na retirada:', error);
    let errorMessage = 'Falha ao registrar retirada';
    
    if (error instanceof Error) {
      if (error.message.includes('Campos de estoque não compatíveis')) {
        errorMessage = 'Erro de compatibilidade de unidades. Verifique se a quantidade está na unidade correta.';
      } else {
        errorMessage = error.message;
      }
    }
    
    Alert.alert('Erro', errorMessage);
  }
  };

  const buscarSeparacoes = async (idiproc: number) => {
  try {
    const sql = `
      SELECT 
        CODPROD, DESCRPROD, QTDSEPARADA, USUARIO, OP, UNIDADE, LOTE
      FROM AD_ALMOXARIFEWMS
      WHERE OP = ${idiproc}
    `;
    
    const result = await queryJson('DbExplorerSP.executeQuery', { sql });
    
    if (result.rows.length > 0) {
      return result.rows.map((row: any) => ({
        CODPROD: row[0],
        DESCRPROD: row[1],
        QTDSEPARADA: row[2],
        USUARIO: row[3],
        OP: row[4],
        UNIDADE: row[5] || 'UN',
        LOTE: row[6] || '' // Incluir o lote
      }));
    }
    return [];
  } catch (error) {
    console.error('Erro ao buscar separações:', error);
    return [];
  }
  };

  const buscarDados = async () => {
    if (!session?.jsessionid || !idiproc.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setDados([]);
      setSeparacaoIniciada(false);
      setSeparacaoFinalizada(false);
      setPodeSepararItens(false);
      
      const temEmbalagem = await verificarAtividadeEmbalagem(Number(idiproc));
      setTemAtividadeEmbalagem(temEmbalagem);
      
      if (!temEmbalagem) {
        setError('Esta OP não está na fase de EMBALAGEM ou não foi aceita.');
        return;
      }

      const status = await verificarStatusSeparacao(Number(idiproc));
      setSeparacaoIniciada(status.dhInicio !== null);
      setSeparacaoFinalizada(status.dhFinal !== null);
      setPodeSepararItens(status.dhInicio !== null && status.dhFinal === null);

      const sqlQuery = `
        WITH RankedData AS (
          SELECT
            P.IDIPROC,
            PRO.REFERENCIA,
            PRO.DESCRPROD AS PRODUTOPA,
            P.NROLOTE AS LOTE,
            MP.CODPRODMP AS COD_MP,
            MP2.DESCRPROD AS PRODUTOMP,
            CASE
              WHEN (MP.QTDMISTURA * PA.QTDPRODUZIR) < 0.999
                THEN FORMAT((MP.QTDMISTURA * PA.QTDPRODUZIR) * 1000, '0.#######') + ' ' + MP.CODVOL
              ELSE
                FORMAT((MP.QTDMISTURA * PA.QTDPRODUZIR), '0.#######') + ' ' + MP.CODVOL
            END AS QUANTIDADE,
            MP.CODVOL AS UNIDADE,
            MP.AD_SEQUENCIAMP AS SEQUENCIA,
            MP.AD_FASEMP AS FASE,
            MP.AD_TEMPMP AS TEMPERATURA,
            MP.AD_OBS AS OBSERVACAO,
            U.NOMEUSU AS EXECUTANTE,
            ROW_NUMBER() OVER (
              PARTITION BY MP.CODPRODMP
              ORDER BY
                CASE
                  WHEN MP.AD_SEQUENCIAMP IS NULL THEN 1 ELSE 0
                END,
                MP.AD_SEQUENCIAMP DESC
            ) AS rn
          FROM
            TPRIPROC P
          JOIN TPRIPA PA ON P.IDIPROC = PA.IDIPROC
          JOIN (
            SELECT LMP.*
            FROM TPRLMP LMP
            INNER JOIN TPREFX EFX ON EFX.IDEFX = LMP.IDEFX
            WHERE EFX.IDPROC = (
              SELECT MAX(P.IDPROC)
              FROM TPRLPA P
              INNER JOIN TPRPRC PRC2 ON PRC2.IDPROC = P.IDPROC
              WHERE P.CODPRODPA = LMP.CODPRODPA
              AND PRC2.CODUSUALT <> 13
            )
            AND EFX.DESCRICAO = 'EMBALAGEM'
          ) MP ON PA.CODPRODPA = MP.CODPRODPA
          JOIN TGFPRO MP2 ON MP.CODPRODMP = MP2.CODPROD
          JOIN TGFPRO PRO ON PA.CODPRODPA = PRO.CODPROD
          LEFT JOIN TPRIATV A ON P.IDIPROC = A.IDIPROC
          LEFT JOIN TPREFX RF ON A.IDEFX = RF.IDEFX
          LEFT JOIN TSIUSU U ON A.CODEXEC = U.CODUSU
          WHERE
            P.IDIPROC = ${idiproc}
            AND MP.CODPRODMP <> 355
            AND P.STATUSPROC <> 'C'
            AND RF.DESCRICAO IN ('EMBALAGEM')
        )
        SELECT
          IDIPROC, REFERENCIA, PRODUTOPA, LOTE, COD_MP, PRODUTOMP, QUANTIDADE, 
           UNIDADE, SEQUENCIA, FASE, TEMPERATURA, OBSERVACAO, EXECUTANTE
        FROM RankedData
        WHERE rn = 1
        ORDER BY SEQUENCIA
      `;

      const result = await queryJson('DbExplorerSP.executeQuery', { sql: sqlQuery });
      const separacoes = await buscarSeparacoes(Number(idiproc));

      if (result.rows.length > 0) {
        const dadosFormatados = result.rows.map((row: any) => {
          const codProdMP = row[4];
          const separacao = separacoes.find((s: any) => s.CODPROD === codProdMP);
          
          return {
            IDIPROC: row[0],
            REFERENCIA: row[1],
            PRODUTOPA: row[2],
            LOTE: row[3],
            COD_MP: codProdMP,
            PRODUTOMP: row[5],
            QUANTIDADE: row[6],
            UNIDADE: row[8], // Unidade da OP
            SEQUENCIA: row[9],
            FASE: row[10],
            TEMPERATURA: row[11],
            OBSERVACAO: row[12],
            EXECUTANTE: row[13],
            separado: separacao ? {
              CODPROD: separacao.CODPROD,
              DESCRPROD: separacao.DESCRPROD,
              QTDSEPARADA: separacao.QTDSEPARADA,
              USUARIO: separacao.USUARIO,
              OP: separacao.OP,
              UNIDADE: separacao.UNIDADE
            } : undefined
          };
        });
        setDados(dadosFormatados);
      } else {
        setError('Nenhum registro dessa OP em embalagem ou OP inexistente');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar dados');
    } finally {
      setLoading(false);
    }
  };

  const todosItensSeparados = () => {
    if (dados.length === 0) return false;
    return dados.every(item => item.separado);
  };

  return (
  <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="white" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Consulta de OP</Text>
      <TouchableOpacity onPress={() => setModalOpsVisible(true)}>
        <Ionicons name="list" size={24} color="white" />
      </TouchableOpacity>
    </View>

    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.formContainer}>
        <Text style={styles.label}>Número da OP</Text>
        <TextInput
          style={styles.input}
          placeholder="Digite o número da OP"
          placeholderTextColor="#999"
          keyboardType="numeric"
          value={idiproc}
          onChangeText={setIdiproc}
        />
        <TouchableOpacity style={styles.searchButton} onPress={buscarDados} disabled={loading || !idiproc}>
          <Ionicons name="search" size={24} color="white" />
          <Text style={styles.searchButtonText}>{loading ? 'Buscando...' : 'Consultar OP'}</Text>
        </TouchableOpacity>

        <View style={styles.buttonGroup}>
          {/* Mostrar botão Iniciar apenas se DHINICIO for null */}
          {!separacaoIniciada && (
            <TouchableOpacity 
              style={[
                styles.actionButton, 
                !temAtividadeEmbalagem ? styles.actionButtonDisabled : styles.iniciarButton
              ]} 
              onPress={handleIniciarSeparacao} 
              disabled={loading || !temAtividadeEmbalagem || !dados.length}
            >
              <Ionicons name="play" size={20} color="white" />
              <Text style={styles.actionButtonText}>
                {loading ? 'Processando...' : !temAtividadeEmbalagem ? 'OP não está em EMBALAGEM' : 'Iniciar Separação'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Mostrar botão Finalizar apenas se DHINICIO não for null e DHFINAL for null */}
          {separacaoIniciada && !separacaoFinalizada && (
            <TouchableOpacity 
              style={[
                styles.finalizarButton,
                !todosItensSeparados() && styles.actionButtonDisabled
              ]} 
              onPress={handleFinalizarSeparacao} 
              disabled={loading || !todosItensSeparados()}
            >
              <Ionicons name="checkmark" size={20} color="white" />
              <Text style={styles.actionButtonText}>
                {loading ? 'Processando...' : 
                 todosItensSeparados() ? 'Finalizar Separação' : 'Separe todos os itens'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Mostrar mensagem quando separação estiver finalizada */}
          {separacaoFinalizada && (
            <View style={styles.statusMessage}>
              <Ionicons name="checkmark-done" size={20} color="#2e7d32" />
              <Text style={styles.statusMessageText}>Separação finalizada</Text>
            </View>
          )}
        </View>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={dados}
        keyExtractor={(item, index) => index.toString()}
        scrollEnabled={false} // Desabilita scroll pois já está dentro de ScrollView
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.materialCard,
              item.separado && styles.separadoCard,
              !podeSepararItens && styles.itemDisabled
            ]}
            onPress={() => {
              if (!item.separado && podeSepararItens) {
                setCodProdSelecionado(item.COD_MP);
                setEndereco('');
                setModalVisible(true);
                handleItemPress(item)
              }
            }}
          >
            <View style={styles.materialHeader}>
              <Text style={styles.materialValue}>{item.COD_MP} - {item.PRODUTOMP}</Text>
            </View>
            
            <View style={styles.materialHeader}>
              <Text style={styles.loteText}>Lote OP: {item.LOTE}</Text>
              <Text style={styles.materialQuantity}>Qtd OP: {item.QUANTIDADE}</Text>
            </View>

            {item.separado && (
              <View style={styles.separadoContainer}>
                <View style={styles.separadoRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#2e7d32" />
                  <Text style={styles.separadoText}>Separação concluída ({item.separado.UNIDADE})</Text>
                </View>
                <View style={styles.separadoDetails}>
                  <Text style={styles.separadoDetail}>Qtd: {item.separado.QTDSEPARADA} </Text>
                  <Text style={styles.separadoDetail}>Por: {item.separado.USUARIO}</Text>
                  {/* Exibir lote na separação concluída */}
                  {/* <Text style={styles.separadoDetail}>Lote: {item.separado.LOTE}</Text> */}
                </View>
              </View>
            )}
          </TouchableOpacity>
        )}
      />

    </ScrollView>

    {/* Modal para seleção de OP */}
    <Modal visible={modalOpsVisible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            OPs Abertas em Embalagem
          </Text>
          
          {loadingOps ? (
            <ActivityIndicator size="large" color="#4CAF50" />
          ) : opsAbertas.length > 0 ? (
            <FlatList
              data={opsAbertas}
              keyExtractor={(item, index) => index.toString()}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.opItem}
                  onPress={() => selecionarOP(item)}
                >
                  <Text style={styles.opText}>OP: {item.IDIPROC}</Text>
                  <Text style={styles.opDetail}>Ref: {item.REFERENCIA}</Text>
                  <Text style={styles.opDetail}>Produto: {item.PRODUTOPA}</Text>
                  <Text style={styles.opDetail}>Lote: {item.LOTE}</Text>
                </TouchableOpacity>
              )}
            />
          ) : (
            <Text style={styles.noDataText}>
              Nenhuma OP aberta encontrada
            </Text>
          )}
          
          {/* Botão para recarregar a lista */}
          <View style={styles.reloadButton}>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={buscarOpsAbertas}
            >
              <Ionicons name="refresh" size={16} color="white" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>Recarregar </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalOpsVisible(false)}
            >
              <Text style={styles.buttonText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Modal principal */}
    <Modal visible={modalVisible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {loading ? (
            <ActivityIndicator size="large" color="#4CAF50" />
          ) : modalMode === 'confirmacao' ? (
            /* VIEW DE CONFIRMAÇÃO */
            dadosEndereco.length > 0 && dadosEndereco[0] ? (
              <ScrollView style={styles.modalScrollView}>
                <Text style={styles.modalTitle}>
                  Confirmar Retirada
                </Text>
                
                {/* Encontrar o itemOP dentro do modal */}
                {(() => {
                  const itemOPModal = dados.find(item => item.COD_MP === codProdSelecionado);
                  return (
                    <>
                      <Text style={{ marginBottom: 8 }}>
                        <Text style={{ fontWeight: 'bold' }}>Produto:</Text> {dadosEndereco[0][1]}
                      </Text>
                      <Text style={{ marginBottom: 8 }}>
                        <Text style={{ fontWeight: 'bold' }}>Endereço:</Text> {dadosEndereco[0][2]}
                      </Text>
                      <Text style={{ marginBottom: 8 }}>
                        <Text style={{ fontWeight: 'bold' }}>Lote OP:</Text> {itemOPModal?.LOTE || 'N/A'}
                      </Text>
                      <Text style={{ marginBottom: 16 }}>
                        <Text style={{ fontWeight: 'bold' }}>Qtd OP:</Text> {itemOPModal?.QUANTIDADE || 'N/A'}
                      </Text>

                      <TextInput
                        style={styles.input}
                        placeholder="Digite o lote"
                        value={loteRetirada}
                        onChangeText={setLoteRetirada}
                        autoCapitalize="characters"
                      />

                      <TextInput
                        style={styles.input}
                        placeholder={`Quantidade a retirar (${dadosEndereco[0][7]})`}
                        keyboardType="numeric"
                        value={quantidadeRetirada}
                        onChangeText={setQuantidadeRetirada}
                      />

                      <TouchableOpacity
                        style={[
                          styles.confirmButton, 
                          { 
                            opacity: (quantidadeRetirada && loteRetirada) ? 1 : 0.5 
                          }
                        ]}
                        onPress={confirmarRetirada}
                        disabled={!quantidadeRetirada || !loteRetirada}
                      >
                        <Text style={styles.buttonText}>Confirmar Retirada</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => {
                          setModalMode('lista');
                          setEndereco('');
                          setQuantidadeRetirada('');
                          setLoteRetirada('');
                          buscarEnderecosProduto(codProdSelecionado!);
                        }}
                      >
                        <Text style={styles.buttonText}>Voltar</Text>
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </ScrollView>
            ) : (
              <View style={styles.warningContainer}>
                <Ionicons name="warning" size={40} color="#ff9800" />
                <Text style={styles.warningText}>Dados não disponíveis</Text>
              </View>
            )
          ) : (
            /* VIEW DE SELEÇÃO */
            <ScrollView style={styles.modalScrollView}>
              <Text style={styles.modalTitle}>
                {dadosEndereco[0]?.[0] || 'Produto'} - {dadosEndereco[0]?.[1] || 'Produto'}
              </Text>
                {/* Informações detalhadas do endereço selecionado */}
                {detalhesEnderecoVisivel && enderecoSelecionado && (
                  <View style={styles.detalhesEndereco}>
                    <Text style={styles.detalhesTitulo}>Informações do Endereço:</Text>
                      <FlatList
                        data={dadosEndereco}
                        keyExtractor={(item, index) => index.toString()}
                        style={styles.enderecoList}
                        scrollEnabled={false}
                        renderItem={({ item }) => (
                          <TouchableOpacity
                            style={[
                              styles.enderecoItem,
                              enderecoSelecionado === item && styles.enderecoItemSelected
                            ]}
                            onPress={() => {
                              setEnderecoSelecionado(item);
                              setDetalhesEnderecoVisivel(true);
                            }}
                          >
                            <Text style={styles.enderecoText}>📍 {item[2]}</Text>
                          </TouchableOpacity>
                        )}
                      />
                  </View>
                )}

              <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>
                Digite o endereço desejado:
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Digite o endereço completo"
                value={endereco}
                onChangeText={setEndereco}
                autoCapitalize="characters"
              />

              <TouchableOpacity
                style={[styles.searchButton, { marginTop: 16, opacity: endereco ? 1 : 0.5 }]}
                onPress={buscarEnderecoEspecifico}
                disabled={!endereco}
              >
                <Text style={styles.searchButtonText}>Buscar Endereço</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.selectButton,
                  { opacity: enderecoSelecionado ? 1 : 0.5 }
                ]}
                onPress={() => {
                  if (enderecoSelecionado) {
                    setDadosEndereco([enderecoSelecionado]);
                    setModalMode('confirmacao');
                  }
                }}
                disabled={!enderecoSelecionado}
              >
                <Text style={styles.buttonText}>Selecionar Endereço</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setModalVisible(false);
                  setDadosEndereco([]);
                  setEndereco('');
                  setQuantidadeRetirada('');
                  setLoteRetirada('');
                  setDetalhesEnderecoVisivel(false);
                  setEnderecoSelecionado(null);
                }}
              >
                <Text style={styles.buttonText}>Cancelar</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  </SafeAreaView>
);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
   loteText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#4CAF50',
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  formContainer: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
  searchButton: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  searchButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 8,
  },
  iniciarButton: {
    backgroundColor: '#2196F3',
  },
  finalizarButton: {
    flex: 1,
    flexDirection: 'row',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAB243',
  },
  actionButtonDisabled: {
    backgroundColor: '#cccccc',
  },
  materialCard: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  itemDisabled: {
    opacity: 0.6,
    backgroundColor: '#f0f0f0',
  },
  materialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  materialValue: {
    fontWeight: '500',
    color: '#333',
    flex: 1,
    fontSize: 14,
  },
  materialQuantity: {
    fontWeight: 'bold',
    color: '#333',
  },
  separadoCard: {
    backgroundColor: '#e8f5e9',
    borderLeftColor: '#2e7d32',
  },
  separadoContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#c8e6c9',
  },
  separadoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  separadoText: {
    color: '#2e7d32',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  separadoDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  separadoDetail: {
    color: '#2e7d32',
    fontSize: 18,
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#c62828',
    fontWeight: '500',
  },
  statusMessage: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
  },
  statusMessageText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  opItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  opText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#333',
  },
  opDetail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
   detalhesEndereco: {
    backgroundColor: '#f0f8ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#b8daff',
  },
  detalhesTitulo: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 8,
    color: '#004085',
  },
  detalhesLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detalhesLabel: {
    fontWeight: '600',
    color: '#0056b3',
  },
  detalhesValor: {
    color: '#004085',
  },
  enderecoItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    backgroundColor: '#f9f9f9',
    marginBottom: 8,
    borderRadius: 6,
  },
  enderecoItemSelected: {
    backgroundColor: '#e3f2fd',
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  enderecoText: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#333',
  },
  enderecoDetail: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
    modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    width: '95%',
    maxHeight: '95%',
  },
  modalTitle: {
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 15,
    textAlign: 'center',
  },
  modalScrollView: {
    maxHeight: '100%',
  },
  modalList: {
    marginBottom: 15,
  },
  enderecoList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  noDataText: {
    textAlign: 'center',
    marginVertical: 20,
    color: '#666',
  },
  reloadButton: {
    padding: 2,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refreshButton: {
    marginTop: 10,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000FFF',
    padding: 12,
    borderRadius: 8,
  },
  closeButton: {
    marginTop: 10,
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
  },
  confirmButton: {
    marginTop: 16,
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  backButton: {
    marginTop: 10,
    backgroundColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  selectButton: {
    marginTop: 10,
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    marginTop: 10,
    backgroundColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  warningContainer: {
    alignItems: 'center',
    padding: 20,
  },
  warningText: {
    textAlign: 'center',
    marginTop: 10,
    color: '#666',
  },
});