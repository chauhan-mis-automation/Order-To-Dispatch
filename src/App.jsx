import { useEffect, useState, useCallback } from "react";
import Sidebar from "./components/layout/Sidebar";
import Login from "./pages/Login";
import CreateOrder from "./pages/CreateOrder";
import Verification from "./pages/Verification";
import Indent from "./pages/Indent";
import Picking from "./pages/Picking";
import Planning from "./pages/Planning";
import Packing from "./pages/Packing";
import Dispatch from "./pages/Dispatch";
import History from "./pages/History";
import PPC from "./pages/PPC";
import ProductionFloor from "./pages/Production";
import QC from "./pages/QC";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import RawMaterials from "./pages/RawMaterials";
import FGItems from "./pages/FGItems";
import ItemBOM from "./pages/ItemBOM";
import FGStock from "./pages/FGStock";
import RMStock from "./pages/RMStock";
import PurchaseOrders from "./pages/PurchaseOrders";
import { supabase } from "./lib/supabaseClient";

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
        color: "#c23c33", fontSize: "13.5px", fontWeight: 600,
      }}
    >
      This section is restricted to Admin accounts only.
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

  useEffect(() => {
    if (!currentUser) return;
    async function loadCounts() {
      const [verifRes, indentRes, pickRes, planRes, packRes, dispRes, ppcRes, prodRes, qcRes] = await Promise.all([
        supabase.from("orders").select("*", { count: "exact", head: true }).in("status", ["Pending", "Indent Raised", "On Hold"]),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "Indent Raised"),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "Confirmed"),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "Confirmed").not("plan_dispatch_date", "is", null),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "Picked"),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "Ready to Ship"),
        supabase.from("production_jobs").select("*", { count: "exact", head: true }).eq("status", "Ready to Schedule"),
        supabase.from("production_jobs").select("*", { count: "exact", head: true }).in("status", ["Scheduled", "In Production"]),
        supabase.from("production_jobs").select("*", { count: "exact", head: true }).eq("status", "QC Pending"),
      ]);
      setNavCounts((prev) => ({
        ...prev,
        verification: verifRes.error ? prev.verification : verifRes.count || 0,
        indent: indentRes.error ? prev.indent : indentRes.count || 0,
        picking: pickRes.error ? prev.picking : pickRes.count || 0,
        planning: planRes.error ? prev.planning : planRes.count || 0,
        packing: packRes.error ? prev.packing : packRes.count || 0,
        dispatch: dispRes.error ? prev.dispatch : dispRes.count || 0,
        ppc: ppcRes.error ? prev.ppc : ppcRes.count || 0,
        production_floor: prodRes.error ? prev.production_floor : prodRes.count || 0,
        qc: qcRes.error ? prev.qc : qcRes.count || 0,
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
    setActiveView("dashboard");
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
  if (activeView === "create_order") {
    pageContent = <CreateOrder currentUser={currentUser} editOrderId={editOrderId} onExitEdit={exitEditOrder} />;
  } else if (activeView === "dashboard") {
    pageContent = <Dashboard />;
  } else if (activeView === "verification") {
    pageContent = <Verification currentUser={currentUser} onEditOrder={openEditOrder} />;
  } else if (activeView === "indent") {
    pageContent = <Indent />;
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
  } else if (activeView === "ppc") {
    pageContent = <PPC currentUser={currentUser} />;
  } else if (activeView === "production_floor") {
    pageContent = <ProductionFloor />;
  } else if (activeView === "qc") {
    pageContent = <QC currentUser={currentUser} />;
  } else if (activeView === "users") {
    pageContent = isAdmin ? <Users /> : <RestrictedView />;
  } else if (activeView === "raw_materials") {
    pageContent = isAdmin ? <RawMaterials /> : <RestrictedView />;
  } else if (activeView === "fg_items") {
    pageContent = isAdmin ? <FGItems /> : <RestrictedView />;
  } else if (activeView === "bom_setup") {
    pageContent = isAdmin ? <ItemBOM /> : <RestrictedView />;
  } else if (activeView === "fg_stock") {
    pageContent = isAdmin ? <FGStock /> : <RestrictedView />;
  } else if (activeView === "rm_stock") {
    pageContent = isAdmin ? <RMStock /> : <RestrictedView />;
  } else if (activeView === "purchase_orders") {
    pageContent = isAdmin ? <PurchaseOrders /> : <RestrictedView />;
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
    >
      {pageContent}
    </Sidebar>
  );
}

export default App;
