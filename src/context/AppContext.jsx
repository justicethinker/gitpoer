import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ── Plan configuration ────────────────────────────────────────────────────────
export const PLANS = {
  free: {
    id: 'free', name: 'Free', price: 0,
    generationsPerMonth: Infinity,
    features: {
      customInstructions: true,
      multiLanguageCount: 20,
      audienceModeCount: 4,
      docValidatorImproved: true,
      portfolioVerdict: true,
      generationHistory: true,
      bulkMode: true,
      pdfExport: true,
      teamDashboard: true,
      sharedInstructions: true,
      slackIntegration: true,
    },
  },
  dev: {
    id: 'dev', name: 'Dev', price: 8,
    generationsPerMonth: 100,
    features: {
      customInstructions: true,
      multiLanguageCount: 10,
      audienceModeCount: 4,
      docValidatorImproved: true,
      portfolioVerdict: true,
      generationHistory: true,
    },
  },
  pro: {
    id: 'pro', name: 'Pro', price: 19,
    generationsPerMonth: Infinity,
    features: {
      customInstructions: true,
      multiLanguageCount: 20,
      audienceModeCount: 4,
      docValidatorImproved: true,
      portfolioVerdict: true,
      generationHistory: true,
      bulkMode: true,
      pdfExport: true,
    },
  },
  team: {
    id: 'team', name: 'Team', price: 59,
    generationsPerMonth: Infinity,
    features: {
      customInstructions: true,
      multiLanguageCount: 20,
      audienceModeCount: 4,
      docValidatorImproved: true,
      portfolioVerdict: true,
      generationHistory: true,
      bulkMode: true,
      pdfExport: true,
      teamDashboard: true,
      sharedInstructions: true,
      slackIntegration: true,
    },
  },
};

// ── Storage keys ─────────────────────────────────────────────────────────────
const STORAGE = {
  USER: 'gg_user',
  PLAN: 'gg_plan',
  GEN_COUNT: 'gg_gen_count',
  GEN_MONTH: 'gg_gen_month',
  CACHED_REPOS: 'gg_cached_repos',
};

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

// ── Context ───────────────────────────────────────────────────────────────────
const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Auth state
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE.USER)); } catch { return null; }
  });

  // Billing / Plan state
  const [planId, setPlanId] = useState(() => localStorage.getItem(STORAGE.PLAN) || 'free');
  const [genCount, setGenCount] = useState(() => {
    const month = localStorage.getItem(STORAGE.GEN_MONTH);
    if (month !== getCurrentMonth()) return 0;
    return parseInt(localStorage.getItem(STORAGE.GEN_COUNT) || '0', 10);
  });

  // Cache of fetched repos for dashboard
  const [cachedRepos, setCachedRepos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE.CACHED_REPOS) || '[]'); } catch { return []; }
  });

  const [upgradeModal, setUpgradeModal] = useState(null); // null | { feature, description }

  const plan = PLANS[planId] || PLANS.free;
  const limit = plan.generationsPerMonth;
  const generationsLeft = limit === Infinity ? Infinity : Math.max(0, limit - genCount);
  const isAtLimit = limit !== Infinity && genCount >= limit;

  // Sync to localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE.USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE.USER);
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem(STORAGE.PLAN, planId);
  }, [planId]);

  useEffect(() => {
    localStorage.setItem(STORAGE.GEN_COUNT, String(genCount));
    localStorage.setItem(STORAGE.GEN_MONTH, getCurrentMonth());
  }, [genCount]);

  useEffect(() => {
    localStorage.setItem(STORAGE.CACHED_REPOS, JSON.stringify(cachedRepos));
  }, [cachedRepos]);

  const login = useCallback((mockUser) => {
    setUser(mockUser);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setCachedRepos([]);
  }, []);

  const incrementGeneration = useCallback(() => {
    setGenCount(c => c + 1);
  }, []);

  const addCachedRepo = useCallback((repoData) => {
    setCachedRepos(prev => {
      // Don't add duplicates
      if (prev.find(r => r.id === repoData.id)) return prev;
      return [repoData, ...prev];
    });
  }, []);

  const openUpgradeModal = useCallback((feature, description) => {
    setUpgradeModal({ feature, description });
  }, []);

  const closeUpgradeModal = useCallback(() => {
    setUpgradeModal(null);
  }, []);

  const upgradePlan = useCallback((newPlanId) => {
    setPlanId(newPlanId);
    setGenCount(0); // reset on upgrade
  }, []);

  const canUseFeature = useCallback((featureKey) => {
    return !!plan.features[featureKey];
  }, [plan]);

  const value = {
    user, login, logout,
    plan, planId, genCount, generationsLeft, isAtLimit, limit,
    cachedRepos, addCachedRepo, setCachedRepos,
    upgradeModal, openUpgradeModal, closeUpgradeModal, upgradePlan,
    incrementGeneration, canUseFeature,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
