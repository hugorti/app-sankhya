// app/almoxarifado.tsx
// app/almoxarifado.tsx
import { View, Text, StyleSheet, ActivityIndicator, TextInput, TouchableOpacity, ScrollView, SafeAreaView, Modal, Alert, FlatList } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import api, { queryJson, iniciarSeparacao, buscarDadosAtividadeEmbalagem, finalizarAtividadeEmbalagemComSession, atualizarStatusSeparacao, finalizarSeparacaoCompleta } from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DadosSeparacao {
  CODPROD: number;
  DESCRPROD: string;
  ESTOQUE: string;
  QTDSEPARADA: string;
  USUARIO: string;
  OP: number;
  UNIDADE: string;
  LOTE: string;
}

interface EstadoSeparacao {
  USUARIO: string;
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
  emSeparacao?: EstadoSeparacao;
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

  const [endereco, setEndereco] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [dadosEndereco, setDadosEndereco] = useState<any[]>([]);
  const [codProdSelecionado, setCodProdSelecionado] = useState<number | null>(null);
  const [quantidadeRetirada, setQuantidadeRetirada] = useState('');
  const [modalMode, setModalMode] = useState<'lista' | 'confirmacao'>('lista');

  const [opsAbertas, setOpsAbertas] = useState<OPAberta[]>([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [modalOpsVisible, setModalOpsVisible] = useState(false);
  const [detalhesEnderecoVisivel, setDetalhesEnderecoVisivel] = useState(false);
  const [enderecoSelecionado, setEnderecoSelecionado] = useState<any>(null);

  const [loteRetirada, setLoteRetirada] = useState('');
  const [estoqueTotal, setEstoqueTotal] = useState<string>('0');

  const [ideiAtv, setIdeiAtv] = useState<number | null>(null);
  const [idiAtv, setIdiAtv] = useState<number | null>(null);

  const [inicioTimestamp, setInicioTimestamp] = useState<number | null>(null);

  const [progressoFinalizacao, setProgressoFinalizacao] = useState(false);
  const [codigoRegistro, setCodigoRegistro] = useState<number | null>(null);

  const [modalSucessoVisible, setModalSucessoVisible] = useState(false);
const [mensagemSucesso, setMensagemSucesso] = useState('');

  useEffect(() => {
    buscarOpsAbertas();
  }, []);

  const verificarUsuarioSeparando = async (
  codProd: number, 
  op: number
): Promise<string | null> => {
  try {
    const sql = `
      SELECT USUARIO 
      FROM AD_ALMOXARIFEWMS 
      WHERE CODPROD = ${codProd} 
        AND OP = ${op} 
        AND STATUS = '1'
    `;
    
    const result = await queryJson('DbExplorerSP.executeQuery', { sql });
    
    if (result.rows.length > 0 && result.rows[0][0]) {
      return result.rows[0][0];
    }
    return null;
  } catch (error) {
    console.error('Erro ao verificar usuário separando:', error);
    return null;
  }
};

  const handleItemPress = async (item: any) => {
  if (!item.separado && podeSepararItens) {
    const usuarioSeparando = await verificarUsuarioSeparando(item.COD_MP, Number(idiproc));
    
    if (usuarioSeparando && usuarioSeparando !== session?.username) {
      Alert.alert(
        'Item em Separação',
        `Este item está sendo separado por: ${usuarioSeparando}`
      );
      return;
    }

    setCodProdSelecionado(item.COD_MP);
    setEndereco('');
    setModalVisible(true);
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
            const resultado = await iniciarSeparacao({
              IDIPROC: Number(idiproc),
              username: session?.username || ''
            });
            
            setIdeiAtv(resultado.IDEIATV);
            setIdiAtv(resultado.IDIATV);
            
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
    'Tem certeza que deseja finalizar a separação?',
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
            setProgressoFinalizacao(true);

            // 2. BUSCAR TODOS OS DADOS NECESSÁRIOS DE UMA VEZ
            console.log('Buscando dados da atividade de embalagem...');
            const dadosAtividade = await buscarDadosAtividadeEmbalagem(Number(idiproc));
            
            if (!dadosAtividade) {
              throw new Error('Dados da atividade de embalagem não encontrados');
            }

            if (!dadosAtividade.IDIATV || !dadosAtividade.IDEFX || !dadosAtividade.IDPROC) {
              throw new Error('Dados incompletos da atividade de embalagem');
            }

            console.log('Dados encontrados:', dadosAtividade);

            const sessionStorage = await AsyncStorage.getItem('sankhya_session');
            if (!sessionStorage) {
              throw new Error('Sessão não encontrada. Faça login novamente.');
            }

            const sessionData = JSON.parse(sessionStorage);
            const jsessionid = sessionData.jsessionid;

            if (!jsessionid) {
              throw new Error('Session ID não encontrado');
            }

            console.log('Finalizando atividade de embalagem...');
            const resultado = await finalizarAtividadeEmbalagemComSession({
              IDIPROC: Number(idiproc),
              IDEFX: dadosAtividade.IDEFX,
              IDIATV: dadosAtividade.IDIATV,
              IDPROC: dadosAtividade.IDPROC,
              jsessionid: jsessionid
            });

            console.log('Resultado completo:', resultado);

            // VERIFICAR SE A ATUALIZAÇÃO DAS QUANTIDADES FOI BEM-SUCEDIDA
            if (resultado.atualizacaoNota) {
              if (resultado.atualizacaoNota.success) {
                console.log('✅ Quantidades atualizadas com sucesso!');
                if (resultado.atualizacaoNota.itensAtualizados > 0) {
                  setMensagemSucesso('Separação finalizada com sucesso! e movimento criado.');
                } else {
                  setMensagemSucesso('Separação finalizada! Nenhuma quantidade separada para atualizar.');
                }
                setModalSucessoVisible(true);
              } else {
                console.warn('⚠️ Atividade finalizada, mas falha na atualização:', resultado.atualizacaoNota.message);
                Alert.alert('Atenção', `Atividade finalizada, mas: ${resultado.atualizacaoNota.message}`);
              }
            } else {
              setMensagemSucesso('Separação finalizada com sucesso!');
              setModalSucessoVisible(true);
            }
            
            setDados([]);
            setIdiproc('');
            setIdeiAtv(null);
            setIdiAtv(null);
            setInicioTimestamp(null);

          } catch (error: any) {
            // console.error('Erro ao finalizar separação:', error);
            Alert.alert('Erro', error instanceof Error ? error.message : 'Falha ao finalizar separação');
          } finally {
            setLoading(false);
            setProgressoFinalizacao(false);
          }
        }
      }
    ]
  );
};

 const buscarEnderecosProduto = async (codProd: number) => {
  try {
    setLoading(true);
    
    // SQL para buscar todos os endereços do produto
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
    
    // 3 SCRIPTS SEPARADOS - UM PARA CADA LOCAL
    const sqlAlmox = `
      SELECT SUM(ESTOQUE) as TOTAL_ESTOQUE 
      FROM TGFEST 
      WHERE CODPROD = ${codProd} 
      AND CODLOCAL = 50000000
    `;
    
    const sqlGP1 = `
      SELECT SUM(ESTOQUE) as TOTAL_ESTOQUE 
      FROM TGFEST 
      WHERE CODPROD = ${codProd} 
      AND CODLOCAL = 120000000
    `;
    
    const sqlGP2 = `
      SELECT SUM(ESTOQUE) as TOTAL_ESTOQUE 
      FROM TGFEST 
      WHERE CODPROD = ${codProd} 
      AND CODLOCAL = 130000000
    `;
    
    const sqlTotal = `
      SELECT SUM(ESTOQUE) as TOTAL_ESTOQUE 
      FROM TGFEST 
      WHERE CODPROD = ${codProd} 
      AND CODLOCAL IN (50000000, 120000000, 130000000)
    `;
    
    // Executar todas as consultas em paralelo
    const [resultAlmox, resultGP1, resultGP2, resultTotal] = await Promise.all([
      queryJson('DbExplorerSP.executeQuery', { sql: sqlAlmox }),
      queryJson('DbExplorerSP.executeQuery', { sql: sqlGP1 }),
      queryJson('DbExplorerSP.executeQuery', { sql: sqlGP2 }),
      queryJson('DbExplorerSP.executeQuery', { sql: sqlTotal })
    ]);
    
    // Processar resultados
    const getEstoque = (result: any) => {
      return result.rows.length > 0 && result.rows[0][0] !== null 
        ? parseFloat(result.rows[0][0]) 
        : 0;
    };
    
    const estoqueAlmox = getEstoque(resultAlmox);
    const estoqueGP1 = getEstoque(resultGP1);
    const estoqueGP2 = getEstoque(resultGP2);
    const estoqueTotal = getEstoque(resultTotal);
    
    setEstoqueTotal(estoqueTotal.toString());
    
    if (res.rows.length > 0) {
      // Adicionar informações dos estoques individuais aos dados
      const dadosComEstoques = res.rows.map((row: any) => ({
        ...row,
        ESTOQUE_ALMOX: estoqueAlmox,
        ESTOQUE_GP1: estoqueGP1,
        ESTOQUE_GP2: estoqueGP2,
        ESTOQUE_TOTAL: estoqueTotal
      }));
      
      setDadosEndereco(dadosComEstoques);
      setEndereco('');
      setModalMode('lista');
      setModalVisible(true);
      
      setEnderecoSelecionado(dadosComEstoques[0]);
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

const selecionarEndereco = async () => {
  if (enderecoSelecionado) {
    try {
      const usuario = session?.username || "Usuário";
      
      const usuarioSeparando = await verificarUsuarioSeparando(codProdSelecionado!, Number(idiproc));
      
      if (usuarioSeparando && usuarioSeparando !== usuario) {
        Alert.alert(
          'Item já em separação',
          `Este item está sendo separado por: ${usuarioSeparando}`
        );
        return;
      }

      const resultado = await atualizarStatusSeparacao(
        codProdSelecionado!, 
        1, 
        usuario, 
        Number(idiproc)
      );
      
      let codigoRegistroExtraido = null;
      
      if (resultado.responseBody && resultado.responseBody.entities) {
        if (resultado.responseBody.entities.entity && 
            resultado.responseBody.entities.entity.CODIGO && 
            resultado.responseBody.entities.entity.CODIGO["$"]) {
          codigoRegistroExtraido = resultado.responseBody.entities.entity.CODIGO["$"];
        }
      }
      
      if (!codigoRegistroExtraido) {
        throw new Error('Não foi possível extrair o código do registro');
      }
      
      setCodigoRegistro(codigoRegistroExtraido);
      setDadosEndereco([enderecoSelecionado]);
      setModalMode('confirmacao');
      
      setDados(prev => prev.map(item => {
        if (item.COD_MP === codProdSelecionado) {
          return {
            ...item,
            emSeparacao: {
              USUARIO: usuario
            }
          };
        }
        return item;
      }));
      
    } catch (error) {
      // console.error('Erro ao bloquear item:', error);
      Alert.alert('Erro', 'Falha ao iniciar separação: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    }
  }
};

const confirmarRetirada = async () => {
    if (!dadosEndereco.length || codProdSelecionado === null) return;

    const itemOP = dados.find(item => item.COD_MP === codProdSelecionado);
    if (!itemOP) {
      Alert.alert('Erro', 'Item não encontrado na OP');
      return;
    }

    const d = dadosEndereco[0];
    const codProd = d[0];
    const descricaoProduto = d[1];
    
    const quantidadeMatch = itemOP.QUANTIDADE.match(/(\d+[,.]?\d*)\s*([a-zA-Z]*)/);
    
    const quantidadeOPString = quantidadeMatch ? quantidadeMatch[1].replace(',', '.') : '0';
    const quantidadeOPNumerica = parseFloat(quantidadeOPString) || 0;
    const unidadeOP = quantidadeMatch ? quantidadeMatch[2] : itemOP.UNIDADE || 'UN';
    
    const quantidadeOPOriginal = itemOP.QUANTIDADE;
    
    const qtdRetirar = quantidadeRetirada;
    const usuario = session?.username || "Usuário";
    const lote = loteRetirada || itemOP.LOTE;

    if (!qtdRetirar) {
      Alert.alert('Erro', 'Quantidade inválida');
      return;
    }

    if (!lote) {
      Alert.alert('Erro', 'Por favor, informe o lote');
      return;
    }

    const parts = qtdRetirar.split('.');
    // ALTERADO: Agora permite até 4 casas decimais
    if (parts.length === 2 && parts[1].length > 4) {
      Alert.alert(
        'Formato incorreto',
        `A quantidade deve ter no máximo 4 casas decimais após o ponto.\nExemplo: 1.1234`
      );
      return;
    }

    const qtdRetirarNumerica = parseFloat(qtdRetirar);

    if (isNaN(qtdRetirarNumerica) || qtdRetirarNumerica <= 0) {
      Alert.alert('Erro', 'A quantidade deve ser maior que zero');
      return;
    }

    if (qtdRetirarNumerica < quantidadeOPNumerica) {
      Alert.alert(
        'Erro', 
        `Quantidade solicitada (${qtdRetirar}) é menor que a quantidade da OP (${quantidadeOPOriginal})`
      );
      return;
    }

    try {
      const sqlTotal = `
        SELECT SUM(ESTOQUE) as TOTAL_ESTOQUE 
        FROM TGFEST 
        WHERE CODPROD = ${codProd} 
        AND CODLOCAL IN (50000000, 120000000, 130000000)
      `;

      const resultEstoque = await queryJson('DbExplorerSP.executeQuery', { sql: sqlTotal });

      let estoqueDisponivel = 0;
      if (resultEstoque.rows.length > 0 && resultEstoque.rows[0][0] !== null) {
        estoqueDisponivel = parseFloat(resultEstoque.rows[0][0]);
      }

      if (qtdRetirarNumerica > estoqueDisponivel) {
        Alert.alert(
          'Estoque insuficiente',
          `Quantidade solicitada: ${qtdRetirar}\nEstoque disponível: ${estoqueDisponivel.toFixed(4)}\n\nNão há estoque suficiente para realizar a retirada.`
        );
        return;
      }

    } catch (error) {
      console.error('Erro ao consultar estoque:', error);
      Alert.alert('Erro', 'Não foi possível verificar o estoque disponível');
      return;
    }

    try {
      if (!codigoRegistro) {
        throw new Error('Código do registro não encontrado');
      }

      await finalizarSeparacaoCompleta({
        CODIGO: codigoRegistro,
        CODPROD: codProd,
        DESCRPROD: descricaoProduto,
        ESTOQUE: quantidadeOPOriginal,
        QTDSEPARADA: qtdRetirar,
        USUARIO: usuario,
        OP: Number(idiproc),
        UNIDADE: unidadeOP,
        LOTE: lote,
        STATUS: "2"
      });

      setDados(prev => prev.map(item => {
        if (item.COD_MP === codProd) {
          return {
            ...item,
            separado: {
              CODPROD: codProd,
              DESCRPROD: descricaoProduto,
              ESTOQUE: quantidadeOPOriginal,
              QTDSEPARADA: qtdRetirar,
              USUARIO: usuario,
              OP: Number(idiproc),
              UNIDADE: unidadeOP,
              LOTE: lote
            },
            emSeparacao: undefined
          };
        }
        return item;
      }));

      setModalVisible(false);
      setDadosEndereco([]);
      setEndereco('');
      setQuantidadeRetirada('');
      setLoteRetirada('');
      setCodigoRegistro(null);
      Alert.alert('Sucesso', 'Retirada registrada com sucesso!');
    } catch (error) {
      console.error('Erro na retirada:', error);
      let errorMessage = 'Falha ao registrar retirada';
      
      if (error instanceof Error) {
        errorMessage = error.message;
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
      WHERE OP = ${idiproc} AND STATUS = '2'
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
        LOTE: row[6] || ''
      }));
    }
    return [];
  } catch (error) {
    console.error('Erro ao buscar separações:', error);
    return [];
  }
};

const buscarSeparacoesEmAndamento = async (idiproc: number) => {
  try {
    const sql = `
      SELECT 
        CODPROD, USUARIO
      FROM AD_ALMOXARIFEWMS
      WHERE OP = ${idiproc} AND STATUS = '1'
    `;
    
    const result = await queryJson('DbExplorerSP.executeQuery', { sql });
    
    if (result.rows.length > 0) {
      return result.rows.map((row: any) => ({
        CODPROD: row[0],
        USUARIO: row[1]
      }));
    }
    return [];
  } catch (error) {
    console.error('Erro ao buscar separações em andamento:', error);
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

    // Buscar itens em separação (status = 1)
    const separacoesEmAndamento = await buscarSeparacoesEmAndamento(Number(idiproc));

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
            WHEN (MP.QTDMISTURA * PA.QTDPRODUZIR) < 0
              THEN REPLACE(FORMAT((MP.QTDMISTURA * PA.QTDPRODUZIR) * 1000, '#,0.####', 'de-DE'), ',', '.') 
                  + ' ' + MP.CODVOL
            ELSE
              REPLACE(FORMAT((MP.QTDMISTURA * PA.QTDPRODUZIR), '#,0.####', 'de-DE'), ',', '.') 
                  + ' ' + MP.CODVOL
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
        const emSeparacao = separacoesEmAndamento.find((s: any) => s.CODPROD === codProdMP);
        
        return {
          IDIPROC: row[0],
          REFERENCIA: row[1],
          PRODUTOPA: row[2],
          LOTE: row[3],
          COD_MP: codProdMP,
          PRODUTOMP: row[5],
          QUANTIDADE: row[6],
          UNIDADE: row[8],
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
          } : undefined,
          emSeparacao: emSeparacao ? {
            USUARIO: emSeparacao.USUARIO
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
      scrollEnabled={false}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[
            styles.materialCard,
            // Aplica laranja apenas se estiver em separação E NÃO separado
            (item.emSeparacao && !item.separado) && styles.emSeparacaoCard,
            // Aplica verde se estiver separado (sobrescreve o laranja se necessário)
            item.separado && styles.separadoCard,
            // Adiciona estilo de desabilitado se não pode separar
            !podeSepararItens && styles.itemDisabled
          ]}
          onPress={() => handleItemPress(item)}
          // disabled={!podeSepararItens || item.emSeparacao || item.separado}
        >
          <View style={styles.materialHeader}>
            <Text style={styles.materialValue}>{item.COD_MP} - {item.PRODUTOMP}</Text>
          </View>
          
          <View style={styles.materialHeader}>
            <Text style={styles.loteText}>Lote OP: {item.LOTE}</Text>
            <Text style={styles.materialQuantity}>Qtd OP: {item.QUANTIDADE}</Text>
          </View>

          {item.emSeparacao && !item.separado && (
            <View style={styles.emSeparacaoContainer}>
              <Ionicons name="lock-closed" size={16} color="#ff9800" />
              <Text style={styles.emSeparacaoText}>
                Em separação por: {item.emSeparacao.USUARIO}
              </Text>
            </View>
          )}
          
          {item.separado && (
            <View style={styles.separadoContainer}>
              <View style={styles.separadoRow}>
                <Ionicons name="checkmark-circle" size={16} color="#2e7d32" />
                <Text style={styles.separadoText}>Separação concluída ({item.separado.UNIDADE})</Text>
              </View>
              <View style={styles.separadoDetails}>
                <Text style={styles.separadoDetail}>Qtd: {item.separado.QTDSEPARADA} </Text>
                <Text style={styles.separadoDetail}>Por: {item.separado.USUARIO}</Text>
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
            dadosEndereco.length > 0 && dadosEndereco[0] ? (
              <ScrollView style={styles.modalScrollView}>
                <Text style={styles.modalTitle}>
                  Confirmar Retirada
                </Text>
                
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
                      <Text style={{ marginBottom: 16 }}>
                        <Text style={{ fontWeight: 'bold' }}>Qtd OP:</Text> {itemOPModal?.QUANTIDADE || 'N/A'}
                      </Text>
                      <View >
                        <Text style={{ fontWeight: 'bold' }}>Estoques por Local:</Text>
                        <Text >
                          📦 Almox (50000000): {dadosEndereco[0]?.ESTOQUE_ALMOX?.toFixed(4) || '0.0000'}
                        </Text>
                        <Text >
                          📦 GP1 (120000000): {dadosEndereco[0]?.ESTOQUE_GP1?.toFixed(4) || '0.0000'}
                        </Text>
                        <Text >
                          📦 GP2 (130000000): {dadosEndereco[0]?.ESTOQUE_GP2?.toFixed(4) || '0.0000'}
                        </Text>
                      </View>

                      <Text style={{ marginBottom: 16, fontWeight: 'bold', color: '#1976d2' }}>
                        📊 Estoque Total: {dadosEndereco[0]?.ESTOQUE_TOTAL?.toFixed(4) || '0.0000'}
                      </Text>
                      {/* <Text style={{ marginBottom: 16, color: '#1976d2', fontWeight: 'bold' }}>
                        <Text style={{ fontWeight: 'bold' }}>Máximo Permitido:</Text> {(
                          parseFloat((itemOPModal?.QUANTIDADE || '0').replace(',', '.')) * 2
                        ).toFixed(3)}
                      </Text> */}

                      <TextInput
                        style={styles.input}
                        placeholder="Digite o lote"
                        keyboardType="numeric"
                        value={loteRetirada}
                        onChangeText={setLoteRetirada}
                        autoCapitalize="characters"
                      />

                      <TextInput
                          style={styles.input}
                          placeholder={`Qtd a retirar (máx: ${dadosEndereco[0]?.ESTOQUE_TOTAL?.toFixed(4) || '0.0000'})`}
                          keyboardType="numeric"
                          value={quantidadeRetirada}
                          onChangeText={(text) => {
                            let formattedText = text.replace(',', '.');
                            formattedText = formattedText.replace(/[^0-9.]/g, '');
                            
                            const parts = formattedText.split('.');
                            if (parts.length > 2) {
                              formattedText = parts[0] + '.' + parts.slice(1).join('');
                            }
                            
                            // ALTERADO: Permite até 4 casas decimais
                            if (parts.length === 2) {
                              if (parts[1].length > 4) {
                                formattedText = parts[0] + '.' + parts[1].substring(0, 4);
                              }
                            }
                            
                            setQuantidadeRetirada(formattedText);
                          }}
                          onBlur={() => {
                            const parts = quantidadeRetirada.split('.');
                            // ALTERADO: Aviso para máximo de 4 casas decimais
                            if (parts.length === 2 && parts[1].length > 4) {
                              Alert.alert(
                                'Formato incorreto',
                                `A quantidade deve ter no máximo 4 casas decimais após o ponto.\nExemplo: 1.1234`
                              );
                              setQuantidadeRetirada('');
                            }
                          }}
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
            <ScrollView style={styles.modalScrollView}>
              <Text style={styles.modalTitle}>
                {dadosEndereco[0]?.[0] || 'Produto'} - {dadosEndereco[0]?.[1] || 'Produto'}
              </Text>
              
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

              <TouchableOpacity
                style={[
                  styles.selectButton,
                  { opacity: enderecoSelecionado ? 1 : 0.5 }
                ]}
                onPress={selecionarEndereco}
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

    {/* Modal de Sucesso */}
<Modal
  animationType="fade"
  transparent={true}
  visible={modalSucessoVisible}
  onRequestClose={() => setModalSucessoVisible(false)}
>
  <View style={styles.modalSucessoContainer}>
    <View style={styles.modalSucessoContent}>
      {/* Ícone de confirmação */}
      <View style={styles.sucessoIconContainer}>
        <Ionicons name="checkmark-circle" size={60} color="#2e7d32" />
      </View>
      
      {/* Mensagem */}
      <Text style={styles.sucessoTitle}>Sucesso!</Text>
      <Text style={styles.sucessoMessage}>{mensagemSucesso}</Text>
      
      {/* Botão de OK */}
      <TouchableOpacity 
        style={styles.sucessoButton}
        onPress={() => {
          setModalSucessoVisible(false);
          // Opcional: navegar para outra tela ou resetar estado
          router.back();
        }}
      >
        <Text style={styles.sucessoButtonText}>OK</Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>

    {progressoFinalizacao && (
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.progressText}>Finalizando separação...</Text>
        </View>
      </View>
    )}
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
   modalSucessoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalSucessoContent: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 25,
    alignItems: 'center',
    width: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  sucessoIconContainer: {
    marginBottom: 15,
  },
  sucessoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 10,
  },
  sucessoMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
    lineHeight: 22,
  },
  sucessoButton: {
    backgroundColor: '#2e7d32',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  sucessoButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
   loteText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  progressContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  progressBar: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
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
    marginBottom: 8,
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
    padding: 6,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FAB243',
    backgroundColor: '#fff8e1',
  },
  detalhesTitulo: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 8,
    color: '#FAB243',
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
    backgroundColor: '#FAB243',
    borderLeftWidth: 4,
    borderLeftColor: '#ffcd2b',
  },
  enderecoText: {
    fontWeight: 'bold',
    fontSize: 20,
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
    marginBottom: 4,
    
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
  emSeparacaoCard: {
    backgroundColor: '#fff3e0',
    borderLeftColor: '#ff9800',
  },
  emSeparacaoContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ffe0b2',
    flexDirection: 'row',
    alignItems: 'center',
  },
  emSeparacaoText: {
    color: '#ff9800',
    fontSize: 14,
    marginLeft: 4,
    fontWeight: '500',
  },

});