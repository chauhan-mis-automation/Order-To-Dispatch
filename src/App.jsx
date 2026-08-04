import { useEffect, useState } from "react";
import Sidebar from "./components/layout/Sidebar";
import CreateOrder from "./pages/CreateOrder";
import Verification from "./pages/Verification";
import Picking from "./pages/Picking";
import Planning from "./pages/Planning";
import Packing from "./pages/Packing";
import Dispatch from "./pages/Dispatch";
import History from "./pages/History";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import AuthModal from "./components/ui/AuthModal";
import { supabase } from "./lib/supabaseClient";

function ComingSoon({ label }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #eceef4",
        borderRadius: 16,
        padding: 22,
        minHeight: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#b7b9c6",
        fontSize: "13.5px",
        fontWeight: 500,
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
        background: "#fff",
        border: "1px solid #fdeceb",
        borderRadius: 16,
        padding: 22,
        minHeight: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#c23c33",
        fontSize: "13.5px",
        fontWeight: 600,
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
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingView, setPendingView] = useState(null);
  const [pendingCallback, setPendingCallback] = useState(null);
  const [navCounts, setNavCounts] = useState({});
  const [editOrderId, setEditOrderId] = useState(null);

  const isAdmin = currentUserRoles.includes("Admin");

  useEffect(() => {
    async function loadCounts() {
      const [verifRes, pickRes, planRes, packRes, dispRes] = await Promise.all([
        supabase.from("orders").select("*", { count: "exact", head: true }).in("status", ["Pending", "Indent Raised", "On Hold"]),
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
  }, [activeView]);

  // Only "create_order" (fresh, non-edit) requires a session login before
  // navigating. Editing an order also requires login, handled separately
  // via openEditOrder() below.
  function handleNavigate(view) {
    if (view === "create_order") {
      setEditOrderId(null); // "New Order" from the sidebar is always a fresh order
      if (!currentUser) {
        requireLogin(() => setActiveView("create_order"));
        setPendingView(view);
        return;
      }
    }
    setActiveView(view);
  }

  function requireLogin(callback) {
    if (currentUser) {
      callback(currentUser);
      return;
    }
    setPendingCallback(() => callback);
    setAuthModalOpen(true);
  }

  function openEditOrder(orderId) {
    requireLogin(() => {
      setEditOrderId(orderId);
      setActiveView("create_order");
    });
  }

  function exitEditOrder() {
    setEditOrderId(null);
    setActiveView("verification");
  }

  function handleAuthSuccess(user) {
    setCurrentUser(user.name);
    setCurrentUserRoles(user.roles || []);
    setAuthModalOpen(false);
    if (pendingView) {
      setActiveView(pendingView);
      setPendingView(null);
    }
    if (pendingCallback) {
      pendingCallback(user.name);
      setPendingCallback(null);
    }
  }

  function handleLogout() {
    setCurrentUser(null);
    setCurrentUserRoles([]);
    setEditOrderId(null);
    setActiveView("dashboard");
  }

  let pageContent;
  if (activeView === "create_order") {
    pageContent = <CreateOrder currentUser={currentUser} editOrderId={editOrderId} onExitEdit={exitEditOrder} />;
  } else if (activeView === "dashboard") {
    pageContent = <Dashboard />;
  } else if (activeView === "verification") {
    pageContent = <Verification onEditOrder={openEditOrder} />;
  } else if (activeView === "picking") {
    pageContent = <Picking />;
  } else if (activeView === "planning") {
    pageContent = <Planning />;
  } else if (activeView === "packing") {
    pageContent = <Packing />;
  } else if (activeView === "dispatch") {
    pageContent = <Dispatch currentUser={currentUser} requireLogin={requireLogin} />;
  } else if (activeView === "history") {
    pageContent = <History />;
  } else if (activeView === "users") {
    pageContent = isAdmin ? <Users /> : <RestrictedView />;
  } else {
    pageContent = <ComingSoon label={activeView} />;
  }

  return (
    <>
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

      <AuthModal
        open={authModalOpen}
        onClose={() => { setAuthModalOpen(false); setPendingView(null); setPendingCallback(null); }}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}

export default App;
