import React, { useCallback, useMemo, useState } from "react";
import {
  Archive,
  Download,
  RefreshCcw,
  ShieldCheck,
  Link as LinkIcon,
} from "lucide-react";
import StatusChip from "../ui/StatusChip.jsx";
import { Tooltip } from "../ui/feedback/Tooltip.jsx";
import { useToastContext } from "../ui/ToastProvider.jsx";
import exportService from "../../services/exportService.js";
import useArtifactPackageHistory from "../../hooks/useArtifactPackageHistory.js";

const FORBIDDEN_KEYS = new Set([
  "zipBytes",
  "rawBytes",
  "secret",
  "secrets",
  "env",
  "environment",
  "token",
  "apiKey",
  "openaiApiKey",
]);

const STATUS_CHIP = {
  stored: { status: "ready", label: "Stored" },
  expired: { status: "warning", label: "Expired" },
  deleted: { status: "blocked", label: "Deleted" },
  failed: { status: "fail", label: "Failed" },
};

const QA_CHIP = {
  pass: { status: "pass", label: "QA Pass" },
  ok: { status: "pass", label: "QA Pass" },
  warning: { status: "warning", label: "QA Warning" },
  warn: { status: "warning", label: "QA Warning" },
  fail: { status: "fail", label: "QA Fail" },
  error: { status: "fail", label: "QA Fail" },
};

const FLAG_KEYS = [
  { key: "structuralEnabled", label: "STR" },
  { key: "mepEnabled", label: "MEP" },
  { key: "detailsEnabled", label: "DTL" },
  { key: "dwgEnabled", label: "DWG" },
  { key: "ifcEnabled", label: "IFC" },
];

function recordStatus(record) {
  const raw = record?.status || record?.packageHistoryStatus || "stored";
  return String(raw).toLowerCase();
}

function isDownloadable(record) {
  if (recordStatus(record) !== "stored") return false;
  return Boolean(
    record?.signedUrl || record?.downloadUrl || record?.downloadRoute,
  );
}

function shortHash(value) {
  if (!value || typeof value !== "string") return "";
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatRelative(iso, nowIso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  const diffMs = now - then;
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return diffMs >= 0 ? "just now" : "in <1m";
  if (abs < hour) {
    const m = Math.round(abs / minute);
    return diffMs >= 0 ? `${m}m ago` : `in ${m}m`;
  }
  if (abs < day) {
    const h = Math.round(abs / hour);
    return diffMs >= 0 ? `${h}h ago` : `in ${h}h`;
  }
  const d = Math.round(abs / day);
  return diffMs >= 0 ? `${d}d ago` : `in ${d}d`;
}

function formatAbsolute(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace("T", " ").replace(/\..+$/, " UTC");
}

function StatusChipFor({ record }) {
  const config = STATUS_CHIP[recordStatus(record)] || {
    status: "neutral",
    label: recordStatus(record),
  };
  return (
    <StatusChip
      status={config.status}
      label={config.label}
      size="sm"
      data-testid="artifact-status-chip"
    />
  );
}

function QaChipFor({ qaStatus }) {
  if (!qaStatus) return null;
  const config = QA_CHIP[String(qaStatus).toLowerCase()] || {
    status: "neutral",
    label: `QA ${qaStatus}`,
  };
  return (
    <StatusChip
      status={config.status}
      label={config.label}
      size="sm"
      data-testid="artifact-qa-chip"
    />
  );
}

function FlagChips({ flags }) {
  if (!flags) return null;
  const active = FLAG_KEYS.filter((entry) => Boolean(flags[entry.key]));
  if (active.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1" data-testid="artifact-flag-chips">
      {active.map((entry) => (
        <span
          key={entry.key}
          className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/65"
        >
          {entry.label}
        </span>
      ))}
    </span>
  );
}

function safeRecord(record) {
  if (!record || typeof record !== "object") return record;
  const clone = {};
  Object.entries(record).forEach(([key, value]) => {
    if (FORBIDDEN_KEYS.has(key)) return;
    clone[key] = value;
  });
  return clone;
}

export const ArtifactHistoryPanel = ({
  sheet,
  projectId,
  userId,
  initialHistory,
  refreshSignal = 0,
  className = "",
  // Tests can inject a fixed clock for relative-time stability.
  now,
}) => {
  const { toast } = useToastContext();
  const [downloadingId, setDownloadingId] = useState(null);

  const { history, isLoading, error, refresh, storageProvider } =
    useArtifactPackageHistory({
      sheet,
      projectId,
      userId,
      initialHistory,
      refreshSignal,
    });

  const sanitized = useMemo(
    () => (Array.isArray(history) ? history.map(safeRecord) : []),
    [history],
  );

  // Post-UI-smoke fix: the /api/project/export/artifact-package/history
  // endpoint is auth-gated by artifactAccessPolicyService. In anonymous
  // mode (Clerk publishable key missing) the response is 403 with code
  // ARTIFACT_ACCESS_USER_REQUIRED — that's by design, not a failure. The
  // previous red alert ("Could not load saved packages. Artifact package
  // is not accessible") read like a bug to anonymous users browsing a
  // generated sheet. Branch the access-gated 403s into a neutral info
  // message and reserve the red alert for real failures (5xx, network,
  // other 4xx).
  const ACCESS_GATED_CODES = new Set([
    "ARTIFACT_ACCESS_USER_REQUIRED",
    "ARTIFACT_ACCESS_DENIED",
    "ARTIFACT_ACCESS_PROJECT_REQUIRED",
  ]);
  const isAccessGated = Boolean(
    error && error.status === 403 && ACCESS_GATED_CODES.has(error.code),
  );
  const accessGatedMessage =
    error?.code === "ARTIFACT_ACCESS_USER_REQUIRED"
      ? "Sign in to view saved packages."
      : "Saved package history is unavailable in anonymous mode.";

  const handleDownload = useCallback(
    async (record) => {
      if (!isDownloadable(record)) return;
      setDownloadingId(record.packageId);
      try {
        await exportService.downloadStoredDeliverablesPackage({
          packageRecord: record,
        });
        toast.success("Export complete", "Saved deliverables ZIP downloaded.");
      } catch (err) {
        toast.error(
          "Download failed",
          err?.message || "Could not download saved deliverables ZIP.",
        );
      } finally {
        setDownloadingId(null);
      }
    },
    [toast],
  );

  const headerCount = sanitized.length;

  return (
    <section
      data-testid="artifact-history-panel"
      className={`rounded-lg border border-white/10 bg-white/[0.025] px-3 py-3 ${className}`.trim()}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Archive className="h-3.5 w-3.5 text-white/55" strokeWidth={1.75} />
          <span className="text-eyebrow">Saved Packages</span>
          <span
            className="font-mono text-[10px] text-white/45"
            data-testid="artifact-history-count"
          >
            {headerCount}
          </span>
          {storageProvider && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
              {storageProvider}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={isLoading}
          aria-label="Refresh saved packages"
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-wider text-white/65 hover:border-white/20 hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-royal-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCcw
            className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`}
            strokeWidth={2}
          />
          {isLoading ? "Loading" : "Refresh"}
        </button>
      </div>

      {error && !isAccessGated && (
        <div
          role="alert"
          className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200"
          data-testid="artifact-history-error"
        >
          <span className="font-medium">Could not load saved packages.</span>{" "}
          <span className="text-red-200/80">
            {error?.message || "Unknown error."}
          </span>{" "}
          <button
            type="button"
            onClick={() => refresh()}
            className="underline underline-offset-2 hover:text-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {isAccessGated && (
        <div
          className="mb-2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/65"
          data-testid="artifact-history-access-info"
          data-artifact-access-code={error?.code || ""}
        >
          <span className="font-medium text-white/80">
            {accessGatedMessage}
          </span>
        </div>
      )}

      {!error && headerCount === 0 && !isLoading && (
        <div
          className="rounded-md border border-dashed border-white/10 px-3 py-3 text-[11px] text-white/55"
          data-testid="artifact-history-empty"
        >
          No saved packages yet. Click{" "}
          <span className="text-white/75">Save Package</span> above to persist a
          deterministic deliverables ZIP for this project.
        </div>
      )}

      {headerCount > 0 && (
        <ul className="flex flex-col gap-2">
          {sanitized.map((record) => {
            const downloadable = isDownloadable(record);
            const fullHash = record.packageHash || record.packageId;
            const created = formatRelative(record.createdAt, now);
            const expires = formatRelative(record.expiresAt, now);
            const jurisdictionLabel =
              record.jurisdictionId || record.countryCode || null;
            const isBusy = downloadingId === record.packageId;
            const signedAvailable = record.signedUrlAvailable === true;
            return (
              <li
                key={record.packageId}
                data-testid="artifact-history-row"
                data-package-id={record.packageId}
                className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Tooltip content={fullHash} side="top">
                      <span
                        className="block truncate font-mono text-xs text-white/85"
                        aria-label={`Package hash ${fullHash}`}
                      >
                        {shortHash(fullHash)}
                      </span>
                    </Tooltip>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-white/55">
                      {created && (
                        <Tooltip
                          content={formatAbsolute(record.createdAt)}
                          side="top"
                        >
                          <span data-testid="artifact-created-at">
                            {created}
                          </span>
                        </Tooltip>
                      )}
                      {expires && (
                        <Tooltip
                          content={`Expires ${formatAbsolute(record.expiresAt)}`}
                          side="top"
                        >
                          <span
                            data-testid="artifact-expires-at"
                            className="text-white/45"
                          >
                            · expires {expires}
                          </span>
                        </Tooltip>
                      )}
                      {jurisdictionLabel && (
                        <span
                          className="rounded border border-white/10 bg-white/5 px-1 py-0.5 font-mono uppercase tracking-wider text-white/65"
                          data-testid="artifact-jurisdiction"
                        >
                          {jurisdictionLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <StatusChipFor record={record} />
                    <QaChipFor qaStatus={record.qaStatus} />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-white/55">
                  <span data-testid="artifact-counts">
                    {Number(record.artifactCount ?? 0)} artifacts
                  </span>
                  {Number(record.sourceGapCount ?? 0) > 0 && (
                    <Tooltip
                      content="Source-gap details available on the package metadata endpoint."
                      side="top"
                    >
                      <span
                        className="rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 font-mono text-amber-200"
                        data-testid="artifact-gaps"
                      >
                        {Number(record.sourceGapCount)} gaps
                      </span>
                    </Tooltip>
                  )}
                  <FlagChips flags={record.flags} />
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <Tooltip
                    content={
                      signedAvailable
                        ? "Signed URL — direct from storage provider"
                        : "Direct download endpoint"
                    }
                    side="top"
                  >
                    <span
                      className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/55"
                      data-testid="artifact-download-mode"
                    >
                      {signedAvailable ? (
                        <ShieldCheck
                          className="h-3 w-3 text-emerald-300"
                          strokeWidth={2}
                        />
                      ) : (
                        <LinkIcon
                          className="h-3 w-3 text-white/55"
                          strokeWidth={2}
                        />
                      )}
                      {signedAvailable ? "signed" : "direct"}
                    </span>
                  </Tooltip>
                  <button
                    type="button"
                    onClick={() => void handleDownload(record)}
                    disabled={!downloadable || isBusy}
                    data-testid="artifact-download-button"
                    aria-label={`Download package ${fullHash}`}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/85 hover:border-white/20 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-royal-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download className="h-3 w-3" strokeWidth={2} />
                    {isBusy
                      ? "Downloading…"
                      : downloadable
                        ? "Download"
                        : "Unavailable"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default ArtifactHistoryPanel;
