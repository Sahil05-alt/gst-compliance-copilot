import { useState, useEffect, useCallback } from "react";
import "./GstDashboard.css";

// Falls back to Settings-entered URL if VITE_API_URL isn't set in .env
const ENV_API_URL = import.meta.env.VITE_API_URL || "";

const SAMPLE_INVOICES = [
  { invoiceNo: "INV-301", gstin: "09AAACH7409R1ZZ", taxableValue: 15000, taxRate: 18, hsnCode: "8471" },
  { invoiceNo: "INV-301", gstin: "09AAACH7409R1ZZ", taxableValue: 15000, taxRate: 18, hsnCode: "8471" },
  { invoiceNo: "INV-302", gstin: "NOTAREALGSTIN", taxableValue: 5000, taxRate: 18, hsnCode: "8517" },
  { invoiceNo: "INV-303", gstin: "09AAACH7409R1ZZ", taxableValue: -100, taxRate: 30, hsnCode: "84" },
];

function StatusLine({ text, kind }) {
  if (!text) return <div className="status-line" />;
  return <div className={`status-line${kind ? ` status-line--${kind}` : ""}`}>{text}</div>;
}

function IssueCard({ issue, onResolve }) {
  const [resolving, setResolving] = useState(false);
  const severity = (issue.severity || "LOW").toUpperCase();

  const resolve = async () => {
    setResolving(true);
    await onResolve(issue);
    setResolving(false);
  };

  return (
    <div className={`stamp-card${issue.resolved ? " stamp-card--resolved" : ""}`}>
      <div className={`stamp stamp--${severity.toLowerCase()}`}>{severity}</div>
      <div className="stamp-card__body">
        <div className="issue-type">
          {(issue.issue_type || "").replace(/_/g, " ")}
        </div>
        <div className="issue-invoice">Invoice {issue.invoice_no}</div>
        {issue.explanation && <div className="issue-explain">{issue.explanation}</div>}
        {issue.suggested_fix && <div className="issue-fix">{issue.suggested_fix}</div>}
        {issue.resolved ? (
          <span className="resolved-tag">Resolved</span>
        ) : (
          <button className="link-btn" onClick={resolve} disabled={resolving}>
            {resolving ? "Marking…" : "Mark resolved"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function GstDashboard() {
  const [view, setView] = useState("dashboard");
  const [apiUrl, setApiUrl] = useState(ENV_API_URL);

  const [businessId, setBusinessId] = useState("BIZ001");
  const [period, setPeriod] = useState("2026-08");
  const [filingType, setFilingType] = useState("GSTR-1");
  const [invoicesJson, setInvoicesJson] = useState(
    JSON.stringify([
      { invoiceNo: "INV-201", gstin: "09AAACH7409R1ZZ", taxableValue: 15000, taxRate: 18, hsnCode: "8471" },
      { invoiceNo: "INV-202", gstin: "BADGSTIN", taxableValue: -200, taxRate: 22, hsnCode: "84" },
    ])
  );

  const [filings, setFilings] = useState([]);
  const [issues, setIssues] = useState([]);
  const [dashboardStatus, setDashboardStatus] = useState({ text: "", kind: "" });
  const [submitStatus, setSubmitStatus] = useState({ text: "", kind: "" });
  const [submitting, setSubmitting] = useState(false);

  const base = () => {
    const url = apiUrl.trim();
    if (!url) return "";
    return url.endsWith("/") ? url : url + "/";
  };

  const loadDashboard = useCallback(async () => {
    const b = base();
    if (!b) {
      setDashboardStatus({ text: "Set the API endpoint in Settings first.", kind: "err" });
      return;
    }
    setDashboardStatus({ text: "Reading ledger…", kind: "" });
    try {
      const res = await fetch(`${b}dashboard/${encodeURIComponent(businessId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setFilings(data.filings || []);
      setIssues(data.flaggedIssues || []);
      setDashboardStatus({
        text: `${(data.filings || []).length} filing(s) on record, ${(data.flaggedIssues || []).length} flagged.`,
        kind: "ok",
      });
    } catch (err) {
      setDashboardStatus({ text: `Error: ${err.message}`, kind: "err" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, apiUrl]);

  useEffect(() => {
    if (view === "dashboard") loadDashboard();
  }, [view, loadDashboard]);

  const loadSample = () => {
    setInvoicesJson(JSON.stringify(SAMPLE_INVOICES));
  };

  const submitFiling = async () => {
    const b = base();
    if (!b) {
      setSubmitStatus({ text: "Set the API endpoint in Settings first.", kind: "err" });
      return;
    }
    let invoices;
    try {
      invoices = JSON.parse(invoicesJson);
    } catch {
      setSubmitStatus({ text: "Invoices field is not valid JSON.", kind: "err" });
      return;
    }

    setSubmitting(true);
    setSubmitStatus({ text: "Filing submitted, entering pipeline…", kind: "" });
    try {
      const res = await fetch(`${b}filings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: businessId.trim(),
          period: period.trim(),
          filingType: filingType.trim(),
          invoices,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setSubmitStatus({
        text: `Recorded as ${data.filingId} — check the Dashboard in ~10s.`,
        kind: "ok",
      });
    } catch (err) {
      setSubmitStatus({ text: `Error: ${err.message}`, kind: "err" });
    } finally {
      setSubmitting(false);
    }
  };

  const resolveIssue = async (issue) => {
    setIssues((prev) =>
      prev.map((i) => (i.issue_id === issue.issue_id ? { ...i, resolved: true } : i))
    );
    const b = base();
    if (!b) return;
    try {
      await fetch(`${b}issues/${issue.issue_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: true }),
      });
    } catch {
      // no PATCH /issues endpoint yet — UI already reflects the intent
    }
  };

  const highCount = issues.filter((i) => i.severity === "HIGH").length;
  const mediumCount = issues.filter((i) => i.severity === "MEDIUM").length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">GST</div>
          <div className="brand-name">
            Compliance
            <br />
            Copilot
          </div>
        </div>
        <nav>
          {[
            ["dashboard", "01", "Dashboard"],
            ["filing", "02", "New Filing"],
            ["settings", "03", "Settings"],
          ].map(([key, num, label]) => (
            <div
              key={key}
              className={`nav-item${view === key ? " nav-item--active" : ""}`}
              onClick={() => setView(key)}
            >
              <span className="nav-icon">{num}</span> {label}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          BUILT ON
          <br />
          AWS LAMBDA · API GATEWAY
          <br />
          DYNAMODB · STEP FUNCTIONS
        </div>
      </aside>

      <main className="main">
        {view === "dashboard" && (
          <section className="view">
            <div className="view-header">
              <div>
                <h1>Dashboard</h1>
                <div className="view-sub">this month's filings, at a glance</div>
              </div>
              <div className="ref-tag">LEDGER REF. GST-CC-01</div>
            </div>

            <div className="stat-strip">
              <div className="stat">
                <div className="stat-num">{filings.length}</div>
                <div className="stat-label">Filings on record</div>
              </div>
              <div className="stat">
                <div className="stat-num stat-num--red">{issues.length}</div>
                <div className="stat-label">Issues flagged</div>
              </div>
              <div className="stat">
                <div className="stat-num stat-num--red">{highCount}</div>
                <div className="stat-label">High severity</div>
              </div>
              <div className="stat">
                <div className="stat-num stat-num--brass">{mediumCount}</div>
                <div className="stat-label">Medium severity</div>
              </div>
            </div>

            <div className="ledger-row ledger-row--flush">
              <div className="row-label">§ FLAGGED FOR REVIEW</div>
              <button className="btn" onClick={loadDashboard}>
                Refresh ledger
              </button>
              <StatusLine text={dashboardStatus.text} kind={dashboardStatus.kind} />
              {issues.length === 0 ? (
                <div className="empty">Nothing flagged. A clean page.</div>
              ) : (
                issues.map((issue, i) => (
                  <IssueCard
                    key={issue.issue_id || i}
                    issue={issue}
                    onResolve={resolveIssue}
                  />
                ))
              )}
            </div>
          </section>
        )}

        {view === "filing" && (
          <section className="view">
            <div className="view-header">
              <div>
                <h1>New Filing</h1>
                <div className="view-sub">submit invoices for compliance review</div>
              </div>
              <div className="ref-tag">§2 FILING ENTRY</div>
            </div>

            <div className="ledger-row">
              <div className="field-line">
                <label htmlFor="businessId">Business ID</label>
                <input
                  id="businessId"
                  value={businessId}
                  onChange={(e) => setBusinessId(e.target.value)}
                />
              </div>
              <div className="field-line">
                <label htmlFor="period">Period</label>
                <input id="period" value={period} onChange={(e) => setPeriod(e.target.value)} />
              </div>
              <div className="field-line">
                <label htmlFor="filingType">Filing type</label>
                <input
                  id="filingType"
                  value={filingType}
                  onChange={(e) => setFilingType(e.target.value)}
                />
              </div>
              <div className="field-line">
                <label htmlFor="invoicesJson">Invoices</label>
                <input
                  id="invoicesJson"
                  value={invoicesJson}
                  onChange={(e) => setInvoicesJson(e.target.value)}
                />
              </div>
              <div className="actions">
                <button className="btn btn--primary" onClick={submitFiling} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit filing"}
                </button>
                <button className="btn" onClick={loadSample}>
                  Load sample errors
                </button>
              </div>
              <StatusLine text={submitStatus.text} kind={submitStatus.kind} />
            </div>

            <div className="ledger-row">
              <div className="row-label">§ FILINGS ON RECORD</div>
              {filings.length === 0 ? (
                <div className="empty">No entries yet — submit a filing above.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th className="mono">FILING ID</th>
                      <th>Period</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Invoices</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filings.map((f) => (
                      <tr key={f.filing_id}>
                        <td className="mono">{f.filing_id}</td>
                        <td>{f.period}</td>
                        <td>{f.filing_type}</td>
                        <td>{f.status}</td>
                        <td className="mono">{(f.invoices || []).length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {view === "settings" && (
          <section className="view">
            <div className="view-header">
              <div>
                <h1>Settings</h1>
                <div className="view-sub">connect your deployed API</div>
              </div>
              <div className="ref-tag">§3 CONFIGURATION</div>
            </div>
            <div className="ledger-row">
              <div className="field-line">
                <label htmlFor="apiUrl">API endpoint</label>
                <input
                  id="apiUrl"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://xxxxx.execute-api.us-east-1.amazonaws.com/prod/"
                />
              </div>
              <div className="settings-hint">
                Paste the <code>ApiUrl</code> output from your <code>sam deploy</code> run, or
                set it once in <code>frontend/.env</code> as <code>VITE_API_URL</code> so it's
                filled in automatically.
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}