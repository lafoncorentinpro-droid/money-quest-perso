import { useEffect, useRef, useState } from 'react';
import { makeBackup, parseBackup, toCSV, type ValidationResult } from '../domain/backup';
import { formatDateShort, periodLabel } from '../domain/dates';
import { centsToInput, parseAmount } from '../domain/money';
import type { AppData, Theme } from '../domain/types';
import { requestPersistence } from '../store/db';
import { useStore } from '../store/store';
import { Confirm, Field, PageHead, Sheet, Switch } from '../ui/components';
import { Icon } from '../ui/Icon';
import { MascotSettings } from '../ui/Mascot';

const CURRENCIES = [
  ['EUR', 'Euro (€)'],
  ['CHF', 'Franc suisse (CHF)'],
  ['CAD', 'Dollar canadien ($ CA)'],
  ['USD', 'Dollar US ($)'],
  ['GBP', 'Livre sterling (£)'],
  ['XOF', 'Franc CFA (XOF)'],
  ['MAD', 'Dirham marocain (MAD)']
];

async function shareOrDownload(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const file = new File([blob], name, { type });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function Profile() {
  const { data, dispatch, toast, period } = useStore();
  const s = data.settings;
  const [nick, setNick] = useState(s.nickname);
  const [opening, setOpening] = useState(s.openingBalance ? (s.openingBalance.amount < 0 ? '-' : '') + centsToInput(s.openingBalance.amount) : '');
  const [importRes, setImportRes] = useState<ValidationResult | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [persisted, setPersisted] = useState<boolean | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (settings: Partial<AppData['settings']>) => dispatch({ type: 'settings/update', settings });

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined);
  }, []);

  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;

  const exportJson = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    await shareOrDownload(`money-quest-perso-sauvegarde-${stamp}.json`, JSON.stringify(makeBackup(data), null, 2), 'application/json');
    set({ lastBackupAt: new Date().toISOString() });
    toast('Sauvegarde exportée', 'success');
  };
  const exportCsv = async () => {
    await shareOrDownload(`money-quest-operations-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(data), 'text/csv;charset=utf-8');
    toast('CSV exporté', 'success');
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      setImportRes({ ok: false, errors: ['Fichier trop volumineux (20 Mo max).'] });
      return;
    }
    setImportRes(parseBackup(await f.text()));
    if (fileRef.current) fileRef.current.value = '';
  };

  const saveOpening = () => {
    const t = opening.trim();
    if (!t) {
      set({ openingBalance: undefined });
      toast('Solde de départ retiré');
      return;
    }
    const neg = t.startsWith('-');
    const c = parseAmount(neg ? t.slice(1) : t);
    if (c === null) {
      toast('Montant invalide', 'error');
      return;
    }
    set({ openingBalance: { amount: neg ? -c : c, period } });
    toast(`Solde de départ appliqué à ${periodLabel(period, s.monthStartDay)}`, 'success');
  };

  const daysSinceBackup = s.lastBackupAt ? Math.floor((Date.now() - Date.parse(s.lastBackupAt)) / 86400000) : null;

  return (
    <div className="page">
      <PageHead title="Réglages" backTo="accueil" />

      <h2 className="set-head">
        <Icon name="user" size={18} /> Profil
      </h2>
      <section className="card stack">
        <Field label="Prénom ou pseudo (facultatif)">
          <input className="input" value={nick} maxLength={30} placeholder="Ex. Corentin" onChange={(e) => setNick(e.target.value)} onBlur={() => nick !== s.nickname && set({ nickname: nick.trim() })} />
        </Field>
      </section>

      <h2 className="set-head">
        <Icon name="star" size={18} /> Mon compagnon
      </h2>
      <section className="card stack">
        <MascotSettings />
      </section>

      <h2 className="set-head">
        <Icon name="sliders" size={18} /> Préférences
      </h2>
      <section className="card stack">
        <Field label="Devise" hint="Change uniquement l’affichage : aucun montant n’est converti.">
          <select className="input" value={s.currency} onChange={(e) => set({ currency: e.target.value })}>
            {CURRENCIES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <span>Thème</span>
          <div className="segmented seg-lg" role="group" aria-label="Thème">
            {(
              [
                ['auto', 'Auto'],
                ['clair', 'Clair'],
                ['sombre', 'Sombre']
              ] as [Theme, string][]
            ).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={s.theme === k} onClick={() => set({ theme: k })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <Switch label="Animations" checked={s.animations} onChange={(v) => set({ animations: v })} />
      </section>

      <h2 className="set-head">
        <Icon name="wallet" size={18} /> Argent de départ
      </h2>
      <section className="card stack">
        <Field label="Solde de départ (facultatif)" hint={`Ajouté au disponible estimé de ${periodLabel(s.openingBalance?.period ?? period, 1).split(' ')[0]}. Mets « − » devant pour un découvert.`}>
          <div className="row">
            <input className="input" inputMode="text" placeholder="0,00 €" value={opening} onChange={(e) => setOpening(e.target.value)} />
            <button type="button" className="btn btn-primary ok-btn" onClick={saveOpening}>
              OK
            </button>
          </div>
        </Field>
      </section>

      <h2 className="set-head">
        <Icon name="bell" size={18} /> Alertes
      </h2>
      <section className="card">
        <div className="set-list">
          <Switch label="Échéances proches" checked={s.alerts.echeances} onChange={(v) => set({ alerts: { ...s.alerts, echeances: v } })} />
          <Switch label="Rappel de saisie du jour" checked={s.alerts.rappelSaisie} onChange={(v) => set({ alerts: { ...s.alerts, rappelSaisie: v } })} />
        </div>
        <p className="tiny" style={{ margin: '8px 0 0' }}>
          Les alertes s’affichent dans l’app à l’ouverture. Aucune notification n’est envoyée par un serveur : tes données restent privées.
        </p>
      </section>

      <h2 className="set-head">
        <Icon name="lock" size={18} /> Mes données
      </h2>
      <section className="card stack">
        <div className="set-info">
          <Icon name="lock" size={20} />
          <span>
            Tes données restent <strong>sur cet appareil</strong>. Rien n’est envoyé sur internet. Si tu effaces Safari ou perds ton téléphone, elles sont perdues : <strong>exporte une sauvegarde régulièrement</strong>.
          </span>
        </div>
        <div className={`set-backup ${daysSinceBackup === null || daysSinceBackup > 30 ? 'is-warn' : 'is-ok'}`}>
          <Icon name={daysSinceBackup === null || daysSinceBackup > 30 ? 'warning' : 'check'} size={20} />
          <span>{daysSinceBackup === null ? 'Aucune sauvegarde exportée pour l’instant' : daysSinceBackup === 0 ? 'Dernière sauvegarde : aujourd’hui' : `Dernière sauvegarde : il y a ${daysSinceBackup} jour${daysSinceBackup > 1 ? 's' : ''}`}</span>
        </div>
        <button type="button" className="btn btn-primary btn-block btn-xl" onClick={exportJson}>
          <Icon name="download" size={20} strokeWidth={2.2} /> Exporter une sauvegarde
        </button>
        <div className="set-list">
          <button type="button" className="set-row" onClick={exportCsv}>
            <span className="set-ico">
              <Icon name="file" size={20} />
            </span>
            <span className="grow">
              <strong>Exporter les opérations</strong>
              <small>Fichier CSV, pour Excel ou Numbers</small>
            </span>
            <Icon name="chevron-right" size={18} />
          </button>
          <label className="set-row">
            <span className="set-ico">
              <Icon name="upload" size={20} />
            </span>
            <span className="grow">
              <strong>Importer une sauvegarde</strong>
            </span>
            <Icon name="chevron-right" size={18} />
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <button
            type="button"
            className="set-row"
            onClick={async () => {
              const ok = await requestPersistence();
              setPersisted(ok);
              toast(ok ? 'Stockage protégé contre l’effacement automatique' : 'Le navigateur n’a pas accordé la protection (installe l’app sur l’écran d’accueil).');
            }}
          >
            <span className="set-ico">
              <Icon name="lock" size={20} />
            </span>
            <span className="grow">
              <strong>Protéger le stockage</strong>
              {persisted && <small>Déjà protégé</small>}
            </span>
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
      </section>

      {!isStandalone && (
        <>
          <h2 className="set-head">
            <Icon name="share" size={18} /> Installer sur iPhone
          </h2>
          <section className="card stack">
            <ol className="set-steps">
              <li>
                <span>1</span> Ouvre cette page dans Safari.
              </li>
              <li>
                <span>2</span> Touche le bouton Partager.
              </li>
              <li>
                <span>3</span> Choisis « Sur l’écran d’accueil », puis « Ajouter ».
              </li>
            </ol>
            <p className="tiny" style={{ margin: 0 }}>
              L’app marche ensuite hors connexion. Les données de Safari et de l’app installée sont séparées : pense à exporter puis importer ta sauvegarde.
            </p>
          </section>
        </>
      )}

      <button type="button" className="card set-reset" onClick={() => setConfirmReset(true)}>
        <span className="set-ico is-danger">
          <Icon name="trash" size={20} />
        </span>
        <span className="grow">
          <strong>Réinitialiser l’application</strong>
          <small>Efface toutes tes données sur cet appareil</small>
        </span>
      </button>

      <p className="set-foot">
        <strong>MONEY QUEST 1.0</strong>
        <br />
        Aucune publicité · aucun traceur · aucun abonnement
      </p>

      {importRes && (
        <Sheet title="Importer une sauvegarde" onClose={() => setImportRes(null)}>
          {importRes.ok ? (
            <div className="stack">
              <p className="muted" style={{ margin: 0 }}>
                Sauvegarde valide{importRes.summary.exportedAt ? ` du ${formatDateShort(importRes.summary.exportedAt.slice(0, 10))}` : ''} :
              </p>
              <ul className="small" style={{ margin: 0 }}>
                <li>{importRes.summary.incomes} revenus</li>
                <li>{importRes.summary.expenses} dépenses</li>
                <li>{importRes.summary.recurring} récurrences</li>
                <li>{importRes.summary.budgets} budgets</li>
                <li>
                  {importRes.summary.goals} objectifs, {importRes.summary.movements} mouvements d’épargne
                </li>
              </ul>
              <div className="notice notice-warn small">⚠️ Tes données actuelles seront remplacées. Exporte-les d’abord si tu veux les garder.</div>
              <button type="button" className="btn" onClick={exportJson}>
                Exporter mes données actuelles d’abord
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (importRes.ok && dispatch({ type: 'data/replace', data: importRes.data })) {
                    toast('Sauvegarde restaurée', 'success');
                    setImportRes(null);
                  }
                }}
              >
                Remplacer par cette sauvegarde
              </button>
            </div>
          ) : (
            <div className="stack">
              <div className="notice notice-warn">Ce fichier ne peut pas être importé. Aucune donnée n’a été modifiée.</div>
              <ul className="small">
                {importRes.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </Sheet>
      )}

      {confirmReset && (
        <Confirm
          title="Tout effacer ?"
          message="Toutes tes opérations, budgets, objectifs et ta progression seront définitivement supprimés de cet appareil. Exporte une sauvegarde avant si besoin."
          danger
          requireText="EFFACER"
          confirmLabel="Tout effacer"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            dispatch({ type: 'data/reset' });
            setConfirmReset(false);
            toast('Application réinitialisée');
            window.location.hash = '/accueil';
          }}
        />
      )}

    </div>
  );
}
