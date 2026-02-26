# Hosting on Portainer

## How updates work (recommended)

The app image is **built by GitHub Actions** when you push to `main`. The image is pushed to **GitHub Container Registry** (`ghcr.io/chrisn-t4d/moneytracking:latest`). In Portainer you **pull** this image; there is no build on the server.

1. **Push to `main`** (e.g. from your machine or Cursor) â†’ Actions builds and pushes the image (see **Actions** tab on GitHub).
2. **In Portainer:** Open your stack â†’ **Pull and redeploy**. Portainer pulls the latest image and restarts the container.
3. No cache issues: each push to `main` produces a new image; "Pull and redeploy" gets it.

If the repo or package is **private**, either make the package public (repo **Settings** â†’ **Packages** â†’ the image â†’ **Package settings** â†’ **Change visibility**) or add **Registry** credentials in Portainer for `ghcr.io` (use a GitHub Personal Access Token with `read:packages`).

---

## Where to put PocketBase admin credentials (never in GitHub)

The app needs your **PocketBase admin email and password** for server-side API calls (e.g. paychecks, setup, statements). Set them **only** in one of these places:

1. **Portainer (recommended):** In your stack or container Ã¢â€ â€™ **Environment variables** Ã¢â€ â€™ add:
   - `NEXT_PUBLIC_POCKETBASE_URL` = your PocketBase URL (e.g. `https://your-pb.com`)
   - `POCKETBASE_ADMIN_EMAIL` = the email you use to log into the PocketBase admin UI
   - `POCKETBASE_ADMIN_PASSWORD` = that accountÃ¢â‚¬â„¢s password

2. **Env file on the server:** Create a file on the server (e.g. `~/neu-money-tracking.env`) with the same variables. Do **not** commit this file or put it in the repo. In Portainer, point the stack/container to it via **Env** Ã¢â€ â€™ **Load from file** (or use `env_file` in docker-compose and mount the path).

These values are **server-only** (no `NEXT_PUBLIC_`), so they are not embedded in the browser. Never add them to the repo or `.env.example` with real values.

---

## Deploy with Web editor + Traefik (paste compose, no Git)

1. **Build the image** on your machine or a build server:
   ```bash
   docker build -t neu-money-tracking:latest .
   ```
   The Dockerfile runs `npm ci` from `package.json` and `package-lock.json`, so **all dependencies** (including those for statement upload, e.g. `unpdf`) are installed during the build. Ensure both files are in the build context (donÃ¢â‚¬â„¢t exclude them in `.dockerignore`). Push the image to a registry, or copy it onto the server where Portainer runs (e.g. `docker save` / `docker load`).

2. **In Portainer:** Stacks Ã¢â€ â€™ **Add stack** Ã¢â€ â€™ Build method: **Web editor**.

3. **Paste** the contents of `docker-compose.yml` from this repo into the editor.

4. **Edit in the editor:**
   - **Traefik hostname:** In the label `traefik.http.routers.neu-money-tracking.rule`, replace `money.yourdomain.com` with your domain (e.g. `money.example.com`).
   - **Traefik network:** If your Traefik stack uses a different external network name (e.g. `proxy`), change the last line from `traefik:` to that name under `networks:` and in `services.app.networks`.
   - **Image without build:** If the image is already on the server or in a registry, remove the `build: .` line so the stack only uses `image: neu-money-tracking:latest` (or your registry path). Then deploy without Ã¢â‚¬Å“Build from repoÃ¢â‚¬Â.

5. **Environment variables:** In the stack, add `NEXT_PUBLIC_POCKETBASE_URL`, `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD` (see above).

6. **Deploy the stack.** Traefik will route `https://your-domain` to the containerÃ¢â‚¬â„¢s port 3000. The app listens on 3000 inside the container; the `ports: "3002:3000"` mapping is optional for direct access.

---

## Deploy from Git (pull image from registry)

When you use **Build method: Git repository**, the compose file is pulled from the repo. The compose file uses **image: ghcr.io/chrisn-t4d/moneytracking:latest**, so Portainer **pulls** that image (built by GitHub Actions). No build runs on the server.

Sensitive values must **not** be in that file; you provide them in Portainer at deploy time:

1. **In Portainer:** Stacks Ã¢â€ â€™ Add stack (or edit stack) Ã¢â€ â€™ Build method: **Git repository**.
2. Set **Repository URL**, **Branch**, and **Compose path** (e.g. `docker-compose.yml`).
3. **Environment variables:** In the stack editor, find the **Environment variables** / **Env** section (often below the compose editor or under Ã¢â‚¬Å“AdvancedÃ¢â‚¬Â). Add:
   - `NEXT_PUBLIC_POCKETBASE_URL` = your PocketBase URL
   - `POCKETBASE_ADMIN_EMAIL` = admin email
   - `POCKETBASE_ADMIN_PASSWORD` = admin password  
   Portainer uses these when deploying: they substitute into `${VAR:-}` in the compose and are passed into the container. They are stored in Portainer, not in Git.
4. Deploy. Portainer pulls the image from GHCR and runs the container. To get updates: **Pull and redeploy**.

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

1. **On your machine:** Build and push an image (if you use a registry), or use PortainerÃ¢â‚¬â„¢s Git build.

2. **In Portainer:**  
   - **Stacks** Ã¢â€ â€™ **Add stack**  
   - Name: e.g. `neu-money-tracking`  
   - Build method: **Git repository** (recommended) or **Web editor**  
   - If using Web editor, paste the compose file and set env vars as above.

3. **Set environment variables** in the stackÃ¢â‚¬â„¢s Env section (see Ã¢â‚¬Å“Deploy from GitÃ¢â‚¬Â above). Never commit real values.

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
   - **Containers** Ã¢â€ â€™ **Add container**  
   - Image: `neu-money-tracking:latest`  
   - Port mapping: host `3002` Ã¢â€ â€™ container `3000`  
   - **Env** Ã¢â€ â€™ add (see Ã¢â‚¬Å“Where to put PocketBase admin credentialsÃ¢â‚¬Â above):
     - `NEXT_PUBLIC_POCKETBASE_URL` = your PocketBase URL  
     - `POCKETBASE_ADMIN_EMAIL` = your PocketBase admin email  
     - `POCKETBASE_ADMIN_PASSWORD` = your PocketBase admin password  
   - **Restart policy:** Unless stopped  
   - Deploy.

4. Open `http://your-server:3002`.

---

## Option 3: Stack from Git (Portainer builds from repo)

1. In Portainer: **Stacks** Ã¢â€ â€™ **Add stack**.
2. Build method: **Git repository**.
3. Repository URL: your repo (e.g. `https://github.com/ChrisN-T4D/moneytracking.git`).
4. Compose path: `docker-compose.yml`.
5. Add environment variables in the stack (see Ã¢â‚¬Å“Where to put PocketBase admin credentialsÃ¢â‚¬Â above): `NEXT_PUBLIC_POCKETBASE_URL`, `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD`.
6. Deploy. Portainer will clone, build, and run. The app is on port 3002.

---

## Pull and redeploy not showing updates?

If the app still shows old code after **Pull and redeploy**:

1. **Check GitHub Actions:** Pushing to `main` triggers a new image. In the repo go to **Actions** and confirm the latest run succeeded.
2. **In Portainer:** Use **Pull and redeploy** so it pulls the latest image from GHCR.
3. **Browser:** Hard-refresh (Ctrl+F5) or check the version in the bottom-left.

---

## Notes

- **PocketBase** is separate. The app only needs `NEXT_PUBLIC_POCKETBASE_URL` pointing to your PocketBase instance (same server or elsewhere). No need to run PocketBase in this stack unless you want to.
- **Port 3002** avoids conflicts with other apps. Change the host port in `docker-compose.yml` (e.g. `"8080:3000"`) if you prefer.
- **HTTPS:** Put the app behind a reverse proxy (Traefik, Caddy, Nginx) on the same server and terminate SSL there.
