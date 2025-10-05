# 🧩 Leads Service — README

Scurt: acest repository conține un **API Node.js** pentru primirea lead-urilor și un **worker Python** care le procesează.  
Toate rulează prin **Docker Compose**.

Acest README îți arată pas cu pas:

- cum pornești proiectul,
- cum verifici fiecare cerință din task,
- și câteva comenzi **`curl`** gata de folosit.

---

## 🧱 1. Cerințe (locale)

Asigură-te că ai instalat:

- **Docker & Docker Compose**  
  (recomand _Docker Compose V2_ — folosește `docker compose ...`)
- **Node.js** — pentru generarea HMAC în exemplele de webhook
- **Un terminal Bash** (Linux, macOS sau WSL)

---

## 📂 2. Fișiere importante

| Fișier / Director    | Descriere                                                                              |
| -------------------- | -------------------------------------------------------------------------------------- |
| `docker-compose.yml` | Definește serviciile: `db` (Postgres), `redis`, `rabbitmq`, `api`, `worker`, `migrate` |
| `./api`              | Cod API Node.js                                                                        |
| `./worker`           | Cod worker Python                                                                      |
| `./migrations`       | Fișiere SQL care se aplică la pornire (serviciul `migrate`)                            |
| `.env`               | Configurații de mediu                                                                  |

---

## 🚀 3. Pornire (pas cu pas)

Clonează repository-ul și intră în director:

```bash
git clone <repo-url>
cd <repo-root>
cp .env.example .env      # editează .env dacă vrei
```

Build & pornește tot (primul run fără -d pentru loguri vizibile):

```bash
docker compose up --build
```

## 🔗 4. Endpoints (exemple curl)

### 📨 A. Creează lead (POST /leads) — cu Idempotency

```bash
curl -s -X POST http://localhost:3000/leads \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: key-123" \
  -d '{
    "email":"john.doe@example.com",
    "phone":"+37360123456",
    "name":"John Doe",
    "source":"facebook"
  }' | jq
```

- Prima cerere → 201 Created

- Repetând cu același Idempotency-Key → 200 OK (răspuns identic, idempotent)

**Rate limit**: maxim 10 requests / minut / IP.
După limită, răspunsul va fi 429 Too Many Requests.

### 🔍 B. Obține lead (GET /leads/:id)

```bash
curl -s http://localhost:3000/leads/<LEAD_ID> | jq
```

Comportament cache:

- Prima apelare → cache miss → răspuns din Postgres, salvat în Redis 60s

- A doua apelare (în 60s) → cache hit → răspuns instant din Redis

Redis key patterns:

- lead:<id> — pentru GET

- lead:<email> — folosit la POST cache (în unele variante)

### 🔔 C. Webhook Fake CRM (POST /webhook/fakecrm)

Exemplu complet:

```bash
BODY='{"lead_id":"<LEAD_ID>","status":"approved"}'
SIG=$(node -e "const crypto=require('crypto');const body=process.env.BODY;const h=crypto.createHmac('sha256','mysecret123').update(body).digest('hex');console.log(h)")

curl -s -X POST http://localhost:3000/webhook/fakecrm \
  -H "Content-Type: application/json" \
  -H "x-signature: sha256=$SIG" \
  -d "$BODY" | jq
```

## 🧰 5. Verificări și comenzi utile

🔎 Logs (live)

```bash
# toate logurile
docker compose logs -f

# doar API
docker compose logs -f api

# doar worker
docker compose logs -f worker
```

🗄️ Database (Postgres)

```bash
docker compose exec db psql -U user -d leadsdb
```

Interogări rapide:

```bash
# ultimele 10 lead-uri
docker compose exec db psql -U user -d leadsdb -c \
"SELECT id, email, status, company FROM leads ORDER BY created_at DESC LIMIT 10;"

# ultimele 10 evenimente
docker compose exec db psql -U user -d leadsdb -c \
"SELECT * FROM lead_events ORDER BY created_at DESC LIMIT 10;"
```

🚦 Test rate-limit

```bash
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/leads \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: key-rate-test" \
    -d '{"email":"rate@example.com","phone":"1","name":"R","source":"x"}'
done
```

| Ultimul request ar trebui să afișeze **429**.

---

**In total acest proiect mi-a luat 3 ore**
