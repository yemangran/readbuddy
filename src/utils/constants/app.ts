import { browser } from "#imports"

export { APP_NAME } from "@read-frog/definitions"
const manifest = browser.runtime.getManifest()
export const EXTENSION_VERSION = manifest.version

export const GITHUB_REPO_URL = "https://github.com/yemangran/read-toad"
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`
export const GITHUB_DISCUSSIONS_URL = `${GITHUB_REPO_URL}/discussions`
export const GITHUB_DISCUSSIONS_IDEAS_URL = `${GITHUB_DISCUSSIONS_URL}/categories/ideas`
