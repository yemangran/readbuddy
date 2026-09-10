import { env } from "@/env"

export function openLogIn() {
  window.open(`${env.WXT_WEBSITE_URL}/log-in`, "_blank")
}
