# Notification Preferences Service

A service that controls which notifications can be sent to a user on which channels, based on their choices, default settings, and global policies.

## Prerequisites

- **Docker Desktop** — required. The app and Postgres run in containers. Everything else (Node.js, npm) is optional.
- **Node.js 22+** — only needed for running tests from the host or direct `npm run dev`.

## Quick Start

```bash
npm run init:app           # boot everything (Postgres + app)
npm run dev:app            # development with hot-reload
npm run reset              # recreate DB from scratch
npm run down               # stop containers
```

---

## UI Matrix

Seed user Alice's state:

```
                    transactional    marketing
Email               ✅ ON            ✅ ON   (user override)
SMS                 ✅ ON            🚫 EU   (global policy)
Push                ✅ ON            ⬜ OFF  (user override)
Telegram            ✅ ON (default)  ⬜ OFF  (default)
Viber               ✅ ON (default)  ⬜ OFF  (default)
```

- **`✅ ON`** — notification will be delivered
- **`⬜ OFF`** — disabled by user or default
- **`🚫`** — blocked by global policy or missing contact

Each cell is `PUT /users/:id/preferences` with `{category, channel, enabled}`.
A whole row can be toggled via `{"category":"*","channel":"push","enabled":false}`.

---

## Seed Data

| id | email | phone | region | notes |
|---|---|---|---|---|
| `a1b2c3d4-...` (Alice) | alice@example.com | +490123456789 | EU | quiet hours: push blocked 22–08 + sms blocked 08–22 Berlin, telegram+viber |
| `b2c3d4e5-...` (Bob) | bob@example.com | null | US | telegram |
| `c3d4e5f6-...` | null | +12025551234 | APAC | quiet hours 23–07 Tokyo |

---

## API

### Get user preferences
```bash
# all settings (effective, messengers, quiet hours)
curl http://localhost:3000/users/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preferences

# only currently allowed (respects quiet hours, policies, contacts)
curl "http://localhost:3000/users/a1b2c3d4-.../preferences?category=marketing&region=EU&datetime=2026-05-25T23:30:00Z"
```

### Update a preference
```bash
# toggle a specific pair (category × channel)
curl -X PUT http://localhost:3000/users/a1b2c3d4-.../preferences \
  -H 'Content-Type: application/json' \
  -d '{"category":"marketing","channel":"email","enabled":true}'

# toggle an entire channel for all categories
curl -X PUT http://localhost:3000/users/a1b2c3d4-.../preferences \
  -H 'Content-Type: application/json' \
  -d '{"category":"*","channel":"push","enabled":false}'
```

### Quiet hours (array of intervals, with per-channel support)

- `channel` omitted — blocks **all channels** in that interval
- `channel` set — blocks **only that channel**

**Scenario: SMS off during the day, push off in the evening**
```bash
curl -X PUT http://localhost:3000/users/a1b2c3d4-.../quiet-hours \
  -H 'Content-Type: application/json' \
  -d '[
    {"startTime":"08:00","endTime":"18:00","timezone":"Europe/Berlin","channel":"sms"},
    {"startTime":"18:00","endTime":"08:00","timezone":"Europe/Berlin","channel":"push"}
  ]'
```

**Block all channels at night**
```bash
curl -X PUT http://localhost:3000/users/a1b2c3d4-.../quiet-hours \
  -H 'Content-Type: application/json' \
  -d '[
    {"startTime":"23:00","endTime":"07:00","timezone":"Europe/Berlin"}
  ]'
```

**Clear all intervals**
```bash
curl -X PUT http://localhost:3000/users/a1b2c3d4-.../quiet-hours \
  -H 'Content-Type: application/json' \
  -d '[]'
```

### Evaluate notification delivery
```bash
curl -X POST http://localhost:3000/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"userId":"a1b2c3d4-...","category":"marketing","channel":"sms","region":"EU","datetime":"2026-05-25T21:30:00Z"}'
```

### Manage messengers
```bash
curl -X POST http://localhost:3000/users/a1b2c3d4-.../messengers \
  -H 'Content-Type: application/json' \
  -d '{"messenger":"whatsapp"}'

curl -X DELETE http://localhost:3000/users/a1b2c3d4-.../messengers/telegram
```

### Create user
```bash
curl -X POST http://localhost:3000/users \
  -H 'Content-Type: application/json' \
  -d '{"id":"11111111-2222-3333-4444-555555555555","email":"user@test.com","phone":"+1111111111","region":"US"}'
```

---

## Architecture

```
                    ┌─────────────┐
                    │  Express API │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │  PreferenceService      │
              │  EvaluationService      │
              └────────────┬────────────┘
                           │
              ┌────────────┴────────────┐
              │  PreferenceRepository   │
              │  PolicyRepository       │
              └────────────┬────────────┘
                           │
              ┌────────────┴────────────┐
              │  PostgreSQL             │
              └─────────────────────────┘
```

### Why category + channel instead of notificationType

Instead of a composite `notificationType` (`marketing_email`, `marketing_sms`, …) we split category and channel. This gives:

- **Orthogonality** — a new channel (`whatsapp`, `signal`) works with all existing categories without duplicating combinations
- **Category scaling** — a new category (`security`, `billing`) gets settings for all channels via a single `INSERT` into `default_preferences`
- **Per-channel quiet hours** — block SMS during the day while keeping push active, without creating rules for every combination
- **Evaluation flexibility** — checks (global policies, contacts, quiet hours) work with category and channel independently

With `notificationType`, each new channel would require `marketing_whatsapp`, `transactional_whatsapp`, `security_whatsapp`, etc. — combinatorial explosion with no benefit.

### Evaluation chain (priority)

1. **Global policy** — deny if `(category, channel, region)` is forbidden
2. **Contact check** — email requires email on profile, sms requires phone
3. **Messenger check** — channel must be connected
4. **Quiet hours** — all intervals are checked. Without `channel` — blocks any channel. With `channel` — blocks only that channel.
5. **User preference** — explicit user override
6. **Default** — transactional allow, marketing deny (same for messengers)

### Idempotency

`UPSERT` (PostgreSQL `ON CONFLICT DO UPDATE`) — applying the same setting twice does not break state.

---

## Next Steps (productionisation)

- **Metrics** — Prometheus counters (allow/deny, changes)
- **Caching** — in-memory for global policies
- **Auth** — JWT/API key on endpoints
- **CI/CD** — GitHub Actions: typecheck → test → build
- **OpenAPI spec** — for API consumers
