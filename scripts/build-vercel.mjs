import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const config = JSON.parse(process.env.FIREBASE_WEB_CONFIG || '{}');
for (const key of ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId']) {
  if (!config[key]) throw Error('Set FIREBASE_WEB_CONFIG with the Firebase web app configuration including ' + key);
}
const emulator = process.env.ROUTIQ_EMULATORS === '1';
if (emulator && (process.env.VERCEL || !config.projectId.startsWith('demo-'))) {
  throw Error('Emulators require a local build and a demo project ID.');
}
if (!emulator && !/^https:\/\/[\w.-]+\.(firebaseio\.com|firebasedatabase\.app)\/?$/.test(config.databaseURL)) {
  throw Error('Use the HTTPS Realtime Database URL from Firebase.');
}
await cp('dist','public',{recursive:true,filter:path=>!/(?:^|[\\/])server(?:[\\/]|$)/.test(path)});
await mkdir('public/beacon',{recursive:true});
const html = await readFile('dist/index.html','utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(match=>match[1]);
if (!scripts.includes('app.js')) throw Error('Dashboard scripts missing.');
const login = await readFile('cloud/login.html','utf8');
await writeFile('public/index.html',html.replace(/<script src="[^"]+" defer><\/script>/g,'')
  .replace('</head>','<link rel="stylesheet" href="/account.css"></head>')
  .replace('<body>','<body>'+login).replace('</body>','<script type="module" src="/account.js"></script></body>'));
await cp('cloud/account.css','public/account.css');
await cp('cloud/viewer.html','public/beacon/index.html');
await build({
  entryPoints: {account:'cloud/account.js',viewer:'cloud/viewer.js'},
  outdir:'public',bundle:true,format:'esm',minify:true,target:'es2022',
  define:{
    FIREBASE_CONFIG:JSON.stringify(Object.fromEntries(['apiKey','authDomain','databaseURL','projectId','appId'].map(k=>[k,config[k]]))),
    DASHBOARD_SCRIPTS:JSON.stringify(scripts), USE_EMULATORS:JSON.stringify(emulator)
  }
});
