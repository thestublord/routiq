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

When updating Routiq later, publish any revised database rules from `database.rules.json` in **Realtime Database → Rules**. Vercel deployment does not publish Firebase rules.

## 2. Deploy the app

Open the Vercel project and go to **Settings → Environment Variables**. Add these five entries, using the values from your Firebase web app config. Select **Production** and **Preview** for each entry.

| Key | Value |
|---|---|
| `apiKey` | Firebase `apiKey` |
| `authDomain` | Firebase `authDomain` |
| `databaseURL` | The HTTPS URL shown in Realtime Database |
| `projectId` | Firebase `projectId` |
| `appId` | Firebase `appId` |

Enter each value by itself. Leave out JavaScript punctuation such as quotes, commas and parentheses. For example, the `databaseURL` value is `https://YOUR_DATABASE_URL`, with no quotation marks or trailing comma. Do not paste a service account key or password.

The build also accepts a single `FIREBASE_WEB_CONFIG` variable containing the five values as JSON. The five individual entries are simpler to add in Vercel's dashboard.

Vercel bundles these public web app settings into the browser app. No service account key is needed.

After saving the entries, go to **Deployments** and redeploy the latest deployment. Or, from the `routiq-app` folder, run `npx vercel --prod` after authenticating with Vercel.

The repository's Vercel settings run `npm run build` and publish `public/`.

## 3. Open it on your phone

Add the deployment hostname to Firebase Authentication's **Settings → Authorized domains**. Open the production HTTPS link in your phone's browser and sign in. Save an activity on the phone, then sign in on another device to see it there. During a GPS recording, tap **Turn on Beacon** and open the sharing link in another browser. Keep the recording page in the foreground for GPS updates.

## Storage and free-plan limits

- Each user's activities, planned routes, goal and profile live under `workspaces/<uid>`. Changes awaiting upload are kept in that browser under the user's UID. After sync, the browser clears those pending edits. Data saved on the original ChatGPT Sites address stays in that browser's storage on the original address.
- Firebase stores the latest encrypted Beacon packet under a randomly generated session ID. The link stays active until the host taps **Stop sharing** or finishes the recording. If GPS or network updates pause, the viewer hides positions older than two minutes and waits for the next update. When updates resume, the viewer reconnects to the same link. Closing or backgrounding the page pauses updates, so keep Routiq open during the activity.
- Vercel Hobby covers personal, non-commercial projects. Firebase Spark includes 100 simultaneous Realtime Database connections, 1 GB stored and 10 GB downloaded per month. Check usage in your Firebase and Vercel dashboards. [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Firebase pricing](https://firebase.google.com/pricing)
