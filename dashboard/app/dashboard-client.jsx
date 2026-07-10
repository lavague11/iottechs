"use client";

import { useState } from "react";
import Link from "next/link";
import { CATEGORIES, STATUS, STATUS_TONE } from "../lib/spec";

const money = (n) => "$" + n.toLocaleString();

export default function DashboardClient({ jobs }) {
  const [tab, setTab] = useState("open");
  const [q, setQ] = useState("");

  const counts = Object.fromEntries(
    CATEGORIES.map((c) => [c.key, jobs.filter((j) => j.category === c.key).length])
  );

  const needle = q.trim().toLowerCase();
  const rows = jobs
    .filter((j) => j.category === tab)
    .filter((j) => {
      if (!needle) return true;
      return [j.access_id, j.customer, j.address, j.issue, j.tech]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(needle));
    });

  const issueCols = tab === "service" || tab === "upgrade";

  return (
    <>
      <div className="section-head"><span className="sh-num">01</span> Projects · {jobs.length} total</div>

      <div className="toolbar">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`toggle ${tab === c.key ? "active" : ""}`}
            onClick={() => setTab(c.key)}
          >
            {c.label} <span className="pill">{counts[c.key]}</span>
          </button>
        ))}
        <Link href="/portal" className="link-btn">Customer Portal →</Link>
      </div>

      <input
        className="search"
        type="text"
        placeholder="Search by customer, address, project ID, tech…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <table>
        <thead>
          <tr>
            <th>Project ID</th>
            <th>Customer</th>
            <th>Address</th>
            {issueCols ? <th>Details</th> : <th>Cams</th>}
            <th>Value</th>
            <th>Stage</th>
            <th>Status</th>
            <th>Tech</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.access_id}>
              <td className="mono">
                <Link href={`/project/${j.access_id}`} className="idlink">{j.access_id}</Link>
                <span className="pinchip">PIN {j.customer_pin}</span>
              </td>
              <td>{j.customer}</td>
              <td>{j.address}</td>
              {issueCols ? <td>{j.issue || "—"}</td> : <td>{j.cameras}</td>}
              <td className="val">{j.value ? money(j.value) : "—"}</td>
              <td className="stagecell">{j.stageLabel}</td>
              <td><span className={`badge ${STATUS_TONE[j.status] || "gray"}`}>{STATUS[j.status] || j.status}</span></td>
              <td>{j.tech || "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={8} className="empty">{needle ? "No projects match your search." : "No projects in this list."}</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
