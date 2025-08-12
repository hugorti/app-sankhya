// app/almoxarifado.tsx
import { View, Text, StyleSheet, ActivityIndicator, TextInput, TouchableOpacity, ScrollView, SafeAreaView, Modal, Alert } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { queryJson, registrarRetiradaAlmoxarifado, iniciarSeparacao, finalizarSeparacao } from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { Ionicons } from '@expo/vector-icons';
import { alterarEstoqueEndereco } from '@/services/api';

interface DadosSeparacao {
  CODPROD: number;
  DESCRPROD: string;
  QTDSEPARADA: number;
  USUARIO: string;
  OP: number;
  UNIDADE: string;
}

interface DadosAlmoxarifado {
  IDIPROC: number;
  REFERENCIA: string;
  PRODUTOPA: string;
  LOTE: string;
  COD_MP: number;
  PRODUTOMP: string;
  QUANTIDADE: string;
  SEQUENCIA: number;
  FASE: string;
  TEMPERATURA: string;
  OBSERVACAO: string;
  EXECUTANTE: string;
  separado?: DadosSeparacao;
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
  const [quantidadeRetirada, setQuantidadeRetirada] = useState<string>('');

  const verificarAtividadeEmbalagem = async (idiproc: number): Promise<boolean> => {
    try {
      const sql = `
        SELECT ATV.IDIPROC, ATV.IDIATV, ATV.IDEFX, ATV.DHACEITE, ATV.DHINICIO, ATV.DHFINAL, FX.DESCRICAO
        FROM TPRIATV ATV
        JOIN TPREFX FX ON FX.IDEFX = ATV.IDEFX
        WHERE ATV.IDIPROC = ${idiproc} AND FX.DESCRICAO = 'EMBALAGEM'
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
          dhInicio: row[0], // DHINICIO
          dhFinal: row[1]   // DHFINAL
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
              await finalizarSeparacao({
                IDIPROC: Number(idiproc),
              });
              setSeparacaoFinalizada(true);
              setPodeSepararItens(false);
              Alert.alert('Sucesso', 'Separação finalizada com sucesso!');
            } catch (error) {
              console.error('Erro ao finalizar separação:', error);
              Alert.alert('Erro', error instanceof Error ? error.message : 'Falha ao finalizar separação');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const confirmarRetirada = async () => {
    if (!dadosEndereco.length || codProdSelecionado === null) return;

    const d = dadosEndereco[0];
    const codProd = d[0];
    const codVol = d[1];
    const estoqueAtual = Number(d[5]);
    const estoqueVolPadAtual = Number(d[6]);
    const quantidadeVolume = Number(d[4]);
    const descricaoProduto = dados.find(item => item.COD_MP === codProd)?.PRODUTOMP || '';
    const qtdRetirar = Number(quantidadeRetirada);
    const usuario = session?.username || "Usuário";

    if (isNaN(qtdRetirar)) {
      Alert.alert('Erro', 'Quantidade inválida');
      return;
    }

    if (qtdRetirar <= 0) {
      Alert.alert('Erro', 'A quantidade deve ser maior que zero');
      return;
    }

    if (qtdRetirar > estoqueAtual) {
      Alert.alert('Erro', `Quantidade indisponível. Estoque atual: ${estoqueAtual}`);
      return;
    }

    const novoEstoque = estoqueAtual - qtdRetirar;
    const novoEstoqueVolPad = estoqueVolPadAtual - (qtdRetirar * quantidadeVolume);

    try {
      await alterarEstoqueEndereco({
        CODEMP: 2,
        CODPROD: codProd,
        CODLOCAL: 0,
        CODEND: d[3],
        ESTOQUE: novoEstoque,
        ESTOQUEVOLPAD: novoEstoqueVolPad,
        CODVOL: codVol
      });

      await registrarRetiradaAlmoxarifado({
        CODPROD: codProd,
        DESCRPROD: descricaoProduto,
        ESTOQUE: novoEstoque.toString(),
        QTDSEPARADA: qtdRetirar.toString(),
        USUARIO: usuario,
        OP: Number(idiproc),
        UNIDADE: codVol
      });

      setDados(prev => prev.map(item => {
        if (item.COD_MP === codProd) {
          return {
            ...item,
            separado: {
              CODPROD: codProd,
              DESCRPROD: descricaoProduto,
              QTDSEPARADA: qtdRetirar,
              USUARIO: usuario,
              OP: Number(idiproc),
              UNIDADE: codVol
            }
          };
        }
        return item;
      }));

      setModalVisible(false);
      setDadosEndereco([]);
      setQuantidadeRetirada('');
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
          CODPROD, DESCRPROD, QTDSEPARADA, USUARIO, OP, UNIDADE
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
          UNIDADE: row[5] || 'UN'
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
      
      // Verifica se tem atividade de embalagem
      const temEmbalagem = await verificarAtividadeEmbalagem(Number(idiproc));
      setTemAtividadeEmbalagem(temEmbalagem);
      
      if (!temEmbalagem) {
        setError('Esta OP não está na fase de EMBALAGEM');
        return;
      }

      // Verifica o status da separação
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
          SEQUENCIA, FASE, TEMPERATURA, OBSERVACAO, EXECUTANTE
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
            SEQUENCIA: row[7],
            FASE: row[8],
            TEMPERATURA: row[9],
            OBSERVACAO: row[10],
            EXECUTANTE: row[11],
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
        setError('Nenhum registro encontrado para a OP informada');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar dados');
    } finally {
      setLoading(false);
    }
  };

  const buscarEndereco = async () => {
    if (!endereco.trim() || !codProdSelecionado) return;
    try {
      const sql = `
        SELECT 
          EST.CODPROD,
          EST.CODVOL,
          ED.ENDERECO,
          ED.CODEND,
          VOA.QUANTIDADE,
          EST.ESTOQUE,
          EST.ESTOQUEVOLPAD
        FROM TGWEST EST
        JOIN TGFVOA VOA 
          ON VOA.CODPROD = EST.CODPROD
          AND VOA.CODVOL = EST.CODVOL
        JOIN TGWEND ED 
          ON ED.CODEND = EST.CODEND
        WHERE EST.CODPROD = ${codProdSelecionado}
          AND EST.CODVOL IN ('PL', 'UN', 'CX', 'KG')
          AND ED.ENDERECO LIKE '%${endereco}%';
      `;
      const res = await queryJson('DbExplorerSP.executeQuery', { sql });
      if (res.rows.length > 0) {
        setDadosEndereco(res.rows);
        setModalVisible(true);
      } else {
        alert('Endereço não encontrado');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Consulta de OP</Text>
        <View style={{ width: 24 }} />
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
                style={styles.finalizarButton} 
                onPress={handleFinalizarSeparacao} 
                disabled={loading}
              >
                <Ionicons name="checkmark" size={20} color="white" />
                <Text style={styles.actionButtonText}>
                  {loading ? 'Processando...' : 'Finalizar Separação'}
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

        {dados.map((item, index) => (
          <TouchableOpacity
            key={index}
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
              }
            }}
            // disabled={!podeSepararItens || item.separado}
          >
            <View style={styles.materialHeader}>
              <Text style={styles.materialValue}>{item.PRODUTOMP}</Text>
              <Text style={styles.materialQuantity}>{item.QUANTIDADE}</Text>
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
                </View>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 10, width: '90%' }}>
            {!dadosEndereco.length ? (
              <>
                <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 10 }}>Digite o endereço</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Endereço"
                  value={endereco}
                  onChangeText={setEndereco}
                />
                <TouchableOpacity style={styles.searchButton} onPress={buscarEndereco}>
                  <Text style={styles.searchButtonText}>Buscar</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 10 }}>Atualizar Estoque</Text>
                <Text>Código do Produto: {dadosEndereco[0][0]}</Text>
                <Text>Endereço: {dadosEndereco[0][2]}</Text>
                <Text>Estoque Atual: {dadosEndereco[0][5]}</Text>

                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  placeholder="Quantidade a retirar"
                  keyboardType="numeric"
                  value={quantidadeRetirada}
                  onChangeText={setQuantidadeRetirada}
                />

                <TouchableOpacity
                  style={[styles.searchButton, { marginTop: 16 }]}
                  onPress={confirmarRetirada}
                >
                  <Text style={styles.searchButtonText}>Confirmar Retirada</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={{ marginTop: 10, backgroundColor: '#4CAF50', padding: 10, borderRadius: 8 }}
              onPress={() => {
                setModalVisible(false);
                setDadosEndereco([]);
                setQuantidadeRetirada('');
              }}
            >
              <Text style={{ color: '#fff', textAlign: 'center' }}>Fechar</Text>
            </TouchableOpacity>
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
});