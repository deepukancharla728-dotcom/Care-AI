# CareConnect AI — Guardian Voice Support Prototype

React + Vite frontend and Express backend. The dashboard is a **simulation**. The optional Twilio webhook flow is designed for a real inbound call: AI answers first, listens to speech, and when emergency language is detected, attempts to dial the configured guardian and bridge the same live caller if the guardian answers.

## Important safety and regional limits

- This is a prototype, not an emergency service. Never rely on AI keyword detection as the only safety mechanism.
- If anyone is in immediate danger, contact local emergency services directly; in India, call 112. Do not wait for this app.
- Live calling depends on Twilio account eligibility, a voice-enabled number, regional permissions, consent, billing and local rules. Twilio's published India voice guidelines restrict availability; confirm the exact inbound/outbound use case with Twilio before buying anything.
- The browser dashboard does not itself place a real phone call. Real inbound routing requires a telephony provider to send webhooks to the backend. The fictional student directory contains five sample guardians with 50 students assigned to each (250 students total); student surnames are intentionally different from their assigned guardian's surname.
- Use only fictional test data until security, guardian verification, consent, access control, monitoring and privacy reviews are complete.
- `.env` and real credentials must never be committed or shared. Never put API keys in the frontend.

## Requirements

- Node.js 18+ (LTS recommended)
- VS Code
- Optional: Gemini API key for Gemini-generated voice replies
- Optional: eligible Twilio Voice setup for real phone calls

## Run the website locally

### Backend (terminal 1)

```powershell
cd server
Copy-Item .env.example .env
npm install
npm run dev
```

Health check: `http://localhost:4000/api/health`

### Frontend (terminal 2)

```powershell
cd client
npm install
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

The dashboard's login/OTP and call controls are demo-only. The demo OTP is `123456`. No real OTP is sent. Simulated calls wait 30 seconds, announce the AI connection, then use browser speech recognition to capture and submit the caller's problem automatically. The AI reply is spoken aloud without a send or playback button. Microphone permission and browser speech-recognition support are required.

## Publish a shareable URL with Render

The included `render.yaml` deploys the Vite frontend and Express API together as one Render web service. After deployment, Render provides an HTTPS URL that can be shared and opened from other devices.

1. Push the `ai-student-counselor-agent` folder to a GitHub repository. Keep `server/.env` and all real credentials out of Git; `.gitignore` excludes the local environment file and build/dependency folders.
2. Sign in to Render and choose **New → Blueprint**. Connect the GitHub repository and select the branch containing `render.yaml`.
3. Review and deploy the `careconnect-ai-guardian` service. Render runs the frontend production build, starts the Express server, and checks `/api/health`.
4. Open the HTTPS `*.onrender.com` URL shown on the Render service page and share it.

The login, OTP, student records, and call handling remain a demo; the sample OTP is `123456`. Calls and logs are in-memory and can be cleared on restart or instance sleep. Do not enter real student/guardian information or treat this as an emergency service. Browser speech recognition requires microphone permission and compatible browser support. If enabling Gemini, add `GEMINI_API_KEY` under the Render service's environment settings; never place it in frontend code or commit it. Real Twilio calls also require provider verification, consent, regional eligibility, and a configured public webhook URL.

## Deploy the client and API on Vercel

The root `vercel.json` defines two services: the public Vite client and the Express API. Requests under `/api/` are routed to the API; all other paths go to the client. The browser uses relative `/api/...` URLs, so the client does not need a service binding or a backend URL in its build environment. No service-to-service calls are made by this application.

Create a Vercel project from this repository with `ai-student-counselor-agent` as the project root (the directory containing `vercel.json`). Vercel builds `client` and `server` independently. Add server-only settings such as `GEMINI_API_KEY` and the Twilio credentials to the `server` service's environment variables; do not expose secrets to the client.

For the optional Twilio flow, set `PUBLIC_BASE_URL` on the server service to the public Vercel project origin (for example, `https://your-project.vercel.app`, without a trailing slash), and configure Twilio webhooks at that origin's `/api/telephony/...` paths. The `/api` rewrite makes these routes publicly reachable; Vercel service bindings are not a substitute for this public webhook URL.

## Optional Gemini configuration

Add a valid key to `server/.env`:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash
```

Restart the backend. Keep the key private. Without a key, voice responses use a short scripted fallback, not a full AI conversation.

## Optional real inbound voice flow (only after provider support is confirmed)

1. Configure Twilio credentials locally in `server/.env`:

```env
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
GUARDIAN_PHONE_NUMBER=...
PUBLIC_BASE_URL=https://your-current-public-https-url
```

`GUARDIAN_PHONE_NUMBER` is the authorized guardian number in E.164 format (for example, `+1...` where valid for the account and region). Keep actual values private. The code accepts legacy `COUNSELOR_PHONE_NUMBER` as a fallback for migration, but the new setting is `GUARDIAN_PHONE_NUMBER`.

2. For temporary local development only, use Cloudflare Quick Tunnel from the official docs: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/
   - Start the backend first.
   - In a separate terminal run `cloudflared tunnel --url http://localhost:4000`.
   - Copy the HTTPS `trycloudflare.com` URL into `PUBLIC_BASE_URL` (no trailing slash).
   - Keep the tunnel terminal running. Its URL may change after restart.
   - A public tunnel exposes your local backend. Do not use it for sensitive data or production.

3. In the Twilio Console, configure the voice-enabled number's incoming call webhook:
   - URL: `https://YOUR_PUBLIC_URL/api/telephony/incoming`
   - Method: `HTTP POST`
   - Ensure the public URL exactly matches `PUBLIC_BASE_URL`, because webhook signature validation checks the request signature.

4. Restart the backend. The health endpoint should show `telephonyConfigured: true` only when all required telephony settings exist. This is configuration presence, not proof of provider reachability or regional eligibility.

5. Test only with authorized numbers and explicit consent. Expected flow:
   - Incoming call is answered by CareConnect AI.
   - Speech is collected and sent to `/api/telephony/voice-turn`.
   - Emergency keywords or Gemini's escalation marker trigger a guardian dial.
   - If guardian answers, Twilio `<Dial>` bridges the same caller and guardian.
   - If guardian does not answer, the caller hears a fallback message.

The AI uses simple keyword matching as an additional trigger. It can miss emergencies or flag ordinary language, so it is not a reliable emergency detector. In the browser demo, emergency responses are followed by a spoken guardian-connection message and a short beep; this is only a simulation and does not place a guardian call. A real guardian transfer is only attempted in the telephony flow if settings are present and the provider permits the call.

## Endpoints

- `GET /api/health`
- `GET /api/students/:id` (fictional records)
- `GET /api/calls` (in-memory demo logs)
- `POST /api/agent/respond` (dashboard demo response)
- `POST /api/telephony/incoming` (Twilio inbound webhook; signature validated)
- `POST /api/telephony/voice-turn` (speech turn; AI response or emergency escalation)
- `POST /api/telephony/guardian-transfer-result` (guardian dial outcome; signature validated)
- `POST /api/emergency/call-counselor` (legacy endpoint name retained; sends an outbound guardian notification only)
- `POST /api/telephony/guardian-voice`
- `POST /api/telephony/status`

## Before any real deployment

Implement verified authentication, guardian identity verification, consent, server-side authorization, rate limiting, durable audited storage, retention limits, monitoring, accessibility, abuse protection, and tested backup escalation. Have a qualified adult and appropriate school/privacy/compliance stakeholders review the system. Do not store or process real student sensitive data in this prototype.
