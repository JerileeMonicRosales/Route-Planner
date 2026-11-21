import { useEffect, useState } from "react";
import Swal from "sweetalert2";
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

const temp = (c, units) =>
  c == null ? "–" : units === "imperial" ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`;
const wind = (kmh, units) =>
  kmh == null ? "–" : units === "imperial" ? `${Math.round(kmh / 1.609)} mph` : `${Math.round(kmh)} km/h`;

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

// which part of the route line a direction step covers: [firstIndex, lastIndex]
function stepRange(route, n) {
  const iv = route.instructions[n].interval;
  if (iv) return iv;                                   // exact range from Graphhopper
  // fallback: walk the route line by distance
  const c = route.coordinates, ins = route.instructions;
  const hav = ([la1, lo1], [la2, lo2]) => {
    const r = Math.PI / 180, R = 6371000, dl = (la2 - la1) * r, dn = (lo2 - lo1) * r;
    const x = Math.sin(dl / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dn / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };
  let startD = 0;
  for (let k = 0; k < n; k++) startD += ins[k].distance_m;
  const endD = startD + ins[n].distance_m;
  let d = 0, a = -1, b = c.length - 1;
  for (let i = 1; i < c.length; i++) {
    d += hav(c[i - 1], c[i]);
    if (a < 0 && d >= startD) a = i - 1;
    if (d >= endD) { b = i; break; }
  }
  if (a < 0) a = c.length - 1;
  return [a, Math.max(a, b)];
}

// escape text before putting it inside a SweetAlert html block
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cute = Swal.mixin({
  confirmButtonColor: "#EE5212",
  cancelButtonColor: "#6E6560",
  iconColor: "#EE5212",
  reverseButtons: true,
  customClass: { popup: "swal-cute" },
});

function loadHistory() {
  try {
    const h = JSON.parse(localStorage.getItem("history2") || "[]");
    return Array.isArray(h) ? h : [];
  } catch { return []; }
}

// ---------- small shared pieces (used on the page AND in the full-screen panel) ----------
function WxCity({ title, name, w, units }) {
  return (
    <div className="wx-city">
      <span className="wx-title">{title}</span>
      <h3>{name}</h3>
      {!w ? <span className="mut">Weather unavailable</span> : (<>
        <div className="wx-main"><Icon name={w.kind} size={34} /><b>{temp(w.temp_c, units)}</b><span>{w.label}</span></div>
        <div className="wx-meta">
          <span>Feels like {temp(w.feels_c, units)}</span>
          <span>High {temp(w.high_c, units)} / Low {temp(w.low_c, units)}</span>
          <span>Wind {wind(w.wind_kmh, units)}</span>
          <span>Humidity {w.humidity ?? "–"}%</span>
        </div>
      </>)}
    </div>
  );
}

function WxCards({ route, cities, units }) {
  if (cities === "loading") return <p className="mut">Loading weather…</p>;
  if (cities === "error") return <p className="mut">Weather is unavailable right now.</p>;
  if (!cities || typeof cities !== "object") return null;
  return (
    <div className="wx-grid">
      <WxCity title="Leaving from" name={first(route.origin.label)} w={cities.origin} units={units} />
      <WxCity title="Arriving in" name={first(route.destination.label)} w={cities.destination} units={units} />
    </div>
  );
}

function Stats({ route, units }) {
  return (
    <div className="stats">
      <div><span>Distance</span><b>{fmt({ km: route.distance_km, mi: route.distance_mi }, units)}</b></div>
      <div><span>Duration</span><b>{route.duration}</b></div>
      {route.ascend_m != null && <div><span>Climb / descent</span><b>{Math.round(route.ascend_m)} m / {Math.round(route.descend_m)} m</b></div>}
    </div>
  );
}

// props for a clickable step row (works for <tr> and <li>)
const stepProps = (i, n, active, onPick) => ({
  className: "clickable" + (active === n ? " active" : ""),
  onClick: () => onPick(n),
  onKeyDown: e => { if (e.key === "Enter") onPick(n); },
  tabIndex: 0,
  title: "Click to zoom to this step",
});

function Steps({ route, units, active, onPick }) {
  return (
    <ol className="steps">
      {route.instructions.map((i, n) => (
        <li key={n} {...stepProps(i, n, active, onPick)}>
          <span className="arrow">{(t => <Icon name={t[0]} rotate={t[1]} />)(TURN[i.sign] || TURN.straight)}</span>
          <span>{i.text}</span>
          <span className="mut">{fmt({ km: i.distance_km, mi: i.distance_mi }, units, 2)}<small>{i.duration}</small></span>
        </li>
      ))}
    </ol>
  );
}

const VehicleSeg = ({ profile, onChange }) => (
  <div className="seg" role="group" aria-label="Vehicle">
    {PROFILES.map(p => (
      <button type="button" key={p.id} className={profile === p.id ? "on" : ""} onClick={() => onChange(p.id)}>
        <Icon name={p.icon} size={22} />{p.label}
      </button>
    ))}
  </div>
);

const UnitsSeg = ({ units, onChange }) => (
  <div className="seg small">
    {UNITS.map(([id, l]) => <button type="button" key={id} className={units === id ? "on" : ""} onClick={() => onChange(id)}>{l}</button>)}
  </div>
);

export default function App() {
  const empty = { text: "", place: null };
  const [start, setStart] = useState(empty);
  const [end, setEnd] = useState(empty);
  const [stops, setStops] = useState([]);
  const [profile, setProfile] = useState("car");
  const [units, setUnits] = useState("both");
  const [route, setRoute] = useState(null);
  const [last, setLast] = useState(null);          // the inputs that produced `route` (what Save / vehicle switch reuse)
  const [weather, setWeather] = useState([]);      // points along the route (map overlay)
  const [cities, setCities] = useState(null);      // null | "loading" | "error" | {origin, destination}
  const [wxOn, setWxOn] = useState(true);
  const [full, setFull] = useState(false);         // full-screen map + directions panel
  const [focus, setFocus] = useState(null);        // clicked step: { n, coords, key } or null
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [user, setUser] = useState(null);
  const [favs, setFavs] = useState([]);
  const [showAuth, setShowAuth] = useState(false);

  // Esc closes full screen; lock page scroll while it is open
  useEffect(() => {
    if (!full) return;
    const onKey = e => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [full]);

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
  // picking a vehicle re-runs the current route so the steps update right away
  const changeProfile = p => {
    setProfile(p);
    if (user) saveSettings({ profile: p }).catch(() => {});
    if (last) search(last.start, last.end, p, last.stops);
  };

  // ----- click a direction step: zoom the map to that street -----
  function focusStep(n) {
    if (!route) return;
    const [a, b] = stepRange(route, n);
    const coords = route.coordinates.slice(a, b + 1);
    if (!coords.length) return;
    setFocus({ n, coords, key: Date.now() });
    if (!full) document.getElementById("route-map")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ----- favorites (with SweetAlert popups) -----
  async function saveFav() {
    if (!user) return setShowAuth(true);
    if (!last) return;
    const names = [last.start, ...last.stops, last.end].map(p => esc(first(p.text)));
    const label = PROFILES.find(p => p.id === last.profile)?.label.toLowerCase();
    const { isConfirmed, value } = await cute.fire({
      icon: "question",
      title: "Save this route?",
      html: `<div class="swal-route">${names.join(" &rarr; ")}<br><small>by ${label}</small></div>`,
      input: "text",
      inputLabel: "Give it a name",
      inputValue: `${first(last.start.text)} to ${first(last.end.text)}`,
      inputAttributes: { maxlength: 80 },
      showCancelButton: true,
      confirmButtonText: "Save route",
      cancelButtonText: "Not now",
      inputValidator: v => (!v || !v.trim() ? "Please enter a name" : undefined),
    });
    if (!isConfirmed) return;
    try {
      const f = await addFavorite(value.trim(), last);
      setFavs(a => [f, ...a]);
      cute.fire({ icon: "success", title: "Saved!", text: `"${f.name}" is now in your favorites.`, timer: 1800, timerProgressBar: true, showConfirmButton: false });
    } catch (err) {
      cute.fire({ icon: "error", title: "Couldn't save", text: err.message });
    }
  }

  async function removeFav(f) {
    const { isConfirmed } = await cute.fire({
      icon: "warning",
      title: "Remove favorite?",
      text: `"${f.name}" will be deleted.`,
      showCancelButton: true,
      confirmButtonText: "Yes, remove",
      cancelButtonText: "Keep it",
    });
    if (!isConfirmed) return;
    deleteFavorite(f.id).then(() => setFavs(a => a.filter(x => x.id !== f.id))).catch(() => {});
  }

  // ----- routing -----
  async function search(s = start, e = end, p = profile, st = stops) {
    setError(""); setLoading(true); setWeather([]); setCities("loading");
    const list = st.filter(x => x.text.trim());
    try {
      // send the picked place (exact coordinates) if there is one, otherwise the typed text
      const r = await getDirections(s.place || s.text, e.place || e.text, p, list.map(x => x.place || x.text));
      setRoute(r);
      setFocus(null);
      const entry = { start: s, stops: list, end: e, profile: p };
      setLast(entry);
      const next = [entry, ...history.filter(h => tripKey(h) !== tripKey(entry))].slice(0, 5);
      setHistory(next);
      try { localStorage.setItem("history2", JSON.stringify(next)); } catch {}
      // one weather call: [origin city, destination city, ...points along the route]
      const pts = [r.origin, r.destination, ...sample(r.coordinates)].map(({ lat, lng }) => ({ lat, lng }));
      getWeather(pts)
        .then(w => { setCities({ origin: w[0], destination: w[1] }); setWeather(w.slice(2)); })
        .catch(() => setCities("error"));
    } catch (err) {
      setError(err.message); setCities(null);
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
            <VehicleSeg profile={profile} onChange={changeProfile} />
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
                  <button className="del" onClick={() => removeFav(f)} aria-label={`Delete ${f.name}`}><Icon name="x" size={14} /></button>
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
          {/* the SAME map is reused for full screen (CSS class .fs), so nothing reloads */}
          <div id="route-map" className={"map-card" + (full ? " fs" : "")}>
            <MapView route={route} weather={wxOn ? weather : []} units={units} full={full} focus={focus} />
            {!route && <div className="map-hint">Search two places to see your route</div>}
            {route && (
              <button className="fs-btn" onClick={() => setFull(f => !f)}>
                <Icon name={full ? "shrink" : "expand"} size={16} />{full ? "Exit full screen" : "Full screen"}
              </button>
            )}
            {focus && (
              <button className="fs-btn fit-btn" onClick={() => setFocus(null)}>
                <Icon name="pin" size={16} />Whole route
              </button>
            )}
          </div>

          {route && (
            <section className="result wx-card">
              <h2>Weather now</h2>
              <WxCards route={route} cities={cities} units={units} />
            </section>
          )}

          {route && (
            <section className="result">
              <div className="result-head">
                <h2>{first(route.origin.label)}<span className="to">to</span>{first(route.destination.label)}
                  {route.waypoints?.length > 0 && <span className="to">· {route.waypoints.length} stop{route.waypoints.length > 1 ? "s" : ""}</span>}
                  <span className="to">· by {PROFILES.find(p => p.id === route.profile)?.label.toLowerCase()}</span>
                </h2>
                <div className="tools">
                  <button className={"chip" + (wxOn ? " on" : "")} onClick={() => setWxOn(v => !v)} title="Toggle weather overlay">
                    <Icon name="cloud" size={16} />Weather
                  </button>
                  <button className="chip" onClick={saveFav} title="Save as favorite"><Icon name="star" size={16} />Save</button>
                  <UnitsSeg units={units} onChange={changeUnits} />
                </div>
              </div>
              <Stats route={route} units={units} />
              <table>
                <thead><tr><th></th><th>Instruction</th><th>Distance</th><th>Time</th></tr></thead>
                <tbody>
                  {route.instructions.map((i, n) => (
                    <tr key={n} {...stepProps(i, n, focus?.n, focusStep)}>
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

      {/* full-screen left panel: weather on top, directions below */}
      {full && route && (
        <aside className="fs-side">
          <div className="fs-head">
            <h2>{first(route.origin.label)}<span className="to">to</span>{first(route.destination.label)}</h2>
            <button className="chip" onClick={() => setFull(false)}><Icon name="shrink" size={16} />Exit</button>
          </div>
          <VehicleSeg profile={profile} onChange={changeProfile} />
          <UnitsSeg units={units} onChange={changeUnits} />
          <h3 className="sec">Weather now</h3>
          <WxCards route={route} cities={cities} units={units} />
          <Stats route={route} units={units} />
          <h3 className="sec">Directions</h3>
          <Steps route={route} units={units} active={focus?.n} onPick={focusStep} />
        </aside>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuth={onAuth} />}
    </div>
  );
}