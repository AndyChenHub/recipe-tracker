# Recipe Tracker (iOS + Supabase Cloud)

A custom offline-first **iOS recipe manager** built with **Expo (React Native + TypeScript)** and **Supabase**, combining:

- **Paprika-style Cookbook & Cook Mode:** Distraction-free layout, automatic screen wake lock (`expo-keep-awake`), checkable ingredients & steps, **Pinned Cooking Tray** for cooking multi-dish meals, and tappable inline countdown timers (`⏱`).
- **Dynamic Serving Scaler:** Adjusts ingredient quantities (with culinary fraction snapping `¼, ⅓, ½, ¾`, automatic unit promotion `4 tbsp -> ¼ cup`, and live `Original | Metric | US` conversion) **both** in the ingredient list **and** inline inside step directions.
- **ReciMe-style Social Media & Web Importer:** Native iOS Share Sheet extension (`expo-share-intent`) + multi-tier waterfall importer (`schema.org/Recipe` JSON-LD, TikTok/Instagram/YouTube captions & transcripts, and Gemini Flash Structured Outputs).
- **Smart Grocery List:** Consolidates overlapping canonical ingredients across scaled recipes and groups them by supermarket aisle with recipe provenance tags.
- **Stateless "Can I Make?" Matcher:** Enter temporary ingredients currently in your fridge (no permanent pantry chore!) to rank saved recipes by *most entered items matched + fewest extra items needed*.

---

## 1. Local Development (Windows -> iPhone)

```powershell
npm install
npm run start
```

- Run unit tests: `npm test`
- Run TypeScript check: `npm run typecheck`

---

## 2. One-Time Apple Developer Account & iPhone Setup (from Windows)

Because `expo-share-intent` compiles **two** iOS targets (Main App + native iOS Share Extension), run the initial credential provisioning once interactively from PowerShell so EAS automatically registers both App IDs, App Groups, and provisioning profiles on your Apple Developer account:

```powershell
# 1. Sign in to your free Expo account
npx eas-cli login

# 2. Link this repo to an EAS project (writes extra.eas.projectId to app.json)
npx eas-cli init

# 3. Register your iPhone's UDID on your Apple Developer account (scans a QR code on iPhone)
npx eas-cli device:create

# 4. Run the first Ad-Hoc .ipa build interactively so EAS sets up Apple signing certificates
#    for both com.chena.recipetracker and ShareExtension
npm run build:ios:adhoc
```

Once finished, EAS prints a QR code / install link—open it in Safari on your iPhone to install the signed `.ipa` directly!

---

## 3. Automated Versioning & Auto-Release of `.ipa`

Versioning is managed in lockstep across `package.json`, `app.json`, `app.config.ts` (`CFBundleShortVersionString`), and `CHANGELOG.md`, while iOS build numbers (`CFBundleVersion`) auto-increment remotely via `"appVersionSource": "remote"` in `eas.json`.

### Setup GitHub Secret (Once)
1. Create an Expo Access Token at `https://expo.dev/settings/access-tokens`.
2. In your GitHub repo -> **Settings -> Secrets and variables -> Actions**, add **`EXPO_TOKEN`**.
   *(Optional: also add `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_GEMINI_API_KEY` if you want them baked into `.ipa` builds automatically).*

### Cut a New Release & Auto-Build `.ipa`
```powershell
# Bumps version (e.g. 0.1.0 -> 0.1.1), updates CHANGELOG.md, commits, and tags v0.1.1:
npm run release:patch   # or release:minor / release:major

# Push commit + tag to trigger .github/workflows/release-ios-ipa.yml:
git push origin main --follow-tags
```

GitHub Actions will automatically:
1. Run `npm run typecheck` and `npm test`.
2. Compile the signed `.ipa` in Expo's macOS cloud (`adhoc` for direct iPhone install, or `production` for TestFlight).
3. Download the `.ipa` artifact and publish a **GitHub Release** with `recipe-tracker-vX.Y.Z-bN-adhoc.ipa` attached + direct OTA install link.

*(You can also trigger a build anytime from your phone via the GitHub Actions tab -> **Build & Auto-Release iOS IPA -> Run workflow**).*

---

## 4. Setting Up Online Cloud Storage (Supabase Free Tier)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in Supabase and run [`supabase/migrations/20261116000001_initial_schema.sql`](./supabase/migrations/20261116000001_initial_schema.sql).
3. In the iOS app, open the **Import** tab -> tap **Configure** under *Online Cloud Database*, and paste your **Supabase Project URL** and **Anon Key** (or set them in `.env` before building).
4. *(Optional — Full Social Video AI Extraction)* Deploy the serverless importer function:
   ```powershell
   npx supabase functions deploy import-recipe
   npx supabase secrets set GEMINI_API_KEY=your_gemini_key SUPADATA_API_KEY=your_optional_social_key
   ```
