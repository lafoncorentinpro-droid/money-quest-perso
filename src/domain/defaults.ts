import { DEFAULT_ACTIVE_MISSIONS, DEFAULT_XP_RULES } from './game';
import type { AppData, Category, IncomeType } from './types';

export const SCHEMA_VERSION = 5;

export const DEFAULT_CATEGORIES: Category[] = [
  ['logement', 'Logement', '🏠'],
  ['courses', 'Courses alimentaires', '🧺'],
  ['restaurants', 'Restaurants', '🍽️'],
  ['transport', 'Transport', '🚌'],
  ['voiture', 'Voiture', '🚗'],
  ['abonnements', 'Abonnements', '🔁'],
  ['telephone', 'Téléphone et Internet', '📱'],
  ['sante', 'Santé', '🩺'],
  ['shopping', 'Shopping', '🛍️'],
  ['loisirs', 'Loisirs', '🎨'],
  ['voyages', 'Voyages', '🧳'],
  ['animaux', 'Animaux', '🐾'],
  ['cadeaux', 'Cadeaux', '🎁'],
  ['impots', 'Impôts et frais', '🧾'],
  ['autres', 'Autres', '✨']
].map(([id, name, icon]) => ({ id, name, icon, custom: false, archived: false }));

export const GOAL_TEMPLATES = [
  { name: 'Vacances', icon: '🏝️' },
  { name: 'Voiture', icon: '🚙' },
  { name: 'Projet immobilier', icon: '🏡' },
  { name: 'Fonds d’urgence', icon: '🛟' },
  { name: 'Achat personnel', icon: '🎒' },
  { name: 'Objectif libre', icon: '⭐' }
];

export const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
  salaire: 'Salaire',
  prime: 'Prime',
  aide: 'Aide',
  activite: 'Activité secondaire',
  remboursement: 'Remboursement reçu',
  autre: 'Autre revenu'
};

/** Données initiales : vides. Aucune transaction ni solde fictif. */
export function initialData(nowIso = new Date().toISOString()): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    incomes: [],
    expenses: [],
    recurring: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    budgets: {},
    goals: [],
    movements: [],
    progress: {
      xpEvents: [],
      achievements: {},
      unlockedRegions: {},
      missionCompletions: [],
      bilansViewed: [],
      recurringReviews: [],
      equipped: { scarf: 'echarpe-bleue' }
    },
    settings: {
      nickname: '',
      currency: 'EUR',
      monthStartDay: 1,
      theme: 'clair',
      animations: true,
      alerts: { budget: true, echeances: true, rappelSaisie: true, masquerMontants: false },
      xpRules: { ...DEFAULT_XP_RULES },
      activeMissions: [...DEFAULT_ACTIVE_MISSIONS],
      onboardingDone: false
    },
    createdAt: nowIso
  };
}
