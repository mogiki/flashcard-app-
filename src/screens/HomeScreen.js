import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../utils/AppContext';
import { colors, REVIEW_INTERVALS } from '../utils/theme';
import { pickAndParseFile } from '../utils/parser';
import { clearAllProgress } from '../utils/storage';

function needsReview(card) {
  if (!card.status || card.status === 'unknown') return false;
  if (!card.lastStudied) return false;
  const daysSince = (Date.now() - card.lastStudied) / (1000 * 60 * 60 * 24);
  const interval = REVIEW_INTERVALS[Math.min(card.reviewLevel || 0, REVIEW_INTERVALS.length - 1)];
  return daysSince >= interval;
}

export default function HomeScreen() {
  const { state, dispatch, updateDecks, saveDeck } = useApp();
  const { decks, currentDeckId } = state;
  const router = useRouter();

  const reviewCount = useMemo(() => {
    return Object.values(decks).flatMap(d => d.cards).filter(needsReview).length;
  }, [decks]);

  async function handleImport() {
    const result = await pickAndParseFile();
    if (!result) return;
    if (!result.cards.length) { Alert.alert('오류', '카드를 찾을 수 없어요'); return; }
    saveDeck(result.title, result.cards);
    Alert.alert('완료', `${result.cards.length}개 카드 불러오기 완료!`);
  }

  function selectDeck(id) {
    dispatch({ type: 'SET_CURRENT_DECK', payload: id });
  }

  async function deleteDeck(id) {
    Alert.alert('덱 삭제', `"${decks[id]?.title}" 덱을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive', onPress: async () => {
          const next = { ...decks };
          delete next[id];
          await updateDecks(next);
          await clearAllProgress(id);
          if (currentDeckId === id) dispatch({ type: 'SET_CURRENT_DECK', payload: null });
        }
      }
    ]);
  }

  function startStudy(mode) {
    if (!currentDeckId) return;
    router.push({ pathname: '/study', params: { deckId: currentDeckId, mode } });
  }

  const deckIds = Object.keys(decks);
  const currentCards = currentDeckId ? decks[currentDeckId]?.cards || [] : [];

  return (
    <View style={s.container}>
      <View style={s.topbar}>
        <Text style={s.title}>📚 FlashCard</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/stats')}>
            <Ionicons name="bar-chart-outline" size={22} color={colors.text2} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={22} color={colors.text2} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {/* 복습 알림 */}
        {reviewCount > 0 && (
          <TouchableOpacity style={s.reviewAlert} onPress={() => router.push({ pathname: '/study', params: { mode: 'review' } })}>
            <Ionicons name="alert-circle" size={20} color={colors.vague} />
            <View style={{ marginLeft: 10 }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>오늘 복습할 카드 {reviewCount}장</Text>
              <Text style={{ color: colors.text2, fontSize: 11, marginTop: 2 }}>탭해서 복습 시작</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* 덱 목록 */}
        {deckIds.map(id => {
          const deck = decks[id];
          const c = deck.cards;
          const total = c.length;
          const known = c.filter(x => x.status === 'known').length;
          const vague = c.filter(x => x.status === 'vague').length;
          const unk = c.filter(x => x.status === 'unknown').length;
          const none = total - known - vague - unk;
          const pct = total ? Math.round(known / total * 100) : 0;
          const isActive = id === currentDeckId;
          return (
            <TouchableOpacity key={id} style={[s.deckCard, isActive && s.deckActive]} onPress={() => selectDeck(id)}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 3 }}>
                <Text style={s.deckTitle} numberOfLines={2}>{deck.title}</Text>
                <TouchableOpacity onPress={() => deleteDeck(id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={18} color={colors.text3} />
                </TouchableOpacity>
              </View>
              <Text style={s.deckMeta}>{total}장 · 이해 {pct}%{isActive ? ' · 선택됨' : ''}</Text>
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${pct}%` }]} />
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Text style={{ color: colors.known, fontSize: 11 }}>✓{known}</Text>
                <Text style={{ color: colors.vague, fontSize: 11 }}>?{vague}</Text>
                <Text style={{ color: colors.unknown, fontSize: 11 }}>✗{unk}</Text>
                <Text style={{ color: colors.text3, fontSize: 11 }}>–{none}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* 불러오기 */}
        <Text style={s.secTitle}>불러오기</Text>
        <TouchableOpacity style={s.importArea} onPress={handleImport}>
          <Ionicons name="cloud-upload-outline" size={32} color={colors.text3} />
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', marginTop: 8 }}>파일 불러오기</Text>
          <Text style={{ color: colors.text2, fontSize: 12, marginTop: 2 }}>MHT · HTML · CSV 지원</Text>
        </TouchableOpacity>

        {/* 학습 시작 */}
        {currentDeckId && currentCards.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={s.secTitle}>학습 시작</Text>
            <View style={s.modeGrid}>
              <TouchableOpacity style={s.modeBtn} onPress={() => startStudy('card')}>
                <Ionicons name="albums-outline" size={24} color={colors.accent2} />
                <Text style={s.modeBtnText}>카드</Text>
                <Text style={s.modeBtnSub}>플립 학습</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modeBtn} onPress={() => startStudy('list')}>
                <Ionicons name="list-outline" size={24} color={colors.accent2} />
                <Text style={s.modeBtnText}>리스트</Text>
                <Text style={s.modeBtnSub}>전체 보기</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modeBtn} onPress={() => startStudy('auto')}>
                <Ionicons name="play-circle-outline" size={24} color={colors.accent2} />
                <Text style={s.modeBtnText}>연속 학습</Text>
                <Text style={s.modeBtnSub}>자동+TTS</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  iconBtn: { padding: 8 },
  scroll: { flex: 1 },
  secTitle: { fontSize: 11, fontWeight: '600', color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 16 },
  deckCard: { backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, marginBottom: 10 },
  deckActive: { borderColor: colors.accent },
  deckTitle: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1, marginRight: 8 },
  deckMeta: { fontSize: 12, color: colors.text2, marginBottom: 10 },
  progressBar: { height: 4, backgroundColor: colors.bg3, borderRadius: 2, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
  importArea: { borderWidth: 2, borderColor: colors.border2, borderStyle: 'dashed', borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 8 },
  reviewAlert: { backgroundColor: colors.vagueBg, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  modeGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeBtn: { flex: 1, minWidth: '30%', backgroundColor: colors.bg3, borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: colors.text },
  modeBtnSub: { fontSize: 10, color: colors.text2 },
});
