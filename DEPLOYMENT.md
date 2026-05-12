# Eazy Logistics Deployment (Render + Vercel)

This project is now configured for both platforms without changing your app routes or core logic.

## 1) Render (recommended for full backend)

Render is the best fit for this app because it runs a long-lived Node server and Socket.IO.

1. Push this repository to GitHub.
2. In Render dashboard: `New` -> `Blueprint`.
3. Select this repo (Render will read [`render.yaml`](./render.yaml)).
4. Add all required environment variables in Render.
5. Deploy.

### Required env vars (minimum)
- `ATLASDB_URL`
- `SESSION_SECRET`
- `BASE_URL` (example: `https://your-service.onrender.com`)

### Social auth env vars (if used)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, `FACEBOOK_CALLBACK_URL`
- `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_CALLBACK_URL`
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CALLBACK_URL`

## 2) Vercel

The app can deploy on Vercel using [`vercel.json`](./vercel.json).  
Note: Vercel serverless runtime is less ideal for always-on sockets/background processes.

1. In Vercel dashboard: `Add New` -> `Project`.
2. Import this repo.
3. Add environment variables (same as Render).
4. Set `BASE_URL` to your Vercel domain (example: `https://your-app.vercel.app`).
5. Deploy.

## 3) Fix Google `redirect_uri_mismatch` (your current error)

In Google Cloud Console -> OAuth Client -> **Authorized redirect URIs**, add exact URLs:

- `https://<render-domain>/auth/google/callback`
- `https://<vercel-domain>/auth/google/callback`
- `http://localhost:8080/auth/google/callback` (for local testing)

If you use explicit callback env vars, make sure `GOOGLE_CALLBACK_URL` exactly matches one of the registered URLs.

## 4) Also register callback URLs for other providers

- Facebook: `/auth/facebook/callback`
- LinkedIn: `/auth/linkedin/callback`
- Apple: `/auth/apple/callback`

For each provider dashboard, add both Render and Vercel callback URLs exactly.
