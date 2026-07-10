"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "../login/actions";

const NAVS = [
  { href: "/dashboard",   label: "Staff" },
  { href: "/manager",     label: "Manager" },
  { href: "/sales",       label: "Sales" },
  { href: "/tech",        label: "Tech" },
  { href: "/customers",   label: "Customers" },
  { href: "/portal",      label: "Portal" },
  { href: "/users",       label: "Users" },
  { href: "/activity",    label: "Activity" },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="main-nav">
      <div className="main-nav-inner">
        {NAVS.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`nav-link${pathname === n.href ? " active" : ""}`}
          >
            {n.label}
          </Link>
        ))}
        <form action={logoutAction} style={{ marginLeft: "auto" }}>
          <button type="submit" className="nav-logout">Sign Out</button>
        </form>
      </div>
    </nav>
  );
}
