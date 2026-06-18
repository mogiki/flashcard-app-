import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { loadDecks, saveDecks, loadSettings, saveSettings, loadStudyLog, saveStudyLog, today } from '../utils/storage';

const AppContext = createContext(null);

const defaultCfg = {
  ttsEnabled: false,
  ttsReadBoth: true,
  ttsSpeed: 1.0,
  autoFrontTime: 3,
  autoBackTime: 3,
  fontSize: 16,
  voiceName: '',
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_DECKS': return { ...state, decks: action.payload };
    case 'SET_CFG': return { ...state, cfg: { ...state.cfg, ...action.payload } };
    case 'SET_CURRENT_DECK': return { ...state, currentDeckId: action.payload };
    case 'SET_STUDY_LOG': return { ...state, studyLog: action.payload };
    default: return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, {
    decks: {},
    cfg: defaultCfg,
    currentDeckId: null,
    studyLog: {},
  });

  useEffect(() => {
    async function load() {
      const [decks, cfg, log] = await Promise.all([loadDecks(), loadSettings(), loadStudyLog()]);
      dispatch({ type: 'SET_DECKS', payload: decks });
      dispatch({ type: 'SET_CFG', payload: { ...defaultCfg, ...cfg } });
      dispatch({ type: 'SET_STUDY_LOG', payload: log });
    }
    load();
  }, []);

  async function updateDecks(decks) {
    dispatch({ type: 'SET_DECKS', payload: decks });
    await saveDecks(decks);
  }

  async function updateCfg(partial) {
    const next = { ...state.cfg, ...partial };
    dispatch({ type: 'SET_CFG', payload: partial });
    await saveSettings(next);
  }

  async function incrementStudyLog() {
    const log = { ...state.studyLog };
    const t = today();
    log[t] = (log[t] || 0) + 1;
    dispatch({ type: 'SET_STUDY_LOG', payload: log });
    await saveStudyLog(log);
  }

  function saveDeck(title, newCards) {
    const decks = { ...state.decks };
    const existId = Object.keys(decks).find(id => decks[id].title === title);
    let deckId;
    if (existId) {
      const existing = {};
      decks[existId].cards.forEach(c => existing[c.front + '|' + c.back] = c);
      decks[existId].cards = newCards.map(c => {
        const k = c.front + '|' + c.back;
        return existing[k] ? { ...c, status: existing[k].status, starred: existing[k].starred, lastStudied: existing[k].lastStudied, reviewLevel: existing[k].reviewLevel } : c;
      });
      deckId = existId;
    } else {
      deckId = 'deck_' + Date.now();
      decks[deckId] = { title, cards: newCards, createdAt: Date.now() };
    }
    updateDecks(decks);
    dispatch({ type: 'SET_CURRENT_DECK', payload: deckId });
    return deckId;
  }

  return (
    <AppContext.Provider value={{ state, dispatch, updateDecks, updateCfg, incrementStudyLog, saveDeck }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() { return useContext(AppContext); }
