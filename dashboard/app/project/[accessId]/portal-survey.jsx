"use client";
// The customer's Site Survey overlay: the saved survey (rooms + cameras) rendered READ-ONLY by the same
// planner widget staff edit in (`customerView` → ?ro=1, which seeds from the server copy — one device model,
// lib/survey2-model.js), with the existing approval bar beneath it. The bar is the deck's own ToolApproveBar:
// it shows Approve only when the office has submitted the current version, "Updated — re-approve" when it
// changed after approval, and nothing at all if there is no survey. No second approval flow.
import SiteSurveyWidget from "./site-survey-widget";
import { ToolApproveBar } from "./survey-approve";

export default function PortalSurvey({ accessId, project, meta, acceptance, submission, preview = false, onApprove }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: "1 1 0", minHeight: 0 }}>
        <SiteSurveyWidget accessId={accessId} view="customer" customerView noApproval noRoster
          propertyType={project.property_type || "commercial"} customerName={project.contact_name || project.customer} hasData />
      </div>
      <div style={{ flex: "0 0 auto", padding: "8px 14px" }}>
        <ToolApproveBar accessId={accessId} stageKey="site_survey" meta={meta} acceptance={acceptance} submission={submission}
          role="customer" preview={preview} onChange={onApprove} />
      </div>
    </div>
  );
}
