# Nexus deployment — tests.finoraledger.com

This is a static HTML/CSS/JavaScript application; no Node.js service or API is required at runtime. The browser handles quizzes and progress.

Prerequisites: Debian 12 LXC `tests` (113), Docker Engine and Docker Compose, an SSH account with Docker access, the intended host address `10.242.211.113`, and the existing Cloudflare Tunnel → Nginx Proxy Manager route to `http://10.242.211.113:8080`.

## First deployment

1. Copy the project files (including `dist`, `deploy`, and `compose.yaml`) to `/opt/tests`.
2. Create the authentication file outside Git:

   ```sh
   mkdir -p /opt/tests/secrets
   chmod 700 /opt/tests/secrets
   htpasswd -cB /opt/tests/secrets/.htpasswd oleg
   chmod 600 /opt/tests/secrets/.htpasswd
   ```

   `htpasswd` is part of Debian's `apache2-utils` package. It prompts for the password; don't pass it as a command-line argument.

3. Start the application:

   ```sh
   cd /opt/tests
   docker compose config --quiet
   docker compose up -d
   docker compose ps
   ```

4. Verify unauthenticated access returns HTTP 401 and authenticated access returns HTTP 200:

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' http://10.242.211.113:8080/
   curl -u oleg -s -o /dev/null -w '%{http_code}\n' http://10.242.211.113:8080/
   ```

   The second command prompts for the password. Do not use `-u oleg:password` because it can expose credentials in shell history and process listings.

## Operations

```sh
cd /opt/tests
docker compose up -d                 # run / update after copying files
docker compose restart               # restart containers
docker compose ps                    # status
docker compose logs --tail=100       # logs
docker compose pull && docker compose up -d  # update nginx image
```

The container has `restart: unless-stopped`. It starts after Docker is available following reboot, unless explicitly stopped.

## Secrets

There are no runtime environment variables required. `/opt/tests/secrets/.htpasswd` is an out-of-repository password-hash file and must not be checked into Git or included in publicly distributed archives.

The login protects the whole application with HTTP Basic Authentication over the existing **external HTTPS** route. Internal port 8080 is plain HTTP inside the trusted Nexus network. Browser-local user progress and 15-day retake controls are not a centrally managed identity or database.
