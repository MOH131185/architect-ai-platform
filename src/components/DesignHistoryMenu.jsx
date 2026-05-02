import React, { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { ChevronDown, FileImage, History, Loader2, RefreshCw } from "lucide-react";
import Button from "./ui/Button.jsx";

function formatUpdatedAt(value) {
  if (!value) {
    return "Saved design";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Saved design";
  }

  return `Updated ${date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function designLabel(design = {}) {
  return (
    design.projectName ||
    design.name ||
    design.projectId ||
    design.designId ||
    design.id ||
    "Saved design"
  );
}

const DesignHistoryMenu = ({ listDesigns, onLoadDesign, className = "" }) => {
  const [open, setOpen] = useState(false);
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingDesignId, setLoadingDesignId] = useState(null);
  const [error, setError] = useState(null);
  const menuRef = useRef(null);

  const refreshDesigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await listDesigns();
      const sortedEntries = [...(entries || [])].sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime(),
      );
      setDesigns(sortedEntries);
    } catch (err) {
      setError(err?.message || "Recent designs could not be loaded.");
      setDesigns([]);
    } finally {
      setLoading(false);
    }
  }, [listDesigns]);

  useEffect(() => {
    if (open) {
      refreshDesigns();
    }
  }, [open, refreshDesigns]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleLoad = async (designId) => {
    if (!designId || loadingDesignId) {
      return;
    }

    setLoadingDesignId(designId);
    setError(null);
    try {
      await onLoadDesign(designId);
      setOpen(false);
    } catch (err) {
      setError(err?.message || "Saved design could not be reopened.");
    } finally {
      setLoadingDesignId(null);
    }
  };

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <Button
        type="button"
        variant="glass"
        size="sm"
        onClick={() => setOpen((value) => !value)}
        icon={<History className="h-4 w-4" />}
        iconPosition="left"
        data-testid="recent-designs-button"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="hidden sm:inline">Recent Designs</span>
        <ChevronDown className="ml-2 h-3.5 w-3.5" />
      </Button>

      {open && (
        <div
          className="absolute right-0 z-[70] mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-white/10 bg-navy-950/95 shadow-2xl backdrop-blur-xl"
          role="menu"
          aria-label="Recent designs"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Recent Designs</p>
              <p className="text-xs text-white/45">
                Reopen from local history
              </p>
            </div>
            <button
              type="button"
              onClick={refreshDesigns}
              disabled={loading}
              className="rounded-md p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
              aria-label="Refresh recent designs"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </button>
          </div>

          {error && (
            <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="max-h-80 overflow-y-auto py-2">
            {loading && designs.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading recent designs...
              </div>
            ) : designs.length === 0 ? (
              <div className="px-4 py-5 text-sm text-white/55">
                No saved designs yet.
              </div>
            ) : (
              designs.map((design) => {
                const designId = design.designId || design.id;
                const isLoadingDesign = loadingDesignId === designId;
                return (
                  <button
                    key={designId}
                    type="button"
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/8 focus:bg-white/8 focus:outline-none"
                    onClick={() => handleLoad(designId)}
                    disabled={Boolean(loadingDesignId)}
                    role="menuitem"
                    data-testid="recent-designs-item"
                  >
                    <span className="mt-0.5 rounded-md border border-white/10 bg-white/5 p-2 text-royal-200">
                      {isLoadingDesign ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileImage className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">
                        {designLabel(design)}
                      </span>
                      <span className="mt-0.5 block text-xs text-white/45">
                        {formatUpdatedAt(design.updatedAt || design.createdAt)}
                      </span>
                      {design.hasA1Sheet && (
                        <span className="mt-1 inline-flex rounded-md border border-success-500/20 bg-success-500/10 px-1.5 py-0.5 text-[11px] text-success-200">
                          A1 saved
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

DesignHistoryMenu.propTypes = {
  listDesigns: PropTypes.func.isRequired,
  onLoadDesign: PropTypes.func.isRequired,
  className: PropTypes.string,
};

export default DesignHistoryMenu;
