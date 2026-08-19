import MigrateClient from "./migrate-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Database Migration · IOT TECHS" };

// One-time DB move helper (Render → Railway, or any host swap). Download the live database, then
// upload it on the new instance. Restore only works when MIGRATION_SECRET is set in the environment.
export default function MigratePage() {
  return <MigrateClient restoreEnabled={!!String(process.env.MIGRATION_SECRET || "").trim()} />;
}
