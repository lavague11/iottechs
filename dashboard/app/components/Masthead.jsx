import NavBar from "./NavBar";
import { TaglinePill, Wordmark } from "./brand";

// VAULT DARK masthead — brand left, document tag right. Server component.
export default function Masthead({ docType = "Project Dashboard", tag, date, showNav = true }) {
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <div className="brand">
          <div className="name"><Wordmark height={26} techsColor="#C9A96E" /></div>
          <TaglinePill tone="dark" style={{ borderColor: "rgba(255,255,255,.3)", margin: "4px 0" }} />
          <div className="brand-tag">La Vague Inc. · Field Service Platform</div>
          <div className="brand-rule" />
          <div className="contact">support@iot-techs.com · NYC / NJ Metro</div>
        </div>
        <div className="doc">
          <div className="doc-type">{docType}</div>
          <div className="doc-uline" />
          {tag && <div className="doc-pill">{tag}</div>}
          {date && <div className="doc-date">{date}</div>}
        </div>
      </div>
      {showNav && <NavBar />}
    </header>
  );
}
