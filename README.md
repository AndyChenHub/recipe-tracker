# Recipe Tracker (iOS + Supabase Cloud)

A custom offline-first **iOS recipe manager** styled after **Paprika Recipe Manager 3**, built with **Expo (React Native + TypeScript)** and **Supabase**:

- **Paprika 3 UI & Cook Mode:** Signature `#D94325` spice-red navigation bar, tappable `All Recipes ▾` category sheet, `☰ List` vs `⊞ Grid` toggle, digital index-card layout (with landscape/iPad side-by-side split view), automatic screen wake lock (`expo-keep-awake`), borderless tap-to-strikethrough ingredients, **Pinned Cooking Tray**, and tappable inline timer links.
- **Dynamic Serving Scaler & Converter:** Adjusts servings (`- / +` or `½x–3x` popover) with kitchen fraction snapping (`¼, ⅓, ½, ¾`), unit promotion (`4 tbsp -> ¼ cup`), `Original | Metric | US Imperial` conversion, and live inline `{{ing:N}}` step updates.
- **Social Media & Web Clipper:** Multi-tier waterfall importer (`schema.org/Recipe` JSON-LD, TikTok/Instagram/YouTube captions & transcripts, and Gemini Flash Structured Outputs) + deep-link Share Sheet support (`recipetracker://import?url=...`).
- **Smart Grocery List:** Consolidates overlapping canonical ingredients across scaled recipes and groups them under sticky uppercase supermarket aisle banners.
- **Stateless "What Can I Make?" Matcher:** Enter temporary ingredients currently on hand (no permanent pantry chore!) to rank saved recipes by *most entered items matched + fewest extra items needed*.

---

## 1. Automated Versioning & `.ipa` Auto-Release Pipeline

Every push to `main` (and any `v*.*.*` tag or manual workflow dispatch) runs [`.github/workflows/release-ios-ipa.yml`](./.github/workflows/release-ios-ipa.yml) on GitHub's macOS Xcode runner (`macos-26`):

1. Runs TypeScript typechecking (`npm run typecheck`) and unit tests (`npm test`).
2. **Automatically versions & tags** the release (`v0.1.0`, `v0.1.1`, …) in lockstep across `package.json`, `app.json`, `CHANGELOG.md`, and `CFBundleVersion`.
3. Runs `npx expo prebuild --platform ios`, installs CocoaPods, compiles the native Release ARM64 `.app` with `xcodebuild`, packages **`recipe-tracker-vX.Y.Z-bN.ipa`**, and attaches it directly to a **GitHub Release**.

### Installing `.ipa` Releases on Your iPhone (from Windows with Your Apple Dev Account)
1. Download the latest **`recipe-tracker-vX.Y.Z-bN.ipa`** from this repo's **GitHub Releases** page.
2. Open **Sideloadly** (or **AltStore / SideStore**) on Windows, connect your iPhone, drop in the `.ipa`, sign in with your Apple Developer account, and click **Start** (paid Apple Developer certificates stay valid for 365 days).
3. *(Optional CI Pre-Signing)* Add `IOS_CERTIFICATE_P12_BASE64`, `IOS_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, and `IOS_TEAM_ID` in **GitHub Settings -> Secrets -> Actions** if you want GitHub Actions to pre-sign Ad-Hoc `.ipa` files directly in CI.

### Manual Version Bumps (Local CLI)
```powershell
npm run version:minor   # or version:patch / version:major
```

---

## 2. Sharing Directly from TikTok / Instagram / Safari on iOS

Create a 2-step Shortcut in Apple's built-in **Shortcuts** app (takes 20 seconds):
1. Tap **+** -> Enable **Show in Share Sheet** (*URLs* and *Text*).
2. Add action **URL**: `recipetracker://import?url=[Shortcut Input]` -> Add action **Open URLs**.

Now tapping **Share -> Save to Recipe Tracker** inside TikTok, Instagram, or Safari opens the app directly into the Clipper screen and extracts the recipe automatically.

---

## 3. Setting Up Online Cloud Storage (Supabase Free Tier)

1. Create a free project at [supabase.com](https://supabase.com).
2. Run [`supabase/migrations/20261116000001_initial_schema.sql`](./supabase/migrations/20261116000001_initial_schema.sql) in the Supabase **SQL Editor**.
3. In the iPhone app, go to **Browser -> Configure Cloud Database & AI Keys...** and paste your **Supabase URL** and **Anon Key** (or add `EXPO_PUBLIC_SUPABASE_URL` & `EXPO_PUBLIC_SUPABASE_ANON_KEY` to GitHub Actions Secrets so they're baked into every `.ipa` build).
4. *(Optional — Cloud Social Video Transcript & AI Extractor)*:
   ```powershell
   npx supabase functions deploy import-recipe
   npx supabase secrets set GEMINI_API_KEY=your_gemini_key SUPADATA_API_KEY=your_optional_social_key
   ```
