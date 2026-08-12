import React, { useCallback, useEffect, useState } from "react";
import { UserPlus, Pencil, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import UserFormModal from "../components/ui/UserFormModal";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    const { data, error } = await supabase.rpc("admin_list_users");
    if (error) setErrorMsg(error.message);
    else setUsers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  function openAdd() {
    setEditingUser(null);
    setFormOpen(true);
  }
  function openEdit(user) {
    setEditingUser(user);
    setFormOpen(true);
  }

  return (
    <div className="us-root">
      <style>{`
        .us-root { font-family: 'Inter', sans-serif; color: #1c1e26; max-width: 900px; }
        .us-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .us-title { font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 700; color: #5b5f72; }
        .us-add-btn {
          border: none; display: flex; align-items: center; gap: 8px;
          background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a;
          padding: 11px 20px; border-radius: 11px; font-weight: 700; font-size: 13.5px; cursor: pointer;
          box-shadow: 0 6px 16px rgba(245,166,35,0.28);
        }
        .us-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: hidden; }
        .us-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .us-table thead th { background: #14161f; color: #fff; text-align: left; padding: 14px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        .us-table tbody td { padding: 14px 18px; border-bottom: 1px solid #f0f1f6; vertical-align: middle; }
        .us-table tbody tr:last-child td { border-bottom: none; }
        .us-table tbody tr:hover { background: #fbfbfd; }
        .us-username { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #b5620f; }
        .us-roles { display: flex; flex-wrap: wrap; gap: 5px; }
        .us-role-badge { font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 20px; background: #fdf3e4; color: #b5620f; }
        .us-role-admin { background: #fdeceb; color: #c23c33; }
        .us-status { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; }
        .us-status-active { color: #1a8a4c; }
        .us-status-inactive { color: #9295a8; }
        .us-edit-btn { border: 1px solid #e6e8f0; background: #fff; width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .us-edit-btn:hover { background: #f6f7fb; }
        .us-loading, .us-nodata { display: flex; justify-content: center; padding: 50px 0; color: #9295a8; }
        .us-spin { animation: us-spin-anim 0.9s linear infinite; }
        @keyframes us-spin-anim { to { transform: rotate(360deg); } }
        .us-error { background: #fdeceb; color: #c23c33; padding: 12px 16px; border-radius: 10px; margin-bottom: 14px; font-size: 13px; font-weight: 600; }

        @media (max-width: 700px) {
          .us-table thead { display: none; }
          .us-table, .us-table tbody, .us-table tr, .us-table td { display: block; width: 100%; }
          .us-table tr { border: 1px solid #eceef4; border-radius: 12px; margin: 12px; padding: 4px 0; }
          .us-table td { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid #f5f6fa; }
          .us-table td:last-child { border-bottom: none; }
          .us-table td::before { content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10.5px; text-transform: uppercase; }
        }
      `}</style>

      <div className="us-toolbar">
        <span className="us-title">Manage app login accounts &amp; access roles</span>
        <button className="us-add-btn" onClick={openAdd}><UserPlus size={16} /> Add User</button>
      </div>

      {errorMsg && <div className="us-error">{errorMsg}</div>}

      <div className="us-card">
        {loading ? (
          <div className="us-loading"><Loader2 size={22} className="us-spin" /></div>
        ) : users.length === 0 ? (
          <div className="us-nodata">No users found.</div>
        ) : (
          <table className="us-table">
            <thead>
              <tr><th>User ID</th><th>Name</th><th>Roles</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td data-label="User ID"><span className="us-username">{u.username}</span></td>
                  <td data-label="Name">{u.name}</td>
                  <td data-label="Roles">
                    <div className="us-roles">
                      {(u.roles || []).map((r) => (
                        <span key={r} className={`us-role-badge ${r === "Admin" ? "us-role-admin" : ""}`}>{r}</span>
                      ))}
                    </div>
                  </td>
                  <td data-label="Status">
                    {u.is_active
                      ? <span className="us-status us-status-active"><CheckCircle2 size={14} /> Active</span>
                      : <span className="us-status us-status-inactive"><XCircle size={14} /> Inactive</span>}
                  </td>
                  <td data-label="Action">
                    <button className="us-edit-btn" onClick={() => openEdit(u)} title="Edit user">
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <UserFormModal
        open={formOpen}
        user={editingUser}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); loadUsers(); }}
      />
    </div>
  );
}
