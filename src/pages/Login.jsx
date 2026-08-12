import React, { useState } from "react";
import {
  ShieldCheck, Loader2, Boxes, CheckCircle2, FlaskConical,
  ShoppingBasket, CalendarClock, PackageCheck, Truck,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const PIPELINE_STAGES = [
  { label: "Verification", icon: CheckCircle2 },
  { label: "Indent", icon: FlaskConical },
  { label: "Picking", icon: ShoppingBasket },
  { label: "Planning", icon: CalendarClock },
  { label: "Packing", icon: PackageCheck },
  { label: "Dispatch", icon: Truck },
];

export default function Login({ onSuccess }) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      onSuccess({ name: user.name, username: user.username, roles: user.roles });
    } catch (err) {
      setError(err.message || "Connection error.");
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');

        .login-root {
          min-height: 100vh;
          width: 100%;
          display: flex;
          font-family: 'Inter', sans-serif;
          background: linear-gradient(135deg, #14161f 0%, #1b1e2c 45%, #201a2e 100%);
          position: relative;
          overflow: hidden;
        }
        .login-root::before {
          content: '';
          position: absolute; inset: 0;
          background-image:
            radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0);
          background-size: 26px 26px;
          pointer-events: none;
        }
        .login-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          pointer-events: none;
        }
        .login-orb-1 {
          top: -12%; right: -6%; width: 46%; height: 55%;
          background: radial-gradient(circle, rgba(245,166,35,0.32) 0%, transparent 70%);
          animation: login-float-1 9s ease-in-out infinite;
        }
        .login-orb-2 {
          bottom: -18%; left: -8%; width: 42%; height: 50%;
          background: radial-gradient(circle, rgba(29,95,199,0.28) 0%, transparent 70%);
          animation: login-float-2 11s ease-in-out infinite;
        }
        .login-orb-3 {
          top: 30%; left: 38%; width: 26%; height: 34%;
          background: radial-gradient(circle, rgba(139,63,214,0.18) 0%, transparent 70%);
          animation: login-float-3 13s ease-in-out infinite;
        }
        @keyframes login-float-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-18px, 22px) scale(1.08); }
        }
        @keyframes login-float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, -18px) scale(1.06); }
        }
        @keyframes login-float-3 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.7; }
          50% { transform: translate(-14px, -14px) scale(1.15); opacity: 1; }
        }

        .login-brand-side {
          flex: 1.1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 60px 70px;
          color: #f4f5f8;
          position: relative;
          z-index: 1;
        }
        .login-brand-mark {
          width: 54px; height: 54px; border-radius: 15px;
          background: linear-gradient(145deg, #f5a623, #c9791a);
          display: flex; align-items: center; justify-content: center;
          color: #16130a; margin-bottom: 26px;
          box-shadow: 0 8px 24px rgba(245,166,35,0.3);
          animation: login-fade-up 0.6s cubic-bezier(.2,.8,.3,1) 0.05s both, login-bob 4s ease-in-out 0.8s infinite;
        }
        @keyframes login-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes login-fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .login-brand-title {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700; font-size: 34px; letter-spacing: -0.01em; margin: 0 0 10px 0;
          animation: login-fade-up 0.6s cubic-bezier(.2,.8,.3,1) 0.15s both;
        }
        .login-brand-sub {
          font-size: 15px; color: #a7abc0; max-width: 380px; line-height: 1.6; margin: 0;
          animation: login-fade-up 0.6s cubic-bezier(.2,.8,.3,1) 0.25s both;
        }
        .login-brand-tags { display: flex; gap: 10px; margin-top: 32px; flex-wrap: wrap; animation: login-fade-up 0.6s cubic-bezier(.2,.8,.3,1) 0.35s both; }
        .login-tag {
          font-size: 11.5px; font-weight: 700; color: #ffcd80; background: rgba(245,166,35,0.14);
          border: 1px solid rgba(245,166,35,0.28); padding: 6px 14px; border-radius: 999px;
          transition: transform .2s ease, background .2s ease;
        }
        .login-tag:hover { transform: translateY(-2px); background: rgba(245,166,35,0.22); }

        .login-form-side {
          flex: 1;
          min-width: 380px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          position: relative;
          z-index: 1;
        }
        .login-form-side::before {
          content: '';
          position: absolute;
          width: 460px; height: 460px;
          background: radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%);
          pointer-events: none;
        }

        .login-pipeline {
          position: relative;
          flex: 0 0 170px;
          display: none;
          flex-direction: column;
          justify-content: center;
          gap: 22px;
          z-index: 1;
          padding: 0 10px;
        }
        .login-pipeline-line {
          position: absolute;
          left: 15px; top: 8px; bottom: 8px;
          width: 2px;
          background: linear-gradient(180deg, rgba(245,166,35,0.05), rgba(255,255,255,0.14) 10%, rgba(255,255,255,0.14) 90%, rgba(245,166,35,0.05));
        }
        .login-pipeline-step {
          display: flex; align-items: center; gap: 12px;
          opacity: 0; transform: translateX(-10px);
          animation: login-step-in 0.5s cubic-bezier(.2,.8,.3,1) forwards;
        }
        @keyframes login-step-in { to { opacity: 1; transform: translateX(0); } }
        .login-pipeline-dot {
          position: relative;
          width: 32px; height: 32px; min-width: 32px; border-radius: 50%;
          background: rgba(245,166,35,0.14); border: 1.5px solid rgba(245,166,35,0.35);
          color: #ffcd80;
          display: flex; align-items: center; justify-content: center;
          animation: login-dot-pulse 2.4s ease-in-out infinite;
        }
        @keyframes login-dot-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,166,35,0.35); }
          50% { box-shadow: 0 0 0 6px rgba(245,166,35,0); }
        }
        .login-pipeline-label { font-size: 12.5px; font-weight: 600; color: #c7cadb; white-space: nowrap; }

        @media (min-width: 1150px) {
          .login-pipeline { display: flex; }
        }
        .login-card {
          width: 100%; max-width: 360px; background: #ffffff; border-radius: 22px;
          padding: 40px 32px; box-shadow: 0 30px 70px rgba(0,0,0,0.4);
          animation: login-pop 0.35s cubic-bezier(.2,.8,.3,1);
        }
        @keyframes login-pop { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .login-card-icon {
          width: 50px; height: 50px; border-radius: 50%; margin: 0 auto 16px auto;
          background: #fdf3e4; color: #b5620f; display: flex; align-items: center; justify-content: center;
        }
        .login-card h2 {
          margin: 0 0 6px 0; text-align: center; font-family: 'Space Grotesk', sans-serif;
          font-size: 21px; color: #1c1e26;
        }
        .login-card-sub { text-align: center; font-size: 13px; color: #8a8da0; margin: 0 0 26px 0; }
        .login-label { display: block; font-size: 12.5px; font-weight: 700; color: #5b5f72; margin-bottom: 7px; }
        .login-input {
          width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 12px;
          padding: 13px 15px; font-size: 14px; outline: none; margin-bottom: 16px;
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .login-input:focus { border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
        .login-error { background: #fdeceb; color: #c23c33; font-size: 12.5px; font-weight: 600; padding: 10px 13px; border-radius: 10px; margin-bottom: 16px; }
        .login-submit {
          width: 100%; border: none; display: flex; align-items: center; justify-content: center; gap: 8px;
          background: linear-gradient(135deg, #f5c343, #f5a623); color: #17130a;
          padding: 14px; border-radius: 12px; font-weight: 700; font-size: 14.5px; cursor: pointer;
          box-shadow: 0 8px 20px rgba(245,166,35,0.3); transition: transform .15s ease, box-shadow .15s ease;
        }
        .login-submit:hover { transform: translateY(-1px); box-shadow: 0 12px 26px rgba(245,166,35,0.38); }
        .login-submit:disabled { opacity: 0.7; cursor: not-allowed; transform: none; }
        .login-spin { animation: login-spin-anim 0.9s linear infinite; }
        @keyframes login-spin-anim { to { transform: rotate(360deg); } }

        @media (max-width: 900px) {
          .login-brand-side { display: none; }
          .login-form-side { min-width: 0; flex: 1; }
        }
        @media (max-width: 480px) {
          .login-card { padding: 30px 22px; border-radius: 18px; }
        }
      `}</style>

      <div className="login-brand-side">
        <div className="login-brand-mark"><Boxes size={26} strokeWidth={2.4} /></div>
        <h1 className="login-brand-title">O2D FMS</h1>
        <p className="login-brand-sub">
          Order-to-Dispatch factory management — track every order from booking through
          verification, production, picking, packing and dispatch in one place.
        </p>
        <div className="login-brand-tags">
          <span className="login-tag">Order Tracking</span>
          <span className="login-tag">Inventory &amp; BOM</span>
          <span className="login-tag">Dispatch Control</span>
        </div>
      </div>

      <div className="login-pipeline">
        <div className="login-pipeline-line" />
        {PIPELINE_STAGES.map((stage, i) => (
          <div className="login-pipeline-step" key={stage.label} style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
            <span className="login-pipeline-dot" style={{ animationDelay: `${i * 0.35}s` }}>
              <stage.icon size={13} />
            </span>
            <span className="login-pipeline-label">{stage.label}</span>
          </div>
        ))}
      </div>

      <div className="login-form-side">
        <div className="login-card">
          <div className="login-card-icon"><ShieldCheck size={24} /></div>
          <h2>Welcome back</h2>
          <p className="login-card-sub">Login to access O2D FMS</p>

          <form onSubmit={handleSubmit}>
            <label className="login-label">User ID</label>
            <input
              className="login-input"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter your ID"
              autoFocus
            />

            <label className="login-label">Password</label>
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />

            {error && <div className="login-error">{error}</div>}

            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? <Loader2 size={16} className="login-spin" /> : null}
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
