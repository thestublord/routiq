import { initializeApp } from 'firebase/app';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';

export const app = initializeApp(FIREBASE_CONFIG);
export const database = getDatabase(app);
if (USE_EMULATORS) connectDatabaseEmulator(database, '127.0.0.1', 9000);

export function beaconUrl(id, child = '') {
  if (!/^[a-f0-9]{64}$/.test(id)) throw Error('Invalid Beacon link');
  const base = USE_EMULATORS ? 'http://127.0.0.1:9000' : FIREBASE_CONFIG.databaseURL.replace(/\/$/,'');
  const url = new URL(base + '/beacons/' + id + child + '.json');
  if (USE_EMULATORS) url.searchParams.set('ns', FIREBASE_CONFIG.projectId + '-default-rtdb');
  return url;
}
