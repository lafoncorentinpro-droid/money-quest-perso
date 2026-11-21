import { createStore, get, set } from 'idb-keyval';
import { validateData } from '../domain/backup';
import { initialData } from '../domain/defaults';
import type { AppData } from '../domain/types';

/**
 * Stockage local (IndexedDB) : les données ne quittent jamais l'appareil.
 * Une copie de secours « previous » est gardée à chaque écriture.
 */

const store = typeof indexedDB !== 'undefined' ? createStore('money-quest-perso', 'kv') : undefined;
const KEY = 'data';
const PREV = 'data-previous';

export type LoadResult = { data: AppData; status: 'ok' | 'new' | 'recovered' | 'unavailable'; message?: string };

export async function loadData(): Promise<LoadResult> {
  if (!store) return { data: initialData(), status: 'unavailable', message: 'Le stockage local n’est pas disponible dans ce navigateur : les données ne seront pas conservées.' };
  try {
    const raw = await get(KEY, store);
    if (raw === undefined) return { data: initialData(), status: 'new' };
    const res = validateData(raw);
    if (res.ok) return { data: res.data, status: 'ok' };
    const prev = await get(PREV, store);
    const back = prev !== undefined ? validateData(prev) : undefined;
    if (back?.ok) return { data: back.data, status: 'recovered', message: 'Les données principales étaient illisibles : la dernière copie valide a été restaurée.' };
    return { data: initialData(), status: 'unavailable', message: `Données locales illisibles (${res.errors[0]}). Importe une sauvegarde depuis Réglages.` };
  } catch (e) {
    return { data: initialData(), status: 'unavailable', message: `Impossible de lire le stockage local : ${(e as Error).message}` };
  }
}

let lastSaved: AppData | undefined;

export async function saveData(data: AppData): Promise<void> {
  if (!store) throw new Error('Stockage local indisponible.');
  if (lastSaved) await set(PREV, lastSaved, store);
  await set(KEY, data, store);
  lastSaved = data;
}

export function markLoaded(data: AppData) {
  lastSaved = data;
}

/** Demande au navigateur de ne pas effacer les données automatiquement (si pris en charge). */
export async function requestPersistence(): Promise<boolean | undefined> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* non pris en charge */
  }
  return undefined;
}
