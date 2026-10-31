import Receptionist from "./receptionist-client";

export const metadata = { title: "Ask IOT Techs", description: "Chat with our assistant about cameras, alarms, and more — or get a free quote." };

export default function AskPage() {
  return (
    <main style={{ minHeight: "100dvh", background: "#0b0e11", color: "#fff" }}>
      <Receptionist />
    </main>
  );
}
