import ApplyClient from "./apply-client";

export const metadata = { title: "IOT TECHS · Join the Team" };

// Public job application. No auth — anyone can apply; they get an Application ID + PIN to track it.
export default function ApplyPage() {
  return <ApplyClient />;
}
