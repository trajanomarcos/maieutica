# Maieutica RH Website

Frontend React for maieuticarh.com.br.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm ci
npm run build
CI=true npm run build
```

Build output is auto-detected by deploy script:

- CRA -> `build`
- Vite -> `dist`

## Contact API integration

Frontend endpoint:

- `/api/contact`
- `/abler-api/v1/vacancies` -> `https://api.abler.com.br/v1/vacancies`

The Abler proxy is intentionally restricted to read-only vacancy queries used by the frontend.

Temporary compatibility fallback is available by env variables:

- `REACT_APP_ENABLE_LEGACY_EMAIL_FALLBACK`
- `REACT_APP_LEGACY_EMAIL_API_URL`

See `.env.example`.
