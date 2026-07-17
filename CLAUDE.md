# Tharwa project context for Claude Code

Read this file completely before changing the project. The user expects changes to be implemented, validated, and—when they concern the website—published to the existing production site.

## Safety and permissions

- Never use `--dangerously-skip-permissions`, permission-bypass flags, sandbox bypasses, or equivalent workarounds.
- Respect Claude Code's normal permission prompts. If an operation requires approval, ask the user normally.
- Never print, copy, commit, expose, or overwrite secrets, tokens, `.env.local`, Vercel credentials, API keys, or authentication files.
- Do not use destructive Git/filesystem commands such as `git reset --hard`, bulk deletion, or checkout over user changes.
- Preserve unrelated user changes. Inspect before editing.
- Do not deploy to a new Vercel project. This folder is linked to the existing `skoopes-projects/tharwa` project.

## Project identity

- Local root: `C:\Users\Xxsau\OneDrive\Desktop\tharwa`
- Product: **ثَروة (Tharwa)**, an Arabic RTL AI banking assistant prototype by ByteStorm.
- Production site: https://tharwa-orcin.vercel.app/
- Guided cinematic demo: https://tharwa-orcin.vercel.app/demo.html
- QR presentation page: https://tharwa-orcin.vercel.app/qr.html
- Direct QR image: https://tharwa-orcin.vercel.app/qr.png
- Git remote recorded in `.git/config`: `git@github.com:i3z1/ByteStorm-Tharwa.git`
- Vercel account previously authenticated as `i3z1`.
- Vercel scope/team: `skoopes-projects`
- Existing Vercel project: `tharwa`
- The `.vercel/project.json` link is authoritative. Do not change its IDs or relink elsewhere.

## Architecture and important files

- `index.html`: main responsive landing page plus the interactive phone UI. Most CSS is embedded here. Arabic, RTL, Tajawal, dark navy/coral visual system.
- `app.js`: client state, navigation, chat UI, card rendering (transfer/OTP confirm, receipt+PDF, zakat, health gauge, card lock, loan estimate, support ticket, card offer), speech recognition/TTS controls, and calls to `/api/chat`. All AI routing is server-side — there is no local card-advisor.
- `api/chat.js`: Vercel serverless Gemini assistant with **14 function-calling tools**: propose/execute transfer, add_beneficiary, set_investment_plan (murabaha savings), set_budget, calculate_zakat, show_receipt, open_screen, financial_health, set_card_lock, financing_estimate, create_support_ticket, recommend_card, issue_card.
- `api/tts.js`: serverless text-to-speech endpoint.
- `demo.html`: standalone scripted/cinematic autoplay demo. It does not import `app.js`; matching features must be updated separately here.
- `qr.html`: QR presentation screen.
- `manifest.json`, `icon-512.png`, `og.png`, `qr.png`: PWA/share/QR assets.
- `vercel.json`: serverless function configuration.

There is no framework or build system. The app is mostly plain HTML/CSS/JavaScript plus Vercel functions.

## Current product behavior

- The AI chat executes simulated banking tools with confirmation before sensitive actions. Transfers require a confirm card **plus an OTP moment**; `execute_transfer` refuses server-side without a pending confirmed proposal (prompt-injection resistant).
- Savings ("ادخار") is a **Shariah-compliant murabaha account at a flat ~4% expected annual return** (`SAVE_RATE`). There are NO risk tiers, no stocks/gold/portfolio — the word "استثمار" was deliberately removed from all user-facing copy.
- Financing: `financing_estimate` computes a murabaha personal-financing estimate (~6% reducing, `FIN_RATE`) from the customer's real income/expenses, capped by 33% DSR (`FIN_DSR`) AND monthly surplus. Applying formally opens a support ticket (bank-human action).
- Support tickets (`create_support_ticket`) are STRICTLY for requests only a human banker can fulfill (formal financing application, account open/close, complex complaints). Never for questions the assistant can answer or for card recommendation/issuance.
- Card recommendations come from the server tool `recommend_card` using `state.expenses`: match score (82 + topPct/3, cap 96), top-category rationale, deterministic year-one cashback. Current demo customer: ~6,420 SAR monthly expenses, restaurants top at ~35% → **Tharwa Visa Cashback** (94% match, ~905 SAR year-one).
- The cashback card: 1% general, 3% restaurants/delivery intro for 3 months; issuance and first year free; later 199 SAR waived at 20,000 SAR annual spend. `issue_card` (explicit consent only) appends the digital Visa (•••• 2088) to `state.cards` and the home carousel. Prototype data, not a real bank offer.
- Card freeze/unfreeze shows the selected card preview inside AI chat; a frozen overlay clearly says all transactions are rejected.
- The guided demo (`demo.html`) has 9 standalone scenes in bank-value-first order (freeze, transfer+OTP+receipt, fraud guard, financing+ticket, bank-value montage, beneficiary, zakat, saving, voice) with **arrow-key presenter navigation** (RTL: ← next, → previous; Space/PageDown/PageUp work for clickers) via an interruptible `sleep()`/generation-counter mechanism.

## Critical routing and UX rules (do not regress)

1. **Security intents have absolute priority.** Lost/stolen/freeze/unfreeze phrases must route to `set_card_lock` only — "ضاعت بطاقتي" must never trigger a card recommendation or any marketing. This is enforced in the system prompt and both `recommend_card`/`set_card_lock` tool descriptions; verified by live tests.
2. All AI routing is server-side via tools — do not reintroduce a client-side `cardAssistant()` interceptor.
3. In the main chat, direct children must keep `flex-shrink: 0`. The rule `#s-chat .chat>*{flex-shrink:0}` prevents cards and messages from being compressed/cut in half.
4. Starter suggestion chips hide after a conversation begins via the `has-conversation` class, and the chat expands above the input bar.
5. Card previews use a real card aspect ratio and must remain fully visible. The chip must sit below the title, not overlap card text.
6. Chat scrolling must move to the newest full card/message after it is inserted or expanded.
7. Any feature shown in the main app that matters to a presentation should be mirrored in `demo.html`, because the demo is independent.
8. Keep Arabic copy natural, concise, and RTL-safe. Preserve the existing palette and visual language.
9. Do not reintroduce the phrase “للأثرياء فقط” or references framing the service as only for wealthy users. The approved neutral text is that financial guidance is available to every customer.

## Validation before deployment

Portable Node is installed here:

```powershell
$node = 'C:\Users\Xxsau\tools\node-v24.18.0-win-x64\node.exe'
& $node --check app.js
& $node --check api\chat.js
& $node --check api\tts.js
& $node -e "const h=require('fs').readFileSync('demo.html','utf8'); const s=h.match(/<script>([\s\S]*)<\/script>/); if(!s) throw new Error('script missing'); new Function(s[1]); console.log('DEMO_SCRIPT_OK')"
```

Also inspect the exact selectors/functions changed with `rg`. For layout changes, verify the served HTML/JS after deployment. Do not claim success based only on a CLI exit code.

## Production deployment workflow

The portable Node distribution and Vercel CLI cache already exist. Use the linked project and existing authenticated account:

```powershell
$nodeRoot = 'C:\Users\Xxsau\tools\node-v24.18.0-win-x64'
$env:Path = "$nodeRoot;$env:Path"
$vercel = Get-ChildItem 'C:\Users\Xxsau\AppData\Local\npm-cache\_npx' -Recurse -Filter vercel.cmd | Select-Object -First 1 -ExpandProperty FullName
& $vercel --prod --yes --scope skoopes-projects --no-color
```

Important Windows behavior: PowerShell may report exit code 1 because Vercel writes normal progress to stderr. A deployment counts as successful only when output contains all of the following:

- JSON status `"status": "ok"`
- deployment `readyState` is `READY`
- target is `production`
- `Aliased https://tharwa-orcin.vercel.app`

After deployment, verify production directly:

```powershell
curl.exe -fsSI https://tharwa-orcin.vercel.app/
curl.exe -fsSI https://tharwa-orcin.vercel.app/demo.html
curl.exe -fsSL https://tharwa-orcin.vercel.app/app.js
```

Check for the exact new selector/function/text in the returned content and an HTTP 200 response. If authentication is missing, run normal `vercel login` and let the user complete the official device flow. Never bypass authentication or request that secrets be pasted into source files.

## Working style expected by the user

- Make the requested change rather than only describing it.
- Keep the user updated briefly while working.
- Fix root causes and test likely regressions.
- When a website change is complete, deploy it to the existing production alias and verify it live.
- If the user only asks a question or review, do not mutate or deploy unless they also request a change.
