import { cookies } from "next/headers";
import { LOCAL_COOKIE } from "./local-mode";

export async function readLocalOnly(): Promise<boolean> {
  return (await cookies()).get(LOCAL_COOKIE)?.value === "1";
}
