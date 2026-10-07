"use client";
import { createBrandDoc, MUTED } from "./pdf-chrome.js";
import { DOC, documentFilename } from "./doc-filename.js";

// Site Survey PDF — the planner as a file: one page per floor with the rasterized plan (every device,
// from lib/survey2-export) and the device list. Same chrome as the other documents; named by
// lib/doc-filename.js ("Identity - Service - 0046 - Site Survey.pdf"). Returns null when there is no
// survey to print so the caller can say so instead of shipping an empty document.
export function downloadSurveyPdf({ fileBase, customerName, customerAddress, projectId, surveyImages = [], meta = {} } = {}) {
  const floors = (surveyImages || []).filter((f) => f && f.img);
  if (!floors.length) return null;
  const rightLines = [projectId ? `Project ${projectId}` : null, new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), `${floors.length} floor${floors.length === 1 ? "" : "s"}`];
  const c = createBrandDoc({ docLabel: "SITE SURVEY", rightLines, section: "Survey", meta, orientation: "landscape" });
  const missing = floors.filter((f) => f.counts && f.counts.canonical !== f.counts.rendered);
  if (missing.length) { for (const f of missing) { const msg = `Site survey "${f.name}": planner devices ${f.counts.canonical}, rendered ${f.counts.rendered}`; console.error("[survey-pdf] " + msg); if (meta.__warnings) meta.__warnings.push(msg); } }
  const dateLine = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  floors.forEach((f, i) => c.surveyFloor(f, {
    eyebrow: "SITE SURVEY",
    floorLabel: floors.length > 1 ? (f.name || `Floor ${i + 1}`) : "",
    metaLines: [customerName, projectId ? `Project ${projectId}` : null, dateLine],
  }));
  void customerAddress; void MUTED;
  return c.finish(documentFilename(fileBase || { identity: customerName || "Client", service: "Custom System", last4: String(projectId || "").slice(-4) }, { type: DOC.SITE_SURVEY }));
}
