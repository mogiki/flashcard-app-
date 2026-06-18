import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../utils/AppContext';
import { colors, SPEED_OPTS } from '../utils/theme';
import { clearAllProgress } from '../utils/storage';

export default function SettingsScreen() {
  const { state, updateCfg, updateDecks } = useApp();
  const { cfg, decks } = state;
  const router = useRouter();
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    Speech.getAvailableVoicesAsync().then(v => {
      setVoices(v.filter(x => x.language?.startsWith('ko')));
    }).catch(() => {});
  }, []);

  async function confirmReset() {
    Alert.alert('초기화', '모든 덱의 학습 기록을 초기화할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '초기화', style: 'destructive', onPress: async () => {
          const next = { ...decks };
          Object.values(next).forEach(d => d.cards.forEach(c => {
            c.status = ''; c.starred = false; c.lastStudied = null; c.reviewLevel = 0;
          }));
          await updateDecks(next);
          for (const id of Object.keys(decks)) await clearAllProgress(id);
          Alert.alert('완료', '초기화되었어요');
        }
      }
    ]);
  }

  const Row = ({ label, sub, right }) => (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );

  const ChipRow = ({ opts, val, onSelect, suffix = '' }) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {opts.map(o => (
        <TouchableOpacity key={o} style={[s.chip, o === val && s.chipActive]} onPress={() => onSelect(o)}>
          <Text style={{ fontSize: 13, color: o === val ? colors.accent2 : colors.text2 }}>{o}{suffix}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="chevron-back" size={20} color={colors.text2} />
          <Text style={{ color: colors.text2, fontSize: 15 }}>홈</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>설정</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        {/* TTS */}
        <Text style={s.secTitle}>TTS</Text>
        <View style={s.card}>
          <Row
            label="TTS 자동 읽기"
            sub="카드 표시 시 자동으로 읽기"
            right={<Switch value={cfg.ttsEnabled} onValueChange={v => updateCfg({ ttsEnabled: v })} trackColor={{ true: colors.accent }} thumbColor="#fff" />}
          />
          <Row
            label="앞뒤 모두 읽기"
            sub="뒤집을 때도 읽음"
            right={<Switch value={cfg.ttsReadBoth} onValueChange={v => updateCfg({ ttsReadBoth: v })} trackColor={{ true: colors.accent }} thumbColor="#fff" />}
          />
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>읽기 속도</Text>
              <ChipRow opts={SPEED_OPTS} val={cfg.ttsSpeed} onSelect={v => updateCfg({ ttsSpeed: v })} suffix="x" />
            </View>
          </View>
          {voices.length > 0 && (
            <View style={[s.row, { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>TTS 목소리</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  <TouchableOpacity style={[s.chip, !cfg.voiceName && s.chipActive]} onPress={() => updateCfg({ voiceName: '' })}>
                    <Text style={{ fontSize: 12, color: !cfg.voiceName ? colors.accent2 : colors.text2 }}>기본</Text>
                  </TouchableOpacity>
                  {voices.map(v => (
                    <TouchableOpacity key={v.identifier} style={[s.chip, cfg.voiceName === v.identifier && s.chipActive]} onPress={() => updateCfg({ voiceName: v.identifier })}>
                      <Text style={{ fontSize: 12, color: cfg.voiceName === v.identifier ? colors.accent2 : colors.text2 }}>{v.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}
        </View>

        {/* 카드 */}
        <Text style={s.secTitle}>카드</Text>
        <View style={s.card}>
          <View style={[s.row, { borderBottomWidth: 0 }]}>
            <Text style={s.rowLabel}>글자 크기</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <TouchableOpacity style={s.fsBtn} onPress={() => updateCfg({ fontSize: Math.max(12, cfg.fontSize - 1) })}>
                <Text style={{ fontSize: 18, color: colors.text }}>−</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, minWidth: 40, textAlign: 'center' }}>{cfg.fontSize}px</Text>
              <TouchableOpacity style={s.fsBtn} onPress={() => updateCfg({ fontSize: Math.min(26, cfg.fontSize + 1) })}>
                <Text style={{ fontSize: 18, color: colors.text }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 연속학습 */}
        <Text style={s.secTitle}>연속 학습</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>앞면 대기 시간</Text>
              <ChipRow opts={[1,2,3,4,5,7]} val={cfg.autoFrontTime} onSelect={v => updateCfg({ autoFrontTime: v })} suffix="초" />
            </View>
          </View>
          <View style={[s.row, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>뒷면 대기 시간</Text>
              <ChipRow opts={[1,2,3,4,5,7]} val={cfg.autoBackTime} onSelect={v => updateCfg({ autoBackTime: v })} suffix="초" />
            </View>
          </View>
        </View>

        {/* 데이터 */}
        <Text style={s.secTitle}>데이터</Text>
        <View style={s.card}>
          <TouchableOpacity style={[s.row, { borderBottomWidth: 0 }]} onPress={confirmReset}>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, { color: colors.unknown }]}>학습 기록 초기화</Text>
              <Text style={s.rowSub}>모든 덱의 학습 기록 삭제</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.text3} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  secTitle: { fontSize: 11, fontWeight: '600', color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 20 },
  card: { backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { fontSize: 15, color: colors.text },
  rowSub: { fontSize: 12, color: colors.text2, marginTop: 2 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accentBg, borderColor: colors.accent },
  fsBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center' },
});
