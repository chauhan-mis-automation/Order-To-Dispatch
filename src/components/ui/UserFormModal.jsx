// import React, { useEffect, useState } from "react";
// import { X, Loader2, UserCog } from "lucide-react";
// import { supabase } from "../../lib/supabaseClient";

// const ROLE_OPTIONS = [
//   "Admin", "Dashboard", "Verification", "Picking", "Planning", "Packing", "Dispatch", "History", "Create Order",
//   "Production", "Inventory", "Purchase Orders", "Reports",
// ];

// export default function UserFormModal({ open, user, onClose, onSaved }) {
//   const isEdit = !!user;
//   const [username, setUsername] = useState("");
//   const [password, setPassword] = useState("");
//   const [name, setName] = useState("");
//   const [roles, setRoles] = useState([]);
//   const [isActive, setIsActive] = useState(true);
//   const [saving, setSaving] = useState(false);
//   const [error, setError] = useState("");

//   useEffect(() => {
//     if (open) {
//       setUsername(user?.username || "");
//       setPassword("");
//       setName(user?.name || "");
//       setRoles(user?.roles || []);
//       setIsActive(user?.is_active ?? true);
//       setError("");
//     }
//   }, [open, user]);

//   if (!open) return null;

//   function toggleRole(role) {
//     setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
//   }

//   async function handleSubmit(e) {
//     e.preventDefault();
//     if (!isEdit && (!username.trim() || !password.trim())) {
//       setError("Username and password are required.");
//       return;
//     }
//     if (!name.trim()) {
//       setError("Name is required.");
//       return;
//     }
//     if (roles.length === 0) {
//       setError("Select at least one role.");
//       return;
//     }

//     setSaving(true);
//     setError("");
//     try {
//       if (isEdit) {
//         const { error: rpcError } = await supabase.rpc("admin_update_user", {
//           p_id: user.id,
//           p_name: name.trim(),
//           p_roles: roles,
//           p_is_active: isActive,
//           p_new_password: password.trim() || null,
//         });
//         if (rpcError) throw rpcError;
//       } else {
//         const { error: rpcError } = await supabase.rpc("admin_create_user", {
//           p_username: username.trim(),
//           p_password: password,
//           p_name: name.trim(),
//           p_roles: roles,
//         });
//         if (rpcError) throw rpcError;
//       }
//       setSaving(false);
//       onSaved && onSaved();
//     } catch (err) {
//       setError(err.message || "Something went wrong.");
//       setSaving(false);
//     }
//   }

//   return (
//     <div className="ufm-overlay" onClick={onClose}>
//       <div className="ufm-card" onClick={(e) => e.stopPropagation()}>
//         <div className="ufm-header">
//           <h4><UserCog size={18} style={{ marginRight: 8, verticalAlign: -3 }} />{isEdit ? "Edit User" : "Add New User"}</h4>
//           <button className="ufm-close" onClick={onClose}><X size={16} /></button>
//         </div>

//         <form onSubmit={handleSubmit}>
//           <div className="ufm-body">
//             <div className="ufm-row">
//               <div className="ufm-field">
//                 <label>User ID</label>
//                 <input
//                   className="ufm-input"
//                   value={username}
//                   onChange={(e) => setUsername(e.target.value)}
//                   disabled={isEdit}
//                   placeholder="e.g. Rohit"
//                 />
//               </div>
//               <div className="ufm-field">
//                 <label>{isEdit ? "New Password (leave blank to keep)" : "Password"}</label>
//                 <input
//                   type="password"
//                   className="ufm-input"
//                   value={password}
//                   onChange={(e) => setPassword(e.target.value)}
//                   placeholder={isEdit ? "••••••" : "Enter password"}
//                 />
//               </div>
//             </div>

//             <div className="ufm-field">
//               <label>Full Name</label>
//               <input className="ufm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rohit Sharma" />
//             </div>

//             <div className="ufm-field">
//               <label>Roles (Admin gets full access to everything)</label>
//               <div className="ufm-roles-grid">
//                 {ROLE_OPTIONS.map((role) => (
//                   <label key={role} className={`ufm-role-chip ${roles.includes(role) ? "ufm-role-active" : ""}`}>
//                     <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />
//                     {role}
//                   </label>
//                 ))}
//               </div>
//             </div>

//             {isEdit && (
//               <label className="ufm-active-toggle">
//                 <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
//                 Account Active
//               </label>
//             )}

//             {error && <div className="ufm-error">{error}</div>}
//           </div>

//           <div className="ufm-footer">
//             <button type="button" className="ufm-cancel" onClick={onClose}>Cancel</button>
//             <button type="submit" className="ufm-save" disabled={saving}>
//               {saving ? <Loader2 size={15} className="ufm-spin" /> : null}
//               {saving ? "Saving..." : isEdit ? "Update User" : "Create User"}
//             </button>
//           </div>
//         </form>
//       </div>

//       <style>{`
//         .ufm-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 280; display: flex; align-items: center; justify-content: center; padding: 16px; animation: ufm-fade 0.18s ease; }
//         @keyframes ufm-fade { from { opacity: 0; } to { opacity: 1; } }
//         .ufm-card { width: 100%; max-width: 440px; max-height: 90vh; background: #fff; border-radius: 20px; box-shadow: 0 24px 60px rgba(10,11,20,0.3); overflow: hidden; display: flex; flex-direction: column; animation: ufm-pop 0.2s cubic-bezier(.2,.8,.3,1); }
//         @keyframes ufm-pop { from { opacity: 0; transform: scale(0.97) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
//         .ufm-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f0f1f6; }
//         .ufm-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; }
//         .ufm-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
//         .ufm-body { padding: 18px 22px; overflow-y: auto; }
//         .ufm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
//         .ufm-field { margin-bottom: 14px; }
//         .ufm-field label { display: block; font-size: 12px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
//         .ufm-input {
//           width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; outline: none;
//         }
//         .ufm-input:focus { border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
//         .ufm-input:disabled { background: #f1f2f6; color: #8a8da0; }
//         .ufm-roles-grid { display: flex; flex-wrap: wrap; gap: 8px; }
//         .ufm-role-chip {
//           display: flex; align-items: center; gap: 6px; border: 1px solid #e1e3ec; border-radius: 999px;
//           padding: 7px 12px; font-size: 12.5px; cursor: pointer; font-weight: 600; color: #4a4d5c;
//         }
//         .ufm-role-chip input { accent-color: #f5a623; }
//         .ufm-role-active { background: #fdf3e4; border-color: #f5a623; color: #b5620f; }
//         .ufm-active-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #4a4d5c; margin-top: 4px; }
//         .ufm-active-toggle input { accent-color: #1a8a4c; width: 16px; height: 16px; }
//         .ufm-error { background: #fdeceb; color: #c23c33; font-size: 12.5px; font-weight: 600; padding: 9px 12px; border-radius: 9px; margin-top: 8px; }
//         .ufm-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 22px; border-top: 1px solid #f0f1f6; }
//         .ufm-cancel { border: none; background: #f1f2f6; color: #4a4d5c; padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; }
//         .ufm-save {
//           border: none; display: flex; align-items: center; gap: 8px;
//           background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a;
//           padding: 10px 20px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer;
//           box-shadow: 0 4px 12px rgba(245,166,35,0.28);
//         }
//         .ufm-save:disabled { opacity: 0.7; cursor: not-allowed; }
//         .ufm-spin { animation: ufm-spin-anim 0.9s linear infinite; }
//         @keyframes ufm-spin-anim { to { transform: rotate(360deg); } }
//       `}</style>
//     </div>
//   );
// }


import React, { useEffect, useState } from "react";
import { X, Loader2, UserCog } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

const ROLE_OPTIONS = [
  "Admin", "Dashboard", "Verification", "Picking", "Planning", "Packing", "Dispatch", "History", "Create Order",
  "Production", "Inventory", "Purchase Orders", "Reports",
];

export default function UserFormModal({ open, user, onClose, onSaved }) {
  const isEdit = !!user;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [roles, setRoles] = useState([]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setUsername(user?.username || "");
      setPassword("");
      setName(user?.name || "");
      setRoles(user?.roles || []);
      setIsActive(user?.is_active ?? true);
      setError("");
    }
  }, [open, user]);

  if (!open) return null;

  function toggleRole(role) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isEdit && (!username.trim() || !password.trim())) {
      setError("Username and password are required.");
      return;
    }
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (roles.length === 0) {
      setError("Select at least one role.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        const { error: rpcError } = await supabase.rpc("admin_update_user", {
          p_id: user.id,
          p_name: name.trim(),
          p_roles: roles,
          p_is_active: isActive,
          p_new_password: password.trim() || null,
        });
        if (rpcError) throw rpcError;
      } else {
        const { error: rpcError } = await supabase.rpc("admin_create_user", {
          p_username: username.trim(),
          p_password: password,
          p_name: name.trim(),
          p_roles: roles,
        });
        if (rpcError) throw rpcError;
      }
      setSaving(false);
      onSaved && onSaved();
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <div className="ufm-overlay" onClick={onClose}>
      <div className="ufm-card" onClick={(e) => e.stopPropagation()}>
        <div className="ufm-header">
          <h4><UserCog size={18} style={{ marginRight: 8, verticalAlign: -3 }} />{isEdit ? "Edit User" : "Add New User"}</h4>
          <button className="ufm-close" onClick={onClose}><X size={16} /></button>
        </div>

        <form className="ufm-form" onSubmit={handleSubmit}>
          <div className="ufm-body">
            <div className="ufm-row">
              <div className="ufm-field">
                <label>User ID</label>
                <input
                  className="ufm-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isEdit}
                  placeholder="e.g. Rohit"
                />
              </div>
              <div className="ufm-field">
                <label>{isEdit ? "New Password (leave blank to keep)" : "Password"}</label>
                <input
                  type="password"
                  className="ufm-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEdit ? "••••••" : "Enter password"}
                />
              </div>
            </div>

            <div className="ufm-field">
              <label>Full Name</label>
              <input className="ufm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rohit Sharma" />
            </div>

            <div className="ufm-field">
              <label>Roles (Admin gets full access to everything)</label>
              <div className="ufm-roles-grid">
                {ROLE_OPTIONS.map((role) => (
                  <label key={role} className={`ufm-role-chip ${roles.includes(role) ? "ufm-role-active" : ""}`}>
                    <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />
                    {role}
                  </label>
                ))}
              </div>
            </div>

            {isEdit && (
              <label className="ufm-active-toggle">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Account Active
              </label>
            )}

            {error && <div className="ufm-error">{error}</div>}
          </div>

          <div className="ufm-footer">
            <button type="button" className="ufm-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="ufm-save" disabled={saving}>
              {saving ? <Loader2 size={15} className="ufm-spin" /> : null}
              {saving ? "Saving..." : isEdit ? "Update User" : "Create User"}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .ufm-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 280; display: flex; align-items: center; justify-content: center; padding: 16px; animation: ufm-fade 0.18s ease; }
        @keyframes ufm-fade { from { opacity: 0; } to { opacity: 1; } }
        .ufm-card { width: 100%; max-width: 440px; max-height: 90vh; max-height: 90dvh; background: #fff; border-radius: 20px; box-shadow: 0 24px 60px rgba(10,11,20,0.3); overflow: hidden; display: flex; flex-direction: column; animation: ufm-pop 0.2s cubic-bezier(.2,.8,.3,1); }
        @keyframes ufm-pop { from { opacity: 0; transform: scale(0.97) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .ufm-form { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }
        .ufm-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f0f1f6; flex-shrink: 0; }
        .ufm-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; }
        .ufm-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .ufm-body { padding: 18px 22px; overflow-y: auto; flex: 1 1 auto; min-height: 0; }
        .ufm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .ufm-field { margin-bottom: 14px; }
        .ufm-field label { display: block; font-size: 12px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .ufm-input {
          width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; outline: none;
        }
        .ufm-input:focus { border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
        .ufm-input:disabled { background: #f1f2f6; color: #8a8da0; }
        .ufm-roles-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .ufm-role-chip {
          display: flex; align-items: center; gap: 6px; border: 1px solid #e1e3ec; border-radius: 999px;
          padding: 7px 12px; font-size: 12.5px; cursor: pointer; font-weight: 600; color: #4a4d5c;
        }
        .ufm-role-chip input { accent-color: #f5a623; }
        .ufm-role-active { background: #fdf3e4; border-color: #f5a623; color: #b5620f; }
        .ufm-active-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #4a4d5c; margin-top: 4px; }
        .ufm-active-toggle input { accent-color: #1a8a4c; width: 16px; height: 16px; }
        .ufm-error { background: #fdeceb; color: #c23c33; font-size: 12.5px; font-weight: 600; padding: 9px 12px; border-radius: 9px; margin-top: 8px; }
        .ufm-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 22px; border-top: 1px solid #f0f1f6; flex-shrink: 0; }
        .ufm-cancel { border: none; background: #f1f2f6; color: #4a4d5c; padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; }
        .ufm-save {
          border: none; display: flex; align-items: center; gap: 8px;
          background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a;
          padding: 10px 20px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer;
          box-shadow: 0 4px 12px rgba(245,166,35,0.28);
        }
        .ufm-save:disabled { opacity: 0.7; cursor: not-allowed; }
        .ufm-spin { animation: ufm-spin-anim 0.9s linear infinite; }
        @keyframes ufm-spin-anim { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}