import { env } from "@/env"

export function openLogIn() {
  window.open(`${env.WXT_WEBSITE_URL}/log-in`, "_blank")
}

export function openWebApp() {
  window.open(`${env.WXT_WEBSITE_URL}/home`, "_blank")
}
