import LoginClient from "./login-client";

export const metadata = { title: "IOT TECHS · Staff Login" };

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const next = params?.next || "";
  return <LoginClient next={next} />;
}
