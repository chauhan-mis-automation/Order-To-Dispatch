import { useEffect, useState, useCallback } from "react";
import Sidebar from "./components/layout/Sidebar";
import Login from "./pages/Login";
import CreateOrder from "./pages/CreateOrder";
import BulkOrderUpload from "./pages/BulkOrderUpload";
import Verification from "./pages/Verification";
import Picking from "./pages/Picking";
import Planning from "./pages/Planning";
import Packing from "./pages/Packing";
import Dispatch from "./pages/Dispatch";
import History from "./pages/History";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import IMS from "./pages/IMS";
import Reports from "./pages/Reports";
import Production from "./pages/Production";
import PurchaseOrders from "./pages/PurchaseOrders";
import { supabase } from "./lib/supabaseClient";

// Every navigable view maps to the role required to see it — Admin always
// bypasses this and sees everything, regardless of their other roles.
export const VIEW_ROLE = {
  dashboard: "Dashboard",
  create_order: "Create Order",
  bulk_order_upload: "Create Order",
  verification: "Verification",
  picking: "Picking",
  planning: "Planning",
  packing: "Packing",
  dispatch: "Dispatch",
  production: "Production",
  history: "History",
  reports: "Reports",
  ims: "Inventory",
  purchase_orders: "Purchase Orders",
  // "users" is intentionally not listed — Admin-only, no role can unlock it.
};

function ComingSoon({ label }) {
  return (
    <div
      style={{
        background: "#fff", border: "1px solid #eceef4", borderRadius: 16, padding: 22,
        minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center",
        color: "#b7b9c6", fontSize: "13.5px", fontWeight: 500,
      }}
    >
      {label} view is coming soon.
    </div>
  );
}

function RestrictedView() {
  return (
    <div
      style={{
        background: "#fff", border: "1px solid #fdeceb", borderRadius: 16, padding: 22,
        minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center",
        color: "#c23c33", fontSize: "13.5px", fontWeight: 600, textAlign: "center",
      }}
    >
      You don't have access to this section. Ask an Admin to grant you the right role in User Management.
    </div>
  );
}

function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [currentUser, setCurrentUser] = useState(null); // name string, null = not logged in
  const [currentUserRoles, setCurrentUserRoles] = useState([]);
  const [navCounts, setNavCounts] = useState({});
  const [editOrderId, setEditOrderId] = useState(null);

  const isAdmin = currentUserRoles.includes("Admin");

  // Admin always has access to everything; everyone else needs the specific
  // role mapped to that view. Views not in VIEW_ROLE (e.g. "users") are
  // Admin-only with no override.
  const canAccess = useCallback(
    (view) => {
      if (isAdmin) return true;
      const requiredRole = VIEW_ROLE[view];
      if (!requiredRole) return false;
      return currentUserRoles.includes(requiredRole);
    },
    [isAdmin, currentUserRoles]
  );

  useEffect(() => {
    if (!currentUser) return;
    async function loadCounts() {
      const [verifRes, pickRes, planRes, packRes, dispRes] = await Promise.all([
        supabase.from("orders").select("*", { count: "exact", head: true }).in("status", ["Pending", "On Hold"]),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "Confirmed"),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "Confirmed").not("plan_dispatch_date", "is", null),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "Picked"),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "Ready to Ship"),
      ]);
      setNavCounts((prev) => ({
        ...prev,
        verification: verifRes.error ? prev.verification : verifRes.count || 0,
        picking: pickRes.error ? prev.picking : pickRes.count || 0,
        planning: planRes.error ? prev.planning : planRes.count || 0,
        packing: packRes.error ? prev.packing : packRes.count || 0,
        dispatch: dispRes.error ? prev.dispatch : dispRes.count || 0,
      }));
    }
    loadCounts();
  }, [activeView, currentUser]);

  function handleNavigate(view) {
    if (view === "create_order") setEditOrderId(null);
    setActiveView(view);
  }

  // Session is already established at login, so this always resolves
  // immediately — kept only so components written against it don't break.
  const requireLogin = useCallback(
    (callback) => {
      if (currentUser) callback(currentUser);
    },
    [currentUser]
  );

  function openEditOrder(orderId) {
    setEditOrderId(orderId);
    setActiveView("create_order");
  }

  function exitEditOrder() {
    setEditOrderId(null);
    setActiveView("verification");
  }

  function handleLoginSuccess(user) {
    setCurrentUser(user.name);
    setCurrentUserRoles(user.roles || []);
    // Land on the first view this user actually has access to, not a
    // hardcoded dashboard they might not be allowed to see.
    const admin = (user.roles || []).includes("Admin");
    const firstAllowed = admin || (user.roles || []).includes("Dashboard")
      ? "dashboard"
      : Object.keys(VIEW_ROLE).find((v) => (user.roles || []).includes(VIEW_ROLE[v])) || "dashboard";
    setActiveView(firstAllowed);
  }

  function handleLogout() {
    setCurrentUser(null);
    setCurrentUserRoles([]);
    setEditOrderId(null);
    setActiveView("dashboard");
  }

  if (!currentUser) {
    return <Login onSuccess={handleLoginSuccess} />;
  }

  let pageContent;
  if (!canAccess(activeView) && activeView !== "users") {
    pageContent = <RestrictedView />;
  } else if (activeView === "create_order") {
    pageContent = <CreateOrder currentUser={currentUser} editOrderId={editOrderId} onExitEdit={exitEditOrder} />;
  } else if (activeView === "bulk_order_upload") {
    pageContent = <BulkOrderUpload currentUser={currentUser} />;
  } else if (activeView === "dashboard") {
    pageContent = <Dashboard />;
  } else if (activeView === "verification") {
    pageContent = <Verification currentUser={currentUser} onEditOrder={openEditOrder} />;
  } else if (activeView === "picking") {
    pageContent = <Picking currentUser={currentUser} />;
  } else if (activeView === "planning") {
    pageContent = <Planning currentUser={currentUser} />;
  } else if (activeView === "packing") {
    pageContent = <Packing />;
  } else if (activeView === "dispatch") {
    pageContent = <Dispatch currentUser={currentUser} requireLogin={requireLogin} />;
  } else if (activeView === "history") {
    pageContent = <History />;
  } else if (activeView === "reports") {
    pageContent = <Reports />;
  } else if (activeView === "users") {
    pageContent = isAdmin ? <Users /> : <RestrictedView />;
  } else if (activeView === "production") {
    pageContent = <Production currentUser={currentUser} />;
  } else if (activeView === "ims") {
    pageContent = <IMS />;
  } else if (activeView === "purchase_orders") {
    pageContent = <PurchaseOrders currentUser={currentUser} />;
  } else {
    pageContent = <ComingSoon label={activeView} />;
  }

  return (
    <Sidebar
      activeView={activeView}
      onNavigate={handleNavigate}
      currentUser={currentUser}
      onLogout={handleLogout}
      counts={navCounts}
      isAdmin={isAdmin}
      canAccess={canAccess}
    >
      {pageContent}
    </Sidebar>
  );
}

export default App;
