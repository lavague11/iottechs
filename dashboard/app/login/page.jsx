import LoginClient from "./login-client";

export const metadata = { title: "Sign In · IOT TECHS", description: "Sign in to IOT TECHS or find your project." };

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const next = params?.next || "";
  return <LoginClient next={next} />;
}
