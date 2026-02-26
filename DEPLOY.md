# Hosting on Portainer

## Where to put PocketBase admin credentials (never in GitHub)

The app needs your **PocketBase admin email and password** for server-side API calls (e.g. paychecks, setup, statements). Set them **only** in one of these places:

1. **Portainer (recommended):** In your stack or container â†’ **Environment variables** â†’ add:
   - `NEXT_PUBLIC_POCKETBASE_URL` = your PocketBase URL (e.g. `https://your-pb.com`)
   - `POCKETBASE_ADMIN_EMAIL` = the email you use to log into the PocketBase admin UI
   - `POCKETBASE_ADMIN_PASSWORD` = that accountâ€™s password

2. **Env file on the server:** Create a file on the server (e.g. `~/neu-money-tracking.env`) with the same variables. Do **not** commit this file or put it in the repo. In Portainer, point the stack/container to it via **Env** â†’ **Load from file** (or use `env_file` in docker-compose and mount the path).

These values are **server-only** (no `NEXT_PUBLIC_`), so they are not embedded in the browser. Never add them to the repo or `.env.example` with real values.

---

## Deploy with Web editor + Traefik (paste compose, no Git)

1. **Build the image** on your machine or a build server:
   ```bash
   docker build -t neu-money-tracking:latest .
   ```
   The Dockerfile runs `npm ci` from `package.json` and `package-lock.json`, so **all dependencies** (including those for statement upload, e.g. `unpdf`) are installed during the build. Ensure both files are in the build context (donâ€™t exclude them in `.dockerignore`). Push the image to a registry, or copy it onto the server where Portainer runs (e.g. `docker save` / `docker load`).

2. **In Portainer:** Stacks â†’ **Add stack** â†’ Build method: **Web editor**.

3. **Paste** the contents of `docker-compose.yml` from this repo into the editor.

4. **Edit in the editor:**
   - **Traefik hostname:** In the label `traefik.http.routers.neu-money-tracking.rule`, replace `money.yourdomain.com` with your domain (e.g. `money.example.com`).
   - **Traefik network:** If your Traefik stack uses a different external network name (e.g. `proxy`), change the last line from `traefik:` to that name under `networks:` and in `services.app.networks`.
   - **Image without build:** If the image is already on the server or in a registry, remove the `build: .` line so the stack only uses `image: neu-money-tracking:latest` (or your registry path). Then deploy without â€œBuild from repoâ€.

5. **Environment variables:** In the stack, add `NEXT_PUBLIC_POCKETBASE_URL`, `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD` (see above).

6. **Deploy the stack.** Traefik will route `https://your-domain` to the containerâ€™s port 3000. The app listens on 3000 inside the container; the `ports: "3002:3000"` mapping is optional for direct access.

---

## Deploy from Git (secrets stay out of the repo)

When you use **Build method: Git repository**, the compose file is pulled from the repo. Sensitive values must **not** be in that file; you provide them in Portainer at deploy time:

1. **In Portainer:** Stacks â†’ Add stack (or edit stack) â†’ Build method: **Git repository**.
2. Set **Repository URL**, **Branch**, and **Compose path** (e.g. `docker-compose.yml`).
3. **Environment variables:** In the stack editor, find the **Environment variables** / **Env** section (often below the compose editor or under â€œAdvancedâ€). Add:
   - `NEXT_PUBLIC_POCKETBASE_URL` = your PocketBase URL
   - `POCKETBASE_ADMIN_EMAIL` = admin email
   - `POCKETBASE_ADMIN_PASSWORD` = admin password  
   Portainer uses these when deploying: they substitute into `${VAR:-}` in the compose and are passed into the container. They are stored in Portainer, not in Git.
4. Deploy. The image is built from the repo; the three variables are injected from Portainer only.

Your `docker-compose.yml` in the repo should keep the placeholders exactly as:

```yaml
environment:
  - NODE_ENV=production
  - NEXT_PUBLIC_POCKETBASE_URL=${NEXT_PUBLIC_POCKETBASE_URL:-}
  - POCKETBASE_ADMIN_EMAIL=${POCKETBASE_ADMIN_EMAIL:-}
  - POCKETBASE_ADMIN_PASSWORD=${POCKETBASE_ADMIN_PASSWORD:-}
```

Do **not** put real URLs or passwords in that file or in any file you commit.

---

## Option 1: Deploy as a Stack (Git build)

1. **On your machine:** Build and push an image (if you use a registry), or use Portainerâ€™s Git build.

2. **In Portainer:**  
   - **Stacks** â†’ **Add stack**  
   - Name: e.g. `neu-money-tracking`  
   - Build method: **Git repository** (recommended) or **Web editor**  
   - If using Web editor, paste the compose file and set env vars as above.

3. **Set environment variables** in the stackâ€™s Env section (see â€œDeploy from Gitâ€ above). Never commit real values.

4. **Build and deploy:**  
   - With **Web editor** + pre-built image: remove `build: .` and deploy.  
   - With **Git repository**: set repo URL and compose path; Portainer builds and injects env vars at deploy.

5. With Traefik, the app is reached at your configured hostname. Without Traefik, use `http://your-server:3002`.

---

## Option 2: Build image locally and run in Portainer

1. **On your machine** (where the repo is):

   ```bash
   cd moneytracking
   docker build -t neu-money-tracking:latest .
   ```

2. **Export the image** (if the Portainer server is another machine):

   ```bash
   docker save neu-money-tracking:latest -o neu-money-tracking.tar
   ```

   Copy `neu-money-tracking.tar` to the server, then on the server:

   ```bash
   docker load -i neu-money-tracking.tar
   ```

   Or push to a registry (Docker Hub, GitHub Container Registry, etc.) and pull from Portainer.

3. **In Portainer:**  
   - **Containers** â†’ **Add container**  
   - Image: `neu-money-tracking:latest`  
   - Port mapping: host `3002` â†’ container `3000`  
   - **Env** â†’ add (see â€œWhere to put PocketBase admin credentialsâ€ above):
     - `NEXT_PUBLIC_POCKETBASE_URL` = your PocketBase URL  
     - `POCKETBASE_ADMIN_EMAIL` = your PocketBase admin email  
     - `POCKETBASE_ADMIN_PASSWORD` = your PocketBase admin password  
   - **Restart policy:** Unless stopped  
   - Deploy.

4. Open `http://your-server:3002`.

---

## Option 3: Stack from Git (Portainer builds from repo)

1. In Portainer: **Stacks** â†’ **Add stack**.
2. Build method: **Git repository**.
3. Repository URL: your repo (e.g. `https://github.com/ChrisN-T4D/moneytracking.git`).
4. Compose path: `docker-compose.yml`.
5. Add environment variables in the stack (see â€œWhere to put PocketBase admin credentialsâ€ above): `NEXT_PUBLIC_POCKETBASE_URL`, `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD`.
6. Deploy. Portainer will clone, build, and run. The app is on port 3002.

---

## Pull and redeploy not showing updates? (Portainer CE)

If you **Pull and redeploy** but the app still shows old code (e.g. version number unchanged), Docker is reusing **cached build layers**. With **build from repo** there is no external image to pull — Portainer builds the image from Git each time, so "Re-pull image" doesn't apply. The **Force redeployment** toggle is Business-only. Use this workaround instead:

**Force a full rebuild with CACHE_BUST**

1. In Portainer go to **Stacks** â†’ your stack â†’ **Redeploy from git repository** (or **Editor**).
2. Open **Environment variables** and add (or edit):
   - Name: `CACHE_BUST`
   - Value: `2` (or any number; bump it each time you need a fresh build, e.g. 3, 4â€¦).
3. Click **Save settings** if needed, then **Pull and redeploy**.

The stack passes `CACHE_BUST` into the image build. Changing it invalidates Docker's cache so the next build copies the latest code and runs a full `npm run build`. After deploy, hard-refresh the site (Ctrl+F5) or check the version in the bottom-left.

---

## Notes

- **PocketBase** is separate. The app only needs `NEXT_PUBLIC_POCKETBASE_URL` pointing to your PocketBase instance (same server or elsewhere). No need to run PocketBase in this stack unless you want to.
- **Port 3002** avoids conflicts with other apps. Change the host port in `docker-compose.yml` (e.g. `"8080:3000"`) if you prefer.
- **HTTPS:** Put the app behind a reverse proxy (Traefik, Caddy, Nginx) on the same server and terminate SSL there.
