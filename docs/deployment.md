# Production Deployment & Security Model
> `Production Setup` • `CORS Configuration` • `Server-Side Security` • `Uvicorn` • `Nginx / Caddy`

Deployment guide, security architecture, and operational practices for hosting BuildWise AI in production environments.

---

## Table of Contents
- [System Requirements](#system-requirements)
- [Security Architecture: Server-Side API Keys](#security-architecture-server-side-api-keys)
- [CORS Configuration for Production](#cors-configuration-for-production)
- [Production Build & Serving Strategies](#production-build--serving-strategies)
  - [Strategy A: Split Frontend (Nginx / Caddy) + Backend (Uvicorn)](#strategy-a-split-frontend-nginx--caddy--backend-uvicorn)
  - [Strategy B: Single-Container Unified Serving via FastAPI](#strategy-b-single-container-unified-serving-via-fastapi)
- [Headless PDF Generation Notes](#headless-pdf-generation-notes)
- [Monitoring & Health Probes](#monitoring--health-probes)
- [Environment Checklist](#environment-checklist)
- [Navigation](#navigation)

---

## System Requirements

| Component | Minimum | Recommended |
|:---|:---|:---|
| **Operating System** | Linux (Ubuntu 22.04 LTS / Debian 12), macOS, Windows Server | Linux (x86_64 / arm64) |
| **CPU** | 2 vCPUs | 4+ vCPUs |
| **RAM** | 2 GB | 4 GB+ (accommodates concurrent ReportLab PDF tasks) |
| **Python** | 3.10+ | 3.11 or 3.12 |
| **Node.js** | 18.0+ | 20.x LTS |

---

## Security Architecture: Server-Side API Keys

> [!CAUTION]
> Never bundle LLM API keys (`GROQ_API_KEY`, `GEMINI_API_KEY`) into the frontend build.

BuildWise AI strictly isolates all credentials on the backend server:

```
[Browser / Client]
       │
       │ HTTP REST Calls (No API Keys)
       ▼
[Nginx / Reverse Proxy]
       │
       ▼
[FastAPI Backend (Uvicorn)]  <─── Reads .env Server-Side (GROQ_API_KEY, GEMINI_API_KEY)
       │
       ├──► Groq API (HTTPS with Bearer Token)
       └──► Google AI API (HTTPS with Key Parameter)
```

1. **Frontend Isolation:** The frontend only needs `VITE_API_URL` pointing to the backend. It has zero knowledge of LLM keys.
2. **Backend Protection:** The backend reads keys from environment variables or a local `.env` file that is excluded from Git (`.gitignore`).
3. **No Paid Mapping Keys:** MapLibre GL connects directly to OpenFreeMap and public tile servers with zero billable client keys.

---

## CORS Configuration for Production

In production, update `CORS_ORIGINS` in `backend/.env` to allow your public domain:

```env
CORS_ORIGINS=["https://buildwise.yourdomain.com", "https://app.yourdomain.com"]
```

The backend parses this JSON array in `app/main.py` and registers the origins with FastAPI's `CORSMiddleware`. Localhost origins (`http://localhost:5173`) remain enabled by default for developer convenience.

---

## Production Build & Serving Strategies

### Strategy A: Split Frontend (Nginx / Caddy) + Backend (Uvicorn)

This is the recommended production architecture for maximum concurrency and caching.

#### 1. Build Frontend Static Assets
```bash
cd frontend
npm install
npm run build
```
The compiled SPA is output to `frontend/dist/`.

#### 2. Configure Reverse Proxy (Nginx Example)
```nginx
server {
    listen 80;
    server_name buildwise.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name buildwise.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/buildwise.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/buildwise.yourdomain.com/privkey.pem;

    # Static Frontend SPA
    root /var/www/buildwise/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Proxy to FastAPI Uvicorn
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 3. Run Backend via Systemd / Supervisor
Run the backend with multiple worker processes behind Uvicorn:
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 4
```

---

### Strategy B: Single-Container Unified Serving via FastAPI

For lightweight deployments (e.g. Docker, Railway, Render, Fly.io), FastAPI can mount the compiled frontend:

```python
# In app/main.py (if deploying unified)
from fastapi.staticfiles import StaticFiles

app.mount("/", StaticFiles(directory="frontend_dist", html=True), name="static")
```

---

## Headless PDF Generation Notes

ReportLab compiles PDF documents in memory using `io.BytesIO`.

### Font Files
BuildWise AI bundles **Inter TrueType fonts** in `backend/assets/fonts/`:
- `Inter-Regular.ttf`
- `Inter-Medium.ttf`
- `Inter-SemiBold.ttf`
- `Inter-Bold.ttf`

Ensure these files are present in production Docker images or host filesystems. If the fonts are missing, ReportLab automatically falls back to standard Helvetica, but vector font kerning and subsetting will be degraded.

### Memory Sizing
Vector PDF compilation of multi-page technical reports consumes ~25MB to 60MB of RAM per concurrent generation. Ensure worker processes have sufficient memory headspace.

---

## Monitoring & Health Probes

Use the built-in health endpoint for load balancer health checks and Kubernetes liveness/readiness probes:

- **Endpoint:** `GET /api/health`
- **Expected Status:** `HTTP 200 OK`
- **Sample Output:**
  ```json
  {
    "status": "healthy",
    "version": "1.1.0",
    "ai_adapters_available": ["mock", "groq", "gemini", "ollama"],
    "active_default_ai": "groq"
  }
  ```

---

## Environment Checklist

Before declaring production readiness, verify:
- [x] `GROQ_API_KEY` or `GEMINI_API_KEY` set in server environment.
- [x] `DEFAULT_AI_PROVIDER` set to preferred LLM (`groq` or `gemini`).
- [x] `CORS_ORIGINS` configured with the production domain name.
- [x] `VITE_API_URL` set during frontend build.
- [x] SSL / TLS certificates configured via Let's Encrypt / Certbot.
- [x] Inter TrueType font files verified in `backend/assets/fonts/`.

---

## Navigation
- **Previous:** [← Testing & Quality Assurance](testing.md)
- **First Guide:** [Getting Started →](getting-started.md)

---
*BuildWise AI • [MIT License](../LICENSE) • Copyright (c) 2026 Rolan Lobo*
