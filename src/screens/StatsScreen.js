import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../utils/AppContext';
import { colors, REVIEW_INTERVALS } from '../utils/theme';
import { today } from '../utils/storage';

const { width: W } = Dimensions.get('window');

function needsReview(card) {
  if (!card.status || !card.lastStudied) return false;
  const days = (Date.now() - card.lastStudied) / 86400000;
  const interval = REVIEW_INTERVALS[Math.min(card.reviewLevel || 0, REVIEW_INTERVALS.length - 1)];
  return days >= interval;
}

export default function StatsScreen() {
  const { state } = useApp();
  const { decks, studyLog } = state;
  const router = useRouter();

  const allCards = useMemo(() => Object.values(decks).flatMap(d => d.cards), [decks]);
  const total = allCards.length;
  const known = allCards.filter(c => c.status === 'known').length;
  const vague = allCards.filter(c => c.status === 'vague').length;
  const unk   = allCards.filter(c => c.status === 'unknown').length;
  const none  = total - known - vague - unk;
  const reviewCount = allCards.filter(needsReview).length;

  // Streak
  const streak = useMemo(() => {
    let s = 0;
    const t = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(t); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (studyLog[key] !== undefined) s++;
      else break;
    }
    return s;
  }, [studyLog]);

  // Last 7 days
  const days = useMemo(() => {
    const t = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(t); d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      const DAY = ['일','월','화','수','목','금','토'];
      return { key, lbl: DAY[d.getDay()], val: studyLog[key] || 0 };
    });
  }, [studyLog]);
  const maxVal = Math.max(1, ...days.map(d => d.val));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="chevron-back" size={20} color={colors.text2} />
          <Text style={{ color: colors.text2, fontSize: 15 }}>홈</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>학습 통계</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        {/* 전체 현황 */}
        <View style={s.card}>
          <Text style={s.cardTitle}>전체 학습 현황</Text>
          <View style={s.grid}>
            {[[total,'전체',colors.text],[known,'이해',colors.known],[vague,'애매',colors.vague],[unk,'모름',colors.unknown],[none,'미학습',colors.text3],[total?Math.round(known/total*100):0+'%','이해율',colors.accent2]].map(([val,lbl,col],i)=>(
              <View key={i} style={s.statBox}>
                <Text style={[s.statNum, { color: col }]}>{val}</Text>
                <Text style={s.statLbl}>{lbl}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 스트릭 */}
        <View style={s.card}>
          <Text style={s.cardTitle}>연속 학습</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 8 }}>
            <Text style={{ fontSize: 40, fontWeight: '800', color: colors.accent2 }}>🔥{streak}</Text>
            <View>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>일 연속 학습 중</Text>
              <Text style={{ color: colors.text2, fontSize: 12, marginTop: 2 }}>오늘도 학습하면 유지돼요</Text>
            </View>
          </View>
        </View>

        {/* 최근 7일 */}
        <View style={s.card}>
          <Text style={s.cardTitle}>최근 7일 학습량</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 80, marginTop: 12 }}>
            {days.map(d => {
              const h = Math.max(4, (d.val / maxVal) * 64);
              return (
                <View key={d.key} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <View style={{ width: '100%', height: h, backgroundColor: d.val > 0 ? colors.accentBg : colors.bg3, borderRadius: 3 }} />
                  <Text style={{ fontSize: 10, color: colors.text3 }}>{d.lbl}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* 망각곡선 복습 */}
        {reviewCount > 0 && (
          <TouchableOpacity style={[s.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]} onPress={() => router.push({ pathname: '/study', params: { mode: 'review' } })}>
            <View>
              <Text style={s.cardTitle}>망각곡선 복습</Text>
              <Text style={{ color: colors.text2, fontSize: 13, marginTop: 2 }}>오늘 복습할 카드</Text>
            </View>
            <View style={{ backgroundColor: colors.accentBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}>
              <Text style={{ color: colors.accent2, fontWeight: '600', fontSize: 14 }}>{reviewCount}장 →</Text>
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  card: { backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: colors.text2, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statBox: { width: '30%', backgroundColor: colors.bg3, borderRadius: 10, padding: 12, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '700' },
  statLbl: { fontSize: 10, color: colors.text2, marginTop: 2 },
});
