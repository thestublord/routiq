import { connectAuthEmulator, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { app, beaconUrl } from './firebase.js';
import { openWorkspace } from './workspace.js';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
window.RoutiqNativeTracking = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  ? {BackgroundGeolocation,LocalNotifications}
  : null;
const auth = getAuth(app);
if (USE_EMULATORS) connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
const form = document.getElementById('accountForm');
const message = document.getElementById('accountMessage');
const switchAccount = document.getElementById('switchAccount');
const sync = document.getElementById('syncStatus');
let opening;

async function beacon(action, body, origin, keepalive) {
  const user = auth.currentUser;
  if (!user) throw Error('Sign in to share a Beacon.');
  const viewer = (Capacitor.isNativePlatform() ? 'https://routiq-xi.vercel.app' : location.origin) + '/beacon';
  const create = action === 'start';
  if (!create && origin !== viewer) throw Error('Unknown Beacon origin');
  const url = beaconUrl(create ? body.read : body.write, create ? '' : '/state');
  url.searchParams.set('auth',await user.getIdToken());
  const timestamp = {'.sv':'timestamp'};
  const record = create ? {owner:user.uid,state:{created:timestamp,updated:timestamp,seq:0,ended:false}}
    : action === 'end' ? {ended:true,packet:null} : {seq:body.seq,updated:timestamp,packet:body.packet};
  const res = await fetch(url,{method:create?'PUT':'PATCH',body:JSON.stringify(record),
    cache:'no-store',keepalive,signal:AbortSignal.timeout(10000)});
  if (!res.ok) {
    const err = Error('Beacon request failed');
    err.status = res.status === 401 || res.status === 403 ? 410 : res.status;
    throw err;
  }
  return create ? {viewer} : {};
}
function leave() {return signOut(auth).then(()=>location.reload());}
switchAccount.onclick = leave;
form.onsubmit = async event=>{
  event.preventDefault();
  form.querySelector('button').disabled = true;
  message.textContent = 'Signing in…';
  try {await signInWithEmailAndPassword(auth,form.elements.email.value.trim(),form.elements.password.value);}
  catch {message.textContent = 'Sign-in failed. Check your email, password and connection.';}
  finally {form.querySelector('button').disabled = false;}
};
onAuthStateChanged(auth, async user=>{
  if (opening && opening !== user?.uid) {location.reload();return;}
  if (!user) {message.textContent = '';return;}
  if (opening) return;
  opening = user.uid;form.hidden = true;form.style.display = 'none';
  message.textContent = 'Loading your training log…';switchAccount.hidden = false;
  try {
    const workspace = await openWorkspace(user.uid,text=>{
      sync.textContent = text;sync.hidden = !text;
    },()=>location.reload());
    if (auth.currentUser?.uid !== user.uid) return;
    window.RoutiqCloud = {...workspace,beacon,signOut:leave};
    for (const src of DASHBOARD_SCRIPTS) {
      if (src === 'app.js') document.documentElement.classList.add('workspace-open');
      await new Promise((resolve,reject)=>{
        const script = document.createElement('script');
        script.onload = resolve;script.onerror = reject;script.src = src;document.body.append(script);
      });
    }
  } catch {
    document.documentElement.classList.remove('workspace-open');
    message.textContent = 'Could not open this workspace. Check your connection and that this account is enabled in Firebase, then reload.';
  }
});
