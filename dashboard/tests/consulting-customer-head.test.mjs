// Customer Consulting planner: no staff rail — just a floor/view pager + full-width Walkthrough.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sp = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");
const widget = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const gw = readFileSync(new URL("../app/project/[accessId]/gateway-client.jsx", import.meta.url), "utf8");

test("SystemPlanner takes a customer flag, passed as cView === 'customer'", () => {
  assert.ok(/devLocked = false, customer = false,/.test(sp), "customer prop in signature");
  assert.ok(gw.includes('customer={cView === "customer"}'), "gateway passes the customer flag");
});

test("customer branch shows a pager + full-width walkthrough, and NO staff rail", () => {
  const branch = sp.slice(sp.indexOf("{customer ? ("), sp.indexOf("syp-floorbar"));
  assert.ok(branch.includes('syp-head--cust'), "customer head");
  assert.ok(branch.includes('className="syp-pager"'), "floor pager");
  assert.ok(branch.includes('syp-play--full'), "full-width walkthrough");
  assert.ok(branch.includes("goCust(custIdx - 1)") && branch.includes("goCust(custIdx + 1)"), "prev/next paging");
  assert.ok(!branch.includes('role="tablist"'), "the staff rail is NOT in the customer branch");
});

test("the workflow steps exist for non-customers (Background · Layout · Placement · Approval) + Survey Navigation popover", () => {
  for (const label of ["Background", "Layout", "Placement", "Approval"]) {
    assert.ok(sp.includes(`label: "${label}"`), `workflow has ${label}`);
  }
  // The ••• Go-to is the Survey Navigation popover (Add-Service-modal styling); "views" is listed as "Camera Angles".
  assert.ok(sp.includes('className="syp-navpop') && sp.includes("Survey Navigation"), "the ••• opens the Survey Navigation popover");
  assert.ok(sp.includes('label: "Camera Angles"'), "Camera Angles (the views pane) is reachable from the popover");
});

test("pager walks floors then Camera Views, driving the survey floor cmd", () => {
  assert.ok(sp.includes("const showViewsStop = hasViews || viewsStarted;"), "views stop appended only when views exist");
  assert.ok(sp.includes('if (showViewsStop && idx === floorCount) { setRailStep("views"); return; }'), "last stop = Camera Views");
  assert.ok(sp.includes('surveyCmd({ cmd: "floor", i: idx })'), "floor paging drives the survey pane");
  assert.ok(sp.includes('const custLabel = onViews ? "Camera Views" : floorLabel(custIdx);'), "label reflects floor or views");
});

test("read-only survey widget lets the floor cmd through (navigation only), edits stay office-only", () => {
  // the floor handler must sit BEFORE the `if(RO) return;` edit guard
  const floorAt = widget.indexOf('if(m.cmd==="floor")');
  const roGuardAt = widget.indexOf("if(RO) return;", widget.indexOf('m.type!=="iotSurveyCmd"'));
  assert.ok(floorAt > 0 && roGuardAt > 0 && floorAt < roGuardAt, "floor cmd precedes the RO guard");
  assert.ok(widget.includes("function pushServer(json){ if(RO||!PID||!json) return;"), "server writes stay RO-guarded");
});
