import { describe, expect, it } from 'vitest';
import { addMonthsClamped, daysInMonth, periodOf, periodRange, shiftPeriod } from '../src/domain/dates';
import { initialData } from '../src/domain/defaults';
import { expensesByCategory, goalBalance, monthSummary, monthlyNeeded, monthsToReach, netExpense, suggestedCarryOver, totalSavings } from '../src/domain/finance';
import { parseAmount, formatCents } from '../src/domain/money';
import { occurrenceDates, pendingOccurrences } from '../src/domain/recurring';
import { makeBackup, parseBackup, toCSV } from '../src/domain/backup';
import { levelFromXp, levelThreshold, totalXp } from '../src/domain/game';
import { reduce, type Action } from '../src/store/reducer';
import type { AppData } from '../src/domain/types';

const T = '2026-11-15';
const run = (d: AppData, ...actions: Action[]) => actions.reduce((acc, a) => reduce(acc, { ...a, today: T } as never), d);

const exp = (amount: number, date: string, categoryId = 'courses', extra: Record<string, unknown> = {}): Action => ({
  type: 'expense/add',
  expense: { amount, date, categoryId, description: 'x', nature: 'variable', status: 'realisee', refunds: [], ...extra } as never
});
const inc = (amount: number, date: string, extra: Record<string, unknown> = {}): Action => ({
  type: 'income/add',
  income: { amount, date, description: 'Salaire', type: 'salaire', status: 'recu', ...extra } as never
});

describe('montants en centimes', () => {
  it('convertit les saisies françaises sans flottant', () => {
    expect(parseAmount('12')).toBe(1200);
    expect(parseAmount('12,5')).toBe(1250);
    expect(parseAmount('0,1')).toBe(10);
    expect(parseAmount('1 234,56')).toBe(123456);
    expect(parseAmount('19.99 €')).toBe(1999);
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('1,234')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
  it('additionne 0,10 + 0,20 exactement', () => {
    let d = initialData();
    d = run(d, exp(parseAmount('0,10')!, '2026-11-02'), exp(parseAmount('0,20')!, '2026-11-03'));
    expect(monthSummary(d, '2026-11').expensesRealized).toBe(30);
  });
  it('formate en euros', () => {
    expect(formatCents(123456).replace(/\s/g, ' ')).toBe('1 234,56 €');
  });
});

describe('dates et périodes', () => {
  it('gère les années bissextiles', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(addMonthsClamped(2028, 1, 31, 1)).toBe('2028-02-29');
    expect(addMonthsClamped(2026, 1, 31, 1)).toBe('2026-02-28');
  });
  it('changement d’année', () => {
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriod('2027-01', -1)).toBe('2026-12');
    expect(periodRange('2026-12', 1)).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });
  it('mois budgétaire décalé (paie le 25)', () => {
    expect(periodOf('2026-11-24', 25)).toBe('2026-10');
    expect(periodOf('2026-11-25', 25)).toBe('2026-11');
    expect(periodRange('2026-12', 25)).toEqual({ start: '2026-12-25', end: '2027-01-24' });
  });
});

describe('revenus', () => {
  it('total des revenus reçus, prévus exclus, annulés exclus', () => {
    let d = initialData();
    d = run(d, inc(200000, '2026-11-01'), inc(30000, '2026-11-10', { type: 'prime' }), inc(5000, '2026-11-20', { status: 'prevu' }), inc(9999, '2026-11-05', { status: 'annule' }));
    const s = monthSummary(d, '2026-11');
    expect(s.incomesReceived).toBe(230000);
    expect(s.incomesPlanned).toBe(5000);
  });
  it('mois sans salaire', () => {
    const d = run(initialData(), exp(1000, '2026-11-03'));
    const s = monthSummary(d, '2026-11');
    expect(s.incomesReceived).toBe(0);
    expect(s.available).toBe(-1000);
  });
  it('changement de salaire : l’historique est conservé', () => {
    let d = run(initialData(), inc(200000, '2026-10-01'), inc(210000, '2026-11-01'));
    expect(monthSummary(d, '2026-10').incomesReceived).toBe(200000);
    expect(monthSummary(d, '2026-11').incomesReceived).toBe(210000);
    // modification d'un revenu historique : seule cette ligne change
    const oct = d.incomes.find((i) => i.date === '2026-10-01')!;
    d = run(d, { type: 'income/update', income: { ...oct, amount: 205000 } });
    expect(monthSummary(d, '2026-10').incomesReceived).toBe(205000);
    expect(monthSummary(d, '2026-11').incomesReceived).toBe(210000);
  });
});

describe('dépenses', () => {
  it('dépense remboursée : nette, sans double comptage', () => {
    let d = run(initialData(), exp(10000, '2026-11-04', 'sante'));
    const e = d.expenses[0];
    d = run(d, { type: 'refund/add', expenseId: e.id, refund: { amount: 7000, date: '2026-11-12' } });
    expect(netExpense(d.expenses[0])).toBe(3000);
    const s = monthSummary(d, '2026-11');
    expect(s.expensesRealized).toBe(3000);
    expect(s.incomesReceived).toBe(0); // le remboursement n'est pas un revenu
    expect(() => run(d, { type: 'refund/add', expenseId: e.id, refund: { amount: 4000, date: '2026-11-13' } })).toThrow();
  });
  it('dépense annulée exclue, prévue comptée à part', () => {
    const d = run(initialData(), exp(5000, '2026-11-04', 'loisirs', { status: 'annulee' }), exp(2000, '2026-11-25', 'loisirs', { status: 'prevue' }));
    const s = monthSummary(d, '2026-11');
    expect(s.expensesRealized).toBe(0);
    expect(s.expensesPlanned).toBe(2000);
  });
  it('dépense saisie avec une date passée va dans son mois', () => {
    const d = run(initialData(), exp(4200, '2026-09-30'));
    expect(monthSummary(d, '2026-09').expensesRealized).toBe(4200);
    expect(monthSummary(d, '2026-11').expensesRealized).toBe(0);
  });
  it('fixes vs variables', () => {
    const d = run(initialData(), exp(80000, '2026-11-01', 'logement', { nature: 'fixe' }), exp(3000, '2026-11-02'));
    const s = monthSummary(d, '2026-11');
    expect(s.fixedRealized).toBe(80000);
    expect(s.variableRealized).toBe(3000);
  });
  it('suppression d’une transaction historique', () => {
    let d = run(initialData(), exp(1000, '2026-10-02'), exp(2000, '2026-10-03'));
    d = run(d, { type: 'expense/delete', id: d.expenses[0].id });
    expect(monthSummary(d, '2026-10').expensesRealized).toBe(2000);
  });
});

describe('épargne : transferts internes', () => {
  const withGoals = () =>
    run(
      initialData(),
      inc(200000, '2026-11-01'),
      { type: 'goal/add', goal: { name: 'Vacances', icon: '🏝️', target: 100000, paused: false } },
      { type: 'goal/add', goal: { name: 'Urgence', icon: '🛟', target: 300000, paused: false } }
    );

  it('un versement n’est pas une dépense', () => {
    let d = withGoals();
    const g = d.goals[0];
    d = run(d, { type: 'movement/add', movement: { goalId: g.id, type: 'versement', amount: 25000, date: '2026-11-05' } });
    const s = monthSummary(d, '2026-11');
    expect(s.expensesRealized).toBe(0);
    expect(s.savingsNet).toBe(25000);
    expect(s.available).toBe(175000);
    expect(goalBalance(g.id, d.movements)).toBe(25000);
  });
  it('retrait : réduit l’objectif, augmente le disponible, pas de revenu artificiel', () => {
    let d = withGoals();
    const g = d.goals[0];
    d = run(
      d,
      { type: 'movement/add', movement: { goalId: g.id, type: 'versement', amount: 25000, date: '2026-11-05' } },
      { type: 'movement/add', movement: { goalId: g.id, type: 'retrait', amount: 5000, date: '2026-11-08' } }
    );
    const s = monthSummary(d, '2026-11');
    expect(s.incomesReceived).toBe(200000);
    expect(s.available).toBe(180000);
    expect(goalBalance(g.id, d.movements)).toBe(20000);
    expect(() => run(d, { type: 'movement/add', movement: { goalId: g.id, type: 'retrait', amount: 999999, date: '2026-11-09' } })).toThrow();
  });
  it('transfert entre deux objectifs : neutre pour le disponible', () => {
    let d = withGoals();
    const [a, b] = d.goals;
    d = run(
      d,
      { type: 'movement/add', movement: { goalId: a.id, type: 'versement', amount: 30000, date: '2026-11-05' } },
      { type: 'movement/add', movement: { goalId: a.id, type: 'transfert', toGoalId: b.id, amount: 10000, date: '2026-11-06' } }
    );
    expect(goalBalance(a.id, d.movements)).toBe(20000);
    expect(goalBalance(b.id, d.movements)).toBe(10000);
    expect(totalSavings(d)).toBe(30000);
    expect(monthSummary(d, '2026-11').available).toBe(170000);
  });
  it('un objectif avec historique ne peut pas être supprimé', () => {
    let d = withGoals();
    d = run(d, { type: 'movement/add', movement: { goalId: d.goals[0].id, type: 'versement', amount: 100, date: '2026-11-05' } });
    expect(() => run(d, { type: 'goal/delete', id: d.goals[0].id })).toThrow();
  });
});

describe('budget', () => {
  it('budget par catégorie : reste, proche, dépassé', () => {
    let d = run(initialData(), exp(9000, '2026-11-02', 'courses'), exp(6000, '2026-11-03', 'restaurants'));
    d = run(d, { type: 'budget/save', budget: { period: '2026-11', savingsTarget: 0, categories: [{ categoryId: 'courses', limit: 10000 }, { categoryId: 'restaurants', limit: 5000 }] } });
    const s = monthSummary(d, '2026-11');
    const c = Object.fromEntries(s.categories.map((x) => [x.categoryId, x]));
    expect(c.courses.remaining).toBe(1000);
    expect(c.courses.state).toBe('proche');
    expect(c.restaurants.remaining).toBe(-1000);
    expect(c.restaurants.state).toBe('depasse');
  });
  it('modifier le budget ne réécrit pas les transactions', () => {
    let d = run(initialData(), exp(9000, '2026-11-02'));
    d = run(d, { type: 'budget/save', budget: { period: '2026-11', savingsTarget: 0, categories: [{ categoryId: 'courses', limit: 10000 }] } });
    d = run(d, { type: 'budget/save', budget: { period: '2026-11', savingsTarget: 0, categories: [{ categoryId: 'courses', limit: 20000 }] } });
    expect(d.expenses).toHaveLength(1);
    expect(d.expenses[0].amount).toBe(9000);
  });
  it('report de budget explicite et tracé', () => {
    let d = run(initialData(), inc(100000, '2026-10-01'), exp(60000, '2026-10-05'));
    expect(monthSummary(d, '2026-11').carryIn).toBe(0); // pas de report implicite
    const amount = suggestedCarryOver(d, '2026-11');
    expect(amount).toBe(40000);
    d = run(d, { type: 'budget/carryOver', period: '2026-11', amount, fromPeriod: '2026-10' });
    expect(monthSummary(d, '2026-11').available).toBe(40000);
    expect(d.budgets['2026-11'].carryOver?.fromPeriod).toBe('2026-10');
    // le report survit à une modification du budget
    d = run(d, { type: 'budget/save', budget: { period: '2026-11', savingsTarget: 0, categories: [{ categoryId: 'courses', limit: 100 }] } });
    expect(d.budgets['2026-11'].carryOver?.amount).toBe(40000);
  });
  it('report d’un déficit', () => {
    let d = run(initialData(), exp(5000, '2026-10-05'));
    d = run(d, { type: 'budget/carryOver', period: '2026-11', amount: suggestedCarryOver(d, '2026-11'), fromPeriod: '2026-10' });
    expect(monthSummary(d, '2026-11').available).toBe(-5000);
  });
  it('dépenses par catégorie', () => {
    const d = run(initialData(), exp(100, '2026-11-01', 'courses'), exp(250, '2026-11-02', 'courses'), exp(50, '2026-11-02', 'sante'));
    expect(expensesByCategory(d, periodRange('2026-11'))).toEqual({ courses: 350, sante: 50 });
  });
});

describe('récurrences sans doublon', () => {
  const rent = (extra: Record<string, unknown> = {}): Action => ({
    type: 'recurring/add',
    recurring: { kind: 'expense', amount: 80000, description: 'Loyer', categoryId: 'logement', nature: 'fixe', frequency: 'mensuel', startDate: '2026-01-31', active: true, skipped: [], ...extra } as never
  });

  it('échéances mensuelles au 31 ramenées en fin de mois', () => {
    const dates = occurrenceDates({ frequency: 'mensuel', startDate: '2026-01-31' }, { start: '2026-01-01', end: '2026-05-31' });
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });
  it('annuelle au 29 février', () => {
    const dates = occurrenceDates({ frequency: 'annuel', startDate: '2028-02-29' }, { start: '2028-01-01', end: '2030-12-31' });
    expect(dates).toEqual(['2028-02-29', '2029-02-28', '2030-02-28']);
  });
  it('hebdomadaire avec date de fin', () => {
    const dates = occurrenceDates({ frequency: 'hebdomadaire', startDate: '2026-11-02', endDate: '2026-11-20' }, { start: '2026-11-01', end: '2026-11-30' });
    expect(dates).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
  });
  it('prévue mais pas comptée comme payée avant confirmation', () => {
    const d = run(initialData(), rent());
    const s = monthSummary(d, '2026-11');
    expect(s.expensesRealized).toBe(0);
    expect(s.expensesPlanned).toBe(80000);
  });
  it('confirmer deux fois ne crée pas de doublon (réouverture, changement de mois)', () => {
    let d = run(initialData(), rent());
    const r = d.recurring[0];
    const confirm: Action = { type: 'recurring/confirm', recurringId: r.id, occurrenceDate: '2026-11-30', date: '2026-11-30', amount: 80000 };
    d = run(d, confirm, confirm, confirm);
    expect(d.expenses).toHaveLength(1);
    const s = monthSummary(d, '2026-11');
    expect(s.expensesRealized).toBe(80000);
    expect(s.expensesPlanned).toBe(0);
    expect(pendingOccurrences(d, periodRange('2026-11'))).toHaveLength(0);
  });
  it('récurrence suspendue : plus d’échéances prévues', () => {
    let d = run(initialData(), rent());
    d = run(d, { type: 'recurring/update', recurring: { ...d.recurring[0], active: false } });
    expect(monthSummary(d, '2026-11').expensesPlanned).toBe(0);
  });
  it('échéance ignorée', () => {
    let d = run(initialData(), rent());
    d = run(d, { type: 'recurring/skip', recurringId: d.recurring[0].id, occurrenceDate: '2026-11-30' });
    expect(monthSummary(d, '2026-11').expensesPlanned).toBe(0);
  });
  it('mois incomplet / date de début en cours de mois', () => {
    const d = run(initialData(), rent({ startDate: '2026-11-20', frequency: 'hebdomadaire', amount: 1000 }));
    expect(monthSummary(d, '2026-11').expensesPlanned).toBe(2000); // 20 et 27
  });
});

describe('sauvegarde', () => {
  it('export puis import restaure exactement les données', () => {
    let d = run(initialData(), inc(200000, '2026-11-01'), exp(1234, '2026-11-02'));
    d = run(d, { type: 'goal/add', goal: { name: 'V', icon: '⭐', target: 1000, paused: false } });
    const text = JSON.stringify(makeBackup(d));
    const res = parseBackup(text);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.expenses).toEqual(d.expenses);
      expect(res.summary.expenses).toBe(1);
      expect(monthSummary(res.data, '2026-11')).toEqual(monthSummary(d, '2026-11'));
    }
  });
  it('refuse un fichier invalide ou corrompu', () => {
    expect(parseBackup('pas du json').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ hello: 1 })).ok).toBe(false);
    const d = run(initialData(), exp(1234, '2026-11-02'));
    const bad = makeBackup(d);
    (bad.data.expenses[0] as { amount: number }).amount = 12.5;
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
    const future = { ...makeBackup(d), data: { ...d, schemaVersion: 99 } };
    expect(parseBackup(JSON.stringify(future)).ok).toBe(false);
  });
  it('CSV lisible par Excel FR', () => {
    const d = run(initialData(), exp(1234, '2026-11-02', 'courses', { description: 'Marché; légumes' }));
    const csv = toCSV(d);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Marché; légumes"');
    expect(csv).toContain('12,34');
  });
});

describe('progression', () => {
  it('l’XP récompense une habitude une fois par jour, pas les montants', () => {
    const small = run(initialData(), exp(100, '2026-11-02'), exp(100, '2026-11-03'));
    const big = run(initialData(), exp(10000000, '2026-11-02'));
    const saisie = (d: AppData) => d.progress.xpEvents.filter((e) => e.rule === 'saisie').reduce((a, e) => a + e.xp, 0);
    expect(saisie(small)).toBe(saisie(big)); // même jour T => une seule récompense
  });
  it('niveaux croissants, jamais perdus', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(levelThreshold(6))).toBe(6);
    expect(levelFromXp(10 ** 9)).toBe(100);
    let d = run(initialData(), exp(100, '2026-11-02'));
    const xp = totalXp(d.progress);
    d = run(d, { type: 'expense/delete', id: d.expenses[0].id });
    expect(totalXp(d.progress)).toBe(xp);
    expect(d.progress.achievements['premiere-depense']).toBeDefined();
    expect(d.progress.unlockedRegions.village).toBeDefined();
  });
  it('simulateur', () => {
    expect(monthsToReach(0, 100000, 15000)).toBe(7);
    expect(monthsToReach(0, 100000, 0)).toBeNull();
    expect(monthlyNeeded(20000, 100000, 4)).toBe(20000);
  });
});

describe('accueil : opérations récentes par jour', () => {
  it('groupe par jour, du plus récent au plus ancien, avec le solde net du jour', async () => {
    const { recentByDay } = await import('../src/domain/finance');
    const it_ = (date: string, amount: number, sign: '+' | '−' | '⇄', planned = false, cancelled = false) => ({ date, amount, sign, planned, cancelled });
    const groups = recentByDay(
      [it_('2026-11-10', 150000, '+'), it_('2026-11-12', 1250, '−'), it_('2026-11-12', 500, '−'), it_('2026-11-12', 2000, '⇄'), it_('2026-11-13', 999, '−', true), it_('2026-11-14', 300, '−', false, true), it_('2026-11-08', 100, '−')],
      2
    );
    expect(groups.map((g) => g.date)).toEqual(['2026-11-12', '2026-11-10']);
    expect(groups[0].net).toBe(-1750); // transfert entre objectifs neutre
    expect(groups[0].items).toHaveLength(3);
    expect(groups[1].net).toBe(150000);
  });
});

describe('graphique du mois et bilan annuel', () => {
  it('la courbe du mois finit sur le disponible estimé et s’arrête à aujourd’hui', async () => {
    const { monthCurve, monthProgress } = await import('../src/domain/finance');
    const d = run(initialData(), inc(200000, '2026-11-01'), exp(5000, '2026-11-03'), exp(1250, '2026-11-15'), exp(999, '2026-11-20'));
    const c = monthCurve(d, '2026-11', T);
    expect(c).toHaveLength(15);
    expect(c[0].available).toBe(200000);
    expect(c[2].available).toBe(195000);
    const full = monthCurve(d, '2026-11', '2026-12-05');
    expect(full).toHaveLength(30);
    expect(full[29].available).toBe(monthSummary(d, '2026-11').available);
    expect(monthProgress(d, '2026-11', T)).toEqual({ day: 15, days: 30 });
    expect(monthProgress(d, '2026-10', T)).toEqual({ day: 31, days: 31 });
    expect(monthCurve(d, '2026-12', T)).toEqual([]);
  });

  it('le bilan de l’année additionne revenus et dépenses de chaque mois', async () => {
    const { yearSummary } = await import('../src/domain/finance');
    const d = run(initialData(), inc(150000, '2026-01-05'), exp(40000, '2026-01-10'), inc(150000, '2026-11-01'), exp(60000, '2026-11-02'), exp(9999, '2025-12-31'));
    const y = yearSummary(d, 2026);
    expect(y.months).toHaveLength(12);
    expect(y.incomes).toBe(300000);
    expect(y.expenses).toBe(100000);
    expect(y.saved).toBe(200000);
    expect(y.months[0].expenses).toBe(40000);
  });
});

describe('migration v2 : mois du 1er au dernier jour', () => {
  it('remet le début du mois au 1er pour les anciennes sauvegardes', async () => {
    const { migrate } = await import('../src/domain/backup');
    const d = migrate({ schemaVersion: 1, settings: { monthStartDay: 25, currency: 'EUR', theme: 'auto' } }) as { schemaVersion: number; settings: { monthStartDay: number; currency: string; theme: string } };
    expect(d.settings.theme).toBe('clair');
    expect((migrate({ schemaVersion: 1, settings: { theme: 'sombre' } }) as { settings: { theme: string } }).settings.theme).toBe('sombre');
    expect(d.schemaVersion).toBe(5);
    expect(d.settings.monthStartDay).toBe(1);
    expect(d.settings.currency).toBe('EUR');
  });
});

describe('migration v3 : compagnon', () => {
  it('garde le compagnon valide et ignore une valeur inconnue', async () => {
    const { parseBackup, makeBackup } = await import('../src/domain/backup');
    const ok = parseBackup(JSON.stringify(makeBackup({ ...initialData(), settings: { ...initialData().settings, mascot: 'lion' } })));
    expect(ok.ok && ok.data.settings.mascot).toBe('lion');
    const bad = parseBackup(JSON.stringify(makeBackup({ ...initialData(), settings: { ...initialData().settings, mascot: 'dragon' as never } })));
    expect(bad.ok && bad.data.settings.mascot).toBeUndefined();
    expect(initialData().settings.mascot).toBeUndefined();
  });
});

describe('récurrences : état du mois et libellé', () => {
  it('indique l’échéance du mois et si elle est payée', async () => {
    const { periodStatus, scheduleLabel } = await import('../src/domain/recurring');
    const rec = { id: 'r1', kind: 'expense', amount: 72000, description: 'Loyer', categoryId: 'logement', nature: 'fixe', frequency: 'mensuel', startDate: '2026-01-05', active: true, skipped: [], createdAt: '', updatedAt: '' } as never;
    const nov = { start: '2026-11-01', end: '2026-11-30' };
    expect(periodStatus({ incomes: [], expenses: [] }, rec, nov)).toEqual({ date: '2026-11-05', confirmed: false });
    const paid = { incomes: [], expenses: [{ recurringId: 'r1', occurrenceDate: '2026-11-05' }] } as never;
    expect(periodStatus(paid, rec, nov).confirmed).toBe(true);
    expect(scheduleLabel(rec)).toBe('Le 5 de chaque mois');
  });
});
