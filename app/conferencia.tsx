import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  queryJson,
  registerUserActivity,
  salvarConferenciaAPI,
} from '@/services/api';

import { useSession } from '@/hooks/useSession';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';

interface Volume {
  IDREV: number;
  SEQETIQUETA: number;
}

interface ApiRow {
  0: number;
  1: number;
}

interface ConferenciaData {
  volumes: Volume[];
  conferidos: number[];
  ultimoConferido: Volume | null;
}

interface FinalizacaoData {
  nuseparacao: number;
  nunota: string;
  ordemCarga: number;
  usuario: string;
  dataFinalizacao: string;
  volumesConferidos: number[];
  volumesFaltantes: number[];
  motivo?: string;
  completa: boolean;
  situacao: string;
}

export default function ConferenciaScreen() {
  const { session } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams();

  // ============================================================
  // PARÂMETROS
  // ============================================================

  const nuseparacao = Number(params.nuseparacao) || 0;
  const totalVolumes = Number(params.totalVolumes) || 0;
  const ordemCarga = Number(params.ordemCarga) || 0;

  const nunota =
    typeof params.nunota === 'string'
      ? params.nunota
      : String(params.nunota ?? '');

  const volumesConferidosParam =
    typeof params.volumesConferidos === 'string'
      ? params.volumesConferidos
      : '';

  // ============================================================
  // ESTADOS
  // ============================================================

  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [conferidos, setConferidos] = useState<number[]>([]);
  const [inputValue, setInputValue] = useState('');

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [ultimoConferido, setUltimoConferido] =
    useState<Volume | null>(null);

  const [showMotivoModal, setShowMotivoModal] = useState(false);
  const [showVolumesModal, setShowVolumesModal] = useState(false);

  const [motivo, setMotivo] = useState('');

  // ============================================================
  // STORAGE
  // ============================================================

  const storageKey = `conferencia_${nunota}`;
  const finalizacoesKey = 'conferencia_finalizacoes';

  // ============================================================
  // OPÇÕES DE MOTIVO
  // ============================================================

  const opcoesMotivo = [
    {
      label: 'Selecione um motivo...',
      value: '',
    },
    {
      label: 'Faltando volumes',
      value: 'Faltando volumes',
    },
    {
      label: 'Caixa sem etiqueta',
      value: 'Caixa sem etiqueta',
    },
    {
      label: 'Não bipando volumes',
      value: 'Não bipando volumes',
    },
    {
      label: 'Troca de turno',
      value: 'Troca de turno',
    },
  ];

  // ============================================================
  // CARREGAR DADOS
  // ============================================================

  useEffect(() => {
    let ativo = true;

    const carregarDados = async () => {
      try {
        if (!ativo) return;

        setLoading(true);
        setError(null);

        console.log('====================================');
        console.log('📦 INICIANDO CONFERÊNCIA');
        console.log('NUNOTA:', nunota);
        console.log('ORDEM CARGA:', ordemCarga);
        console.log('TOTAL VOLUMES:', totalVolumes);
        console.log('====================================');

        // --------------------------------------------------------
        // 1. TENTA CARREGAR DO STORAGE
        // --------------------------------------------------------

        const savedData = await AsyncStorage.getItem(storageKey);

        if (savedData) {
          try {
            const parsedData: ConferenciaData = JSON.parse(savedData);

            if (
              parsedData &&
              Array.isArray(parsedData.volumes) &&
              Array.isArray(parsedData.conferidos)
            ) {
              if (!ativo) return;

              setVolumes(parsedData.volumes);
              setConferidos(parsedData.conferidos);
              setUltimoConferido(
                parsedData.ultimoConferido || null
              );

              console.log(
                '💾 Dados locais carregados:',
                parsedData.conferidos.length,
                'volumes'
              );

              if (parsedData.volumes.length > 0) {
                setLoading(false);
                return;
              }
            }
          } catch (storageError) {
            console.error(
              '❌ Erro ao interpretar dados locais:',
              storageError
            );

            await AsyncStorage.removeItem(storageKey);
          }
        }

        // --------------------------------------------------------
        // 2. VOLUMES CONFERIDOS RECEBIDOS POR PARÂMETRO
        // --------------------------------------------------------

        let conferidosIniciais: number[] = [];

        if (volumesConferidosParam) {
          try {
            const parsed = JSON.parse(volumesConferidosParam);

            if (Array.isArray(parsed)) {
              conferidosIniciais = parsed
                .map(Number)
                .filter((value) => !isNaN(value));
            }
          } catch (paramError) {
            console.error(
              '❌ Erro ao interpretar volumes conferidos:',
              paramError
            );
          }
        }

        // --------------------------------------------------------
        // 3. BUSCA VOLUMES NO SERVIDOR
        // --------------------------------------------------------

        console.log('🔎 Buscando volumes no servidor...');

        const result = await queryJson(
          'DbExplorerSP.executeQuery',
          {
            sql: `
              SELECT
                IDREV,
                SEQETIQUETA
              FROM TGWREV
              WHERE NUNOTA = ${Number(nunota)}
              ORDER BY SEQETIQUETA
            `,
          }
        );

        if (!result || !Array.isArray(result.rows)) {
          throw new Error(
            'Não foi possível obter os volumes da nota.'
          );
        }

        const volumesData: Volume[] = result.rows
          .map((row: ApiRow) => ({
            IDREV: Number(row[0]),
            SEQETIQUETA: Number(row[1]),
          }))
          .filter(
            (volume: Volume) =>
              !isNaN(volume.IDREV) &&
              !isNaN(volume.SEQETIQUETA)
          );

        if (!ativo) return;

        console.log(
          '📦 Volumes encontrados:',
          volumesData.length
        );

        setVolumes(volumesData);
        setConferidos(conferidosIniciais);

        await saveConferenciaData({
          volumes: volumesData,
          conferidos: conferidosIniciais,
          ultimoConferido: null,
        });
      } catch (err) {
        console.error(
          '❌ Erro ao carregar conferência:',
          err
        );

        if (ativo) {
          setError(
            err instanceof Error
              ? err.message
              : 'Erro ao carregar volumes'
          );
        }
      } finally {
        if (ativo) {
          setLoading(false);
        }
      }
    };

    carregarDados();

    return () => {
      ativo = false;
    };
  }, []);

  // ============================================================
  // CONFERÊNCIA AUTOMÁTICA
  // ============================================================

  useEffect(() => {
    if (
      inputValue.length === 7 &&
      conferidos.length < totalVolumes &&
      !salvando
    ) {
      handleConferir();
    }
  }, [inputValue]);

  // ============================================================
  // SALVAR CONFERÊNCIA LOCAL
  // ============================================================

  const saveConferenciaData = async (
    data: ConferenciaData
  ) => {
    try {
      await AsyncStorage.setItem(
        storageKey,
        JSON.stringify(data)
      );

      console.log('💾 Conferência salva localmente');
    } catch (err) {
      console.error(
        '❌ Erro ao salvar dados da conferência:',
        err
      );
    }
  };

  // ============================================================
  // SALVAR FINALIZAÇÃO LOCAL
  // ============================================================

  const saveFinalizacaoData = async (
    data: FinalizacaoData
  ) => {
    try {
      const finalizacoesExistentes =
        await AsyncStorage.getItem(finalizacoesKey);

      let finalizacoes: FinalizacaoData[] = [];

      if (finalizacoesExistentes) {
        try {
          const parsed = JSON.parse(
            finalizacoesExistentes
          );

          if (Array.isArray(parsed)) {
            finalizacoes = parsed;
          }
        } catch (parseError) {
          console.error(
            '❌ Erro ao interpretar histórico:',
            parseError
          );
        }
      }

      finalizacoes.push(data);

      await AsyncStorage.setItem(
        finalizacoesKey,
        JSON.stringify(finalizacoes)
      );

      console.log('💾 Finalização salva localmente');
    } catch (err) {
      console.error(
        '❌ Erro ao salvar finalização:',
        err
      );
    }
  };

  // ============================================================
  // CONFERIR VOLUME
  // ============================================================

  const handleConferir = async () => {
    try {
      if (salvando) return;

      // --------------------------------------------------------
      // LIMITE
      // --------------------------------------------------------

      if (conferidos.length >= totalVolumes) {
        Alert.alert(
          'Limite atingido',
          'Todos os volumes já foram conferidos!'
        );

        setInputValue('');
        return;
      }

      // --------------------------------------------------------
      // CONVERTE ID
      // --------------------------------------------------------

      const id = parseInt(inputValue, 10);

      if (isNaN(id)) {
        Alert.alert(
          'Valor inválido',
          'Digite um número válido'
        );

        setInputValue('');
        return;
      }

      // --------------------------------------------------------
      // JÁ CONFERIDO
      // --------------------------------------------------------

      if (conferidos.includes(id)) {
        Alert.alert(
          'Já conferido',
          'Este volume já foi conferido'
        );

        setInputValue('');
        return;
      }

      // --------------------------------------------------------
      // PROCURA VOLUME
      // --------------------------------------------------------

      const volumeExistente = volumes.find(
        (v) => v.IDREV === id
      );

      if (!volumeExistente) {
        Alert.alert(
          'Não encontrado',
          'Número digitado não corresponde a nenhum volume'
        );

        setInputValue('');
        return;
      }

      // --------------------------------------------------------
      // ADICIONA VOLUME
      // --------------------------------------------------------

      let novosConferidos = [...conferidos, id];

      setConferidos(novosConferidos);
      setUltimoConferido(volumeExistente);

      await saveConferenciaData({
        volumes,
        conferidos: novosConferidos,
        ultimoConferido: volumeExistente,
      });

      setInputValue('');

      // --------------------------------------------------------
      // CONFIRMAÇÃO AUTOMÁTICA PELA ETIQUETA
      // --------------------------------------------------------

      const volumePorEtiqueta = volumes.find(
        (v) =>
          v.SEQETIQUETA.toString() === inputValue
      );

      if (
        volumePorEtiqueta &&
        volumePorEtiqueta.IDREV !== id &&
        !novosConferidos.includes(
          volumePorEtiqueta.IDREV
        ) &&
        novosConferidos.length < totalVolumes
      ) {
        novosConferidos = [
          ...novosConferidos,
          volumePorEtiqueta.IDREV,
        ];

        setConferidos(novosConferidos);
        setUltimoConferido(volumePorEtiqueta);

        await saveConferenciaData({
          volumes,
          conferidos: novosConferidos,
          ultimoConferido: volumePorEtiqueta,
        });

        Alert.alert(
          'Confirmação automática',
          `Volume ${volumePorEtiqueta.IDREV} ` +
            `(etiqueta ${volumePorEtiqueta.SEQETIQUETA}) ` +
            `confirmado automaticamente`
        );
      }

      // --------------------------------------------------------
      // ATIVIDADE DO USUÁRIO
      // --------------------------------------------------------

      try {
        registerUserActivity();
      } catch (activityError) {
        console.log(
          '⚠️ Não foi possível registrar atividade:',
          activityError
        );
      }
    } catch (error) {
      console.error(
        '❌ Erro ao conferir volume:',
        error
      );

      Alert.alert(
        'Erro',
        'Não foi possível conferir este volume.'
      );

      setInputValue('');
    }
  };

  // ============================================================
  // MOSTRAR VOLUMES FALTANTES
  // ============================================================

  const mostrarVolumesFaltantes = () => {
    try {
      const faltantesCount =
        Math.max(totalVolumes - conferidos.length, 0);

      if (faltantesCount === 0) {
        Alert.alert(
          'Conferência Completa',
          'Todos os volumes foram conferidos!'
        );
        return;
      }

      setShowVolumesModal(true);
    } catch (error) {
      console.error(
        '❌ Erro ao mostrar volumes:',
        error
      );
    }
  };

  // ============================================================
  // FINALIZAÇÃO
  // ============================================================

  const confirmarFinalizacao = async () => {
    if (salvando) {
      return;
    }

    try {
      setSalvando(true);

      console.log('====================================');
      console.log('🚀 FINALIZANDO CONFERÊNCIA');
      console.log('NUNOTA:', nunota);
      console.log('ORDEM:', ordemCarga);
      console.log('CONFERIDOS:', conferidos.length);
      console.log('TOTAL:', totalVolumes);
      console.log('MOTIVO:', motivo);
      console.log('====================================');

      // --------------------------------------------------------
      // CALCULA FALTANTES
      // --------------------------------------------------------

      const faltantes = volumes
        .filter(
          (v) => !conferidos.includes(v.IDREV)
        )
        .map((v) => v.IDREV);

      const completa =
        faltantes.length === 0;

      const situacao = completa
        ? 'Conferência completa'
        : 'Conferência com divergência';

      const volumesFormatado =
        `${conferidos.length} / ${totalVolumes}`;

      // --------------------------------------------------------
      // VALIDA MOTIVO
      // --------------------------------------------------------

      if (!completa && !motivo) {
        setSalvando(false);

        Alert.alert(
          'Atenção',
          'Selecione o motivo da divergência.'
        );

        return;
      }

      // --------------------------------------------------------
      // ENVIA PARA API
      // --------------------------------------------------------

      console.log('📡 Enviando conferência para API...');

      await salvarConferenciaAPI({
        NUNOTA: Number(nunota),
        ORDEMCARGA: Number(ordemCarga),
        CONFERENTE:
          session?.username ||
          'Usuário desconhecido',
        DESCRICAO: completa
          ? 'Conferência completa'
          : motivo,
        VOLUMES: volumesFormatado,
        COMPLETA: completa,
      });

      console.log(
        '✅ Conferência enviada para API'
      );

      // --------------------------------------------------------
      // SALVA HISTÓRICO LOCAL
      // --------------------------------------------------------

      const finalizacaoLocal: FinalizacaoData = {
        nuseparacao,
        nunota,
        ordemCarga,
        usuario:
          session?.username ||
          'Usuário desconhecido',
        dataFinalizacao:
          new Date().toISOString(),
        volumesConferidos: [...conferidos],
        volumesFaltantes: [...faltantes],
        motivo: completa
          ? undefined
          : motivo,
        completa,
        situacao,
      };

      await saveFinalizacaoData(
        finalizacaoLocal
      );

      // --------------------------------------------------------
      // LIMPA MODAL
      // --------------------------------------------------------

      setShowMotivoModal(false);
      setMotivo('');

      // --------------------------------------------------------
      // FINALIZAÇÃO COMPLETA
      // --------------------------------------------------------

      if (completa) {
        await AsyncStorage.removeItem(
          storageKey
        );

        setSalvando(false);

        Alert.alert(
          'Conferência completa!',
          `Todos os ${totalVolumes} volumes foram conferidos.`,
          [
            {
              text: 'OK',
              onPress: () => {
                try {
                  router.back();
                } catch (navigationError) {
                  console.error(
                    'Erro ao voltar:',
                    navigationError
                  );
                }
              },
            },
          ],
          {
            cancelable: false,
          }
        );
      } else {
        // ------------------------------------------------------
        // FINALIZAÇÃO COM DIVERGÊNCIA
        // ------------------------------------------------------

        setSalvando(false);

        Alert.alert(
          'Conferência salva',
          `Progresso salvo.\n\n` +
            `${conferidos.length} volumes conferidos ` +
            `de ${totalVolumes}.`,
          [
            {
              text: 'OK',
              onPress: () => {
                try {
                  router.back();
                } catch (navigationError) {
                  console.error(
                    'Erro ao voltar:',
                    navigationError
                  );
                }
              },
            },
          ],
          {
            cancelable: false,
          }
        );
      }
    } catch (error) {
      console.error(
        '===================================='
      );
      console.error(
        '❌ ERRO AO FINALIZAR CONFERÊNCIA'
      );
      console.error(error);
      console.error(
        '===================================='
      );

      setSalvando(false);

      Alert.alert(
        'Erro',
        error instanceof Error
          ? error.message
          : 'Ocorreu um erro ao salvar a conferência. Tente novamente.',
        [
          {
            text: 'OK',
          },
        ]
      );
    }
  };

  // ============================================================
  // SOLICITAR MOTIVO
  // ============================================================

  const solicitarMotivo = () => {
    if (salvando) return;

    setMotivo('');
    setShowMotivoModal(true);
  };

  // ============================================================
  // FINALIZAR
  // ============================================================

  const finalizarConferencia = () => {
    try {
      if (salvando) return;

      if (conferidos.length === 0) {
        Alert.alert(
          'Atenção',
          'Confira pelo menos um volume antes de finalizar.'
        );

        return;
      }

      const faltantes = volumes.filter(
        (v) => !conferidos.includes(v.IDREV)
      );

      if (faltantes.length === 0) {
        confirmarFinalizacao();
      } else {
        solicitarMotivo();
      }
    } catch (error) {
      console.error(
        '❌ Erro ao iniciar finalização:',
        error
      );

      Alert.alert(
        'Erro',
        'Não foi possível iniciar a finalização.'
      );
    }
  };

  // ============================================================
  // REINICIAR CONFERÊNCIA
  // ============================================================

  const reiniciarConferencia = async () => {
    if (salvando) return;

    Alert.alert(
      'Reiniciar Conferência',
      'Tem certeza que deseja reiniciar a contagem? Todos os volumes conferidos serão perdidos.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Reiniciar',
          style: 'destructive',

          onPress: async () => {
            try {
              await AsyncStorage.removeItem(
                storageKey
              );

              setConferidos([]);
              setUltimoConferido(null);
              setInputValue('');
              setMotivo('');

              Alert.alert(
                'Conferência reiniciada',
                'A contagem foi reiniciada do zero.'
              );
            } catch (error) {
              console.error(
                '❌ Erro ao reiniciar:',
                error
              );

              Alert.alert(
                'Erro',
                'Não foi possível reiniciar a conferência.'
              );
            }
          },
        },
      ]
    );
  };

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator
          size="large"
          color="#4CAF50"
        />

        <Text style={styles.loadingText}>
          Carregando volumes...
        </Text>
      </View>
    );
  }

  // ============================================================
  // TELA
  // ============================================================

  return (
    <View style={styles.container}>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
      >

        {/* ================================================== */}
        {/* CABEÇALHO */}
        {/* ================================================== */}

        <View style={styles.header}>

          <TouchableOpacity
            onPress={async () => {
              if (salvando) return;

              try {
                await saveConferenciaData({
                  volumes,
                  conferidos,
                  ultimoConferido,
                });

                router.back();
              } catch (error) {
                console.error(
                  'Erro ao voltar:',
                  error
                );
              }
            }}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color="white"
            />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>
            Conferência
          </Text>

          <View style={{ width: 24 }} />

        </View>

        {/* ================================================== */}
        {/* ERRO */}
        {/* ================================================== */}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        )}

        {/* ================================================== */}
        {/* INFORMAÇÕES */}
        {/* ================================================== */}

        <View style={styles.infoContainer}>

          <Text style={styles.infoText}>
            Ordem: {ordemCarga}
          </Text>

          <Text style={styles.infoText}>
            Nota: {nunota}
          </Text>

          <Text style={styles.infoText}>
            Separação: {nuseparacao}
          </Text>

          <Text style={styles.infoText}>
            Usuário:{' '}
            {session?.username ||
              'Não identificado'}
          </Text>

          <Text style={styles.infoText}>
            Progresso:{' '}
            {conferidos.length}/{totalVolumes}
          </Text>

        </View>

        {/* ================================================== */}
        {/* PROGRESSO */}
        {/* ================================================== */}

        <View style={styles.progressContainer}>

          <Text style={styles.progressText}>
            {conferidos.length}/{totalVolumes}{' '}
            volumes
          </Text>

          <View style={styles.progressBar}>

            <View
              style={[
                styles.progressFill,
                {
                  width:
                    totalVolumes > 0
                      ? `${Math.min(
                          (conferidos.length /
                            totalVolumes) *
                            100,
                          100
                        )}%`
                      : '0%',
                },
              ]}
            />

          </View>

        </View>

        {/* ================================================== */}
        {/* ÚLTIMO CONFERIDO */}
        {/* ================================================== */}

        {ultimoConferido && (
          <View style={styles.lastChecked}>

            <Text style={styles.lastCheckedText}>
              Último conferido
            </Text>

            <Text style={styles.lastCheckedId}>
              ID: {ultimoConferido.IDREV}
            </Text>

            <Text style={styles.lastCheckedSeq}>
              Etiqueta:{' '}
              {ultimoConferido.SEQETIQUETA}
            </Text>

          </View>
        )}

        {/* ================================================== */}
        {/* INPUT */}
        {/* ================================================== */}

        <View style={styles.inputContainer}>

          <TextInput
            style={[
              styles.input,
              conferidos.length >=
                totalVolumes &&
                styles.disabledInput,
            ]}
            placeholder="Bipe ou digite a etiqueta"
            placeholderTextColor="#999"
            keyboardType="numeric"
            value={inputValue}
            onChangeText={(text) => {
              if (
                conferidos.length <
                totalVolumes
              ) {
                setInputValue(text);

                try {
                  registerUserActivity();
                } catch (error) {
                  console.log(
                    '⚠️ Erro atividade:',
                    error
                  );
                }
              }
            }}
            autoFocus={
              conferidos.length < totalVolumes
            }
            autoCorrect={false}
            autoCapitalize="none"
            maxLength={7}
            editable={
              conferidos.length <
              totalVolumes
            }
          />

          <TouchableOpacity
            style={[
              styles.confirmButton,
              (!inputValue ||
                conferidos.length >=
                  totalVolumes) &&
                styles.disabledButton,
            ]}
            onPress={handleConferir}
            disabled={
              !inputValue ||
              conferidos.length >=
                totalVolumes ||
              salvando
            }
          >
            <Ionicons
              name="checkmark"
              size={24}
              color="white"
            />
          </TouchableOpacity>

        </View>

        {/* ================================================== */}
        {/* BOTÕES */}
        {/* ================================================== */}

        <View style={styles.footerButtons}>

          <TouchableOpacity
            style={[
              styles.volumesButton,
              {
                backgroundColor: '#FFA500',
              },
            ]}
            onPress={mostrarVolumesFaltantes}
            disabled={salvando}
          >
            <Text style={styles.finishButtonText}>
              Volumes
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.finishButton,
              {
                backgroundColor:
                  conferidos.length ===
                  totalVolumes
                    ? '#4CAF50'
                    : '#2196F3',

                opacity:
                  conferidos.length > 0 &&
                  !salvando
                    ? 1
                    : 0.5,
              },
            ]}
            onPress={finalizarConferencia}
            disabled={
              conferidos.length === 0 ||
              salvando
            }
          >

            {salvando ? (
              <ActivityIndicator
                color="white"
                size="small"
              />
            ) : (
              <Text
                style={
                  styles.finishButtonText
                }
              >
                Finalizar
              </Text>
            )}

          </TouchableOpacity>

        </View>

        {/* ================================================== */}
        {/* REINICIAR */}
        {/* ================================================== */}

        <TouchableOpacity
          style={[
            styles.volumesButton,
            {
              backgroundColor: '#F44336',
              marginTop: 8,
              marginHorizontal: 16,
              marginBottom: 30,
            },
          ]}
          onPress={reiniciarConferencia}
          disabled={salvando}
        >
          <Text style={styles.finishButtonText}>
            Reiniciar Contagem
          </Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ==================================================== */}
      {/* MODAL MOTIVO */}
      {/* ==================================================== */}

      <Modal
        visible={showMotivoModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          if (!salvando) {
            setShowMotivoModal(false);
          }
        }}
      >

        <View style={styles.modalContainer}>

          <View style={styles.modalContent}>

            <Text style={styles.modalTitle}>
              Motivo da divergência
            </Text>

            <Text style={styles.modalSubtitle}>
              {Math.max(
                totalVolumes -
                  conferidos.length,
                0
              )}{' '}
              volumes não conferidos
            </Text>

            {/* PICKER */}

            <View
              style={
                styles.pickerContainer
              }
            >

              <Picker
                selectedValue={motivo}
                onValueChange={(itemValue) => {
                  if (!salvando) {
                    setMotivo(
                      String(itemValue)
                    );
                  }
                }}
                style={styles.picker}
                enabled={!salvando}
              >

                {opcoesMotivo.map(
                  (opcao, index) => (
                    <Picker.Item
                      key={index}
                      label={opcao.label}
                      value={opcao.value}
                    />
                  )
                )}

              </Picker>

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
                onPress={() => {
                  if (salvando) return;

                  setMotivo('');
                  setShowMotivoModal(false);
                }}
                disabled={salvando}
              >

                <Text
                  style={
                    styles.modalButtonText
                  }
                >
                  Cancelar
                </Text>

              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.confirmModalButton,
                  !motivo &&
                    styles.disabledButton,
                ]}
                onPress={() => {
                  if (!motivo || salvando) {
                    return;
                  }

                  confirmarFinalizacao();
                }}
                disabled={
                  !motivo || salvando
                }
              >

                {salvando ? (
                  <ActivityIndicator
                    color="white"
                    size="small"
                  />
                ) : (
                  <Text
                    style={
                      styles.modalButtonText
                    }
                  >
                    Confirmar
                  </Text>
                )}

              </TouchableOpacity>

            </View>

          </View>

        </View>

      </Modal>

      {/* ==================================================== */}
      {/* MODAL VOLUMES */}
      {/* ==================================================== */}

      <Modal
        visible={showVolumesModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() =>
          setShowVolumesModal(false)
        }
      >

        <View style={styles.modalContainer}>

          <View style={styles.modalContent}>

            <Text style={styles.modalTitle}>
              Volumes Faltantes
            </Text>

            <Text style={styles.modalSubtitle}>
              {Math.max(
                totalVolumes -
                  conferidos.length,
                0
              )}{' '}
              volumes não conferidos
            </Text>

            <Text
              style={[
                styles.situacaoText,
                conferidos.length ===
                totalVolumes
                  ? styles.situacaoComplete
                  : styles.situacaoDivergencia,
              ]}
            >
              Situação:{' '}
              {conferidos.length ===
              totalVolumes
                ? 'Conferência completa'
                : 'Conferência com divergência'}
            </Text>

            {/* LISTA */}

            <ScrollView
              style={styles.volumesList}
              nestedScrollEnabled={true}
            >

              {volumes
                .filter(
                  (v) =>
                    !conferidos.includes(
                      v.IDREV
                    )
                )
                .map((volume, index) => (
                  <View
                    key={`${volume.IDREV}-${index}`}
                    style={
                      styles.volumeItem
                    }
                  >

                    <Text
                      style={
                        styles.volumeText
                      }
                    >
                      ID: {volume.IDREV}
                    </Text>

                    <Text
                      style={
                        styles.volumeSubText
                      }
                    >
                      Etiqueta:{' '}
                      {
                        volume.SEQETIQUETA
                      }
                    </Text>

                  </View>
                ))}

            </ScrollView>

            <TouchableOpacity
              style={[
                styles.modalButton,
                styles.confirmModalButton,
              ]}
              onPress={() =>
                setShowVolumesModal(false)
              }
            >

              <Text
                style={
                  styles.modalButtonText
                }
              >
                Fechar
              </Text>

            </TouchableOpacity>

          </View>

        </View>

      </Modal>

    </View>
  );
}

// ============================================================
// ESTILOS
// ============================================================

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  scrollContainer: {
    flex: 1,
  },

  scrollContent: {
    paddingBottom: 40,
  },

  // ==========================================================
  // HEADER
  // ==========================================================

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',

    paddingHorizontal: 12,
    paddingVertical: 12,

    backgroundColor: '#2196F3',

    paddingTop: 35,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },

  // ==========================================================
  // ERRO
  // ==========================================================

  errorContainer: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 10,
    backgroundColor: '#ffebee',
    borderRadius: 8,
  },

  errorText: {
    color: '#c62828',
    fontSize: 13,
  },

  // ==========================================================
  // INFORMAÇÕES
  // ==========================================================

  infoContainer: {
    padding: 12,
    backgroundColor: 'white',

    marginHorizontal: 12,
    marginTop: 10,

    borderRadius: 8,

    elevation: 2,
  },

  infoText: {
    fontSize: 14,
    marginBottom: 3,
    color: '#333',
  },

  // ==========================================================
  // PROGRESSO
  // ==========================================================

  progressContainer: {
    padding: 12,
    backgroundColor: 'white',

    marginHorizontal: 12,
    marginTop: 10,

    borderRadius: 8,

    elevation: 2,
  },

  progressText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    color: '#333',
  },

  progressBar: {
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },

  // ==========================================================
  // ÚLTIMO CONFERIDO
  // ==========================================================

  lastChecked: {
    padding: 12,

    backgroundColor: '#E3F2FD',

    marginHorizontal: 12,
    marginTop: 10,

    borderRadius: 8,

    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },

  lastCheckedText: {
    fontSize: 13,
    color: '#0D47A1',
    marginBottom: 3,
  },

  lastCheckedId: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0D47A1',
  },

  lastCheckedSeq: {
    fontSize: 13,
    color: '#0D47A1',
  },

  // ==========================================================
  // INPUT
  // ==========================================================

  inputContainer: {
    flexDirection: 'row',

    marginHorizontal: 12,
    marginTop: 12,
  },

  input: {
    flex: 1,

    backgroundColor: 'white',

    paddingHorizontal: 12,
    paddingVertical: 12,

    borderRadius: 8,

    borderWidth: 1,
    borderColor: '#ddd',

    fontSize: 16,
  },

  disabledInput: {
    backgroundColor: '#f0f0f0',
    color: '#999',
  },

  confirmButton: {
    backgroundColor: '#4CAF50',

    width: 55,

    borderRadius: 8,

    justifyContent: 'center',
    alignItems: 'center',

    marginLeft: 8,
  },

  disabledButton: {
    backgroundColor: '#cccccc',
  },

  // ==========================================================
  // BOTÕES
  // ==========================================================

  footerButtons: {
    flexDirection: 'row',

    marginHorizontal: 12,
    marginTop: 12,
  },

  volumesButton: {
    flex: 1,

    paddingVertical: 13,

    borderRadius: 8,

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 6,
  },

  finishButton: {
    flex: 1,

    paddingVertical: 13,

    borderRadius: 8,

    alignItems: 'center',
    justifyContent: 'center',

    marginLeft: 6,
  },

  finishButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },

  // ==========================================================
  // LOADING
  // ==========================================================

  loadingText: {
    marginTop: 16,

    fontSize: 16,

    color: '#666',

    textAlign: 'center',
  },

  // ==========================================================
  // MODAIS
  // ==========================================================

  modalContainer: {
    flex: 1,

    justifyContent: 'center',
    alignItems: 'center',

    backgroundColor:
      'rgba(0,0,0,0.5)',

    padding: 12,
  },

  modalContent: {
    width: '95%',

    maxHeight: '90%',

    backgroundColor: 'white',

    borderRadius: 10,

    padding: 15,
  },

  modalTitle: {
    fontSize: 18,

    fontWeight: 'bold',

    marginBottom: 8,

    textAlign: 'center',

    color: '#333',
  },

  modalSubtitle: {
    fontSize: 13,

    marginBottom: 10,

    textAlign: 'center',

    color: '#666',
  },

  // ==========================================================
  // PICKER
  // ==========================================================

  pickerContainer: {
    borderWidth: 1,

    borderColor: '#ddd',

    borderRadius: 5,

    marginBottom: 15,

    overflow: 'hidden',
  },

  picker: {
    width: '100%',

    backgroundColor: 'white',
  },

  // ==========================================================
  // LISTA DE VOLUMES
  // ==========================================================

  volumesList: {
    marginBottom: 10,

    maxHeight: 300,
  },

  volumeItem: {
    paddingVertical: 8,

    borderBottomWidth: 1,

    borderBottomColor: '#eee',
  },

  volumeText: {
    fontSize: 20,

    fontWeight: 'bold',

    color: '#333',
  },

  volumeSubText: {
    fontSize: 18,

    color: '#333',
  },

  // ==========================================================
  // SITUAÇÃO
  // ==========================================================

  situacaoText: {
    fontSize: 15,

    fontWeight: 'bold',

    textAlign: 'center',

    marginBottom: 10,
  },

  situacaoComplete: {
    color: '#4CAF50',
  },

  situacaoDivergencia: {
    color: '#F44336',
  },

  // ==========================================================
  // BOTÕES DO MODAL
  // ==========================================================

  modalButtons: {
    flexDirection: 'row',

    justifyContent: 'space-between',
  },

  modalButton: {
    flex: 1,

    paddingVertical: 12,

    borderRadius: 5,

    alignItems: 'center',

    justifyContent: 'center',

    marginHorizontal: 4,
  },

  cancelButton: {
    backgroundColor: '#F44336',
  },

  confirmModalButton: {
    backgroundColor: '#4CAF50',
  },

  modalButtonText: {
    color: 'white',

    fontWeight: 'bold',

    fontSize: 14,
  },
});