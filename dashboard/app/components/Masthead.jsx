import NavBar from "./NavBar";

// VAULT DARK masthead — brand left, document tag right. Server component.
export default function Masthead({ docType = "Project Dashboard", tag, date, showNav = true }) {
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <div className="brand">
          <div className="name">IOT TECHS</div>
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
