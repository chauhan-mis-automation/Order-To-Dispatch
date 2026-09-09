import React, { useState, useEffect, useRef } from "react";
import {
  LayoutGrid,
  CheckCircle2,
  ShoppingBasket,
  CalendarClock,
  PackageCheck,
  Truck,
  History,
  Plus,
  ChevronLeft,
  Menu,
  X,
  Boxes,
  LogOut,
  Users,
  ShoppingCart,
  UploadCloud,
  Layers,
  Factory,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  O2D FMS — Sidebar Navigation                                       */
/*  Design concept: "control tower" for a plywood/laminate dispatch    */
/*  operation. A vertical pipeline rail literally traces the physical  */
/*  flow of an order — Verification → Picking → Planning → Packing →   */
/*  Dispatch — because that sequence is real, not decorative.          */
/* ------------------------------------------------------------------ */

const PIPELINE = [
  { id: "verification", label: "Verification", icon: CheckCircle2, count: 12 },
  { id: "picking", label: "Picking", icon: ShoppingBasket, count: 7 },
  { id: "planning", label: "Planning", icon: CalendarClock, count: 4 },
  { id: "packing", label: "Packing", icon: PackageCheck, count: 3 },
  { id: "dispatch", label: "Dispatch", icon: Truck, count: 2 },
];

const STANDALONE = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
];

const TAIL = [{ id: "history", label: "History", icon: History }];

export default function Sidebar({ activeView, onNavigate, children, currentUser, onLogout, counts = {}, isAdmin = false }) {
  const isControlled = activeView !== undefined && typeof onNavigate === "function";
  const [internalActive, setInternalActive] = useState("dashboard");
  const active = isControlled ? activeView : internalActive;
  const setActive = isControlled ? onNavigate : setInternalActive;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const railRefs = useRef({});

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [active]);

  const allNavItems = [
    ...STANDALONE,
    ...PIPELINE,
    ...TAIL,
    { id: "create_order", label: "New Order" },
    { id: "bulk_order_upload", label: "Bulk Order Upload" },
    { id: "users", label: "User Management" },
    { id: "production", label: "Production" },
    { id: "ims", label: "Inventory (IMS)" },
    { id: "purchase_orders", label: "Purchase Orders" },
  ];

  return (
    <div className="o2d-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

        .o2d-root {
          --graphite-0: #0e1016;
          --graphite-1: #14161f;
          --graphite-2: #1b1e2a;
          --graphite-border: rgba(255,255,255,0.07);
          --amber: #f5a623;
          --amber-soft: rgba(245,166,35,0.14);
          --amber-glow: rgba(245,166,35,0.55);
          --ink-0: #f4f5f8;
          --ink-1: #a7abc0;
          --ink-2: #656a80;
          --success: #34d399;
          --danger: #f87171;
          font-family: 'Inter', sans-serif;
          position: relative;
          min-height: 100vh;
          width: 100%;
          background: #f6f7fb;
          display: flex;
          overflow: hidden;
        }

        /* ---------- Mobile top bar ---------- */
        .o2d-mobilebar {
          display: none;
        }
        @media (max-width: 900px) {
          .o2d-mobilebar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: fixed;
            top: 0; left: 0; right: 0;
            height: 58px;
            background: var(--graphite-0);
            border-bottom: 1px solid var(--graphite-border);
            padding: 0 16px;
            z-index: 60;
          }
        }
        .o2d-mobile-brand { display:flex; align-items:center; gap:10px; }
        .o2d-mobile-brand span {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          color: var(--ink-0);
          letter-spacing: 0.02em;
          font-size: 15px;
        }
        .o2d-iconbtn {
          background: var(--graphite-2);
          border: 1px solid var(--graphite-border);
          color: var(--ink-0);
          width: 36px; height: 36px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.15s ease;
        }
        .o2d-iconbtn:hover { background: #24273580; transform: translateY(-1px); }
        .o2d-iconbtn:active { transform: scale(0.94); }

        /* ---------- Overlay for mobile drawer ---------- */
        .o2d-overlay {
          position: fixed; inset: 0;
          background: rgba(8,9,13,0.55);
          backdrop-filter: blur(2px);
          z-index: 45;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.28s ease;
        }
        .o2d-overlay.show { opacity: 1; pointer-events: auto; }

        /* ---------- Sidebar shell ---------- */
        .o2d-sidebar {
          position: fixed;
          top: 0; left: 0; bottom: 0;
          width: 264px;
          background: linear-gradient(180deg, var(--graphite-1) 0%, var(--graphite-0) 100%);
          border-right: 1px solid var(--graphite-border);
          display: flex;
          flex-direction: column;
          z-index: 50;
          transition: width 0.32s cubic-bezier(.4,0,.2,1), transform 0.32s cubic-bezier(.4,0,.2,1);
          transform: translateX(0);
        }
        .o2d-sidebar.collapsed { width: 84px; }

        @media (max-width: 900px) {
          .o2d-sidebar {
            width: 272px;
            transform: translateX(-100%);
            box-shadow: 24px 0 48px rgba(0,0,0,0.35);
          }
          .o2d-sidebar.mobile-open { transform: translateX(0); }
          .o2d-sidebar.collapsed { width: 272px; }
        }

        /* ---------- Collapse toggle tab ---------- */
        .o2d-collapse-tab {
          position: absolute;
          top: 84px;
          right: -13px;
          width: 26px; height: 26px;
          border-radius: 50%;
          background: var(--graphite-2);
          border: 1px solid var(--graphite-border);
          display: flex; align-items: center; justify-content: center;
          color: var(--ink-1);
          cursor: pointer;
          z-index: 55;
          transition: transform 0.3s ease, color 0.2s ease, background 0.2s ease;
        }
        .o2d-collapse-tab:hover { color: var(--amber); background: #262a3a; }
        .o2d-collapse-tab.flipped svg { transform: rotate(180deg); }
        .o2d-collapse-tab svg { transition: transform 0.32s ease; }
        @media (max-width: 900px) { .o2d-collapse-tab { display: none; } }

        /* ---------- Brand header ---------- */
        .o2d-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 22px 20px 18px 20px;
          white-space: nowrap;
        }
        .o2d-brand-mark {
          width: 38px; height: 38px;
          min-width: 38px;
          border-radius: 11px;
          background: linear-gradient(145deg, var(--amber), #c9791a);
          display: flex; align-items: center; justify-content: center;
          color: #16130a;
          box-shadow: 0 4px 14px rgba(245,166,35,0.35);
        }
        .o2d-brand-text { overflow: hidden; transition: opacity 0.2s ease, width 0.3s ease; }
        .o2d-sidebar.collapsed .o2d-brand-text { opacity: 0; width: 0; }
        .o2d-brand-title {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: 16.5px;
          color: var(--ink-0);
          letter-spacing: 0.01em;
          line-height: 1.1;
        }
        .o2d-brand-sub {
          font-size: 10.5px;
          color: var(--ink-2);
          text-transform: uppercase;
          letter-spacing: 0.14em;
          margin-top: 2px;
          font-weight: 600;
        }
        .o2d-mobile-close-btn { display: none; }
        @media (max-width: 900px) {
          .o2d-mobile-close-btn { display: flex; }
        }

        /* ---------- New order CTA ---------- */
        .o2d-cta-wrap { padding: 4px 16px 18px 16px; }
        .o2d-cta {
          width: 100%;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: linear-gradient(135deg, var(--amber), #e0951f);
          color: #17130a;
          border: none;
          border-radius: 12px;
          padding: 12px 14px;
          font-weight: 700;
          font-size: 13.5px;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          box-shadow: 0 6px 16px rgba(245,166,35,0.25);
          transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
        }
        .o2d-cta:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(245,166,35,0.38); filter: brightness(1.04); }
        .o2d-cta:active { transform: translateY(0px) scale(0.98); }
        .o2d-sidebar.collapsed .o2d-cta span { display: none; }
        .o2d-sidebar.collapsed .o2d-cta { padding: 12px; }

        .o2d-bulk-btn {
          width: 100%; margin-top: 8px;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          background: transparent; color: #c7cadb;
          border: 1px dashed rgba(255,255,255,0.18);
          border-radius: 10px;
          padding: 9px 12px;
          font-weight: 600;
          font-size: 12px;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .o2d-bulk-btn:hover { background: rgba(245,166,35,0.08); border-color: rgba(245,166,35,0.4); color: #ffcd80; }
        .o2d-sidebar.collapsed .o2d-bulk-btn span { display: none; }
        .o2d-sidebar.collapsed .o2d-bulk-btn { padding: 9px; }

        /* ---------- Nav sections ---------- */
        .o2d-nav {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 4px 14px 14px 14px;
        }
        .o2d-nav::-webkit-scrollbar { width: 5px; }
        .o2d-nav::-webkit-scrollbar-thumb { background: #2a2e3d; border-radius: 10px; }

        .o2d-section-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-2);
          padding: 14px 10px 8px 10px;
          white-space: nowrap;
          overflow: hidden;
          transition: opacity 0.2s ease;
        }
        .o2d-sidebar.collapsed .o2d-section-label { opacity: 0; height: 0; padding: 6px 0 0 0; }

        /* ---------- Standalone item (Dashboard) ---------- */
        .o2d-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          color: var(--ink-1);
          cursor: pointer;
          margin-bottom: 3px;
          border: 1px solid transparent;
          transition: background 0.18s ease, color 0.18s ease, transform 0.15s ease;
        }
        .o2d-item:hover { background: rgba(255,255,255,0.045); color: var(--ink-0); }
        .o2d-item:active { transform: scale(0.985); }
        .o2d-item.is-active {
          background: var(--amber-soft);
          color: #ffcd80;
          border-color: rgba(245,166,35,0.28);
        }
        .o2d-item-icon {
          min-width: 20px;
          display: flex; align-items: center; justify-content: center;
        }
        .o2d-item-label {
          font-size: 13.5px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: opacity 0.2s ease;
        }
        .o2d-sidebar.collapsed .o2d-item-label,
        .o2d-sidebar.collapsed .o2d-item-count { opacity: 0; width: 0; }

        .o2d-item-count {
          margin-left: auto;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          font-weight: 600;
          color: var(--ink-2);
          background: rgba(255,255,255,0.05);
          padding: 2px 7px;
          border-radius: 20px;
          transition: color 0.18s ease, background 0.18s ease;
        }
        .o2d-item.is-active .o2d-item-count {
          color: #ffcd80;
          background: rgba(245,166,35,0.18);
        }

        /* ---------- Pipeline rail (signature element) ---------- */
        .o2d-pipeline {
          position: relative;
          padding-left: 22px;
          margin-top: 2px;
        }
        .o2d-pipeline-rail {
          position: absolute;
          left: 21px;
          top: 8px;
          bottom: 8px;
          width: 2px;
          background: linear-gradient(180deg, rgba(245,166,35,0.05), rgba(255,255,255,0.09) 8%, rgba(255,255,255,0.09) 92%, rgba(245,166,35,0.05));
          transition: opacity 0.2s ease;
        }
        .o2d-sidebar.collapsed .o2d-pipeline { padding-left: 0; }
        .o2d-sidebar.collapsed .o2d-pipeline-rail { display: none; }

        .o2d-stage {
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 9px 12px 9px 10px;
          border-radius: 10px;
          color: var(--ink-1);
          cursor: pointer;
          margin-bottom: 2px;
          border: 1px solid transparent;
          transition: background 0.18s ease, color 0.18s ease, transform 0.15s ease;
        }
        .o2d-stage:hover { background: rgba(255,255,255,0.045); color: var(--ink-0); }
        .o2d-stage:active { transform: scale(0.985); }
        .o2d-stage.is-active {
          background: var(--amber-soft);
          color: #ffcd80;
          border-color: rgba(245,166,35,0.28);
        }

        .o2d-stage-dot {
          position: relative;
          min-width: 9px; width: 9px; height: 9px;
          border-radius: 50%;
          background: #3a3f52;
          border: 2px solid var(--graphite-0);
          box-shadow: 0 0 0 1px rgba(255,255,255,0.06);
          transition: background 0.25s ease, box-shadow 0.25s ease;
          margin-left: -22px;
        }
        .o2d-sidebar.collapsed .o2d-stage-dot { display: none; }
        .o2d-stage.is-active .o2d-stage-dot {
          background: var(--amber);
          box-shadow: 0 0 0 4px rgba(245,166,35,0.18);
        }
        .o2d-stage.is-active .o2d-stage-dot::after {
          content: '';
          position: absolute;
          inset: -5px;
          border-radius: 50%;
          border: 1.5px solid var(--amber-glow);
          animation: o2d-pulse 1.8s ease-out infinite;
        }
        @keyframes o2d-pulse {
          0% { transform: scale(0.7); opacity: 0.9; }
          100% { transform: scale(2.1); opacity: 0; }
        }

        .o2d-stage-icon {
          min-width: 18px;
          display: flex; align-items: center; justify-content: center;
        }
        .o2d-stage-label {
          font-size: 13.5px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: opacity 0.2s ease;
        }
        .o2d-sidebar.collapsed .o2d-stage-label,
        .o2d-sidebar.collapsed .o2d-stage-count { opacity: 0; width: 0; }
        .o2d-stage-count {
          margin-left: auto;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          font-weight: 600;
          color: var(--ink-2);
          background: rgba(255,255,255,0.05);
          padding: 2px 7px;
          border-radius: 20px;
        }
        .o2d-stage.is-active .o2d-stage-count { color: #ffcd80; background: rgba(245,166,35,0.18); }

        /* stagger-in animation on mount */
        .o2d-anim-item {
          opacity: 0;
          transform: translateX(-8px);
          animation: o2d-slide-in 0.42s cubic-bezier(.2,.7,.3,1) forwards;
        }
        @keyframes o2d-slide-in {
          to { opacity: 1; transform: translateX(0); }
        }

        /* ---------- Footer / user ---------- */
        .o2d-footer {
          border-top: 1px solid var(--graphite-border);
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 11px;
        }
        .o2d-avatar {
          min-width: 36px; width: 36px; height: 36px;
          border-radius: 10px;
          background: var(--graphite-2);
          border: 1px solid var(--graphite-border);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: 13px;
          color: var(--amber);
        }
        .o2d-footer-text { overflow: hidden; transition: opacity 0.2s ease; flex: 1; }
        .o2d-sidebar.collapsed .o2d-footer-text { opacity: 0; width: 0; }
        .o2d-footer-name { font-size: 12.5px; font-weight: 600; color: var(--ink-0); white-space: nowrap; }
        .o2d-footer-role { font-size: 10.5px; color: var(--ink-2); white-space: nowrap; }
        .o2d-footer-logout {
          min-width: 30px; width: 30px; height: 30px;
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          color: var(--ink-2);
          cursor: pointer;
          transition: background 0.18s ease, color 0.18s ease;
        }
        .o2d-footer-logout:hover { background: rgba(248,113,113,0.12); color: var(--danger); }
        .o2d-sidebar.collapsed .o2d-footer-logout { display: none; }

        /* ---------- Demo main panel ---------- */
        .o2d-main {
          flex: 1;
          min-width: 0;
          margin-left: 264px;
          transition: margin-left 0.32s cubic-bezier(.4,0,.2,1);
          padding: 28px 32px;
          min-height: 100vh;
          overflow-x: hidden;
        }
        .o2d-main.collapsed { margin-left: 84px; }
        @media (max-width: 900px) {
          .o2d-main { margin-left: 0; padding: 74px 18px 28px 18px; }
          .o2d-main.collapsed { margin-left: 0; }
        }
        .o2d-main-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 22px; flex-wrap: wrap; gap: 12px;
        }
        .o2d-main-title {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: 24px;
          color: #191b23;
        }
        .o2d-main-eyebrow {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #9a9db0;
          margin-bottom: 4px;
        }
        .o2d-search {
          display: flex; align-items: center; gap: 8px;
          background: #fff;
          border: 1px solid #e4e6ee;
          border-radius: 999px;
          padding: 9px 16px;
          min-width: 240px;
          color: #9a9db0;
          box-shadow: 0 1px 2px rgba(20,22,30,0.03);
        }
        .o2d-search input { border: none; outline: none; font-size: 13px; width: 100%; font-family: 'Inter', sans-serif; }

        .o2d-card {
          background: #fff;
          border: 1px solid #eceef4;
          border-radius: 16px;
          padding: 22px;
          min-height: 300px;
          display: flex; align-items: center; justify-content: center;
          color: #b7b9c6;
          font-size: 13.5px;
          font-weight: 500;
        }
      `}</style>

      {/* Mobile top bar */}
      <div className="o2d-mobilebar">
        <div className="o2d-mobile-brand">
          <button className="o2d-iconbtn" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <span>O2D FMS</span>
        </div>
        <div className="o2d-avatar" style={{ width: 32, height: 32, minWidth: 32 }}>
          {currentUser ? currentUser.charAt(0).toUpperCase() : ""}
        </div>
      </div>

      {/* Overlay */}
      <div className={`o2d-overlay ${mobileOpen ? "show" : ""}`} onClick={() => setMobileOpen(false)} />

      {/* Sidebar */}
      <aside className={`o2d-sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        <div
          className={`o2d-collapse-tab ${collapsed ? "flipped" : ""}`}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <ChevronLeft size={14} />
        </div>

        <div className="o2d-brand">
          <div className="o2d-brand-mark">
            <Boxes size={20} strokeWidth={2.4} />
          </div>
          <div className="o2d-brand-text">
            <div className="o2d-brand-title">O2D FMS</div>
            <div className="o2d-brand-sub">Dispatch Control</div>
          </div>
          <button className="o2d-iconbtn o2d-mobile-close-btn" style={{ marginLeft: "auto" }} onClick={() => setMobileOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="o2d-cta-wrap">
          <button className="o2d-cta" onClick={() => setActive("create_order")}>
            <Plus size={16} strokeWidth={2.6} />
            <span>New Order</span>
          </button>
          <button className="o2d-bulk-btn" onClick={() => setActive("bulk_order_upload")}>
            <UploadCloud size={14} strokeWidth={2.4} />
            <span>Bulk Upload</span>
          </button>
        </div>

        <nav className="o2d-nav">
          {STANDALONE.map((item, i) => (
            <NavItem
              key={item.id}
              item={item}
              active={active === item.id}
              onClick={() => setActive(item.id)}
              delay={mounted ? i * 40 : 0}
            />
          ))}

          <div className="o2d-section-label">Order Pipeline</div>
          <div className="o2d-pipeline">
            <div className="o2d-pipeline-rail" />
            {PIPELINE.map((item, i) => (
              <StageItem
                key={item.id}
                item={counts[item.id] !== undefined ? { ...item, count: counts[item.id] } : item}
                active={active === item.id}
                onClick={() => setActive(item.id)}
                delay={mounted ? (i + 1) * 45 : 0}
              />
            ))}
          </div>

          <div className="o2d-section-label">Factory Floor</div>
          <NavItem
            item={{ id: "production", label: "Production", icon: Factory }}
            active={active === "production"}
            onClick={() => setActive("production")}
            delay={mounted ? (PIPELINE.length + 1) * 45 : 0}
          />

          <div className="o2d-section-label">Records</div>
          {TAIL.map((item, i) => (
            <NavItem
              key={item.id}
              item={item}
              active={active === item.id}
              onClick={() => setActive(item.id)}
              delay={mounted ? (PIPELINE.length + i + 2) * 40 : 0}
            />
          ))}

          {isAdmin && (
            <>
              <div className="o2d-section-label">Admin</div>
              <NavItem
                item={{ id: "users", label: "User Management", icon: Users }}
                active={active === "users"}
                onClick={() => setActive("users")}
                delay={mounted ? (PIPELINE.length + TAIL.length + 3) * 40 : 0}
              />
              <NavItem
                item={{ id: "ims", label: "Inventory (IMS)", icon: Layers }}
                active={active === "ims"}
                onClick={() => setActive("ims")}
                delay={mounted ? (PIPELINE.length + TAIL.length + 4) * 40 : 0}
              />
              <NavItem
                item={{ id: "purchase_orders", label: "Purchase Orders", icon: ShoppingCart }}
                active={active === "purchase_orders"}
                onClick={() => setActive("purchase_orders")}
                delay={mounted ? (PIPELINE.length + TAIL.length + 8) * 40 : 0}
              />
            </>
          )}
        </nav>

        <div className="o2d-footer">
          <div className="o2d-avatar">{currentUser ? currentUser.charAt(0).toUpperCase() : ""}</div>
          <div className="o2d-footer-text">
            <div className="o2d-footer-name">{currentUser || ""}</div>
            {currentUser && <div className="o2d-footer-role">Logged in</div>}
          </div>
          <div
            className="o2d-footer-logout"
            title={currentUser ? "Logout" : ""}
            onClick={() => currentUser && onLogout && onLogout()}
            style={{ cursor: currentUser ? "pointer" : "default", opacity: currentUser ? 1 : 0.4 }}
          >
            <LogOut size={15} />
          </div>
        </div>
      </aside>

      {/* Demo main content */}
      <main className={`o2d-main ${collapsed ? "collapsed" : ""}`}>
        <div className="o2d-main-header">
          <div>
            <div className="o2d-main-eyebrow">O2D FMS / {active.replace("_", " ")}</div>
            <div className="o2d-main-title">
              {allNavItems.find((n) => n.id === active)?.label || "New Order"}
            </div>
          </div>
        </div>
        {children || <div className="o2d-card">Main content for “{active}” renders here</div>}
      </main>
    </div>
  );
}

function NavItem({ item, active, onClick, delay }) {
  const Icon = item.icon;
  return (
    <div
      className={`o2d-item o2d-anim-item ${active ? "is-active" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
    >
      <span className="o2d-item-icon">
        <Icon size={17} strokeWidth={2.2} />
      </span>
      <span className="o2d-item-label">{item.label}</span>
      {item.count != null && <span className="o2d-item-count">{item.count}</span>}
    </div>
  );
}

function StageItem({ item, active, onClick, delay }) {
  const Icon = item.icon;
  return (
    <div
      className={`o2d-stage o2d-anim-item ${active ? "is-active" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
    >
      <span className="o2d-stage-dot" />
      <span className="o2d-stage-icon">
        <Icon size={16} strokeWidth={2.2} />
      </span>
      <span className="o2d-stage-label">{item.label}</span>
      <span className="o2d-stage-count">{item.count}</span>
    </div>
  );
}
