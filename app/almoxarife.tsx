// app/almoxarifado.tsx

import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Modal,
  Alert,
} from 'react-native';

import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  queryJson,
  iniciarSeparacao,
  buscarDadosAtividadeEmbalagem,
  finalizarAtividadeEmbalagemComSession,
  atualizarStatusSeparacao,
  finalizarSeparacaoCompleta,
} from '@/services/api';
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
  const [estoqueTotal, setEstoqueTotal] = useState('0');

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

  // ============================================================
  // VERIFICAR USUÁRIO QUE ESTÁ SEPARANDO
  // ============================================================

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

      const result = await queryJson(
        'DbExplorerSP.executeQuery',
        { sql }
      );

      if (result.rows.length > 0 && result.rows[0][0]) {
        return result.rows[0][0];
      }

      return null;
    } catch (error) {
      console.error('Erro ao verificar usuário separando:', error);
      return null;
    }
  };

  // ============================================================
  // CLICAR NO ITEM
  // ============================================================

  const handleItemPress = async (item: DadosAlmoxarifado) => {
    if (!item.separado && podeSepararItens) {
      const usuarioSeparando = await verificarUsuarioSeparando(
        item.COD_MP,
        Number(idiproc)
      );

      if (
        usuarioSeparando &&
        usuarioSeparando !== session?.username
      ) {
        Alert.alert(
          'Item em Separação',
          `Este item está sendo separado por:\n${usuarioSeparando}`
        );

        return;
      }

      setCodProdSelecionado(item.COD_MP);
      setEndereco('');
      setModalVisible(true);

      await buscarEnderecosProduto(item.COD_MP);
    }
  };

  // ============================================================
  // BUSCAR OPS ABERTAS
  // ============================================================

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
        JOIN TPRIPA PA
          ON P.IDIPROC = PA.IDIPROC
        JOIN TGFPRO PRO
          ON PA.CODPRODPA = PRO.CODPROD
        JOIN TPRIATV ATV
          ON P.IDIPROC = ATV.IDIPROC
        JOIN TPREFX FX
          ON FX.IDEFX = ATV.IDEFX
        WHERE FX.DESCRICAO = 'EMBALAGEM'
          AND ATV.DHACEITE IS NOT NULL
          AND ATV.DHINICIO IS NULL
          AND ATV.DHFINAL IS NULL
          AND P.STATUSPROC <> 'C'
        ORDER BY P.IDIPROC DESC
      `;

      const result = await queryJson(
        'DbExplorerSP.executeQuery',
        { sql }
      );

      if (result.rows.length > 0) {
        const ops = result.rows.map((row: any) => ({
          IDIPROC: row[0],
          REFERENCIA: row[1],
          PRODUTOPA: row[2],
          LOTE: row[3],
        }));

        setOpsAbertas(ops);
        setModalOpsVisible(true);
      } else {
        setOpsAbertas([]);
      }
    } catch (error) {
      console.error('Erro ao buscar OPs abertas:', error);
      setError('Erro ao carregar OPs abertas');
    } finally {
      setLoadingOps(false);
    }
  };

  // ============================================================
  // SELECIONAR OP
  // ============================================================

  const selecionarOP = (op: OPAberta) => {
    setIdiproc(op.IDIPROC.toString());
    setModalOpsVisible(false);

    setTimeout(() => {
      buscarDados(op.IDIPROC.toString());
    }, 100);
  };

  // ============================================================
  // VERIFICAR ATIVIDADE
  // ============================================================

  const verificarAtividadeEmbalagem = async (
    idiproc: number
  ): Promise<boolean> => {
    try {
      const sql = `
        SELECT
          ATV.IDIPROC,
          ATV.IDIATV,
          ATV.IDEFX,
          ATV.DHACEITE,
          ATV.DHINICIO,
          ATV.DHFINAL,
          FX.DESCRICAO
        FROM TPRIATV ATV
        JOIN TPREFX FX
          ON FX.IDEFX = ATV.IDEFX
        WHERE ATV.IDIPROC = ${idiproc}
          AND FX.DESCRICAO = 'EMBALAGEM'
          AND ATV.DHACEITE IS NOT NULL
      `;

      const result = await queryJson(
        'DbExplorerSP.executeQuery',
        { sql }
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error(
        'Erro ao verificar atividade de embalagem:',
        error
      );

      return false;
    }
  };

  // ============================================================
  // STATUS DA SEPARAÇÃO
  // ============================================================

  const verificarStatusSeparacao = async (
    idiproc: number
  ) => {
    try {
      const sql = `
        SELECT
          ATV.DHINICIO,
          ATV.DHFINAL
        FROM TPRIATV ATV
        JOIN TPREFX FX
          ON FX.IDEFX = ATV.IDEFX
        WHERE ATV.IDIPROC = ${idiproc}
          AND FX.DESCRICAO = 'EMBALAGEM'
      `;

      const result = await queryJson(
        'DbExplorerSP.executeQuery',
        { sql }
      );

      if (result.rows.length > 0) {
        return {
          dhInicio: result.rows[0][0],
          dhFinal: result.rows[0][1],
        };
      }

      return {
        dhInicio: null,
        dhFinal: null,
      };
    } catch (error) {
      console.error(
        'Erro ao verificar status da separação:',
        error
      );

      return {
        dhInicio: null,
        dhFinal: null,
      };
    }
  };

  // ============================================================
  // INICIAR SEPARAÇÃO
  // ============================================================

  const handleIniciarSeparacao = async () => {
    if (!idiproc) {
      Alert.alert(
        'Erro',
        'Informe o número da OP primeiro'
      );

      return;
    }

    Alert.alert(
      'Confirmação',
      'Deseja iniciar a separação?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              setLoading(true);

              const resultado = await iniciarSeparacao({
                IDIPROC: Number(idiproc),
                username: session?.username || '',
              });

              setIdeiAtv(resultado.IDEIATV);
              setIdiAtv(resultado.IDIATV);

              setSeparacaoIniciada(true);
              setPodeSepararItens(true);

              Alert.alert(
                'Sucesso',
                'Separação iniciada!'
              );
            } catch (error) {
              console.error(
                'Erro ao iniciar separação:',
                error
              );

              Alert.alert(
                'Erro',
                error instanceof Error
                  ? error.message
                  : 'Falha ao iniciar separação'
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // ============================================================
  // FINALIZAR SEPARAÇÃO
  // ============================================================

  const handleFinalizarSeparacao = async () => {
    if (!idiproc) {
      Alert.alert(
        'Erro',
        'Informe o número da OP primeiro'
      );

      return;
    }

    Alert.alert(
      'Confirmação',
      'Deseja finalizar a separação?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              setLoading(true);
              setProgressoFinalizacao(true);

              const dadosAtividade =
                await buscarDadosAtividadeEmbalagem(
                  Number(idiproc)
                );

              if (!dadosAtividade) {
                throw new Error(
                  'Dados da atividade de embalagem não encontrados'
                );
              }

              if (
                !dadosAtividade.IDIATV ||
                !dadosAtividade.IDEFX ||
                !dadosAtividade.IDPROC
              ) {
                throw new Error(
                  'Dados incompletos da atividade de embalagem'
                );
              }

              const sessionStorage =
                await AsyncStorage.getItem(
                  'sankhya_session'
                );

              if (!sessionStorage) {
                throw new Error(
                  'Sessão não encontrada. Faça login novamente.'
                );
              }

              const sessionData =
                JSON.parse(sessionStorage);

              const jsessionid =
                sessionData.jsessionid;

              if (!jsessionid) {
                throw new Error(
                  'Session ID não encontrado'
                );
              }

              const resultado =
                await finalizarAtividadeEmbalagemComSession({
                  IDIPROC: Number(idiproc),
                  IDEFX: dadosAtividade.IDEFX,
                  IDIATV: dadosAtividade.IDIATV,
                  IDPROC: dadosAtividade.IDPROC,
                  jsessionid,
                });

              if (resultado.atualizacaoNota) {
                if (
                  resultado.atualizacaoNota.success
                ) {
                  if (
                    resultado.atualizacaoNota
                      .itensAtualizados > 0
                  ) {
                    setMensagemSucesso(
                      'Separação finalizada com sucesso!\n\nMovimento criado.'
                    );
                  } else {
                    setMensagemSucesso(
                      'Separação finalizada!\n\nNenhuma quantidade separada para atualizar.'
                    );
                  }

                  setModalSucessoVisible(true);
                } else {
                  Alert.alert(
                    'Atenção',
                    `Atividade finalizada, mas: ${resultado.atualizacaoNota.message}`
                  );
                }
              } else {
                setMensagemSucesso(
                  'Separação finalizada com sucesso!'
                );

                setModalSucessoVisible(true);
              }

              setDados([]);
              setIdiproc('');
              setIdeiAtv(null);
              setIdiAtv(null);
              setInicioTimestamp(null);
              setSeparacaoIniciada(false);
              setSeparacaoFinalizada(false);
              setPodeSepararItens(false);

            } catch (error: any) {
              Alert.alert(
                'Erro',
                error instanceof Error
                  ? error.message
                  : 'Falha ao finalizar separação'
              );
            } finally {
              setLoading(false);
              setProgressoFinalizacao(false);
            }
          },
        },
      ]
    );
  };

  // ============================================================
  // BUSCAR ENDEREÇOS
  // ============================================================

  const buscarEnderecosProduto = async (
    codProd: number
  ) => {
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
        LEFT JOIN TGWEND ED
          ON ED.CODEND = EXP.CODEND
        JOIN TGFPRO PRO
          ON PRO.CODPROD = EXP.CODPROD
        LEFT JOIN TGWEST EST
          ON EST.CODPROD = EXP.CODPROD
         AND EST.CODEND = EXP.CODEND
        LEFT JOIN TGFVOA VOA
          ON VOA.CODPROD = EXP.CODPROD
         AND VOA.CODVOL = EST.CODVOL
        WHERE EXP.CODPROD = ${codProd}
        ORDER BY ED.ENDERECO
      `;

      const res = await queryJson(
        'DbExplorerSP.executeQuery',
        { sql }
      );

      const sqlAlmox = `
        SELECT SUM(ESTOQUE)
        FROM TGFEST
        WHERE CODPROD = ${codProd}
          AND CODLOCAL = 50000000
      `;

      const sqlGP1 = `
        SELECT SUM(ESTOQUE)
        FROM TGFEST
        WHERE CODPROD = ${codProd}
          AND CODLOCAL = 120000000
      `;

      const sqlGP2 = `
        SELECT SUM(ESTOQUE)
        FROM TGFEST
        WHERE CODPROD = ${codProd}
          AND CODLOCAL = 130000000
      `;

      const sqlTotal = `
        SELECT SUM(ESTOQUE)
        FROM TGFEST
        WHERE CODPROD = ${codProd}
          AND CODLOCAL IN (
            50000000,
            120000000,
            130000000
          )
      `;

      const [
        resultAlmox,
        resultGP1,
        resultGP2,
        resultTotal,
      ] = await Promise.all([
        queryJson(
          'DbExplorerSP.executeQuery',
          { sql: sqlAlmox }
        ),
        queryJson(
          'DbExplorerSP.executeQuery',
          { sql: sqlGP1 }
        ),
        queryJson(
          'DbExplorerSP.executeQuery',
          { sql: sqlGP2 }
        ),
        queryJson(
          'DbExplorerSP.executeQuery',
          { sql: sqlTotal }
        ),
      ]);

      const getEstoque = (result: any) => {
        if (
          result.rows.length > 0 &&
          result.rows[0][0] !== null
        ) {
          return parseFloat(result.rows[0][0]);
        }

        return 0;
      };

      const estoqueAlmox =
        getEstoque(resultAlmox);

      const estoqueGP1 =
        getEstoque(resultGP1);

      const estoqueGP2 =
        getEstoque(resultGP2);

      const estoqueTotal =
        getEstoque(resultTotal);

      setEstoqueTotal(
        estoqueTotal.toString()
      );

      if (res.rows.length > 0) {
        const dadosComEstoques =
          res.rows.map((row: any) => ({
            ...row,
            ESTOQUE_ALMOX: estoqueAlmox,
            ESTOQUE_GP1: estoqueGP1,
            ESTOQUE_GP2: estoqueGP2,
            ESTOQUE_TOTAL: estoqueTotal,
          }));

        setDadosEndereco(dadosComEstoques);
        setEndereco('');

        setModalMode('lista');
        setEnderecoSelecionado(
          dadosComEstoques[0]
        );
        setDetalhesEnderecoVisivel(true);
      } else {
        Alert.alert(
          'Aviso',
          'Nenhum endereço encontrado para este produto'
        );
      }
    } catch (err) {
      console.error(
        'Erro ao buscar endereços:',
        err
      );

      Alert.alert(
        'Erro',
        'Erro ao buscar endereços do produto'
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // SELECIONAR ENDEREÇO
  // ============================================================

  const selecionarEndereco = async () => {
    if (!enderecoSelecionado) {
      return;
    }

    try {
      const usuario =
        session?.username || 'Usuário';

      const usuarioSeparando =
        await verificarUsuarioSeparando(
          codProdSelecionado!,
          Number(idiproc)
        );

      if (
        usuarioSeparando &&
        usuarioSeparando !== usuario
      ) {
        Alert.alert(
          'Item já em separação',
          `Este item está sendo separado por:\n${usuarioSeparando}`
        );

        return;
      }

      const resultado =
        await atualizarStatusSeparacao(
          codProdSelecionado!,
          1,
          usuario,
          Number(idiproc)
        );

      let codigoRegistroExtraido: any = null;

      if (
        resultado.responseBody &&
        resultado.responseBody.entities
      ) {
        const entity =
          resultado.responseBody.entities.entity;

        if (
          entity &&
          entity.CODIGO &&
          entity.CODIGO['$']
        ) {
          codigoRegistroExtraido =
            entity.CODIGO['$'];
        }
      }

      if (!codigoRegistroExtraido) {
        throw new Error(
          'Não foi possível extrair o código do registro'
        );
      }

      setCodigoRegistro(
        Number(codigoRegistroExtraido)
      );

      setDadosEndereco([
        enderecoSelecionado,
      ]);

      setModalMode('confirmacao');

      setDados(prev =>
        prev.map(item => {
          if (
            item.COD_MP ===
            codProdSelecionado
          ) {
            return {
              ...item,
              emSeparacao: {
                USUARIO: usuario,
              },
            };
          }

          return item;
        })
      );

    } catch (error) {
      Alert.alert(
        'Erro',
        'Falha ao iniciar separação: ' +
          (
            error instanceof Error
              ? error.message
              : 'Erro desconhecido'
          )
      );
    }
  };

  // ============================================================
  // CONFIRMAR RETIRADA
  // ============================================================

  const confirmarRetirada = async () => {
    if (
      !dadosEndereco.length ||
      codProdSelecionado === null
    ) {
      return;
    }

    const itemOP = dados.find(
      item =>
        item.COD_MP ===
        codProdSelecionado
    );

    if (!itemOP) {
      Alert.alert(
        'Erro',
        'Item não encontrado na OP'
      );

      return;
    }

    const d = dadosEndereco[0];

    const codProd = d[0];
    const descricaoProduto = d[1];

    const quantidadeMatch =
      itemOP.QUANTIDADE.match(
        /(\d+[,.]?\d*)\s*([a-zA-Z]*)/
      );

    const quantidadeOPString =
      quantidadeMatch
        ? quantidadeMatch[1].replace(',', '.')
        : '0';

    const quantidadeOPNumerica =
      parseFloat(quantidadeOPString) || 0;

    const unidadeOP =
      quantidadeMatch
        ? quantidadeMatch[2]
        : itemOP.UNIDADE || 'UN';

    const quantidadeOPOriginal =
      itemOP.QUANTIDADE;

    const qtdRetirar =
      quantidadeRetirada;

    const usuario =
      session?.username || 'Usuário';

    const lote =
      loteRetirada || itemOP.LOTE;

    if (!qtdRetirar) {
      Alert.alert(
        'Erro',
        'Quantidade inválida'
      );

      return;
    }

    if (!lote) {
      Alert.alert(
        'Erro',
        'Informe o lote'
      );

      return;
    }

    const parts =
      qtdRetirar.split('.');

    if (
      parts.length === 2 &&
      parts[1].length > 4
    ) {
      Alert.alert(
        'Formato incorreto',
        'A quantidade deve ter no máximo 4 casas decimais.'
      );

      return;
    }

    const qtdRetirarNumerica =
      parseFloat(qtdRetirar);

    if (
      isNaN(qtdRetirarNumerica) ||
      qtdRetirarNumerica <= 0
    ) {
      Alert.alert(
        'Erro',
        'A quantidade deve ser maior que zero'
      );

      return;
    }

    if (
      qtdRetirarNumerica <
      quantidadeOPNumerica
    ) {
      Alert.alert(
        'Erro',
        `Quantidade solicitada (${qtdRetirar}) é menor que a quantidade da OP (${quantidadeOPOriginal})`
      );

      return;
    }

    try {
      const sqlTotal = `
        SELECT SUM(ESTOQUE)
        FROM TGFEST
        WHERE CODPROD = ${codProd}
          AND CODLOCAL IN (
            50000000,
            120000000,
            130000000
          )
      `;

      const resultEstoque =
        await queryJson(
          'DbExplorerSP.executeQuery',
          { sql: sqlTotal }
        );

      let estoqueDisponivel = 0;

      if (
        resultEstoque.rows.length > 0 &&
        resultEstoque.rows[0][0] !== null
      ) {
        estoqueDisponivel =
          parseFloat(
            resultEstoque.rows[0][0]
          );
      }

      if (
        qtdRetirarNumerica >
        estoqueDisponivel
      ) {
        Alert.alert(
          'Estoque insuficiente',
          `Solicitado: ${qtdRetirar}\nDisponível: ${estoqueDisponivel.toFixed(4)}`
        );

        return;
      }

    } catch (error) {
      console.error(
        'Erro ao consultar estoque:',
        error
      );

      Alert.alert(
        'Erro',
        'Não foi possível verificar o estoque disponível'
      );

      return;
    }

    try {
      if (!codigoRegistro) {
        throw new Error(
          'Código do registro não encontrado'
        );
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
        STATUS: '2',
      });

      setDados(prev =>
        prev.map(item => {
          if (
            item.COD_MP ===
            codProd
          ) {
            return {
              ...item,

              separado: {
                CODPROD: codProd,
                DESCRPROD:
                  descricaoProduto,
                ESTOQUE:
                  quantidadeOPOriginal,
                QTDSEPARADA:
                  qtdRetirar,
                USUARIO: usuario,
                OP: Number(idiproc),
                UNIDADE: unidadeOP,
                LOTE: lote,
              },

              emSeparacao:
                undefined,
            };
          }

          return item;
        })
      );

      setModalVisible(false);
      setDadosEndereco([]);
      setEndereco('');
      setQuantidadeRetirada('');
      setLoteRetirada('');
      setCodigoRegistro(null);

      Alert.alert(
        'Sucesso',
        'Retirada registrada!'
      );

    } catch (error) {
      console.error(
        'Erro na retirada:',
        error
      );

      Alert.alert(
        'Erro',
        error instanceof Error
          ? error.message
          : 'Falha ao registrar retirada'
      );
    }
  };

  // ============================================================
  // BUSCAR SEPARAÇÕES
  // ============================================================

  const buscarSeparacoes = async (
    idiproc: number
  ) => {
    try {
      const sql = `
        SELECT
          CODPROD,
          DESCRPROD,
          QTDSEPARADA,
          USUARIO,
          OP,
          UNIDADE,
          LOTE
        FROM AD_ALMOXARIFEWMS
        WHERE OP = ${idiproc}
          AND STATUS = '2'
      `;

      const result =
        await queryJson(
          'DbExplorerSP.executeQuery',
          { sql }
        );

      if (result.rows.length > 0) {
        return result.rows.map(
          (row: any) => ({
            CODPROD: row[0],
            DESCRPROD: row[1],
            QTDSEPARADA: row[2],
            USUARIO: row[3],
            OP: row[4],
            UNIDADE:
              row[5] || 'UN',
            LOTE:
              row[6] || '',
          })
        );
      }

      return [];
    } catch (error) {
      console.error(
        'Erro ao buscar separações:',
        error
      );

      return [];
    }
  };

  // ============================================================
  // SEPARAÇÕES EM ANDAMENTO
  // ============================================================

  const buscarSeparacoesEmAndamento =
    async (idiproc: number) => {
      try {
        const sql = `
          SELECT
            CODPROD,
            USUARIO
          FROM AD_ALMOXARIFEWMS
          WHERE OP = ${idiproc}
            AND STATUS = '1'
        `;

        const result =
          await queryJson(
            'DbExplorerSP.executeQuery',
            { sql }
          );

        if (result.rows.length > 0) {
          return result.rows.map(
            (row: any) => ({
              CODPROD: row[0],
              USUARIO: row[1],
            })
          );
        }

        return [];
      } catch (error) {
        console.error(
          'Erro ao buscar separações em andamento:',
          error
        );

        return [];
      }
    };

  // ============================================================
  // BUSCAR DADOS DA OP
  // ============================================================

  const buscarDados = async (
    opInformada?: string
  ) => {
    const op =
      opInformada || idiproc;

    if (
      !session?.jsessionid ||
      !op.trim()
    ) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setDados([]);

      setSeparacaoIniciada(false);
      setSeparacaoFinalizada(false);
      setPodeSepararItens(false);

      const temEmbalagem =
        await verificarAtividadeEmbalagem(
          Number(op)
        );

      setTemAtividadeEmbalagem(
        temEmbalagem
      );

      if (!temEmbalagem) {
        setError(
          'Esta OP não está na fase de EMBALAGEM ou não foi aceita.'
        );

        return;
      }

      const status =
        await verificarStatusSeparacao(
          Number(op)
        );

      setSeparacaoIniciada(
        status.dhInicio !== null
      );

      setSeparacaoFinalizada(
        status.dhFinal !== null
      );

      setPodeSepararItens(
        status.dhInicio !== null &&
        status.dhFinal === null
      );

      const separacoesEmAndamento =
        await buscarSeparacoesEmAndamento(
          Number(op)
        );

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
              WHEN
                (MP.QTDMISTURA * PA.QTDPRODUZIR) < 0
              THEN
                REPLACE(
                  FORMAT(
                    (MP.QTDMISTURA * PA.QTDPRODUZIR) * 1000,
                    '#,0.####',
                    'de-DE'
                  ),
                  ',',
                  '.'
                ) + ' ' + MP.CODVOL
              ELSE
                REPLACE(
                  FORMAT(
                    (MP.QTDMISTURA * PA.QTDPRODUZIR),
                    '#,0.####',
                    'de-DE'
                  ),
                  ',',
                  '.'
                ) + ' ' + MP.CODVOL
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
                  WHEN MP.AD_SEQUENCIAMP IS NULL
                  THEN 1
                  ELSE 0
                END,
                MP.AD_SEQUENCIAMP DESC
            ) AS rn

          FROM TPRIPROC P

          JOIN TPRIPA PA
            ON P.IDIPROC = PA.IDIPROC

          JOIN (
            SELECT LMP.*
            FROM TPRLMP LMP

            INNER JOIN TPREFX EFX
              ON EFX.IDEFX = LMP.IDEFX

            WHERE EFX.IDPROC = (
              SELECT MAX(P2.IDPROC)
              FROM TPRLPA P2

              INNER JOIN TPRPRC PRC2
                ON PRC2.IDPROC = P2.IDPROC

              WHERE P2.CODPRODPA =
                    LMP.CODPRODPA

                AND PRC2.CODUSUALT <> 13
            )

            AND EFX.DESCRICAO = 'EMBALAGEM'
          ) MP
            ON PA.CODPRODPA =
               MP.CODPRODPA

          JOIN TGFPRO MP2
            ON MP.CODPRODMP =
               MP2.CODPROD

          JOIN TGFPRO PRO
            ON PA.CODPRODPA =
               PRO.CODPROD

          LEFT JOIN TPRIATV A
            ON P.IDIPROC =
               A.IDIPROC

          LEFT JOIN TPREFX RF
            ON A.IDEFX =
               RF.IDEFX

          LEFT JOIN TSIUSU U
            ON A.CODEXEC =
               U.CODUSU

          WHERE
            P.IDIPROC = ${Number(op)}

            AND MP.CODPRODMP <> 355

            AND P.STATUSPROC <> 'C'

            AND RF.DESCRICAO =
                'EMBALAGEM'

            AND MP2.DESCRPROD
                NOT LIKE 'FITA%'
        )

        SELECT
          IDIPROC,
          REFERENCIA,
          PRODUTOPA,
          LOTE,
          COD_MP,
          PRODUTOMP,
          QUANTIDADE,
          UNIDADE,
          SEQUENCIA,
          FASE,
          TEMPERATURA,
          OBSERVACAO,
          EXECUTANTE
        FROM RankedData
        WHERE rn = 1
        ORDER BY SEQUENCIA
      `;

      const result =
        await queryJson(
          'DbExplorerSP.executeQuery',
          { sql: sqlQuery }
        );

      const separacoes =
        await buscarSeparacoes(
          Number(op)
        );

      if (result.rows.length > 0) {
        const dadosFormatados =
          result.rows.map(
            (row: any) => {
              const codProdMP =
                row[4];

              const separacao =
                separacoes.find(
                  (s: any) =>
                    s.CODPROD ===
                    codProdMP
                );

              const emSeparacao =
                separacoesEmAndamento.find(
                  (s: any) =>
                    s.CODPROD ===
                    codProdMP
                );

              return {
                IDIPROC: row[0],
                REFERENCIA: row[1],
                PRODUTOPA: row[2],
                LOTE: row[3],
                COD_MP: row[4],
                PRODUTOMP: row[5],

                QUANTIDADE: row[6],

                // CORREÇÃO:
                // row[7] é UNIDADE
                UNIDADE: row[7],

                // row[8] é SEQUENCIA
                SEQUENCIA: row[8],

                // row[9] é FASE
                FASE: row[9],

                // row[10] é TEMPERATURA
                TEMPERATURA: row[10],

                // row[11] é OBSERVACAO
                OBSERVACAO: row[11],

                // row[12] é EXECUTANTE
                EXECUTANTE: row[12],

                separado:
                  separacao
                    ? {
                        CODPROD:
                          separacao.CODPROD,
                        DESCRPROD:
                          separacao.DESCRPROD,
                        QTDSEPARADA:
                          separacao.QTDSEPARADA,
                        USUARIO:
                          separacao.USUARIO,
                        OP:
                          separacao.OP,
                        UNIDADE:
                          separacao.UNIDADE,
                        LOTE:
                          separacao.LOTE,
                      }
                    : undefined,

                emSeparacao:
                  emSeparacao
                    ? {
                        USUARIO:
                          emSeparacao.USUARIO,
                      }
                    : undefined,
              };
            }
          );

        setDados(dadosFormatados);
      } else {
        setError(
          'Nenhum registro dessa OP em embalagem ou OP inexistente'
        );
      }
    } catch (err) {
      console.error(
        'Erro ao buscar dados:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao buscar dados'
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // TODOS SEPARADOS
  // ============================================================

  const todosItensSeparados = () => {
    if (dados.length === 0) {
      return false;
    }

    return dados.every(
      item => !!item.separado
    );
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <SafeAreaView style={styles.container}>

      {/* HEADER COMPACTO */}
      <View style={styles.header}>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
        >
          <Ionicons
            name="arrow-back"
            size={21}
            color="white"
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Almoxarifado
        </Text>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={() =>
            setModalOpsVisible(true)
          }
        >
          <Ionicons
            name="list"
            size={21}
            color="white"
          />
        </TouchableOpacity>

      </View>

      {/* SCROLL PRINCIPAL */}
      <ScrollView
        contentContainerStyle={
          styles.scrollContent
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >

        {/* FORMULÁRIO */}
        <View style={styles.formContainer}>

          <Text style={styles.label}>
            Número da OP
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Digite a OP"
            placeholderTextColor="#999"
            keyboardType="numeric"
            value={idiproc}
            onChangeText={setIdiproc}
            returnKeyType="search"
            onSubmitEditing={() =>
              buscarDados()
            }
          />

          <TouchableOpacity
            style={styles.searchButton}
            onPress={() =>
              buscarDados()
            }
            disabled={
              loading || !idiproc
            }
          >
            {loading ? (
              <ActivityIndicator
                size="small"
                color="white"
              />
            ) : (
              <Ionicons
                name="search"
                size={19}
                color="white"
              />
            )}

            <Text
              style={
                styles.searchButtonText
              }
            >
              {loading
                ? 'Buscando...'
                : 'Consultar OP'}
            </Text>
          </TouchableOpacity>

          {/* BOTÕES */}
          <View style={styles.buttonGroup}>

            {!separacaoIniciada && (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  !temAtividadeEmbalagem
                    ? styles.actionButtonDisabled
                    : styles.iniciarButton,
                ]}
                onPress={
                  handleIniciarSeparacao
                }
                disabled={
                  loading ||
                  !temAtividadeEmbalagem ||
                  !dados.length
                }
              >
                <Ionicons
                  name="play"
                  size={17}
                  color="white"
                />

                <Text
                  style={
                    styles.actionButtonText
                  }
                >
                  {loading
                    ? 'Processando...'
                    : !temAtividadeEmbalagem
                    ? 'Não está em embalagem'
                    : 'Iniciar Separação'}
                </Text>
              </TouchableOpacity>
            )}

            {separacaoIniciada &&
              !separacaoFinalizada && (
                <TouchableOpacity
                  style={[
                    styles.finalizarButton,
                    !todosItensSeparados() &&
                      styles.actionButtonDisabled,
                  ]}
                  onPress={
                    handleFinalizarSeparacao
                  }
                  disabled={
                    loading ||
                    !todosItensSeparados()
                  }
                >
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color="white"
                  />

                  <Text
                    style={
                      styles.actionButtonText
                    }
                  >
                    {loading
                      ? 'Processando...'
                      : todosItensSeparados()
                      ? 'Finalizar'
                      : 'Separe todos os itens'}
                  </Text>
                </TouchableOpacity>
              )}

            {separacaoFinalizada && (
              <View
                style={
                  styles.statusMessage
                }
              >
                <Ionicons
                  name="checkmark-done"
                  size={18}
                  color="#2e7d32"
                />

                <Text
                  style={
                    styles.statusMessageText
                  }
                >
                  Separação finalizada
                </Text>
              </View>
            )}

          </View>
        </View>

        {/* ERRO */}
        {error && (
          <View
            style={
              styles.errorContainer
            }
          >
            <Text
              style={styles.errorText}
            >
              {error}
            </Text>
          </View>
        )}

        {/* LISTA DE MATERIAIS */}
        <View style={styles.itemsContainer}>

          {dados.map(
            (item, index) => (
              <TouchableOpacity
                key={`${item.COD_MP}-${index}`}
                style={[
                  styles.materialCard,

                  item.emSeparacao &&
                    !item.separado &&
                    styles.emSeparacaoCard,

                  item.separado &&
                    styles.separadoCard,

                  !podeSepararItens &&
                    styles.itemDisabled,
                ]}
                onPress={() =>
                  handleItemPress(item)
                }
              >

                <View
                  style={
                    styles.materialHeader
                  }
                >
                  <Text
                    style={
                      styles.materialValue
                    }
                    numberOfLines={2}
                  >
                    {item.COD_MP} -{' '}
                    {item.PRODUTOMP}
                  </Text>
                </View>

                <View
                  style={
                    styles.materialHeader
                  }
                >
                  <Text
                    style={
                      styles.loteText
                    }
                  >
                    Lote: {item.LOTE}
                  </Text>

                  <Text
                    style={
                      styles.materialQuantity
                    }
                  >
                    Qtd: {item.QUANTIDADE}
                  </Text>
                </View>

                {/* EM SEPARAÇÃO */}
                {item.emSeparacao &&
                  !item.separado && (
                    <View
                      style={
                        styles.emSeparacaoContainer
                      }
                    >
                      <Ionicons
                        name="lock-closed"
                        size={14}
                        color="#ff9800"
                      />

                      <Text
                        style={
                          styles.emSeparacaoText
                        }
                      >
                        Em separação por:{' '}
                        {
                          item
                            .emSeparacao
                            .USUARIO
                        }
                      </Text>
                    </View>
                  )}

                {/* SEPARADO */}
                {item.separado && (
                  <View
                    style={
                      styles.separadoContainer
                    }
                  >

                    <View
                      style={
                        styles.separadoRow
                      }
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={15}
                        color="#2e7d32"
                      />

                      <Text
                        style={
                          styles.separadoText
                        }
                      >
                        Separado (
                        {
                          item
                            .separado
                            .UNIDADE
                        }
                        )
                      </Text>
                    </View>

                    <View
                      style={
                        styles.separadoDetails
                      }
                    >
                      <Text
                        style={
                          styles.separadoDetail
                        }
                      >
                        Qtd:{' '}
                        {
                          item
                            .separado
                            .QTDSEPARADA
                        }
                      </Text>

                      <Text
                        style={
                          styles.separadoDetail
                        }
                      >
                        Por:{' '}
                        {
                          item
                            .separado
                            .USUARIO
                        }
                      </Text>
                    </View>

                  </View>
                )}

              </TouchableOpacity>
            )
          )}

        </View>

      </ScrollView>

      {/* ======================================================
          MODAL OPS
      ====================================================== */}

      <Modal
        visible={modalOpsVisible}
        animationType="slide"
        transparent
        onRequestClose={() =>
          setModalOpsVisible(false)
        }
      >
        <View
          style={styles.modalOverlay}
        >

          <View
            style={styles.modalContent}
          >

            <Text
              style={styles.modalTitle}
            >
              OPs em Embalagem
            </Text>

            {loadingOps ? (
              <View
                style={
                  styles.loadingContainer
                }
              >
                <ActivityIndicator
                  size="large"
                  color="#4CAF50"
                />
              </View>
            ) : opsAbertas.length > 0 ? (

              <ScrollView
                style={styles.modalList}
                showsVerticalScrollIndicator
              >
                {opsAbertas.map(
                  (item, index) => (
                    <TouchableOpacity
                      key={`${item.IDIPROC}-${index}`}
                      style={
                        styles.opItem
                      }
                      onPress={() =>
                        selecionarOP(
                          item
                        )
                      }
                    >
                      <Text
                        style={
                          styles.opText
                        }
                      >
                        OP: {
                          item.IDIPROC
                        }
                      </Text>

                      <Text
                        style={
                          styles.opDetail
                        }
                      >
                        Ref:{' '}
                        {
                          item.REFERENCIA
                        }
                      </Text>

                      <Text
                        style={
                          styles.opDetail
                        }
                        numberOfLines={1}
                      >
                        Produto:{' '}
                        {
                          item.PRODUTOPA
                        }
                      </Text>

                      <Text
                        style={
                          styles.opDetail
                        }
                      >
                        Lote:{' '}
                        {item.LOTE}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </ScrollView>

            ) : (
              <Text
                style={
                  styles.noDataText
                }
              >
                Nenhuma OP encontrada
              </Text>
            )}

            <View
              style={
                styles.modalButtons
              }
            >

              <TouchableOpacity
                style={
                  styles.refreshButton
                }
                onPress={
                  buscarOpsAbertas
                }
              >
                <Ionicons
                  name="refresh"
                  size={16}
                  color="white"
                />

                <Text
                  style={
                    styles.buttonText
                  }
                >
                  Atualizar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={
                  styles.closeButton
                }
                onPress={() =>
                  setModalOpsVisible(
                    false
                  )
                }
              >
                <Text
                  style={
                    styles.buttonText
                  }
                >
                  Fechar
                </Text>
              </TouchableOpacity>

            </View>

          </View>
        </View>
      </Modal>

      {/* ======================================================
          MODAL ENDEREÇO / RETIRADA
      ====================================================== */}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() =>
          setModalVisible(false)
        }
      >
        <View
          style={styles.modalOverlay}
        >

          <View
            style={styles.modalContent}
          >

            {loading ? (
              <View
                style={
                  styles.loadingContainer
                }
              >
                <ActivityIndicator
                  size="large"
                  color="#4CAF50"
                />
              </View>
            ) : modalMode ===
              'confirmacao' ? (

              dadosEndereco.length >
                0 &&
              dadosEndereco[0] ? (

                <ScrollView
                  style={
                    styles.modalScrollView
                  }
                  showsVerticalScrollIndicator
                >

                  <Text
                    style={
                      styles.modalTitle
                    }
                  >
                    Confirmar Retirada
                  </Text>

                  {(() => {
                    const itemOPModal =
                      dados.find(
                        item =>
                          item.COD_MP ===
                          codProdSelecionado
                      );

                    return (
                      <>

                        <View
                          style={
                            styles.infoBox
                          }
                        >
                          <Text
                            style={
                              styles.infoText
                            }
                          >
                            <Text
                              style={
                                styles.infoLabel
                              }
                            >
                              Produto:
                            </Text>{' '}
                            {
                              dadosEndereco[0][1]
                            }
                          </Text>

                          <Text
                            style={
                              styles.infoText
                            }
                          >
                            <Text
                              style={
                                styles.infoLabel
                              }
                            >
                              Endereço:
                            </Text>{' '}
                            {
                              dadosEndereco[0][2]
                            }
                          </Text>

                          <Text
                            style={
                              styles.infoText
                            }
                          >
                            <Text
                              style={
                                styles.infoLabel
                              }
                            >
                              Qtd OP:
                            </Text>{' '}
                            {
                              itemOPModal?.QUANTIDADE ||
                              'N/A'
                            }
                          </Text>
                        </View>

                        <View
                          style={
                            styles.stockBox
                          }
                        >

                          <Text
                            style={
                              styles.stockTitle
                            }
                          >
                            Estoques
                          </Text>

                          <Text
                            style={
                              styles.stockText
                            }
                          >
                            Almox:{' '}
                            {Number(
                              dadosEndereco[0]
                                ?.ESTOQUE_ALMOX ||
                                0
                            ).toFixed(4)}
                          </Text>

                          <Text
                            style={
                              styles.stockText
                            }
                          >
                            GP1:{' '}
                            {Number(
                              dadosEndereco[0]
                                ?.ESTOQUE_GP1 ||
                                0
                            ).toFixed(4)}
                          </Text>

                          <Text
                            style={
                              styles.stockText
                            }
                          >
                            GP2:{' '}
                            {Number(
                              dadosEndereco[0]
                                ?.ESTOQUE_GP2 ||
                                0
                            ).toFixed(4)}
                          </Text>

                          <Text
                            style={
                              styles.stockTotal
                            }
                          >
                            Total:{' '}
                            {Number(
                              dadosEndereco[0]
                                ?.ESTOQUE_TOTAL ||
                                0
                            ).toFixed(4)}
                          </Text>

                        </View>

                        <TextInput
                          style={
                            styles.input
                          }
                          placeholder="Lote"
                          placeholderTextColor="#999"
                          keyboardType="numeric"
                          value={
                            loteRetirada
                          }
                          onChangeText={
                            setLoteRetirada
                          }
                        />

                        <TextInput
                          style={
                            styles.input
                          }
                          placeholder="Quantidade a retirar"
                          placeholderTextColor="#999"
                          keyboardType="decimal-pad"
                          value={
                            quantidadeRetirada
                          }
                          onChangeText={text => {
                            let formatted =
                              text
                                .replace(
                                  ',',
                                  '.'
                                )
                                .replace(
                                  /[^0-9.]/g,
                                  ''
                                );

                            const parts =
                              formatted.split(
                                '.'
                              );

                            if (
                              parts.length >
                              2
                            ) {
                              formatted =
                                parts[0] +
                                '.' +
                                parts
                                  .slice(
                                    1
                                  )
                                  .join(
                                    ''
                                  );
                            }

                            if (
                              parts.length ===
                                2 &&
                              parts[1]
                                .length >
                                4
                            ) {
                              formatted =
                                parts[0] +
                                '.' +
                                parts[1].substring(
                                  0,
                                  4
                                );
                            }

                            setQuantidadeRetirada(
                              formatted
                            );
                          }}
                        />

                        <TouchableOpacity
                          style={[
                            styles.confirmButton,
                            !quantidadeRetirada ||
                            !loteRetirada
                              ? styles.disabledButton
                              : null,
                          ]}
                          onPress={
                            confirmarRetirada
                          }
                          disabled={
                            !quantidadeRetirada ||
                            !loteRetirada
                          }
                        >
                          <Ionicons
                            name="checkmark"
                            size={17}
                            color="white"
                          />

                          <Text
                            style={
                              styles.buttonText
                            }
                          >
                            Confirmar Retirada
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={
                            styles.backButton
                          }
                          onPress={() => {
                            setModalMode(
                              'lista'
                            );

                            setQuantidadeRetirada(
                              ''
                            );

                            setLoteRetirada(
                              ''
                            );

                            buscarEnderecosProduto(
                              codProdSelecionado!
                            );
                          }}
                        >
                          <Text
                            style={
                              styles.buttonTextDark
                            }
                          >
                            Voltar
                          </Text>
                        </TouchableOpacity>

                      </>
                    );
                  })()}

                </ScrollView>

              ) : (
                <View
                  style={
                    styles.warningContainer
                  }
                >
                  <Ionicons
                    name="warning"
                    size={35}
                    color="#ff9800"
                  />

                  <Text
                    style={
                      styles.warningText
                    }
                  >
                    Dados não disponíveis
                  </Text>
                </View>
              )

            ) : (

              <ScrollView
                style={
                  styles.modalScrollView
                }
                showsVerticalScrollIndicator
              >

                <Text
                  style={
                    styles.modalTitle
                  }
                >
                  {dadosEndereco[0]?.[0] ||
                    'Produto'}
                  {' - '}
                  {dadosEndereco[0]?.[1] ||
                    'Produto'}
                </Text>

                <View
                  style={
                    styles.detalhesEndereco
                  }
                >

                  <Text
                    style={
                      styles.detalhesTitulo
                    }
                  >
                    Endereços disponíveis
                  </Text>

                  {dadosEndereco.map(
                    (item, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.enderecoItem,
                          enderecoSelecionado ===
                            item &&
                            styles.enderecoItemSelected,
                        ]}
                        onPress={() => {
                          setEnderecoSelecionado(
                            item
                          );

                          setDetalhesEnderecoVisivel(
                            true
                          );
                        }}
                      >

                        <View
                          style={
                            styles.enderecoRow
                          }
                        >
                          <Ionicons
                            name="location"
                            size={17}
                            color={
                              enderecoSelecionado ===
                              item
                                ? '#fff'
                                : '#4CAF50'
                            }
                          />

                          <Text
                            style={[
                              styles.enderecoText,
                              enderecoSelecionado ===
                                item &&
                                styles.enderecoTextSelected,
                            ]}
                          >
                            {item[2] ||
                              'Sem endereço'}
                          </Text>
                        </View>

                        <Text
                          style={[
                            styles.enderecoEstoque,
                            enderecoSelecionado ===
                              item &&
                              styles.enderecoTextSelected,
                          ]}
                        >
                          Estoque:{' '}
                          {Number(
                            item[5] || 0
                          ).toFixed(4)}
                        </Text>

                      </TouchableOpacity>
                    )
                  )}

                </View>

                <TouchableOpacity
                  style={[
                    styles.selectButton,
                    !enderecoSelecionado &&
                      styles.disabledButton,
                  ]}
                  onPress={
                    selecionarEndereco
                  }
                  disabled={
                    !enderecoSelecionado
                  }
                >
                  <Ionicons
                    name="location"
                    size={17}
                    color="white"
                  />

                  <Text
                    style={
                      styles.buttonText
                    }
                  >
                    Selecionar Endereço
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={
                    styles.cancelButton
                  }
                  onPress={() => {
                    setModalVisible(
                      false
                    );

                    setDadosEndereco(
                      []
                    );

                    setEndereco('');

                    setQuantidadeRetirada(
                      ''
                    );

                    setLoteRetirada(
                      ''
                    );

                    setDetalhesEnderecoVisivel(
                      false
                    );

                    setEnderecoSelecionado(
                      null
                    );
                  }}
                >
                  <Text
                    style={
                      styles.buttonTextDark
                    }
                  >
                    Cancelar
                  </Text>
                </TouchableOpacity>

              </ScrollView>
            )}

          </View>
        </View>
      </Modal>

      {/* ======================================================
          MODAL SUCESSO
      ====================================================== */}

      <Modal
        animationType="fade"
        transparent
        visible={
          modalSucessoVisible
        }
        onRequestClose={() =>
          setModalSucessoVisible(
            false
          )
        }
      >
        <View
          style={
            styles.modalSucessoContainer
          }
        >
          <View
            style={
              styles.modalSucessoContent
            }
          >

            <Ionicons
              name="checkmark-circle"
              size={55}
              color="#2e7d32"
            />

            <Text
              style={
                styles.sucessoTitle
              }
            >
              Sucesso!
            </Text>

            <Text
              style={
                styles.sucessoMessage
              }
            >
              {mensagemSucesso}
            </Text>

            <TouchableOpacity
              style={
                styles.sucessoButton
              }
              onPress={() => {
                setModalSucessoVisible(
                  false
                );

                router.back();
              }}
            >
              <Text
                style={
                  styles.sucessoButtonText
                }
              >
                OK
              </Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* ======================================================
          PROGRESSO
      ====================================================== */}

      {progressoFinalizacao && (
        <View
          style={
            styles.progressContainer
          }
        >
          <View
            style={
              styles.progressBar
            }
          >
            <ActivityIndicator
              size="large"
              color="#4CAF50"
            />

            <Text
              style={
                styles.progressText
              }
            >
              Finalizando...
            </Text>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

// ============================================================
// ESTILOS COMPACTOS PARA COLETOR
// ============================================================

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  scrollContent: {
    paddingBottom: 25,
  },

  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    backgroundColor: '#4CAF50',
  },

  headerButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: 'white',
  },

  formContainer: {
    padding: 10,
  },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },

  input: {
    backgroundColor: 'white',
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d5d5d5',
    fontSize: 14,
    marginBottom: 7,
    color: '#222',
  },

  searchButton: {
    minHeight: 42,
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  searchButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 6,
  },

  buttonGroup: {
    marginTop: 7,
  },

  actionButton: {
    minHeight: 42,
    flexDirection: 'row',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  actionButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 5,
    textAlign: 'center',
  },

  iniciarButton: {
    backgroundColor: '#2196F3',
  },

  finalizarButton: {
    minHeight: 42,
    flexDirection: 'row',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#FAB243',
  },

  actionButtonDisabled: {
    backgroundColor: '#bdbdbd',
  },

  statusMessage: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 6,
    padding: 8,
  },

  statusMessageText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 5,
  },

  itemsContainer: {
    paddingHorizontal: 10,
  },

  materialCard: {
    backgroundColor: '#fff',
    padding: 9,
    borderRadius: 6,
    marginBottom: 7,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
    elevation: 1,
  },

  itemDisabled: {
    opacity: 0.65,
    backgroundColor: '#eeeeee',
  },

  materialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  materialValue: {
    fontWeight: '600',
    color: '#333',
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
  },

  materialQuantity: {
    fontWeight: 'bold',
    color: '#333',
    fontSize: 12,
    marginLeft: 5,
  },

  loteText: {
    fontSize: 11,
    color: '#666',
    marginTop: 3,
  },

  separadoCard: {
    backgroundColor: '#e8f5e9',
    borderLeftColor: '#2e7d32',
  },

  separadoContainer: {
    marginTop: 5,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#c8e6c9',
  },

  separadoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  separadoText: {
    color: '#2e7d32',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },

  separadoDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },

  separadoDetail: {
    color: '#2e7d32',
    fontSize: 11,
  },

  emSeparacaoCard: {
    backgroundColor: '#fff3e0',
    borderLeftColor: '#ff9800',
  },

  emSeparacaoContainer: {
    marginTop: 5,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#ffe0b2',
    flexDirection: 'row',
    alignItems: 'center',
  },

  emSeparacaoText: {
    color: '#ff9800',
    fontSize: 11,
    marginLeft: 4,
    fontWeight: '500',
    flex: 1,
  },

  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 9,
    marginHorizontal: 10,
    borderRadius: 6,
    marginBottom: 7,
  },

  errorText: {
    color: '#c62828',
    fontSize: 12,
    fontWeight: '500',
  },

  // ==========================================================
  // MODAIS
  // ==========================================================

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },

  modalContent: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    width: '96%',
    maxHeight: '92%',
  },

  modalTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 10,
    textAlign: 'center',
    color: '#333',
  },

  modalScrollView: {
    maxHeight: '100%',
  },

  modalList: {
    maxHeight: 360,
    marginBottom: 8,
  },

  loadingContainer: {
    padding: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },

  opItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },

  opText: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#333',
  },

  opDetail: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },

  noDataText: {
    textAlign: 'center',
    marginVertical: 20,
    color: '#666',
    fontSize: 13,
  },

  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 7,
  },

  refreshButton: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000FFF',
    padding: 8,
    borderRadius: 6,
    gap: 5,
  },

  closeButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 8,
    borderRadius: 6,
  },

  confirmButton: {
    minHeight: 42,
    marginTop: 8,
    backgroundColor: '#4CAF50',
    padding: 9,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },

  selectButton: {
    minHeight: 42,
    marginTop: 8,
    backgroundColor: '#4CAF50',
    padding: 9,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },

  backButton: {
    minHeight: 40,
    marginTop: 7,
    backgroundColor: '#ddd',
    padding: 9,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelButton: {
    minHeight: 40,
    marginTop: 7,
    backgroundColor: '#ddd',
    padding: 9,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  disabledButton: {
    opacity: 0.5,
  },

  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },

  buttonTextDark: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 12,
  },

  // ==========================================================
  // INFORMAÇÕES DO ENDEREÇO
  // ==========================================================

  detalhesEndereco: {
    padding: 7,
    borderRadius: 6,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: '#FAB243',
    backgroundColor: '#fff8e1',
  },

  detalhesTitulo: {
    fontWeight: 'bold',
    fontSize: 13,
    marginBottom: 6,
    color: '#d88900',
  },

  enderecoItem: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    backgroundColor: '#f9f9f9',
    marginBottom: 5,
    borderRadius: 5,
  },

  enderecoItemSelected: {
    backgroundColor: '#FAB243',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },

  enderecoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  enderecoText: {
    fontWeight: 'bold',
    fontSize: 13,
    color: '#333',
    marginLeft: 5,
  },

  enderecoTextSelected: {
    color: '#fff',
  },

  enderecoEstoque: {
    fontSize: 10,
    color: '#666',
    marginTop: 3,
    marginLeft: 22,
  },

  infoBox: {
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 6,
    marginBottom: 7,
  },

  infoText: {
    fontSize: 12,
    color: '#333',
    marginBottom: 4,
  },

  infoLabel: {
    fontWeight: 'bold',
  },

  stockBox: {
    backgroundColor: '#e3f2fd',
    padding: 8,
    borderRadius: 6,
    marginBottom: 7,
  },

  stockTitle: {
    fontWeight: 'bold',
    fontSize: 12,
    color: '#1976d2',
    marginBottom: 4,
  },

  stockText: {
    fontSize: 11,
    color: '#333',
    marginBottom: 2,
  },

  stockTotal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1976d2',
    marginTop: 3,
  },

  warningContainer: {
    alignItems: 'center',
    padding: 20,
  },

  warningText: {
    textAlign: 'center',
    marginTop: 8,
    color: '#666',
    fontSize: 13,
  },

  // ==========================================================
  // SUCESSO
  // ==========================================================

  modalSucessoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 15,
  },

  modalSucessoContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    width: '88%',
    elevation: 5,
  },

  sucessoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginTop: 8,
    marginBottom: 7,
  },

  sucessoMessage: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 15,
    color: '#333',
    lineHeight: 19,
  },

  sucessoButton: {
    backgroundColor: '#2e7d32',
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 6,
  },

  sucessoButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },

  // ==========================================================
  // FINALIZAÇÃO
  // ==========================================================

  progressContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },

  progressBar: {
    backgroundColor: 'white',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 160,
  },

  progressText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
});