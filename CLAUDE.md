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
- `app.js`: client state, navigation, chat UI, card rendering, speech recognition/TTS controls, local card-advisor flow, and calls to `/api/chat`.
- `api/chat.js`: Vercel serverless Gemini assistant with tool/function calls for transfers, budgets, beneficiaries, investing, zakat, card lock/unlock, receipts, and financial health.
- `api/tts.js`: serverless text-to-speech endpoint.
- `demo.html`: standalone scripted/cinematic autoplay demo. It does not import `app.js`; matching features must be updated separately here.
- `qr.html`: QR presentation screen.
- `manifest.json`, `icon-512.png`, `og.png`, `qr.png`: PWA/share/QR assets.
- `vercel.json`: serverless function configuration.

There is no framework or build system. The app is mostly plain HTML/CSS/JavaScript plus Vercel functions.

## Current product behavior

- The AI chat executes simulated banking tools with confirmation before sensitive actions.
- Card recommendations are personalized from `state.expenses` and `state.income`.
- The current customer has monthly expenses totaling about 6,420 SAR; restaurants are the top category at roughly 35%. The recommended product is **Tharwa Visa Cashback**.
- The recommendation UI shows a match score, spending rationale, proper card preview, estimated first-year cashback, benefits, fees, comparison, and simulated digital issuance.
- The cashback card uses 1% cashback generally and a 3% restaurants/delivery introductory offer for the first three months. Issuance and first year are free; later fee is 199 SAR and waived at 20,000 SAR annual spend. This is prototype data, not a real bank offer.
- Asking to issue the card adds a simulated digital Visa card to `state.cards` and the home card carousel.
- Card freeze/unfreeze actions show the selected card preview inside AI chat. A frozen overlay clearly says all transactions are rejected.
- The guided demo includes both personalized card recommendation/issuance and lost-card freeze preview scenes.

## Critical routing and UX rules (do not regress)

1. **Security intents have priority over recommendations.** In `cardAssistant()`, lost/stolen/freeze/unfreeze phrases must return `null` so `/api/chat` and the `set_card_lock` tool handle them. “ضاعت بطاقتي” must never trigger a cashback recommendation.
2. Generic benefit detection must not match the bare word `بطاق`/`بطاقتي`; it caused the lost-card regression before.
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
