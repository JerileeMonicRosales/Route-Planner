<<<<<<< HEAD
# Route Planner (Graphhopper) – Project Activity 3, Option 1

Enhanced version of Lab 4.9.2. A **Python (Flask)** backend wraps the lab's Graphhopper
geocoding + routing logic; a **React (Vite)** frontend shows directions, a map, live weather,
multi-stop routes and saved favorites. The original terminal app is kept as an upgraded CLI.

![screenshot](docs/screenshot.png)

## Features
- Vehicle profiles: car, bike, walk (free-plan Graphhopper profiles)
- Units toggle: miles / km / both (instant – the API returns both)
- Directions table with arrows, per-step distance and time; total distance, `hh:mm:ss` duration, climb/descent
- Interactive map (Leaflet + OpenStreetMap) with route line
- **Multi-stop routing:** add up to 3 stops between start and destination (free plan allows 5 points per route)
- **Real-time weather:** current conditions (icon, temperature, wind, rain) shown on the map at 6 points along the route, via Open-Meteo (no API key); toggle the overlay on/off
- **Accounts + saved favorite routes:** sign up / log in, save a route (with its stops and vehicle) under a name, reload or delete it later; Miles/Km and vehicle choices are stored per account
- Swap start/destination (reverses stops too), recent searches (browser localStorage)
- Friendly errors: empty input, unknown place, bad API key, no route, network failure, bad login
- Demo mode (`GRAPHHOPPER_KEY=demo`) – works offline with sample data (Washington ↔ Baltimore)

## Project layout
```
backend/gh_client.py   Core logic (lab code refactored): geocode(), route(), formatting helpers
backend/app.py         Flask API (directions, weather, auth, favorites); serves the React build
backend/db.py          SQLite layer: users, settings, favorite routes (autoassist.db, auto-created)
backend/weather.py     Open-Meteo client: current weather at points along the route
backend/cli.py         Terminal version (colors, table, units; no stops)
backend/tests/         Unit tests (no network needed)
frontend/src/          React app: App.jsx (UI), MapView.jsx (map + weather overlay),
                       AuthModal.jsx (login/sign-up), PlaceInput.jsx (autocomplete), api.js (calls backend)
docs/                  Backlog, completed rubric, screenshot
```

## Setup
Get a free key at https://www.graphhopper.com/ (Sign Up -> API Keys). **Never commit your key or `.env`.**
Needs Python 3 and Node.js (nodejs.org). Use two terminals.

Create `backend/.env`:
```
GRAPHHOPPER_KEY=your_key
SECRET_KEY=any-long-random-text      # signs login tokens
```

```bash
# Terminal 1 - backend
cd backend
pip install -r requirements.txt      # flask, flask-cors, requests
python app.py                        # API on http://localhost:5000

# Terminal 2 - frontend (hot reload)
cd frontend
npm install
npm run dev                          # open http://localhost:5173 (Vite proxies /api to port 5000)
```
No key yet? Use `GRAPHHOPPER_KEY=demo` for sample data (Washington <-> Baltimore only).
Alternative: `npm run build` once, then open http://localhost:5000 (Flask serves the built app).
Terminal version: `cd backend && python cli.py`. Tests: `cd backend && python -m unittest discover tests`.

## API
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/health`, `/api/profiles`, `/api/suggest?q=` | status, vehicle list, autocomplete |
| POST | `/api/directions` | `{start, end, profile, stops: []}` |
| POST | `/api/weather` | `{points: [{lat, lng}, ...]}` (max 10) |
| POST | `/api/register`, `/api/login` | `{email, password}` -> `{token, user}` |
| GET | `/api/me` | needs `Authorization: Bearer <token>` |
| PUT | `/api/settings` | `{units, profile}` (token) |
| GET / POST | `/api/favorites` | list / save `{name, data}` (token) |
| DELETE | `/api/favorites/<id>` | (token) |

## How it works (for the next team)
1. React sends `POST /api/directions {start, end, profile, stops}`.
2. `gh_client.get_directions()` geocodes every place (`geocode()` = lab's geocoding function),
   calls the routing API with one `point=` per place and `points_encoded=false` (so the route is plain
   coordinates), then `add_units()` adds km, miles and `hh:mm:ss` to every step.
3. After the route loads, the frontend picks 6 evenly spaced points on the line and calls `/api/weather`;
   `weather.py` fetches all of them from Open-Meteo in one request. This is current weather, not a forecast for arrival time.
4. Accounts: passwords are hashed (werkzeug) in SQLite; login returns a signed token (itsdangerous, 30 days)
   that the frontend keeps in localStorage and sends as a Bearer header. A favorite stores the route inputs
   (start, stops, end, vehicle) as JSON, so loading one simply re-runs the search.
5. Errors raise `GraphhopperError(message, status)`; Flask returns `{error: ...}` and React shows it.

Changes from the lab: miles use 1609.344 m (lab used 1.61 km/mile); duration rounds to the nearest second
(lab truncated, so it may differ by 1 s); the API request uses `profile=` (current Graphhopper parameter)
instead of the older `vehicle=`. `route()` now takes a list of points instead of `orig, dest`
(update any tests that call it directly).

## Suggested Git workflow (if you set up GitHub)
`git init` → `.gitignore` is included (add `.env` and `autoassist.db`) → one branch per feature
(`feature/weather`, `feature/multi-stop`, `feature/accounts`) → pull request → teammate review → merge to `main`.

See `docs/BACKLOG.md` for future work (e.g. ETA-based weather forecast, drag-to-reorder stops, rename/edit favorites).
=======
# Route-Planner
RoutePlanner using Graphhopper
>>>>>>> JerileeMonicRosales/main
