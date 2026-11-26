# Deploy Routiq on Vercel and Firebase

The Vercel build serves the dashboard at `/` and the public Beacon viewer at `/beacon/`. Both run in the browser. Firebase Authentication and Realtime Database handle the private training log and encrypted Beacon updates.

## 1. Create a Firebase project

1. Open the [Firebase console](https://console.firebase.google.com/), create a project, and keep the **Spark** plan. Analytics is optional.
2. Under **Build → Authentication → Sign-in method**, enable **Email/Password**. Under **Users**, add your email and password and copy the user's UID.
3. Under **Build → Realtime Database**, create a database in locked mode. Open **Rules**, paste the contents of [database.rules.json](./database.rules.json), and publish. These rules protect workspaces and enforce the Beacon expiry on the server.
4. Give your sign-in permission to use Routiq. In Realtime Database, open **Data**. Add this entry at the database root, replacing `PASTE_YOUR_UID_HERE` with the UID you copied in step 2:

   ```json
   {
     "members": {
       "PASTE_YOUR_UID_HERE": true
     }
   }
   ```

   To enter it with the Firebase console, add a root child named `members`, then add a child under it named exactly your UID and set its value to the boolean `true` (without quotation marks). The UID is the long string on the user's details page in **Authentication → Users**. This entry lets your signed-in account read and write its own private data. If the app is just for you, skip adding other users. Anyone you invite needs their own Authentication user and a matching UID entry. People opening a Beacon link can skip sign-in.
5. Under **Project settings → General → Your apps**, register a web app. Copy its public web configuration. Include the exact HTTPS **databaseURL** shown in Realtime Database. If you registered the app before creating the database, add that field yourself.

## 2. Deploy the app

Open PowerShell in the `routiq-app` folder. Create a free [Vercel Hobby account](https://vercel.com/signup) and run:

~~~powershell
npx.cmd vercel login
npx.cmd vercel link
npx.cmd vercel env add FIREBASE_WEB_CONFIG production
~~~

For the environment value, paste the configuration as JSON on one line, with quoted keys and strings. Replace every example value with your project's value.

~~~json
{"apiKey":"YOUR_WEB_API_KEY","authDomain":"YOUR_PROJECT.firebaseapp.com","databaseURL":"https://YOUR_DATABASE_URL","projectId":"YOUR_PROJECT","appId":"YOUR_WEB_APP_ID"}
~~~

Use the Firebase **web app config** here. Service account keys and passwords are private. Vercel bundles these five public fields into the browser app.

~~~powershell
npx.cmd vercel --prod
~~~

The repository's Vercel settings run `npm run build` and publish `public/`. If you also use Vercel preview deployments, add the config to the Preview environment before building one.

## 3. Open it on your phone

Add the deployment hostname to Firebase Authentication's **Settings → Authorized domains**. Open the production HTTPS link in your phone's browser and sign in. Save an activity on the phone, then sign in on another device to see it there. During a GPS recording, tap **Turn on Beacon** and open the sharing link in another browser. Keep the recording page in the foreground for GPS updates.

## Storage and free-plan limits

- Each user's activities, planned routes, goal and profile live under `workspaces/<uid>`. Changes awaiting upload are kept in that browser under the user's UID. After sync, the browser clears those pending edits. Data saved on the original ChatGPT Sites address stays in that browser's storage on the original address.
- The server stores the latest encrypted Beacon packet under a randomly generated session ID. A successful stop removes the packet. If the phone disconnects, database rules deny new reads after two minutes without an update, or twelve hours from session creation. Interrupted sessions can leave expired ciphertext in the database. The project owner can remove old sessions in the Firebase console.
- Vercel Hobby covers personal, non-commercial projects. Firebase Spark includes 100 simultaneous Realtime Database connections, 1 GB stored and 10 GB downloaded per month. Check usage in your Firebase and Vercel dashboards. [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Firebase pricing](https://firebase.google.com/pricing)
