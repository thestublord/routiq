import { onValue, ref, update } from 'firebase/database';
import { database } from './firebase.js';

// Each edit is journaled before uploading. A tab that closes offline can resume
// its writes after the same account signs in again on this browser.
export async function openWorkspace(uid, status, accessLost) {
  const root = ref(database, 'workspaces/' + uid);
  const prefix = 'routiq-pending/' + uid + '/';
  let remote = {}, model, connected = false, running = false, retryTimer;
  function pending() {
    return Object.keys(localStorage).filter(k=>k.startsWith(prefix)).sort();
  }
  function refresh() {
    const data = {...remote, activities:{...remote.activities}, routes:{...remote.routes}};
    for (const key of pending()) {
      const patch = JSON.parse(localStorage.getItem(key));
      for (const [path,value] of Object.entries(patch || {})) {
        const [group,id] = path.split('/');
        if (!id) data[group] = value;
        else if (value === null) delete data[group][id];
        else data[group][id] = value;
      }
    }
    const changed = JSON.stringify(data) !== JSON.stringify(model);
    model = data;
    if (changed) window.dispatchEvent(new Event('routiq-workspace'));
  }
  function report() {
    const dirty = pending().length > 0;
    status(dirty ? (connected ? 'Saving changes…' : 'Offline · changes saved on this device') : (connected ? '' : 'Offline'));
  }
  async function flush() {
    if (running || !connected) return;
    running = true;
    async function drain() {
      for (const key of pending()) {
        const patch = JSON.parse(localStorage.getItem(key));
        if (!patch) continue;
        await update(root,patch);
        localStorage.removeItem(key);
      }
    }
    try {
      await navigator.locks.request(prefix, drain);
      refresh();report();
    } catch {
      status('Sync interrupted. Changes are on this device. Retrying…');
      clearTimeout(retryTimer);retryTimer = setTimeout(()=>{retryTimer=undefined;flush();},10000);
    } finally {running = false;}
    if (connected && pending().length && !retryTimer) queueMicrotask(flush);
  }
  function commit(patch) {
    if (!Object.keys(patch).length) return;
    const last = pending().at(-1);
    const next = Math.max(Date.now(),last ? Number(last.slice(prefix.length).split('-')[0])+1 : 0);
    localStorage.setItem(prefix + next + '-' + crypto.randomUUID(), JSON.stringify(patch));
    refresh();report();flush();
  }
  function rows(group) {
    return Object.values(model[group]).map(value=>JSON.parse(value));
  }
  function changes(group, records) {
    const old = model[group];
    const remaining = new Set(Object.keys(old)), patch = {};
    for (const item of records) {
      remaining.delete(item.id);
      const value = JSON.stringify(item);
      if (value !== old[item.id]) patch[group+'/'+item.id] = value;
    }
    for (const id of remaining) patch[group+'/'+id] = null;
    return patch;
  }
  await new Promise((resolve,reject)=>{
    let loaded = false;
    onValue(root,snapshot=>{
      remote = snapshot.val() || {};refresh();loaded = true;resolve();
    },error=>loaded ? accessLost() : reject(error));
  });
  onValue(ref(database,'.info/connected'),snapshot=>{
    connected = snapshot.val() === true;report();if (connected) flush();
  });
  window.addEventListener('storage',event=>{
    if (event.key?.startsWith(prefix)) {refresh();report();flush();}
  });
  return {
    log:()=>({name:model.name || 'Athlete',goal:model.goal || 50,activities:rows('activities')}),
    routes:()=>rows('routes'),
    saveLog(log) {
      const patch = changes('activities',log.activities);
      if (log.name !== (model.name || 'Athlete')) patch.name = log.name;
      if (log.goal !== (model.goal || 50)) patch.goal = log.goal;
      commit(patch);
    },
    saveRoutes:routes=>commit(changes('routes',routes))
  };
}
