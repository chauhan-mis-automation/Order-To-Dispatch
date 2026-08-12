import React, { useState } from "react";
import { ShieldCheck, X, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

/**
 * Authentication popup — shown when the user tries to create an order
 * without being logged in yet. Verifies against the login_user() RPC
 * (which checks the hashed password server-side and never exposes it).
 */
export default function AuthModal({
  open,
  onClose,
  onSuccess,
  title = "Authentication Required",
  subtitle = "Please login to access Order creation.",
  submitLabel = "Login",
}) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!userId.trim() || !password.trim()) {
      setError("User ID and Password are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("login_user", {
        p_username: userId.trim(),
        p_password: password,
      });
      if (rpcError) throw rpcError;

      if (!data || data.length === 0) {
        setError("Invalid ID or Password.");
        setLoading(false);
        return;
      }

      const user = data[0];
      setUserId("");
      setPassword("");
      setLoading(false);
      onSuccess({ name: user.name, username: user.username, roles: user.roles });
    } catch (err) {
      setError(err.message || "Connection error.");
      setLoading(false);
    }
  }

  return (
    <div className="am-overlay" onClick={onClose}>
      <div className="am-card" onClick={(e) => e.stopPropagation()}>
        <button className="am-close" onClick={onClose}>
          <X size={16} />
        </button>

        <div className="am-icon">
          <ShieldCheck size={26} />
        </div>
        <h4>{title}</h4>
        <p className="am-sub">{subtitle}</p>

        <form onSubmit={handleSubmit}>
          <label className="am-label">User ID</label>
          <input
            className="am-input"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Enter ID"
            autoFocus
          />

          <label className="am-label">Password</label>
          <input
            className="am-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter Password"
          />

          {error && <div className="am-error">{error}</div>}

          <button className="am-submit" type="submit" disabled={loading}>
            {loading ? <Loader2 size={15} className="am-spin" /> : null}
            {loading ? "Verifying..." : submitLabel}
          </button>
        </form>
      </div>

      <style>{`
        .am-overlay {
          position: fixed; inset: 0; background: rgba(12,13,20,0.5);
          backdrop-filter: blur(3px); z-index: 300;
          display: flex; align-items: center; justify-content: center;
          animation: am-fade 0.18s ease; padding: 16px;
        }
        @keyframes am-fade { from { opacity: 0; } to { opacity: 1; } }
        .am-card {
          position: relative; width: 100%; max-width: 360px; background: #fff;
          border-radius: 20px; box-shadow: 0 24px 60px rgba(10,11,20,0.28);
          padding: 32px 28px 28px 28px; text-align: center;
          animation: am-pop 0.2s cubic-bezier(.2,.8,.3,1);
        }
        @keyframes am-pop { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .am-close {
          position: absolute; top: 14px; right: 14px; border: none; background: #f1f2f6;
          width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center;
          justify-content: center; cursor: pointer; color: #5b5f72;
        }
        .am-icon {
          width: 54px; height: 54px; border-radius: 50%; margin: 0 auto 14px auto;
          background: #fdf3e4; color: #b5620f; display: flex; align-items: center; justify-content: center;
        }
        .am-card h4 { margin: 0 0 6px 0; font-family: 'Space Grotesk', sans-serif; font-size: 17px; color: #1c1e26; }
        .am-sub { margin: 0 0 20px 0; font-size: 12.5px; color: #8a8da0; }
        .am-label { display: block; text-align: left; font-size: 12px; font-weight: 700; color: #5b5f72; margin-bottom: 5px; }
        .am-input {
          width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px;
          padding: 10px 13px; font-size: 13.5px; outline: none; margin-bottom: 14px;
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .am-input:focus { border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
        .am-error { background: #fdeceb; color: #c23c33; font-size: 12.5px; font-weight: 600; padding: 9px 12px; border-radius: 9px; margin-bottom: 14px; text-align: left; }
        .am-submit {
          width: 100%; border: none; display: flex; align-items: center; justify-content: center; gap: 8px;
          background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a;
          padding: 12px; border-radius: 11px; font-weight: 700; font-size: 14px; cursor: pointer;
          box-shadow: 0 6px 16px rgba(245,166,35,0.28);
        }
        .am-submit:disabled { opacity: 0.7; cursor: not-allowed; }
        .am-spin { animation: am-spin-anim 0.9s linear infinite; }
        @keyframes am-spin-anim { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
