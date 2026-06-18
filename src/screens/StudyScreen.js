import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, Alert, TextInput, Modal, PanResponder, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../utils/AppContext';
import { colors, STATUS_LABEL, REVIEW_INTERVALS, TIME_OPTS, SPEED_OPTS } from '../utils/theme';
import { loadProgress, saveProgress, clearProgress } from '../utils/storage';

const { width: SCREEN_W } = Dimensions.get('window');

function needsReview(card) {
  if (!card.status || !card.lastStudied) return false;
  const daysSince = (Date.now() - card.lastStudied) / 86400000;
  const interval = REVIEW_INTERVALS[Math.min(card.reviewLevel || 0, REVIEW_INTERVALS.length - 1)];
  return daysSince >= interval;
}

export default function StudyScreen() {
  const { deckId, mode: initMode } = useLocalSearchParams();
  const router = useRouter();
  const { state, updateDecks, incrementStudyLog } = useApp();
  const { decks, cfg } = state;

  // Study config
  const [studyFilter, setStudyFilter] = useState('all');
  const [studyDir, setStudyDir] = useState('ab');
  const [studyOrd, setStudyOrd] = useState('seq');
  const [studyMode, setStudyMode] = useState(initMode || 'card');

  // Study state
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionStats, setSessionStats] = useState({ known: 0, vague: 0, unknown: 0 });
  const [phase, setPhase] = useState('config'); // config | studying | complete
  const [autoPaused, setAutoPaused] = useState(false);
  const [autoPhase, setAutoPhase] = useState('front');
  const [countdown, setCountdown] = useState(null);
  const [timerPct, setTimerPct] = useState(1);
  const [editVisible, setEditVisible] = useState(false);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [resumeVisible, setResumeVisible] = useState(false);
  const [pendingResume, setPendingResume] = useState(null);

  // Flip animation
  const flipAnim = useRef(new Animated.Value(0)).current;
  const autoTimerRef = useRef(null);
  const cdTimerRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const manualSpeakRef = useRef(false);
  const autoPausedRef = useRef(false);
  const autoPhaseRef = useRef('front');
  const idxRef = useRef(0);
  const queueRef = useRef([]);
  const cfgRef = useRef(cfg);

  useEffect(() => { cfgRef.current = cfg; }, [cfg]);
  useEffect(() => { autoPausedRef.current = autoPaused; }, [autoPaused]);
  useEffect(() => { autoPhaseRef.current = autoPhase; }, [autoPhase]);
  useEffect(() => { idxRef.current = idx; }, [idx]);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  const deck = deckId ? decks[deckId] : null;
  const cards = deck?.cards || [];

  function getFiltered(filter = studyFilter) {
    if (initMode === 'review') return Object.values(decks).flatMap(d => d.cards).filter(needsReview);
    let f = [...cards];
    if (filter === 'starred') f = f.filter(c => c.starred);
    else if (filter === 'unknown') f = f.filter(c => c.status === 'unknown');
    else if (filter === 'review') f = f.filter(c => c.status === 'unknown' || c.status === 'vague');
    return f;
  }

  function progKey() { return `${deckId}_${studyFilter}_${studyDir}_${studyOrd}`; }

  async function handleStart() {
    const filtered = getFiltered();
    if (!filtered.length) { Alert.alert('알림', '해당하는 카드가 없어요'); return; }
    if (studyMode === 'list') { setQueue(filtered); setPhase('studying'); return; }
    const saved = await loadProgress(progKey());
    if (saved && saved.idx > 0) {
      const rq = saved.queue.map(id => cards.find(c => String(c.id) === String(id))).filter(Boolean);
      if (rq.length && saved.idx < rq.length) {
        setPendingResume({ idx: saved.idx, queue: rq });
        setResumeVisible(true); return;
      }
    }
    launchStudy(filtered, 0);
  }

  function launchStudy(filtered, startIdx, existingQueue = null) {
    const q = existingQueue || (studyOrd === 'rand' ? [...filtered].sort(() => Math.random() - .5) : [...filtered]);
    setQueue(q); queueRef.current = q;
    setIdx(startIdx); idxRef.current = startIdx;
    setSessionStats({ known: 0, vague: 0, unknown: 0 });
    setIsFlipped(false); flipAnim.setValue(0);
    setPhase('studying');
    if (studyMode === 'auto') setTimeout(() => startAutoMode(q, startIdx), 300);
  }

  function doResume() {
    setResumeVisible(false);
    if (pendingResume) launchStudy(null, pendingResume.idx, pendingResume.queue);
    setPendingResume(null);
  }
  function doFresh() {
    setResumeVisible(false);
    clearProgress(progKey());
    launchStudy(getFiltered(), 0);
    setPendingResume(null);
  }

  // Card render helpers
  const currentCard = queue[idx];
  const front = currentCard ? (studyDir === 'ab' ? currentCard.front : currentCard.back) : '';
  const back  = currentCard ? (studyDir === 'ab' ? currentCard.back  : currentCard.front) : '';

  // Flip
  const frontInterp = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backInterp  = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  function doFlip() {
    if (!isFlipped) {
      Animated.spring(flipAnim, { toValue: 1, useNativeDriver: true }).start();
      setIsFlipped(true);
      if (cfg.ttsEnabled && cfg.ttsReadBoth) speakText(back);
    } else {
      Animated.spring(flipAnim, { toValue: 0, useNativeDriver: true }).start();
      setIsFlipped(false);
    }
  }

  function navCard(dir) {
    const newIdx = idx + dir;
    if (newIdx < 0) return;
    stopSpeech();
    manualSpeakRef.current = false;
    if (newIdx >= queue.length) { showComplete(); return; }
    setIdx(newIdx); idxRef.current = newIdx;
    setIsFlipped(false);
    flipAnim.setValue(0);
    saveProgress(progKey(), { idx: newIdx, queue: queue.map(c => c.id), ts: Date.now() });
    if (cfg.ttsEnabled) setTimeout(() => speakText(studyDir === 'ab' ? queue[newIdx].front : queue[newIdx].back), 100);
  }

  function judgeCard(status) {
    if (!currentCard) return;
    if (!isFlipped) { doFlip(); }
    const updatedCard = { ...currentCard, status, lastStudied: Date.now(), reviewLevel: status === 'known' ? Math.min((currentCard.reviewLevel || 0) + 1, REVIEW_INTERVALS.length - 1) : status === 'unknown' ? 0 : currentCard.reviewLevel || 0 };
    updateCardInDeck(updatedCard);
    setSessionStats(prev => ({ ...prev, [status]: prev[status] + 1 }));
    incrementStudyLog();
    const newIdx = idx + 1;
    if (newIdx >= queue.length) { showComplete(); return; }
    setIdx(newIdx); idxRef.current = newIdx;
    setIsFlipped(false); flipAnim.setValue(0);
    saveProgress(progKey(), { idx: newIdx, queue: queue.map(c => c.id), ts: Date.now() });
    if (cfg.ttsEnabled) setTimeout(() => speakText(studyDir === 'ab' ? queue[newIdx]?.front : queue[newIdx]?.back), 100);
  }

  function updateCardInDeck(updatedCard) {
    if (!deckId || !decks[deckId]) return;
    const nextDecks = { ...decks };
    nextDecks[deckId] = { ...nextDecks[deckId], cards: nextDecks[deckId].cards.map(c => String(c.id) === String(updatedCard.id) ? updatedCard : c) };
    updateDecks(nextDecks);
    // update queue too
    setQueue(prev => prev.map(c => String(c.id) === String(updatedCard.id) ? updatedCard : c));
  }

  function toggleStar() {
    if (!currentCard) return;
    updateCardInDeck({ ...currentCard, starred: !currentCard.starred });
  }

  function openEdit() {
    setEditFront(currentCard?.front || '');
    setEditBack(currentCard?.back || '');
    setEditVisible(true);
  }

  function saveEdit() {
    if (!editFront.trim() || !editBack.trim()) { Alert.alert('오류', '앞면과 뒷면을 입력해주세요'); return; }
    updateCardInDeck({ ...currentCard, front: editFront.trim(), back: editBack.trim() });
    setEditVisible(false);
  }

  // ===== TTS - 네이티브 expo-speech =====
  function speakText(text) {
    if (!text) return;
    Speech.stop();
    Speech.speak(text, {
      language: 'ko-KR',
      rate: cfgRef.current.ttsSpeed,
      voice: cfgRef.current.voiceName || undefined,
    });
  }

  function speakWithCallback(text, onDone) {
    if (!text) { onDone(); return; }
    Speech.stop();
    isSpeakingRef.current = true;
    Speech.speak(text, {
      language: 'ko-KR',
      rate: cfgRef.current.ttsSpeed,
      voice: cfgRef.current.voiceName || undefined,
      onDone: () => { isSpeakingRef.current = false; if (!autoPausedRef.current && !manualSpeakRef.current) onDone(); },
      onStopped: () => { isSpeakingRef.current = false; },
      onError: () => { isSpeakingRef.current = false; if (!autoPausedRef.current && !manualSpeakRef.current) onDone(); },
    });
  }

  function stopSpeech() { Speech.stop(); isSpeakingRef.current = false; }

  function manualSpeak(side) {
    const text = side === 'front' ? front : back;
    if (studyMode === 'auto' && !autoPausedRef.current) {
      clearTimers();
      stopSpeech();
      manualSpeakRef.current = true;
      speakWithCallback(text, () => {
        manualSpeakRef.current = false;
        runAutoPhase();
      });
    } else {
      speakText(text);
    }
  }

  // ===== AUTO MODE =====
  function clearTimers() {
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
    if (cdTimerRef.current) { clearInterval(cdTimerRef.current); cdTimerRef.current = null; }
  }

  function startAutoMode(q, startIdx) {
    setAutoPaused(false); autoPausedRef.current = false;
    setAutoPhase('front'); autoPhaseRef.current = 'front';
    runAutoPhase(q, startIdx);
  }

  function runAutoPhase(q, startIdx) {
    const currentQ = q || queueRef.current;
    const currentI = startIdx !== undefined ? startIdx : idxRef.current;
    if (autoPausedRef.current || manualSpeakRef.current) return;
    if (currentI >= currentQ.length) { showComplete(); return; }

    const card = currentQ[currentI];
    const cardFront = studyDir === 'ab' ? card.front : card.back;
    const cardBack  = studyDir === 'ab' ? card.back  : card.front;
    const text = autoPhaseRef.current === 'front' ? cardFront : cardBack;
    const wait = (autoPhaseRef.current === 'front' ? cfgRef.current.autoFrontTime : cfgRef.current.autoBackTime) * 1000;

    if (autoPhaseRef.current === 'front') {
      setIdx(currentI); idxRef.current = currentI;
      setIsFlipped(false); flipAnim.setValue(0);
      saveProgress(progKey(), { idx: currentI, queue: currentQ.map(c => c.id), ts: Date.now() });
    } else {
      Animated.spring(flipAnim, { toValue: 1, useNativeDriver: true }).start();
      setIsFlipped(true);
    }

    const advance = () => {
      if (autoPausedRef.current || manualSpeakRef.current) return;
      if (autoPhaseRef.current === 'front') {
        autoPhaseRef.current = 'back'; setAutoPhase('back');
        runAutoPhase();
      } else {
        autoPhaseRef.current = 'front'; setAutoPhase('front');
        const nextIdx = idxRef.current + 1;
        idxRef.current = nextIdx;
        runAutoPhase();
      }
    };

    if (cfgRef.current.ttsEnabled) {
      speakWithCallback(text, () => startWait(wait, advance));
    } else {
      startWait(wait, advance);
    }
  }

  function startWait(duration, cb) {
    setTimerPct(1);
    const steps = 30;
    const stepTime = duration / steps;
    let step = 0;
    clearTimers();
    cdTimerRef.current = setInterval(() => {
      step++;
      setTimerPct(1 - step / steps);
      const remaining = Math.ceil((steps - step) * stepTime / 1000);
      setCountdown(remaining > 0 ? remaining : null);
      if (step >= steps) {
        clearInterval(cdTimerRef.current);
        setCountdown(null);
      }
    }, stepTime);
    autoTimerRef.current = setTimeout(() => { if (!autoPausedRef.current) cb(); }, duration);
  }

  function togglePause() {
    if (!autoPaused) {
      clearTimers(); stopSpeech();
      setAutoPaused(true); autoPausedRef.current = true;
      setCountdown(null);
    } else {
      setAutoPaused(false); autoPausedRef.current = false;
      runAutoPhase();
    }
  }

  function autoNav(dir) {
    clearTimers(); stopSpeech(); manualSpeakRef.current = false;
    const newIdx = idxRef.current + dir;
    if (newIdx < 0) return;
    if (newIdx >= queueRef.current.length) { showComplete(); return; }
    idxRef.current = newIdx;
    autoPhaseRef.current = 'front'; setAutoPhase('front');
    setIsFlipped(false); flipAnim.setValue(0);
    if (!autoPausedRef.current) runAutoPhase();
    else { setIdx(newIdx); }
  }

  function showComplete() {
    clearTimers(); stopSpeech();
    clearProgress(progKey());
    setPhase('complete');
  }

  function exitStudy() {
    clearTimers(); stopSpeech();
    if (phase === 'studying' && idx > 0 && idx < queue.length) {
      saveProgress(progKey(), { idx, queue: queue.map(c => c.id), ts: Date.now() });
    }
    router.back();
  }

  useEffect(() => { return () => { clearTimers(); stopSpeech(); }; }, []);

  // ===== RENDER =====
  if (phase === 'config') return <ConfigPhase {...{ studyMode, setStudyMode, studyFilter, setStudyFilter, studyDir, setStudyDir, studyOrd, setStudyOrd, handleStart, exitStudy, cards }} />;
  if (phase === 'complete') return <CompletePhase sessionStats={sessionStats} queue={queue} onRestart={() => { setPhase('config'); }} onExit={exitStudy} />;

  if (studyMode === 'list') return <ListPhase cards={queue} studyDir={studyDir} cfg={cfg} decks={decks} deckId={deckId} updateDecks={updateDecks} onExit={exitStudy} speakText={speakText} />;

  return (
    <View style={s.container}>
      {/* Resume Modal */}
      <Modal visible={resumeVisible} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>이어서 학습할까요?</Text>
            <Text style={s.modalDesc}>{pendingResume?.idx + 1}번째 카드까지 진행했어요. (전체 {pendingResume?.queue?.length}장)</Text>
            <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={doResume}><Text style={s.btnText}>이어서 학습</Text></TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnSecondary, { marginTop: 10 }]} onPress={doFresh}><Text style={[s.btnText, { color: colors.text }]}>처음부터</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={editVisible} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={s.modalTitle}>카드 수정</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}><Ionicons name="close" size={22} color={colors.text2} /></TouchableOpacity>
            </View>
            <Text style={s.editLbl}>앞면</Text>
            <TextInput style={s.editInput} value={editFront} onChangeText={setEditFront} multiline placeholderTextColor={colors.text3} />
            <Text style={[s.editLbl, { marginTop: 12 }]}>뒷면</Text>
            <TextInput style={s.editInput} value={editBack} onChangeText={setEditBack} multiline placeholderTextColor={colors.text3} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.btn, s.btnPrimary, { flex: 1 }]} onPress={saveEdit}><Text style={s.btnText}>저장</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnSecondary, { flex: 0.5 }]} onPress={() => setEditVisible(false)}><Text style={[s.btnText, { color: colors.text }]}>취소</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={exitStudy}>
            <Ionicons name="chevron-back" size={20} color={colors.text2} />
            <Text style={{ color: colors.text2, fontSize: 15 }}>홈</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: colors.text3 }} numberOfLines={1}>{deck?.title || ''}</Text>
            <TouchableOpacity style={s.iconBtn} onPress={() => { cfg.ttsEnabled ? updateDecks : null; }}>
              <Ionicons name={cfg.ttsEnabled ? 'volume-high' : 'volume-mute'} size={20} color={cfg.ttsEnabled ? colors.accent2 : colors.text2} onPress={() => { /* toggle handled in settings */ }} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${queue.length ? idx / queue.length * 100 : 0}%` }]} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={{ color: colors.text2, fontSize: 12 }}>{idx + 1}/{queue.length}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Text style={{ color: colors.known, fontSize: 12 }}>✓{sessionStats.known}</Text>
            <Text style={{ color: colors.vague, fontSize: 12 }}>?{sessionStats.vague}</Text>
            <Text style={{ color: colors.unknown, fontSize: 12 }}>✗{sessionStats.unknown}</Text>
          </View>
        </View>
      </View>

      {/* Card */}
      <View style={s.cardArea}>
        <TouchableOpacity style={s.cardWrap} onPress={doFlip} activeOpacity={1}>
          {/* Front */}
          <Animated.View style={[s.cardFace, { transform: [{ rotateY: frontInterp }], backfaceVisibility: 'hidden' }]}>
            {currentCard?.status ? (
              <View style={[s.badge, currentCard.status === 'known' ? s.badgeKnown : currentCard.status === 'vague' ? s.badgeVague : s.badgeUnknown]}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: currentCard.status === 'known' ? colors.known : currentCard.status === 'vague' ? colors.vague : colors.unknown }}>{STATUS_LABEL[currentCard.status]}</Text>
              </View>
            ) : null}
            <Text style={[s.cardText, { fontSize: front.length > 80 ? Math.max(12, cfg.fontSize - 3) : cfg.fontSize }]}>{front}</Text>
            <TouchableOpacity style={s.starBtn} onPress={toggleStar}>
              <Ionicons name={currentCard?.starred ? 'star' : 'star-outline'} size={18} color={currentCard?.starred ? colors.star : colors.text3} />
            </TouchableOpacity>
            <View style={{ position: 'absolute', bottom: 10, flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={s.ttsBtn} onPress={() => manualSpeak('front')}>
                <Ionicons name="volume-medium-outline" size={16} color={colors.text2} />
              </TouchableOpacity>
              <TouchableOpacity style={s.ttsBtn} onPress={openEdit}>
                <Ionicons name="pencil-outline" size={16} color={colors.text2} />
              </TouchableOpacity>
            </View>
          </Animated.View>
          {/* Back */}
          <Animated.View style={[s.cardFace, s.cardBack, { transform: [{ rotateY: backInterp }], backfaceVisibility: 'hidden' }]}>
            <Text style={[s.cardText, { fontSize: back.length > 80 ? Math.max(12, cfg.fontSize - 3) : cfg.fontSize }]}>{back}</Text>
            <View style={{ position: 'absolute', bottom: 10, flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={s.ttsBtn} onPress={() => manualSpeak('back')}>
                <Ionicons name="volume-medium-outline" size={16} color={colors.text2} />
              </TouchableOpacity>
              <TouchableOpacity style={s.ttsBtn} onPress={openEdit}>
                <Ionicons name="pencil-outline" size={16} color={colors.text2} />
              </TouchableOpacity>
            </View>
          </Animated.View>
          {/* Countdown */}
          {studyMode === 'auto' && countdown !== null && (
            <View style={s.countdownOverlay}>
              <Text style={s.countdownNum}>{countdown}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Bottom controls */}
      {studyMode === 'card' && (
        <View style={s.bottomBar}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity style={[s.navBtn, idx === 0 && s.navBtnDisabled]} onPress={() => navCard(-1)} disabled={idx === 0}>
              <Ionicons name="chevron-back" size={20} color={colors.text2} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.jbtn, s.jUnknown]} onPress={() => judgeCard('unknown')}>
              <Ionicons name="close" size={20} color={colors.unknown} />
              <Text style={[s.jbtnSub, { color: colors.unknown }]}>모름</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.jbtn, s.jVague]} onPress={() => judgeCard('vague')}>
              <Ionicons name="help-circle-outline" size={20} color={colors.vague} />
              <Text style={[s.jbtnSub, { color: colors.vague }]}>애매</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.jbtn, s.jKnown]} onPress={() => judgeCard('known')}>
              <Ionicons name="checkmark" size={20} color={colors.known} />
              <Text style={[s.jbtnSub, { color: colors.known }]}>이해</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.navBtn} onPress={() => navCard(1)}>
              <Ionicons name="chevron-forward" size={20} color={colors.text2} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {studyMode === 'auto' && (
        <View style={s.autoBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity style={[s.navBtn, { width: 40, height: 40 }]} onPress={() => autoNav(-1)} disabled={idx === 0}>
              <Ionicons name="chevron-back" size={18} color={colors.text2} />
            </TouchableOpacity>
            <View style={s.timerBar}>
              <View style={[s.timerFill, { width: `${timerPct * 100}%` }]} />
            </View>
            <TouchableOpacity style={s.playBtn} onPress={togglePause}>
              <Ionicons name={autoPaused ? 'play' : 'pause'} size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[s.navBtn, { width: 40, height: 40 }]} onPress={() => autoNav(1)}>
              <Ionicons name="chevron-forward" size={18} color={colors.text2} />
            </TouchableOpacity>
            <Text style={{ fontSize: 11, color: colors.text2, minWidth: 28 }}>{autoPhase === 'front' ? '앞' : '뒤'}</Text>
          </View>
          {/* Auto settings */}
          <MiniChipRow label="앞 대기" opts={TIME_OPTS} val={cfg.autoFrontTime} onSelect={v => { /* update cfg */ }} suffix="s" />
          <MiniChipRow label="뒤 대기" opts={TIME_OPTS} val={cfg.autoBackTime} onSelect={v => { }} suffix="s" />
          <MiniChipRow label="속도" opts={SPEED_OPTS} val={cfg.ttsSpeed} onSelect={v => { }} suffix="x" />
        </View>
      )}
    </View>
  );
}

function MiniChipRow({ label, opts, val, onSelect, suffix }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <Text style={{ fontSize: 11, color: colors.text3, minWidth: 48 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, flexDirection: 'row' }}>
        {opts.map(o => (
          <TouchableOpacity key={o} style={[mcs.chip, o === val && mcs.chipActive]} onPress={() => onSelect(o)}>
            <Text style={[{ fontSize: 11, color: colors.text2 }, o === val && { color: colors.accent2 }]}>{o}{suffix}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
const mcs = StyleSheet.create({ chip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.border }, chipActive: { backgroundColor: colors.accentBg, borderColor: colors.accent } });

function ConfigPhase({ studyMode, setStudyMode, studyFilter, setStudyFilter, studyDir, setStudyDir, studyOrd, setStudyOrd, handleStart, exitStudy, cards }) {
  const modes = [['card','카드','플립 학습'],['list','리스트','전체 보기'],['auto','연속 학습','자동+TTS']];
  const filters = [['all','전체'],['starred','⭐ 별표'],['unknown','❌ 모름'],['review','❓+❌ 복습']];
  return (
    <View style={s.container}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={exitStudy} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="chevron-back" size={20} color={colors.text2} />
          <Text style={{ color: colors.text2, fontSize: 15 }}>홈</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>학습 설정</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        <Text style={s.secTitle}>학습 방식</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {modes.map(([m, label, sub]) => (
            <TouchableOpacity key={m} style={[cs.modeBtn, studyMode === m && cs.modeBtnActive]} onPress={() => setStudyMode(m)}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: studyMode === m ? colors.accent2 : colors.text }}>{label}</Text>
              <Text style={{ fontSize: 10, color: colors.text2 }}>{sub}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.secTitle}>범위</Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {filters.map(([f, label]) => (
            <TouchableOpacity key={f} style={[cs.chip, studyFilter === f && cs.chipActive]} onPress={() => setStudyFilter(f)}>
              <Text style={{ fontSize: 12, color: studyFilter === f ? colors.accent2 : colors.text2 }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.secTitle}>방향</Text>
        <View style={cs.toggle}>
          <TouchableOpacity style={[cs.togBtn, studyDir === 'ab' && cs.togBtnActive]} onPress={() => setStudyDir('ab')}><Text style={{ fontSize: 12, color: studyDir === 'ab' ? '#fff' : colors.text2, fontWeight: studyDir === 'ab' ? '600' : '400' }}>앞 → 뒤</Text></TouchableOpacity>
          <TouchableOpacity style={[cs.togBtn, studyDir === 'ba' && cs.togBtnActive]} onPress={() => setStudyDir('ba')}><Text style={{ fontSize: 12, color: studyDir === 'ba' ? '#fff' : colors.text2, fontWeight: studyDir === 'ba' ? '600' : '400' }}>뒤 → 앞</Text></TouchableOpacity>
        </View>
        <Text style={s.secTitle}>순서</Text>
        <View style={cs.toggle}>
          <TouchableOpacity style={[cs.togBtn, studyOrd === 'seq' && cs.togBtnActive]} onPress={() => setStudyOrd('seq')}><Text style={{ fontSize: 12, color: studyOrd === 'seq' ? '#fff' : colors.text2, fontWeight: studyOrd === 'seq' ? '600' : '400' }}>순서대로</Text></TouchableOpacity>
          <TouchableOpacity style={[cs.togBtn, studyOrd === 'rand' && cs.togBtnActive]} onPress={() => setStudyOrd('rand')}><Text style={{ fontSize: 12, color: studyOrd === 'rand' ? '#fff' : colors.text2, fontWeight: studyOrd === 'rand' ? '600' : '400' }}>랜덤</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={[s.btn, s.btnPrimary, { marginTop: 24 }]} onPress={handleStart}>
          <Ionicons name="play" size={16} color="#fff" />
          <Text style={s.btnText}>학습 시작</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
const cs = StyleSheet.create({ modeBtn: { flex: 1, minWidth: '28%', backgroundColor: colors.bg3, borderRadius: 12, padding: 14, alignItems: 'center', gap: 4, borderWidth: 2, borderColor: 'transparent' }, modeBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentBg }, chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.border }, chipActive: { backgroundColor: colors.accentBg, borderColor: colors.accent }, toggle: { flexDirection: 'row', backgroundColor: colors.bg3, borderRadius: 10, padding: 3, gap: 3, marginBottom: 16 }, togBtn: { flex: 1, padding: 8, borderRadius: 7, alignItems: 'center' }, togBtnActive: { backgroundColor: colors.accent } });

function CompletePhase({ sessionStats, queue, onRestart, onExit }) {
  return (
    <View style={[s.container, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
      <Text style={{ fontSize: 48 }}>🎉</Text>
      <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginTop: 12 }}>학습 완료!</Text>
      <Text style={{ color: colors.text2, fontSize: 14, marginTop: 4 }}>총 {queue.length}장 완료</Text>
      <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 20 }}>
        {[['known','이해',colors.known],['vague','애매',colors.vague],['unknown','모름',colors.unknown]].map(([k,l,c])=>(
          <View key={k} style={{ flex: 1, backgroundColor: colors.bg3, borderRadius: 10, padding: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: c }}>{sessionStats[k]}</Text>
            <Text style={{ fontSize: 11, color: colors.text2, marginTop: 2 }}>{l}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity style={[s.btn, s.btnPrimary, { width: '100%', marginTop: 24 }]} onPress={onRestart}><Text style={s.btnText}>다시 학습</Text></TouchableOpacity>
      <TouchableOpacity style={[s.btn, s.btnSecondary, { width: '100%', marginTop: 10 }]} onPress={onExit}><Text style={[s.btnText, { color: colors.text }]}>홈으로</Text></TouchableOpacity>
    </View>
  );
}

function ListPhase({ cards, studyDir, cfg, decks, deckId, updateDecks, onExit, speakText }) {
  const [search, setSearch] = useState('');
  const [editVisible, setEditVisible] = useState(false);
  const [editCard, setEditCard] = useState(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const fk = studyDir === 'ab' ? 'front' : 'back';
  const bk = studyDir === 'ab' ? 'back' : 'front';
  const filtered = search ? cards.filter(c => c.front.toLowerCase().includes(search.toLowerCase()) || c.back.toLowerCase().includes(search.toLowerCase())) : cards;

  function updateCard(updated) {
    if (!deckId || !decks[deckId]) return;
    const nextDecks = { ...decks };
    nextDecks[deckId] = { ...nextDecks[deckId], cards: nextDecks[deckId].cards.map(c => String(c.id) === String(updated.id) ? updated : c) };
    updateDecks(nextDecks);
  }

  function judge(card, status) { updateCard({ ...card, status: card.status === status ? '' : status, lastStudied: Date.now() }); }
  function toggleStar(card) { updateCard({ ...card, starred: !card.starred }); }

  return (
    <View style={s.container}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={onExit} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="chevron-back" size={20} color={colors.text2} />
          <Text style={{ color: colors.text2, fontSize: 15 }}>홈</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>목록 ({filtered.length})</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={{ padding: 10, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TextInput style={{ backgroundColor: colors.bg3, borderRadius: 10, padding: 9, color: colors.text, fontSize: 14 }} placeholder="🔍 검색..." placeholderTextColor={colors.text3} value={search} onChangeText={setSearch} />
      </View>
      <ScrollView style={{ flex: 1 }}>
        {filtered.map((card, i) => (
          <View key={card.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 11, color: colors.text3, minWidth: 22, marginTop: 2, textAlign: 'right' }}>{i + 1}</Text>
            <View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 4, backgroundColor: card.status === 'known' ? colors.known : card.status === 'vague' ? colors.vague : card.status === 'unknown' ? colors.unknown : colors.text3 }} />
            <TouchableOpacity style={{ flex: 1 }} onPress={() => speakText((studyDir === 'ab' ? card.front : card.back) + '. ' + (studyDir === 'ab' ? card.back : card.front))}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text, lineHeight: 20 }}>{card[fk]}</Text>
              <Text style={{ fontSize: 11, color: colors.text2, marginTop: 3, lineHeight: 17 }}>{card[bk]}</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <TouchableOpacity onPress={() => toggleStar(card)}>
                <Ionicons name={card.starred ? 'star' : 'star-outline'} size={15} color={card.starred ? colors.star : colors.text3} />
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {[['unknown','✗',colors.unknown,colors.unknownBg],['vague','?',colors.vague,colors.vagueBg],['known','✓',colors.known,colors.knownBg]].map(([st,lbl,col,bg])=>(
                  <TouchableOpacity key={st} style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: bg, opacity: card.status === st ? 1 : 0.6, borderWidth: card.status === st ? 2 : 0, borderColor: col }} onPress={() => judge(card, st)}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: col }}>{lbl}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.bg3 }} onPress={() => { setEditCard(card); setEditFront(card.front); setEditBack(card.back); setEditVisible(true); }}>
                  <Text style={{ fontSize: 10, color: colors.text2 }}>✎</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
      <Modal visible={editVisible} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={s.modalTitle}>카드 수정</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}><Ionicons name="close" size={22} color={colors.text2} /></TouchableOpacity>
            </View>
            <Text style={s.editLbl}>앞면</Text>
            <TextInput style={s.editInput} value={editFront} onChangeText={setEditFront} multiline />
            <Text style={[s.editLbl, { marginTop: 12 }]}>뒷면</Text>
            <TextInput style={s.editInput} value={editBack} onChangeText={setEditBack} multiline />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.btn, s.btnPrimary, { flex: 1 }]} onPress={() => { if (!editFront.trim() || !editBack.trim()) return; updateCard({ ...editCard, front: editFront.trim(), back: editBack.trim() }); setEditVisible(false); }}><Text style={s.btnText}>저장</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnSecondary, { flex: 0.5 }]} onPress={() => setEditVisible(false)}><Text style={[s.btnText, { color: colors.text }]}>취소</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  header: { paddingTop: 48, paddingHorizontal: 20, paddingBottom: 10, flexShrink: 0 },
  iconBtn: { padding: 8 },
  secTitle: { fontSize: 11, fontWeight: '600', color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 16 },
  progressBar: { height: 3, backgroundColor: colors.bg3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  cardWrap: { width: '100%', maxWidth: 420, height: 240, position: 'relative' },
  cardFace: { position: 'absolute', width: '100%', height: '100%', backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center', padding: 24, backfaceVisibility: 'hidden' },
  cardBack: { backgroundColor: colors.cardBg },
  cardText: { textAlign: 'center', color: colors.text, fontWeight: '500', lineHeight: 26 },
  badge: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 },
  badgeKnown: { backgroundColor: colors.knownBg }, badgeVague: { backgroundColor: colors.vagueBg }, badgeUnknown: { backgroundColor: colors.unknownBg },
  starBtn: { position: 'absolute', top: 10, right: 10, padding: 6 },
  ttsBtn: { padding: 6, opacity: 0.6 },
  countdownOverlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  countdownNum: { fontSize: 64, fontWeight: '800', color: 'rgba(255,255,255,0.15)' },
  bottomBar: { paddingHorizontal: 16, paddingBottom: 28, paddingTop: 8 },
  navBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center' },
  navBtnDisabled: { opacity: 0.3 },
  jbtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', gap: 2, borderWidth: 1 },
  jbtnSub: { fontSize: 10, fontWeight: '500' },
  jKnown: { backgroundColor: colors.knownBg, borderColor: 'rgba(34,197,94,0.25)' },
  jVague: { backgroundColor: colors.vagueBg, borderColor: 'rgba(245,158,11,0.25)' },
  jUnknown: { backgroundColor: colors.unknownBg, borderColor: 'rgba(239,68,68,0.25)' },
  autoBar: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },
  timerBar: { flex: 1, height: 4, backgroundColor: colors.bg3, borderRadius: 2, overflow: 'hidden' },
  timerFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
  playBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
  modalDesc: { fontSize: 13, color: colors.text2, marginBottom: 20, lineHeight: 20 },
  editLbl: { fontSize: 11, fontWeight: '600', color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  editInput: { backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.border2, borderRadius: 10, padding: 12, color: colors.text, fontSize: 14, minHeight: 80, textAlignVertical: 'top', lineHeight: 22 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 13, borderRadius: 10 },
  btnPrimary: { backgroundColor: colors.accent },
  btnSecondary: { backgroundColor: colors.bg3 },
  btnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
