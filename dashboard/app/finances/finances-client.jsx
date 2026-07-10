"use client";

import Link from "next/link";
import AdminShell from "../components/admin-shell";

const money = (n) => "$" + (n || 0).toLocaleString();
const CAT_COLOR = ["#3257ff", "#C9A96E", "#7c3aed", "#1c8a45", "#b45309", "#d23c3c", "#5b6275"];

export default function FinancesClient({ user, alerts, stats, txn }) {
  const maxCat = stats.byCat.length ? stats.byCat[0][1] : 1;

  const KPI = [
    { cls: "c-green",  label: "Revenue (closed)", val: money(stats.revenue) },
    { cls: "c-gold",   label: "Pipeline Value",   val: money(stats.pipeline) },
    { cls: "c-red",    label: "Expenses",         val: money(stats.expenses) },
    { cls: stats.net >= 0 ? "c-green" : "c-red", label: "Net", val: (stats.net < 0 ? "-" : "") + money(Math.abs(stats.net)) },
    { cls: "c-purple", label: "Payroll (est)",    val: money(stats.payrollEst) },
    { cls: "c-blue",   label: "Inventory Value",  val: money(stats.inventoryValue) },
  ];

  return (
    <AdminShell user={user} alerts={alerts} active="finances">
      <div className="apx-wrap">
        <div className="page-head"><h1>Finances</h1><div className="ph-sub">Revenue, pipeline, expenses &amp; profit at a glance</div></div>

        <div className="kpi-row">
          {KPI.map((k) => <div key={k.label} className={`kpi ${k.cls}`}><div className="k-label">{k.label}</div><div className="k-val" style={{ fontSize: "1.4rem" }}>{k.val}</div></div>)}
        </div>

        <div className="two-col">
          {/* Recent transactions */}
          <div className="panel">
            <div className="panel-head"><h3>Recent Transactions</h3><Link className="more" href="/expenses">Expenses →</Link></div>
            {txn.length === 0 ? <div className="empty">No transactions yet.</div> : (
              <table className="dtable">
                <thead><tr><th>Item</th><th>Category</th><th>Date</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {txn.map((t, i) => (
                    <tr key={i}>
                      <td>{t.link ? <Link href={t.link} className="idlink">{t.label}</Link> : <span className="name-cell">{t.label}</span>}<div style={{ fontSize: ".74rem", color: "var(--muted)" }}>{t.detail}</div></td>
                      <td><span className={`chip ${t.kind === "in" ? "done" : ""}`}>{t.category}</span></td>
                      <td style={{ color: "var(--muted)", fontSize: ".82rem" }}>{t.date || "—"}</td>
                      <td className="num" style={{ color: t.kind === "in" ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{t.kind === "in" ? "+" : "−"}{money(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Expense breakdown */}
          <div className="panel" style={{ alignSelf: "start" }}>
            <div className="panel-head"><h3>Expense Breakdown</h3></div>
            {stats.byCat.length === 0 ? <div className="empty">No expenses.</div> : (
              <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                {stats.byCat.map(([cat, amt], i) => (
                  <div key={cat}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".84rem", marginBottom: 5 }}>
                      <span style={{ fontWeight: 600 }}>{cat}</span><span style={{ color: "var(--muted)" }}>{money(amt)}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 100, background: "var(--bg-tint)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.round((amt / maxCat) * 100)}%`, height: "100%", borderRadius: 100, background: CAT_COLOR[i % CAT_COLOR.length] }} />
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                  <span>Total</span><span>{money(stats.expenses)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
