import { useState } from "react";
import { login, register } from "./api.js";
import Icon from "./icons.jsx";

export default function AuthModal({ onClose, onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try { onAuth(await (mode === "login" ? login : register)(email, password)); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <form className="modal" onMouseDown={e => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="rm" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        <h2 className="panel-title">{mode === "login" ? "Log in" : "Create account"}</h2>
        <p className="panel-sub">Save favorite routes and keep your settings on any device.</p>
        <span className="field-label">Email</span>
        <div className="input-wrap"><input type="email" value={email} onChange={e => setEmail(e.target.value)}
          autoComplete="email" required style={{ paddingLeft: 14 }} /></div>
        <span className="field-label" style={{ marginTop: 12 }}>Password</span>
        <div className="input-wrap"><input type="password" value={password} onChange={e => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required style={{ paddingLeft: 14 }} /></div>
        {error && <div className="error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}
        <button className="go" style={{ marginTop: 18 }} disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>
        <button type="button" className="link-btn" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
          {mode === "login" ? "No account? Sign up" : "Have an account? Log in"}
        </button>
      </form>
    </div>
  );
}