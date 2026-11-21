import { isValidISO, isValidPeriod } from './dates';
import { initialData, SCHEMA_VERSION } from './defaults';
import { netExpense } from './finance';
import { isCents } from './money';
import type { AppData } from './types';

/**
 * Sauvegarde versionnée :
 * { app: 'MONEY_QUEST', format: 1, schemaVersion, exportedAt, data }
 * L'import valide tout avant de proposer un remplacement.
 */

export const BACKUP_FORMAT = 1;

export interface BackupFile {
  app: 'MONEY_QUEST';
  format: number;
  schemaVersion: number;
  exportedAt: string;
  data: AppData;
}

export function makeBackup(data: AppData, nowIso = new Date().toISOString()): BackupFile {
  return { app: 'MONEY_QUEST', format: BACKUP_FORMAT, schemaVersion: data.schemaVersion, exportedAt: nowIso, data };
}

export interface BackupSummary {
  exportedAt?: string;
  incomes: number;
  expenses: number;
  recurring: number;
  goals: number;
  movements: number;
  budgets: number;
}

export type ValidationResult = { ok: true; data: AppData; summary: BackupSummary } | { ok: false; errors: string[] };

/** Migrations de schéma : chaque version ajoute une étape. */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  // 3 -> 4 -> 5 : versions de l'app « enveloppes » (de ta copine). Rien à convertir ici :
  // ces numéros servent seulement à pouvoir importer ses sauvegardes et les tiennes faites là-bas.
  3: (d) => d,
  4: (d) => d,
  // 1 -> 2 : le mois va toujours du 1er au dernier jour
  // + thème clair par défaut (l'ancien « auto » devient « clair »)
  1: (d) => {
    const st = (d.settings ?? {}) as Record<string, unknown>;
    return { ...d, settings: { ...st, monthStartDay: 1, theme: st.theme === 'auto' || st.theme === undefined ? 'clair' : st.theme } };
  },
  // 2 -> 3 : ajout du compagnon (absent = choix au prochain lancement), rien à convertir
  2: (d) => d
};

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let d = raw;
  let v = typeof d.schemaVersion === 'number' ? d.schemaVersion : 1;
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (step) d = step(d);
    v++;
    d = { ...d, schemaVersion: v };
  }
  return d;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

export function validateData(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['Le contenu n’est pas un objet de données.'] };
  if (typeof input.schemaVersion === 'number' && input.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, errors: [`Cette sauvegarde vient d’une version plus récente de l’application (schéma ${input.schemaVersion}).`] };
  }
  const d = migrate(input);
  const base = initialData();

  const arr = (k: string) => {
    if (!Array.isArray(d[k])) {
      errors.push(`La liste « ${k} » est absente ou invalide.`);
      return [] as Record<string, unknown>[];
    }
    return d[k] as Record<string, unknown>[];
  };

  const incomes = arr('incomes');
  const expenses = arr('expenses');
  const recurring = arr('recurring');
  const categories = arr('categories');
  const goals = arr('goals');
  const movements = arr('movements');

  const check = (list: Record<string, unknown>[], name: string, fields: (x: Record<string, unknown>) => boolean) => {
    list.forEach((x, i) => {
      if (!isObj(x) || !isStr(x.id) || !fields(x)) errors.push(`${name} n°${i + 1} invalide.`);
    });
    const ids = new Set(list.map((x) => x.id));
    if (ids.size !== list.length) errors.push(`${name} : identifiants en double.`);
  };

  check(incomes, 'Revenu', (x) => isCents(x.amount) && isValidISO(x.date) && ['recu', 'prevu', 'annule'].includes(x.status as string));
  check(
    expenses,
    'Dépense',
    (x) =>
      isCents(x.amount) &&
      isValidISO(x.date) &&
      isStr(x.categoryId) &&
      ['realisee', 'prevue', 'annulee'].includes(x.status as string) &&
      Array.isArray(x.refunds) &&
      (x.refunds as Record<string, unknown>[]).every((r) => isCents(r.amount) && isValidISO(r.date))
  );
  check(recurring, 'Récurrence', (x) => isCents(x.amount) && isValidISO(x.startDate) && ['income', 'expense'].includes(x.kind as string) && Array.isArray(x.skipped));
  check(categories, 'Catégorie', (x) => isStr(x.name));
  check(goals, 'Objectif', (x) => isCents(x.target) && isStr(x.name));
  check(movements, 'Mouvement d’épargne', (x) => isCents(x.amount) && isValidISO(x.date) && ['versement', 'retrait', 'transfert'].includes(x.type as string));

  const goalIds = new Set(goals.map((g) => g.id));
  movements.forEach((m, i) => {
    if (!goalIds.has(m.goalId) || (m.type === 'transfert' && !goalIds.has(m.toGoalId))) errors.push(`Mouvement d’épargne n°${i + 1} : objectif inconnu.`);
  });
  const catIds = new Set(categories.map((c) => c.id));
  expenses.forEach((e, i) => {
    if (!catIds.has(e.categoryId)) errors.push(`Dépense n°${i + 1} : catégorie inconnue.`);
  });

  if (!isObj(d.budgets)) errors.push('Les budgets sont invalides.');
  else for (const k of Object.keys(d.budgets)) if (!isValidPeriod(k)) errors.push(`Budget « ${k} » : période invalide.`);
  if (!isObj(d.settings)) errors.push('Les paramètres sont invalides.');
  if (!isObj(d.progress)) errors.push('La progression est invalide.');

  if (errors.length) return { ok: false, errors: errors.slice(0, 12) };

  const settings = { ...base.settings, ...(d.settings as object) } as AppData['settings'];
  settings.alerts = { ...base.settings.alerts, ...settings.alerts };
  settings.xpRules = { ...base.settings.xpRules, ...settings.xpRules };
  if (settings.mascot !== undefined && !['chat', 'loutre', 'lion', 'renard'].includes(settings.mascot)) delete settings.mascot;
  const progress = { ...base.progress, ...(d.progress as object) } as AppData['progress'];

  const data: AppData = {
    ...base,
    ...(d as unknown as AppData),
    settings,
    progress,
    schemaVersion: SCHEMA_VERSION
  };
  return {
    ok: true,
    data,
    summary: {
      incomes: data.incomes.length,
      expenses: data.expenses.length,
      recurring: data.recurring.length,
      goals: data.goals.length,
      movements: data.movements.length,
      budgets: Object.keys(data.budgets).length
    }
  };
}

export function parseBackup(text: string): ValidationResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Le fichier n’est pas un JSON lisible.'] };
  }
  if (!isObj(json) || json.app !== 'MONEY_QUEST' || !isObj(json.data)) {
    return { ok: false, errors: ['Ce fichier n’est pas une sauvegarde MONEY QUEST.'] };
  }
  if (typeof json.format === 'number' && json.format > BACKUP_FORMAT) {
    return { ok: false, errors: ['Format de sauvegarde trop récent pour cette version.'] };
  }
  const res = validateData(json.data);
  if (res.ok && isStr(json.exportedAt)) res.summary.exportedAt = json.exportedAt;
  return res;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvAmount = (c: number) => (c / 100).toFixed(2).replace('.', ',');

/** Export CSV des transactions (séparateur « ; », décimale « , », compatible Excel FR). */
export function toCSV(data: AppData): string {
  const cat = new Map(data.categories.map((c) => [c.id, c.name]));
  const goal = new Map(data.goals.map((g) => [g.id, g.name]));
  const rows: (string | number)[][] = [['Date', 'Type', 'Catégorie / objectif', 'Description', 'Montant', 'Remboursé', 'Net', 'Statut', 'Nature', 'Note']];
  for (const i of data.incomes) rows.push([i.date, 'Revenu', i.type, i.description, csvAmount(i.amount), '', csvAmount(i.amount), i.status, '', i.note ?? '']);
  for (const e of data.expenses) {
    const net = netExpense(e);
    rows.push([e.date, 'Dépense', cat.get(e.categoryId) ?? e.categoryId, e.description, csvAmount(e.amount), csvAmount(e.amount - net), csvAmount(net), e.status, e.nature, e.note ?? '']);
  }
  for (const m of data.movements) {
    const label = m.type === 'transfert' ? `${goal.get(m.goalId)} → ${goal.get(m.toGoalId ?? '')}` : goal.get(m.goalId) ?? '';
    rows.push([m.date, `Épargne (${m.type})`, label, m.note ?? '', csvAmount(m.amount), '', csvAmount(m.amount), 'realise', '', '']);
  }
  const [head, ...body] = rows;
  body.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return '﻿' + [head, ...body].map((r) => r.map(csvCell).join(';')).join('\r\n');
}
