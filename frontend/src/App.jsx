import { useEffect, useState } from "react";
import {
  getDirections, getWeather, getMe, setToken, hasToken, saveSettings,
  getFavorites, addFavorite, deleteFavorite,
} from "./api.js";
import MapView from "./MapView.jsx";
import PlaceInput from "./PlaceInput.jsx";
import AuthModal from "./AuthModal.jsx";
import Icon from "./icons.jsx";

const PROFILES = [
  { id: "car", label: "Car", icon: "car" },
  { id: "bike", label: "Bike", icon: "bike" },
  { id: "foot", label: "Walk", icon: "foot" },
];
const UNITS = [["both", "Both"], ["imperial", "Miles"], ["metric", "Km"]];
const MAX_STOPS = 3;
const TURN = {
  straight: ["up", 0], slight_right: ["up", 45], keep_right: ["up", 45], right: ["up", 90], sharp_right: ["up", 135],
  slight_left: ["up", -45], keep_left: ["up", -45], left: ["up", -90], sharp_left: ["up", -135],
  uturn: ["uturn", 0], roundabout: ["loop", 0], arrive: ["flag", 0], via: ["dot", 0],
};

const fmt = (o, units, d = 1) =>
  units === "metric" ? `${o.km.toFixed(d)} km`
  : units === "imperial" ? `${o.mi.toFixed(d)} mi`
  : `${o.mi.toFixed(d)} mi / ${o.km.toFixed(d)} km`;

// pick n evenly spaced points along the route line for the weather lookup
function sample(coords, n = 6) {
  if (coords.length <= n) return coords.map(([lat, lng]) => ({ lat, lng }));
  return Array.from({ length: n }, (_, i) => {
    const [lat, lng] = coords[Math.round(i * (coords.length - 1) / (n - 1))];
    return { lat, lng };
  });
}

const first = t => t.split(",")[0];
const tripKey = h => [h.start.text, ...(h.stops || []).map(s => s.text), h.end.text, h.profile].join("|");

function loadHistory() {
  try {
    const h = JSON.parse(localStorage.getItem("history2") || "[]");
    return Array.isArray(h) ? h : [];
  } catch { return []; }
}

export default function App() {
  const empty = { text: "", place: null };
  const [start, setStart] = useState(empty);
  const [end, setEnd] = useState(empty);
  const [stops, setStops] = useState([]);
  const [profile, setProfile] = useState("car");
  const [units, setUnits] = useState("both");
  const [route, setRoute] = useState(null);
  const [last, setLast] = useState(null);          // the inputs that produced `route` (what Save stores)
  const [weather, setWeather] = useState([]);
  const [wxOn, setWxOn] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [user, setUser] = useState(null);
  const [favs, setFavs] = useState([]);
  const [showAuth, setShowAuth] = useState(false);

  // ----- accounts -----
  function signedIn(u) {
    setUser(u);
    if (u.settings?.units) setUnits(u.settings.units);
    if (u.settings?.profile) setProfile(u.settings.profile);
    getFavorites().then(setFavs).catch(() => {});
  }
  useEffect(() => {
    if (hasToken()) getMe().then(r => signedIn(r.user)).catch(() => setToken(""));
  }, []);
  const onAuth = ({ token, user }) => { setToken(token); signedIn(user); setShowAuth(false); };
  const logout = () => { setToken(""); setUser(null); setFavs([]); };

  const changeUnits = u => { setUnits(u); if (user) saveSettings({ units: u }).catch(() => {}); };
  const changeProfile = p => { setProfile(p); if (user) saveSettings({ profile: p }).catch(() => {}); };

  async function saveFav() {
    if (!user) return setShowAuth(true);
    if (!last) return;
    const name = window.prompt("Name this route:", `${first(last.start.text)} to ${first(last.end.text)}`);
    if (!name || !name.trim()) return;
    try { const f = await addFavorite(name.trim(), last); setFavs(a => [f, ...a]); }
    catch (err) { setError(err.message); }
  }
  const removeFav = id => { deleteFavorite(id).then(() => setFavs(a => a.filter(f => f.id !== id))).catch(() => {}); };

  // ----- routing -----
  async function search(s = start, e = end, p = profile, st = stops) {
    setError(""); setLoading(true); setWeather([]);
    const list = st.filter(x => x.text.trim());
    try {
      // send the picked place (exact coordinates) if there is one, otherwise the typed text
      const r = await getDirections(s.place || s.text, e.place || e.text, p, list.map(x => x.place || x.text));
      setRoute(r);
      const entry = { start: s, stops: list, end: e, profile: p };
      setLast(entry);
      const next = [entry, ...history.filter(h => tripKey(h) !== tripKey(entry))].slice(0, 5);
      setHistory(next);
      try { localStorage.setItem("history2", JSON.stringify(next)); } catch {}
      getWeather(sample(r.coordinates)).then(setWeather).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }

  const setStop = (i, v) => setStops(a => a.map((x, j) => (j === i ? v : x)));
  const addStop = () => setStops(a => [...a, empty]);
  const rmStop = i => setStops(a => a.filter((_, j) => j !== i));
  const swap = () => { setStart(end); setEnd(start); setStops(a => [...a].reverse()); };
  const pick = h => {
    const st = h.stops || [];
    setStart(h.start); setEnd(h.end); setStops(st); setProfile(h.profile);
    search(h.start, h.end, h.profile, st);
  };

  return (
    <div className="app">
      <header className="top">
        <div className="top-in">
          <img src="/logo.png" alt="logo" height="44" /><h1>AutoAssist</h1>
          <div className="acct">
            {user ? (<><span className="mut">{user.email}</span><button className="btn-sm" onClick={logout}>Log out</button></>)
                  : <button className="btn-sm" onClick={() => setShowAuth(true)}><Icon name="user" size={16} />Log in</button>}
          </div>
        </div>
      </header>

      <div className="layout">
        <aside className="panel">
          <h2 className="panel-title">Plan a route</h2>
          <p className="panel-sub">Choose a start, a destination and how you are travelling.</p>
          <form onSubmit={ev => { ev.preventDefault(); search(); }}>
            <PlaceInput label="From" dot="start" placeholder="Search a city or place"
                        value={start} onChange={setStart} />
            <button type="button" className="swap" onClick={swap} title="Swap places" aria-label="Swap places"><Icon name="swap" size={16} /></button>

            {stops.map((s, i) => (
              <div className="stop-row" key={i}>
                <PlaceInput label={`Stop ${i + 1}`} dot="stop" placeholder="Search a city or place"
                            value={s} onChange={v => setStop(i, v)} />
                <button type="button" className="rm" onClick={() => rmStop(i)} aria-label={`Remove stop ${i + 1}`}><Icon name="x" size={14} /></button>
              </div>
            ))}
            {stops.length < MAX_STOPS && (
              <button type="button" className="add-stop" onClick={addStop}><Icon name="plus" size={16} />Add stop</button>
            )}

            <PlaceInput label="To" dot="end" placeholder="Search a city or place"
                        value={end} onChange={setEnd} />

            <span className="field-label">Travel by</span>
            <div className="seg" role="group" aria-label="Vehicle">
              {PROFILES.map(p => (
                <button type="button" key={p.id} className={profile === p.id ? "on" : ""} onClick={() => changeProfile(p.id)}>
                  <Icon name={p.icon} size={22} />{p.label}
                </button>
              ))}
            </div>
            <button className="go" disabled={loading || !start.text.trim() || !end.text.trim()}>
              {loading ? "Finding route…" : "Get directions"}
            </button>
          </form>

          {error && <div className="error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}

          {user && (
            <div className="history">
              <div className="history-head"><h3>Favorite routes</h3></div>
              {favs.length === 0 && <p className="mut small-note">Run a route, then press Save.</p>}
              {favs.map(f => (
                <div className="fav" key={f.id}>
                  <button onClick={() => pick(f.data)}>
                    <Icon name="star" size={16} /><span className="h-text">{f.name}</span>
                  </button>
                  <button className="del" onClick={() => removeFav(f.id)} aria-label={`Delete ${f.name}`}><Icon name="x" size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {history.length > 0 && (
            <div className="history">
              <div className="history-head"><h3>Recent trips</h3>
                <button className="link" onClick={() => { setHistory([]); try { localStorage.removeItem("history2"); } catch {} }}>Clear</button>
              </div>
              {history.map((h, i) => (
                <button key={i} onClick={() => pick(h)}>
                  <Icon name={PROFILES.find(p => p.id === h.profile)?.icon} size={16} />
                  <span className="h-text">{first(h.start.text)} to {first(h.end.text)}{(h.stops || []).length ? ` (+${h.stops.length})` : ""}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main>
          <div className="map-card"><MapView route={route} weather={wxOn ? weather : []} units={units} />
            {!route && <div className="map-hint">Search two places to see your route</div>}
          </div>
          {route && (
            <section className="result">
              <div className="result-head">
                <h2>{first(route.origin.label)}<span className="to">to</span>{first(route.destination.label)}
                  {route.waypoints?.length > 0 && <span className="to">· {route.waypoints.length} stop{route.waypoints.length > 1 ? "s" : ""}</span>}
                </h2>
                <div className="tools">
                  <button className={"chip" + (wxOn ? " on" : "")} onClick={() => setWxOn(v => !v)} title="Toggle weather overlay">
                    <Icon name="cloud" size={16} />Weather
                  </button>
                  <button className="chip" onClick={saveFav} title="Save as favorite"><Icon name="star" size={16} />Save</button>
                  <div className="seg small">
                    {UNITS.map(([id, l]) => <button key={id} className={units === id ? "on" : ""} onClick={() => changeUnits(id)}>{l}</button>)}
                  </div>
                </div>
              </div>
              <div className="stats">
                <div><span>Distance</span><b>{fmt({ km: route.distance_km, mi: route.distance_mi }, units)}</b></div>
                <div><span>Duration</span><b>{route.duration}</b></div>
                {route.ascend_m != null && <div><span>Climb / descent</span><b>{Math.round(route.ascend_m)} m / {Math.round(route.descend_m)} m</b></div>}
              </div>
              <table>
                <thead><tr><th></th><th>Instruction</th><th>Distance</th><th>Time</th></tr></thead>
                <tbody>
                  {route.instructions.map((i, n) => (
                    <tr key={n}>
                      <td className="arrow">{(t => <Icon name={t[0]} rotate={t[1]} />)(TURN[i.sign] || TURN.straight)}</td>
                      <td>{i.text}</td>
                      <td>{fmt({ km: i.distance_km, mi: i.distance_mi }, units, 2)}</td>
                      <td className="mut">{i.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </main>
      </div>
      <footer>Route data © OpenStreetMap contributors. Directions by Graphhopper. Weather by Open-Meteo.</footer>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuth={onAuth} />}
    </div>
  );
}