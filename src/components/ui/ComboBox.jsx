import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";

/**
 * Searchable dropdown — replaces the old jQuery-style autocomplete inputs.
 * Fully keyboard/mouse friendly, closes on outside click, and can render
 * an optional "+" button next to it (wired to the master-data add flow).
 */
export default function ComboBox({
  label,
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  required = false,
  onAddNew,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  function selectValue(v) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="ob-field">
      {label && (
        <label className="ob-label">
          {label} {required && <span className="ob-req">*</span>}
        </label>
      )}
      <div className="ob-row">
        <div className="ob-wrap" ref={wrapRef}>
          <button
            type="button"
            className={`ob-trigger ${disabled ? "ob-disabled" : ""}`}
            onClick={() => {
              if (disabled) return;
              setOpen((o) => !o);
              setTimeout(() => inputRef.current?.focus(), 10);
            }}
          >
            <span className={`ob-value ${!value ? "ob-placeholder" : ""}`}>
              {value || placeholder}
            </span>
            <ChevronDown size={15} className={`ob-chevron ${open ? "ob-chevron-open" : ""}`} />
          </button>

          {open && (
            <div className="ob-panel">
              <div className="ob-search">
                <Search size={13} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type to search..."
                  autoFocus
                />
              </div>
              <div className="ob-list">
                {filtered.length === 0 && (
                  <div className="ob-empty">No matches</div>
                )}
                {filtered.map((opt) => (
                  <div
                    key={opt}
                    className={`ob-item ${opt === value ? "ob-item-active" : ""}`}
                    onClick={() => selectValue(opt)}
                  >
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {onAddNew && (
          <button type="button" className="ob-add-btn" title="Add new" onClick={onAddNew}>
            <Plus size={15} strokeWidth={2.6} />
          </button>
        )}
      </div>

      <style>{`
        .ob-field { display: flex; flex-direction: column; gap: 6px; width: 100%; }
        .ob-label { font-size: 12.5px; font-weight: 600; color: #5b5f72; }
        .ob-req { color: #e0641f; }
        .ob-row { display: flex; gap: 8px; align-items: stretch; }
        .ob-wrap { position: relative; flex: 1; min-width: 0; }
        .ob-trigger {
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          gap: 8px; background: #fff; border: 1px solid #e1e3ec; border-radius: 10px;
          padding: 10px 12px; cursor: pointer; font-family: 'Inter', sans-serif;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .ob-trigger:hover { border-color: #c7cad9; }
        .ob-trigger:focus-visible { outline: none; border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
        .ob-disabled { background: #f1f2f6; cursor: not-allowed; opacity: 0.65; }
        .ob-value { font-size: 13.5px; color: #1c1e26; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ob-placeholder { color: #a1a4b5; }
        .ob-chevron { color: #9295a8; transition: transform 0.2s ease; flex-shrink: 0; }
        .ob-chevron-open { transform: rotate(180deg); }
        .ob-panel {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0;
          background: #fff; border: 1px solid #e6e8f0; border-radius: 12px;
          box-shadow: 0 12px 28px rgba(20,22,35,0.12); z-index: 40;
          padding: 8px; animation: ob-pop 0.16s ease;
        }
        @keyframes ob-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .ob-search {
          display: flex; align-items: center; gap: 6px; background: #f6f7fb;
          border: 1px solid #e6e8f0; border-radius: 8px; padding: 7px 10px; margin-bottom: 6px;
          color: #9295a8;
        }
        .ob-search input { border: none; outline: none; background: transparent; font-size: 13px; width: 100%; }
        .ob-list { max-height: 220px; overflow-y: auto; }
        .ob-item { padding: 8px 10px; border-radius: 8px; font-size: 13px; cursor: pointer; color: #2c2e3a; }
        .ob-item:hover { background: #fdf3e4; }
        .ob-item-active { background: #fef1de; color: #b5620f; font-weight: 600; }
        .ob-empty { padding: 14px 10px; text-align: center; color: #a1a4b5; font-size: 12.5px; }
        .ob-add-btn {
          min-width: 42px; width: 42px; border-radius: 10px; border: none;
          background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          box-shadow: 0 3px 10px rgba(245,166,35,0.28);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .ob-add-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(245,166,35,0.35); }
        .ob-add-btn:active { transform: scale(0.94); }
      `}</style>
    </div>
  );
}
