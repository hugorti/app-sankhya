// app/lotes-parceiro.tsx

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  Alert,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';

import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { queryJson, salvarLoteAPI } from '@/services/api';

interface NotaParceiro {
  NUNOTA: number;
  CODPARC: number;
  NOMEPARC: string;
  DHALTER: string;
  CODPROD: number;
  DESCRPROD: string;
  QTDCONF: number;
  REFERENCIA: string;
  CODEMP: number;
  dataValidade?: string;
  loteVinculado?: string;
}

type FiltroLote = 'todos' | 'comLote' | 'semLote';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ALTURA_PEQUENA = SCREEN_HEIGHT < 700;

export default function LotesParceiroScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [notas, setNotas] = useState<NotaParceiro[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [notaSelecionada, setNotaSelecionada] =
    useState<NotaParceiro | null>(null);

  const [lote, setLote] = useState('');
  const [dataValidade, setDataValidade] = useState('');

  const [salvando, setSalvando] = useState(false);

  const [filtroAtivo, setFiltroAtivo] =
    useState<FiltroLote>('todos');

  const [showDateSelector, setShowDateSelector] = useState(false);

  const [dia, setDia] = useState('');
  const [mes, setMes] = useState('');
  const [ano, setAno] = useState('');

  /**
   * ============================================================
   * CARREGAR NOTAS
   * ============================================================
   */
  useEffect(() => {
    buscarNotas();
  }, []);

  const buscarNotas = async () => {
    if (loading) return;

    try {
      setLoading(true);

      const sql = `
        SELECT TOP 20
          CAB.NUNOTA,
          CAB.CODPARC,
          PAR.NOMEPARC,
          COI2.DHALTER,
          COI2.CODPROD,
          PRO.DESCRPROD,
          COI2.QTDCONF,
          PRO.REFERENCIA,
          CAB.CODEMP,
          LP.LOTE,
          CONVERT(VARCHAR(10), LP.DATAVAL, 103) AS DATAVAL

        FROM TGFCAB CAB

        INNER JOIN TGFCON2 CON2
          ON CAB.NUCONFATUAL = CON2.NUCONF

        INNER JOIN TGFCOI2 COI2
          ON CON2.NUCONF = COI2.NUCONF

        INNER JOIN TGFPRO PRO
          ON COI2.CODPROD = PRO.CODPROD

        INNER JOIN TGFPAR PAR
          ON CAB.CODPARC = PAR.CODPARC

        LEFT JOIN AD_LOTESPROD LP
          ON LP.NUNOTA = CAB.NUNOTA
         AND LP.CODPROD = COI2.CODPROD

        ORDER BY
          CAB.NUNOTA DESC,
          COI2.CODPROD
      `;

      const result = await queryJson(
        'DbExplorerSP.executeQuery',
        { sql }
      );

      if (!result?.rows) {
        setNotas([]);
        return;
      }

      const notasData: NotaParceiro[] = result.rows.map(
        (row: any[]) => ({
          NUNOTA: Number(row[0]) || 0,
          CODPARC: Number(row[1]) || 0,
          NOMEPARC: row[2] || '',
          DHALTER: row[3] || '',
          CODPROD: Number(row[4]) || 0,
          DESCRPROD: row[5] || '',
          QTDCONF: Number(row[6]) || 0,
          REFERENCIA: row[7] || '',
          CODEMP: Number(row[8]) || 0,
          loteVinculado: row[9] || '',
          dataValidade: row[10] || '',
        })
      );

      setNotas(notasData);

    } catch (error) {
      console.error('Erro ao buscar notas:', error);

      Alert.alert(
        'Erro',
        'Falha ao carregar as notas.'
      );

    } finally {
      setLoading(false);
    }
  };

  /**
   * ============================================================
   * FILTRO
   * ============================================================
   */

  const notasFiltradas = useMemo(() => {
    let resultado = [...notas];

    if (filtroAtivo === 'comLote') {
      resultado = resultado.filter(
        item => !!item.loteVinculado
      );
    }

    if (filtroAtivo === 'semLote') {
      resultado = resultado.filter(
        item => !item.loteVinculado
      );
    }

    const busca = searchQuery.trim().toLowerCase();

    if (busca) {
      resultado = resultado.filter(item => {

        const nunota =
          item.NUNOTA?.toString().toLowerCase() || '';

        const parceiro =
          item.NOMEPARC?.toLowerCase() || '';

        const produto =
          item.DESCRPROD?.toLowerCase() || '';

        const referencia =
          item.REFERENCIA?.toLowerCase() || '';

        const lote =
          item.loteVinculado?.toLowerCase() || '';

        const codprod =
          item.CODPROD?.toString().toLowerCase() || '';

        return (
          nunota.includes(busca) ||
          parceiro.includes(busca) ||
          produto.includes(busca) ||
          referencia.includes(busca) ||
          lote.includes(busca) ||
          codprod.includes(busca)
        );
      });
    }

    return resultado;

  }, [notas, searchQuery, filtroAtivo]);

  /**
   * ============================================================
   * DATA
   * ============================================================
   */

  const abrirSeletorData = () => {
    const hoje = new Date();

    if (!dataValidade) {

      setDia(
        hoje.getDate()
          .toString()
          .padStart(2, '0')
      );

      setMes(
        (hoje.getMonth() + 1)
          .toString()
          .padStart(2, '0')
      );

      setAno(
        hoje.getFullYear().toString()
      );

    } else {

      const partes = dataValidade.split('/');

      if (partes.length === 3) {
        setDia(partes[0]);
        setMes(partes[1]);
        setAno(partes[2]);
      }
    }

    setShowDateSelector(true);
  };

  const confirmarData = () => {

    if (!dia || !mes || !ano) {
      Alert.alert(
        'Atenção',
        'Informe dia, mês e ano.'
      );
      return;
    }

    const data = `${dia.padStart(2, '0')}/${mes.padStart(
      2,
      '0'
    )}/${ano}`;

    setDataValidade(data);
    setShowDateSelector(false);
  };

  /**
   * ============================================================
   * MODAL DE LOTE
   * ============================================================
   */

  const abrirModalLote = (nota: NotaParceiro) => {

    setNotaSelecionada(nota);

    setLote(
      nota.loteVinculado || ''
    );

    setDataValidade(
      nota.dataValidade || ''
    );

    setModalVisible(true);
  };

  const fecharModal = () => {

    if (salvando) return;

    setModalVisible(false);
    setNotaSelecionada(null);
    setLote('');
    setDataValidade('');
  };

  /**
   * ============================================================
   * SALVAR LOTE
   * ============================================================
   */

  const salvarLote = async () => {

    if (!notaSelecionada) {
      return;
    }

    const loteAtual =
      notaSelecionada.loteVinculado || '';

    const validadeAtual =
      notaSelecionada.dataValidade || '';

    const novoLote = lote.trim();

    if (!novoLote) {
      Alert.alert(
        'Atenção',
        'Informe o lote.'
      );
      return;
    }

    if (!dataValidade) {
      Alert.alert(
        'Atenção',
        'Selecione a data de validade.'
      );
      return;
    }

    /**
     * Permite atualizar caso:
     *
     * - lote tenha mudado
     * OU
     * - validade tenha mudado
     */

    const loteMudou =
      novoLote !== loteAtual;

    const validadeMudou =
      dataValidade !== validadeAtual;

    if (!loteMudou && !validadeMudou) {
      Alert.alert(
        'Atenção',
        'Nenhuma alteração foi realizada.'
      );
      return;
    }

    try {

      setSalvando(true);

      await salvarLoteAPI(
        notaSelecionada.NUNOTA,
        notaSelecionada.CODPROD,
        novoLote,
        dataValidade
      );

      /**
       * Fecha primeiro o modal para evitar
       * sobreposição de componentes no coletor.
       */

      setModalVisible(false);
      setNotaSelecionada(null);
      setLote('');
      setDataValidade('');

      /**
       * Atualiza a lista depois.
       */

      await buscarNotas();

      Alert.alert(
        'Sucesso',
        'Lote atualizado com sucesso!'
      );

    } catch (error: any) {

      console.error(
        'Erro ao salvar lote:',
        error
      );

      Alert.alert(
        'Erro',
        error?.message ||
          'Falha ao vincular o lote.'
      );

    } finally {
      setSalvando(false);
    }
  };

  /**
   * ============================================================
   * FORMATA DATA
   * ============================================================
   */

  const formatarDataExibicao = (
    dataString?: string | null
  ) => {

    if (!dataString) {
      return '';
    }

    try {

      const data = String(dataString)
        .split(/[T ]/)[0];

      /**
       * Já está DD/MM/YYYY
       */
      if (
        /^\d{2}\/\d{2}\/\d{4}$/.test(data)
      ) {
        return data;
      }

      /**
       * YYYY-MM-DD
       */
      if (
        /^\d{4}-\d{2}-\d{2}$/.test(data)
      ) {

        const [ano, mes, dia] =
          data.split('-');

        return `${dia}/${mes}/${ano}`;
      }

      return data;

    } catch {
      return String(dataString);
    }
  };

  /**
   * ============================================================
   * RENDER CARD
   * ============================================================
   */

  const renderItem = ({
    item,
  }: {
    item: NotaParceiro;
  }) => {

    const possuiLote =
      !!item.loteVinculado;

    return (
      <TouchableOpacity
        style={[
          styles.notaCard,
          possuiLote && styles.notaComLote,
        ]}
        activeOpacity={0.7}
        onPress={() =>
          abrirModalLote(item)
        }
      >

        <View style={styles.notaHeader}>

          <View style={styles.notaHeaderEsquerda}>
            <Text style={styles.notaNumero}>
              NF: {item.NUNOTA}
            </Text>

            <Text
              style={styles.parceiroNome}
              numberOfLines={1}
            >
              {item.NOMEPARC ||
                'Parceiro não informado'}
            </Text>
          </View>

          {possuiLote && (
            <Ionicons
              name="checkmark-circle"
              size={22}
              color="#4CAF50"
            />
          )}

        </View>

        <View style={styles.divisor} />

        <Text
          style={styles.produtoTexto}
          numberOfLines={2}
        >
          <Text style={styles.codigoProduto}>
            {item.CODPROD}
          </Text>
          {' - '}
          {item.DESCRPROD ||
            'Produto não informado'}
        </Text>

        <View style={styles.informacoesLinha}>

          <View style={styles.infoItem}>
            <Ionicons
              name="cube-outline"
              size={15}
              color="#777"
            />

            <Text style={styles.infoTexto}>
              Qtd: {item.QTDCONF}
            </Text>
          </View>

          {item.dataValidade && (
            <View style={styles.infoItem}>
              <Ionicons
                name="calendar-outline"
                size={15}
                color="#9C27B0"
              />

              <Text style={styles.validadeTexto}>
                {formatarDataExibicao(
                  item.dataValidade
                )}
              </Text>
            </View>
          )}

        </View>

        {possuiLote && (
          <View style={styles.loteContainer}>

            <Ionicons
              name="pricetag"
              size={15}
              color="white"
            />

            <Text
              style={styles.loteText}
              numberOfLines={1}
            >
              {item.loteVinculado}
            </Text>

          </View>
        )}

      </TouchableOpacity>
    );
  };

  /**
   * ============================================================
   * DATA SELETOR
   * ============================================================
   */

  const dias = Array.from(
    { length: 31 },
    (_, i) =>
      (i + 1)
        .toString()
        .padStart(2, '0')
  );

  const meses = Array.from(
    { length: 12 },
    (_, i) =>
      (i + 1)
        .toString()
        .padStart(2, '0')
  );

  const anos = Array.from(
    { length: 10 },
    (_, i) =>
      (
        new Date().getFullYear() + i
      ).toString()
  );

  /**
   * ============================================================
   * TELA
   * ============================================================
   */

  return (
    <SafeAreaView style={styles.container}>

      {/* HEADER */}

      <View style={styles.header}>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color="white"
          />
        </TouchableOpacity>

        <Text
          style={styles.headerTitle}
          numberOfLines={1}
        >
          Vinculação de Lotes
        </Text>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={buscarNotas}
          disabled={loading}
        >
          <Ionicons
            name="refresh"
            size={22}
            color="white"
          />
        </TouchableOpacity>

      </View>

      {/* BUSCA */}

      <View style={styles.searchContainer}>

        <Ionicons
          name="search"
          size={18}
          color="#888"
        />

        <TextInput
          style={styles.searchInput}
          placeholder="Buscar nota, produto ou lote"
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />

        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() =>
              setSearchQuery('')
            }
          >
            <Ionicons
              name="close-circle"
              size={19}
              color="#999"
            />
          </TouchableOpacity>
        )}

      </View>

      {/* FILTROS */}

      <View style={styles.filtrosContainer}>

        <TouchableOpacity
          style={[
            styles.filtroButton,
            filtroAtivo === 'todos' &&
              styles.filtroAtivo,
          ]}
          onPress={() =>
            setFiltroAtivo('todos')
          }
        >
          <Text
            style={[
              styles.filtroText,
              filtroAtivo === 'todos' &&
                styles.filtroTextAtivo,
            ]}
          >
            Todos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filtroButton,
            filtroAtivo === 'comLote' &&
              styles.filtroAtivo,
          ]}
          onPress={() =>
            setFiltroAtivo('comLote')
          }
        >
          <Text
            style={[
              styles.filtroText,
              filtroAtivo === 'comLote' &&
                styles.filtroTextAtivo,
            ]}
          >
            Com lote
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filtroButton,
            filtroAtivo === 'semLote' &&
              styles.filtroAtivo,
          ]}
          onPress={() =>
            setFiltroAtivo('semLote')
          }
        >
          <Text
            style={[
              styles.filtroText,
              filtroAtivo === 'semLote' &&
                styles.filtroTextAtivo,
            ]}
          >
            Sem lote
          </Text>
        </TouchableOpacity>

      </View>

      {/* LISTA */}

      {loading ? (

        <View style={styles.loadingContainer}>

          <ActivityIndicator
            size="large"
            color="#9C27B0"
          />

          <Text style={styles.loadingText}>
            Carregando...
          </Text>

        </View>

      ) : (

        <FlatList
          data={notasFiltradas}
          keyExtractor={(item, index) =>
            `${item.NUNOTA}-${item.CODPROD}-${index}`
          }
          renderItem={renderItem}
          contentContainerStyle={
            styles.listContainer
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshing={loading}
          onRefresh={buscarNotas}
          ListEmptyComponent={
            <View
              style={styles.emptyContainer}
            >

              <Ionicons
                name="document-text-outline"
                size={48}
                color="#ccc"
              />

              <Text
                style={styles.emptyText}
              >
                {filtroAtivo === 'comLote'
                  ? 'Nenhuma nota com lote'
                  : filtroAtivo === 'semLote'
                  ? 'Nenhuma nota sem lote'
                  : 'Nenhuma nota encontrada'}
              </Text>

            </View>
          }
        />

      )}

      {/* ======================================================
          MODAL LOTE
      ====================================================== */}

      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={fecharModal}
      >

        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : undefined
          }
        >

          <View style={styles.modalContent}>

            <View style={styles.modalHeader}>

              <Text style={styles.modalTitle}>
                {notaSelecionada?.loteVinculado
                  ? 'Editar lote'
                  : 'Vincular lote'}
              </Text>

              <TouchableOpacity
                onPress={fecharModal}
                disabled={salvando}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color="#666"
                />
              </TouchableOpacity>

            </View>

            {notaSelecionada && (
              <>

                {/* NOTA */}

                <View style={styles.modalInfo}>

                  <Text
                    style={styles.modalLabel}
                  >
                    NF:
                  </Text>

                  <Text
                    style={styles.modalValue}
                  >
                    {notaSelecionada.NUNOTA}
                  </Text>

                </View>

                {/* PRODUTO */}

                <View style={styles.modalInfo}>

                  <Text
                    style={styles.modalLabel}
                  >
                    Produto:
                  </Text>

                  <Text
                    style={styles.modalValue}
                    numberOfLines={2}
                  >
                    {notaSelecionada.CODPROD}
                    {' - '}
                    {notaSelecionada.DESCRPROD}
                  </Text>

                </View>

                {/* LOTE ATUAL */}

                {notaSelecionada.loteVinculado && (
                  <View
                    style={
                      styles.loteAtualContainer
                    }
                  >

                    <Ionicons
                      name="pricetag"
                      size={18}
                      color="#9C27B0"
                    />

                    <Text
                      style={
                        styles.loteAtualInfo
                      }
                    >
                      Lote atual:{' '}
                      <Text
                        style={
                          styles.loteAtualDestaque
                        }
                      >
                        {
                          notaSelecionada.loteVinculado
                        }
                      </Text>
                    </Text>

                  </View>
                )}

                {/* LOTE */}

                <Text
                  style={styles.inputLabel}
                >
                  Lote
                </Text>

                <TextInput
                  style={styles.loteInput}
                  placeholder="Digite o lote"
                  placeholderTextColor="#999"
                  value={lote}
                  onChangeText={setLote}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={50}
                />

                {/* VALIDADE */}

                <Text
                  style={styles.inputLabel}
                >
                  Data de validade
                </Text>

                <TouchableOpacity
                  onPress={
                    abrirSeletorData
                  }
                  style={
                    styles.datePickerButton
                  }
                >

                  <Text
                    style={
                      dataValidade
                        ? styles.datePickerText
                        : styles.datePickerPlaceholder
                    }
                  >
                    {dataValidade ||
                      'Selecionar validade'}
                  </Text>

                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color="#777"
                  />

                </TouchableOpacity>

                {/* BOTÕES */}

                <View
                  style={styles.modalButtons}
                >

                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.cancelButton,
                    ]}
                    onPress={fecharModal}
                    disabled={salvando}
                  >
                    <Text
                      style={
                        styles.cancelButtonText
                      }
                    >
                      Cancelar
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.saveButton,
                    ]}
                    onPress={salvarLote}
                    disabled={salvando}
                  >

                    {salvando ? (

                      <ActivityIndicator
                        size="small"
                        color="white"
                      />

                    ) : (

                      <Text
                        style={
                          styles.buttonText
                        }
                      >
                        {notaSelecionada.loteVinculado
                          ? 'Atualizar'
                          : 'Salvar'}
                      </Text>

                    )}

                  </TouchableOpacity>

                </View>

              </>
            )}

          </View>

        </KeyboardAvoidingView>

      </Modal>

      {/* ======================================================
          MODAL DATA
      ====================================================== */}

      <Modal
        visible={showDateSelector}
        animationType="fade"
        transparent
        onRequestClose={() =>
          setShowDateSelector(false)
        }
      >

        <View
          style={styles.modalOverlay}
        >

          <View
            style={[
              styles.modalContent,
              styles.dateSelectorModal,
            ]}
          >

            <View
              style={styles.modalHeader}
            >

              <Text
                style={styles.modalTitle}
              >
                Data de validade
              </Text>

              <TouchableOpacity
                onPress={() =>
                  setShowDateSelector(false)
                }
              >
                <Ionicons
                  name="close"
                  size={24}
                  color="#666"
                />
              </TouchableOpacity>

            </View>

            {/* DATA */}

            <View
              style={
                styles.dateSelectorContainer
              }
            >

              {/* DIA */}

              <View
                style={
                  styles.dateSelectorColumn
                }
              >

                <Text
                  style={
                    styles.dateSelectorLabel
                  }
                >
                  Dia
                </Text>

                <ScrollView
                  style={
                    styles.dateSelectorScroll
                  }
                  showsVerticalScrollIndicator={
                    false
                  }
                >

                  {dias.map(item => (

                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.dateSelectorItem,
                        dia === item &&
                          styles.dateSelectorItemSelected,
                      ]}
                      onPress={() =>
                        setDia(item)
                      }
                    >

                      <Text
                        style={[
                          styles.dateSelectorItemText,
                          dia === item &&
                            styles.dateSelectorItemTextSelected,
                        ]}
                      >
                        {item}
                      </Text>

                    </TouchableOpacity>

                  ))}

                </ScrollView>

              </View>

              {/* MÊS */}

              <View
                style={
                  styles.dateSelectorColumn
                }
              >

                <Text
                  style={
                    styles.dateSelectorLabel
                  }
                >
                  Mês
                </Text>

                <ScrollView
                  style={
                    styles.dateSelectorScroll
                  }
                  showsVerticalScrollIndicator={
                    false
                  }
                >

                  {meses.map(item => (

                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.dateSelectorItem,
                        mes === item &&
                          styles.dateSelectorItemSelected,
                      ]}
                      onPress={() =>
                        setMes(item)
                      }
                    >

                      <Text
                        style={[
                          styles.dateSelectorItemText,
                          mes === item &&
                            styles.dateSelectorItemTextSelected,
                        ]}
                      >
                        {item}
                      </Text>

                    </TouchableOpacity>

                  ))}

                </ScrollView>

              </View>

              {/* ANO */}

              <View
                style={
                  styles.dateSelectorColumn
                }
              >

                <Text
                  style={
                    styles.dateSelectorLabel
                  }
                >
                  Ano
                </Text>

                <ScrollView
                  style={
                    styles.dateSelectorScroll
                  }
                  showsVerticalScrollIndicator={
                    false
                  }
                >

                  {anos.map(item => (

                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.dateSelectorItem,
                        ano === item &&
                          styles.dateSelectorItemSelected,
                      ]}
                      onPress={() =>
                        setAno(item)
                      }
                    >

                      <Text
                        style={[
                          styles.dateSelectorItemText,
                          ano === item &&
                            styles.dateSelectorItemTextSelected,
                        ]}
                      >
                        {item}
                      </Text>

                    </TouchableOpacity>

                  ))}

                </ScrollView>

              </View>

            </View>

            {/* DATA SELECIONADA */}

            <View
              style={
                styles.selectedDateContainer
              }
            >

              <Text
                style={
                  styles.selectedDateText
                }
              >
                {dia && mes && ano
                  ? `${dia}/${mes}/${ano}`
                  : 'Selecione a data'}
              </Text>

            </View>

            {/* BOTÕES */}

            <View
              style={styles.modalButtons}
            >

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.cancelButton,
                ]}
                onPress={() =>
                  setShowDateSelector(false)
                }
              >
                <Text
                  style={
                    styles.cancelButtonText
                  }
                >
                  Cancelar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.saveButton,
                ]}
                onPress={confirmarData}
              >
                <Text
                  style={styles.buttonText}
                >
                  Confirmar
                </Text>
              </TouchableOpacity>

            </View>

          </View>

        </View>

      </Modal>

    </SafeAreaView>
  );
}

/**
 * ============================================================
 * ESTILOS
 * ============================================================
 */

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  /**
   * HEADER
   */

  header: {
    height: ALTURA_PEQUENA ? 52 : 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    backgroundColor: '#9C27B0',
  },

  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: ALTURA_PEQUENA ? 17 : 19,
    fontWeight: 'bold',
    color: 'white',
    marginHorizontal: 8,
  },

  /**
   * BUSCA
   */

  searchContainer: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#ddd',
  },

  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 15,
    color: '#333',
    marginLeft: 7,
  },

  /**
   * FILTROS
   */

  filtrosContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginBottom: 6,
  },

  filtroButton: {
    flex: 1,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3,
    borderRadius: 17,
    backgroundColor: '#e0e0e0',
    borderWidth: 1,
    borderColor: '#ccc',
  },

  filtroAtivo: {
    backgroundColor: '#9C27B0',
    borderColor: '#9C27B0',
  },

  filtroText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },

  filtroTextAtivo: {
    color: 'white',
    fontWeight: 'bold',
  },

  /**
   * LOADING
   */

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
  },

  /**
   * LISTA
   */

  listContainer: {
    paddingHorizontal: 10,
    paddingTop: 3,
    paddingBottom: 20,
  },

  /**
   * CARD
   */

  notaCard: {
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 7,
    marginBottom: 7,
    borderLeftWidth: 3,
    borderLeftColor: '#9C27B0',

    elevation: 1,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },

  notaComLote: {
    backgroundColor: '#f1f8f2',
    borderLeftColor: '#4CAF50',
  },

  notaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  notaHeaderEsquerda: {
    flex: 1,
    marginRight: 5,
  },

  notaNumero: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },

  parceiroNome: {
    fontSize: 12,
    color: '#9C27B0',
    fontWeight: '600',
    marginTop: 2,
  },

  divisor: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 6,
  },

  produtoTexto: {
    fontSize: 13,
    color: '#333',
    lineHeight: 17,
  },

  codigoProduto: {
    fontWeight: 'bold',
  },

  informacoesLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },

  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 18,
  },

  infoTexto: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },

  validadeTexto: {
    fontSize: 12,
    color: '#9C27B0',
    fontWeight: '600',
    marginLeft: 4,
  },

  loteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#9C27B0',
    borderRadius: 5,
  },

  loteText: {
    flex: 1,
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 5,
  },

  /**
   * VAZIO
   */

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
  },

  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },

  /**
   * MODAL
   */

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },

  modalContent: {
    backgroundColor: 'white',
    width: '96%',
    maxWidth: 420,
    padding: 15,
    borderRadius: 10,
    elevation: 8,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  modalTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: 'bold',
    color: '#333',
  },

  modalInfo: {
    flexDirection: 'row',
    marginBottom: 5,
  },

  modalLabel: {
    width: 58,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#444',
  },

  modalValue: {
    flex: 1,
    fontSize: 12,
    color: '#666',
  },

  loteAtualContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3e5f5',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
    marginBottom: 8,
  },

  loteAtualInfo: {
    fontSize: 12,
    color: '#555',
    marginLeft: 6,
  },

  loteAtualDestaque: {
    fontWeight: 'bold',
    color: '#9C27B0',
  },

  inputLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#555',
    marginTop: 8,
    marginBottom: 4,
  },

  loteInput: {
    height: 42,
    backgroundColor: '#f9f9f9',
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 15,
    color: '#333',
  },

  datePickerButton: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9f9f9',
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },

  datePickerText: {
    fontSize: 14,
    color: '#333',
  },

  datePickerPlaceholder: {
    fontSize: 14,
    color: '#999',
  },

  modalButtons: {
    flexDirection: 'row',
    marginTop: 15,
  },

  modalButton: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    marginHorizontal: 3,
  },

  cancelButton: {
    backgroundColor: '#e0e0e0',
  },

  cancelButtonText: {
    color: '#555',
    fontWeight: 'bold',
    fontSize: 13,
  },

  saveButton: {
    backgroundColor: '#9C27B0',
  },

  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
  },

  /**
   * MODAL DATA
   */

  dateSelectorModal: {
    maxHeight: '85%',
  },

  dateSelectorContainer: {
    flexDirection: 'row',
    height: ALTURA_PEQUENA ? 220 : 260,
    marginBottom: 10,
  },

  dateSelectorColumn: {
    flex: 1,
    marginHorizontal: 3,
  },

  dateSelectorLabel: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 5,
  },

  dateSelectorScroll: {
    flex: 1,
  },

  dateSelectorItem: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
    borderRadius: 5,
    backgroundColor: '#f3f3f3',
  },

  dateSelectorItemSelected: {
    backgroundColor: '#9C27B0',
  },

  dateSelectorItemText: {
    fontSize: 12,
    color: '#333',
  },

  dateSelectorItemTextSelected: {
    color: 'white',
    fontWeight: 'bold',
  },

  selectedDateContainer: {
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },

  selectedDateText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#9C27B0',
  },

});