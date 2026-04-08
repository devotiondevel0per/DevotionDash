# DevotionDash — Windows Server Production Deployment Guide

## Prerequisites

| Software | Version | Download |
|---|---|---|
| Windows Server | 2019 / 2022 | — |
| Node.js | 20 LTS or 22 LTS | nodejs.org |
| MySQL | 8.0+ | dev.mysql.com |
| PM2 | latest | via npm |

---

## Step 1 — Install Node.js

1. Download Node.js 20 LTS from https://nodejs.org
2. Run the installer — accept default settings
3. Verify in PowerShell (as Administrator):
```powershell
node --version   # should show v20.x.x
npm --version
```

---

## Step 2 — Install MySQL 8

1. Download MySQL 8 Community Installer from https://dev.mysql.com/downloads/installer/
2. Choose **"Server only"** install
3. During setup:
   - Authentication: use **"Use Strong Password Encryption"**
   - Set a strong root password (save it!)
   - Leave port as **3306**
   - Check **"Start MySQL at system startup"**
4. After install, open **MySQL Command Line Client** and run:

```sql
CREATE DATABASE devotiondash CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'devotiondash'@'localhost' IDENTIFIED BY 'YourStrongPassword123!';
GRANT ALL PRIVILEGES ON devotiondash.* TO 'devotiondash'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```
```sql
CREATE DATABASE devotiondash CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'devotiondash'@'localhost' IDENTIFIED BY 'DEVOTION@devotion2801';
GRANT ALL PRIVILEGES ON devotiondash.* TO 'devotiondash'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## Step 3 — Copy the Application

Copy your project folder to the server, e.g.:
```
C:\Apps\devotiondash\
```

Or clone from Git:
```powershell
git clone <your-repo-url> C:\Apps\devotiondash
cd C:\Apps\devotiondash
```

---

## Step 4 — Configure Environment Variables

Create the `.env` file at `C:\Apps\devotiondash\.env`:

```env
# ── Database ────────────────────────────────────────────────
DATABASE_URL="mysql://devotiondash:YourStrongPassword123!@localhost:3306/devotiondash"

# ── Auth (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
AUTH_SECRET="paste-a-64-hex-char-random-string-here"
NEXTAUTH_URL="https://your-server-ip-or-domain"

# ── Server
NODE_ENV="production"
PORT="3000"

# ── SSL (only if using Option B — direct HTTPS, skip for reverse proxy)
# SSL_CERT_PATH="C:\ssl\cert.crt"
# SSL_KEY_PATH="C:\ssl\private.key"
# FORCE_HTTPS="true"
# HTTP_PORT="80"

# ── AI Features (optional)
# ANTHROPIC_API_KEY="sk-ant-..."
```

Generate `AUTH_SECRET` with PowerShell:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 5 — Install Dependencies & Setup DB

```powershell
cd C:\Apps\devotiondash

# Install dependencies
npm install

# Push database schema (creates all tables)
npx prisma db push

# Generate Prisma client
npx prisma generate

# Seed initial data (creates admin user: admin / admin123)
npm run db:seed

# Build for production
npm run build
```

---

## Step 6 — Windows Firewall Rules

Run **PowerShell as Administrator**:

```powershell
# Allow HTTP (port 80)
netsh advfirewall firewall add rule name="DevotionDash HTTP" protocol=TCP dir=in localport=80 action=allow

# Allow HTTPS (port 443)
netsh advfirewall firewall add rule name="DevotionDash HTTPS" protocol=TCP dir=in localport=443 action=allow

# Allow app port (for reverse proxy setup)
netsh advfirewall firewall add rule name="DevotionDash App" protocol=TCP dir=in localport=3000 action=allow
```

**Important:** Do NOT open MySQL port 3306 to the internet unless your DB is on a separate machine.

---

## Step 7 — SSL Configuration

### Option A: Reverse Proxy via IIS (Recommended for Windows Server)

IIS handles SSL. The app runs on HTTP (port 3000) internally.

**Install IIS + ARR:**
```powershell
# Enable IIS and ARR (Application Request Routing)
Install-WindowsFeature -Name Web-Server, Web-Asp-Net45 -IncludeManagementTools
# Then download and install ARR from: https://www.iis.net/downloads/microsoft/application-request-routing
```

**Configure IIS site:**
1. Open IIS Manager
2. Create a new website binding on port 80 and 443
3. Import your SSL certificate: **Server Certificates → Import**
4. Add HTTPS binding with your certificate
5. Add URL Rewrite rule to proxy to localhost:3000:

Create `C:\Apps\devotiondash\web.config` (if using IIS):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ReverseProxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://localhost:3000/{R:1}" />
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="104857600" />
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
```

### Option B: Nginx on Windows (Simpler alternative to IIS)

1. Download Nginx for Windows from http://nginx.org/en/download.html
2. Extract to `C:\nginx\`
3. Edit `C:\nginx\conf\nginx.conf`:

```nginx
worker_processes 1;

events { worker_connections 1024; }

http {
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name your-domain.com;

        ssl_certificate     C:/ssl/cert.crt;
        ssl_certificate_key C:/ssl/private.key;
        ssl_protocols       TLSv1.2 TLSv1.3;

        location / {
            proxy_pass         http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header   Upgrade $http_upgrade;
            proxy_set_header   Connection 'upgrade';
            proxy_set_header   Host $host;
            proxy_set_header   X-Real-IP $remote_addr;
            proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
```

4. Start Nginx: `C:\nginx\nginx.exe`
5. Register as Windows service with NSSM (see below)

### Option C: Direct HTTPS (App handles SSL itself)

Add to `.env`:
```env
SSL_CERT_PATH=C:\ssl\cert.crt
SSL_KEY_PATH=C:\ssl\private.key
FORCE_HTTPS=true
PORT=443
HTTP_PORT=80
```

Start with:
```powershell
npm run start:prod
```

### Getting an SSL Certificate

**Free — Let's Encrypt (requires a domain name):**
```powershell
# Install win-acme (simple Let's Encrypt client for Windows)
# Download from https://github.com/win-acme/win-acme/releases
wacs.exe --target manual --host your-domain.com --installation iis --siteid 1
```

**Self-signed (for internal/testing only):**
```powershell
# Generate self-signed cert (PowerShell)
$cert = New-SelfSignedCertificate -DnsName "your-server-ip" -CertStoreLocation "cert:\LocalMachine\My" -NotAfter (Get-Date).AddYears(5)
$certPath = "C:\ssl"
New-Item -ItemType Directory -Force -Path $certPath
$password = ConvertTo-SecureString -String "CertPassword123" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "$certPath\cert.pfx" -Password $password

# Convert PFX to PEM/CRT for Node.js (requires openssl)
openssl pkcs12 -in C:\ssl\cert.pfx -out C:\ssl\cert.crt -clcerts -nokeys -passin pass:CertPassword123
openssl pkcs12 -in C:\ssl\cert.pfx -out C:\ssl\private.key -nocerts -nodes -passin pass:CertPassword123
```

---

## Step 8 — Install PM2 and Start the App

```powershell
# Install PM2 globally
npm install -g pm2 pm2-windows-startup

# Start the app (standard Next.js HTTP server, use when reverse proxy handles SSL)
pm2 start npm --name devotiondash -- run start -- --port 3000

# OR start with custom server (for direct HTTPS, Option C)
pm2 start npm --name devotiondash -- run start:prod

# Save PM2 process list
pm2 save

# Configure auto-start on Windows boot
pm2-startup install
# Follow the instructions printed by the above command
```

**Useful PM2 commands:**
```powershell
pm2 status              # show all processes
pm2 logs devotiondash        # live log tail
pm2 logs devotiondash --lines 100  # last 100 lines
pm2 restart devotiondash     # restart after .env change
pm2 stop devotiondash        # stop
pm2 delete devotiondash      # remove from PM2
```

---

## Step 9 — First Login

1. Open your browser: `https://your-server-ip` (or `http://your-server-ip:3000` if no SSL yet)
2. Login with: **admin / admin123**
3. **Immediately change the password** in Administration → Users
4. Go to **Administration → Settings** and configure:
   - Application Name
   - Support Email
   - Timezone
5. Go to **Administration → Deployment & SSL** to verify SSL status

---

## Step 10 — Optional: Register Nginx as Windows Service

Use NSSM (Non-Sucking Service Manager):

```powershell
# Download NSSM from https://nssm.cc/download
# Extract to C:\nssm\

C:\nssm\nssm.exe install nginx C:\nginx\nginx.exe
C:\nssm\nssm.exe start nginx
```

---

## Updating the App

```powershell
cd C:\Apps\devotiondash

# Pull latest code (if using Git)
git pull

# Install any new dependencies
npm install

# Regenerate Prisma client if schema changed
npx prisma generate

# Push any DB schema changes
npx prisma db push

# Rebuild
npm run build

# Restart the app
pm2 restart devotiondash
```

---

## Backup

**Database backup (daily scheduled task):**
```powershell
# Create backup script: C:\Scripts\backup-devotiondash.ps1
$date = Get-Date -Format "yyyy-MM-dd"
$backupDir = "C:\Backups\devotiondash"
New-Item -ItemType Directory -Force -Path $backupDir
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" `
    --user=devotiondash --password=YourStrongPassword123! `
    --single-transaction devotiondash > "$backupDir\devotiondash-$date.sql"

# Schedule it: Task Scheduler → Create Basic Task → Daily → PowerShell
powershell -ExecutionPolicy Bypass -File C:\Scripts\backup-devotiondash.ps1
```

**Uploads backup:**
```powershell
# Copy uploads folder to backup location
Copy-Item -Path "C:\Apps\devotiondash\public\uploads" -Destination "C:\Backups\devotiondash\uploads-$date" -Recurse
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `Can't reach database server at localhost:3306` | Start MySQL: `net start MySQL80` |
| Port 80/443 already in use | Stop IIS default site or change port |
| `EPERM` when running `prisma generate` | Stop PM2/dev server first, then generate |
| SSL cert errors | Ensure cert.crt contains full chain (cert + intermediates) |
| App not accessible from internet | Check Windows Firewall rules (Step 6) and router port forwarding |
| Socket.io not working | Ensure proxy passes `Upgrade` and `Connection` headers (see Nginx config) |
| `AUTH_SECRET` error | Generate and set `AUTH_SECRET` in `.env` |

---

## Architecture Summary

```
Internet
    │
    ▼ port 443 (HTTPS)
┌─────────────────────────────┐
│  IIS / Nginx / Direct SSL   │  ← SSL termination
└─────────────┬───────────────┘
              │ HTTP (localhost)
              ▼ port 3000
┌─────────────────────────────┐
│   Next.js App (PM2)         │  ← DevotionDash application
└─────────────┬───────────────┘
              │
              ▼ port 3306
┌─────────────────────────────┐
│   MySQL 8 (Windows Service) │  ← Database
└─────────────────────────────┘
```
