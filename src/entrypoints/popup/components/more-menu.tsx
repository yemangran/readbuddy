import { Icon } from "@iconify/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/base-ui/dropdown-menu"
import {
  GITHUB_DISCUSSIONS_IDEAS_URL,
  GITHUB_DISCUSSIONS_URL,
  GITHUB_ISSUES_URL,
  GITHUB_REPO_URL,
} from "@/utils/constants/app"
import { i18n } from "@/utils/i18n"
import { getReviewUrl } from "@/utils/utils"

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer")
}

/**
 * Grouped the same way as the options page it mirrors: what to read or reach us through
 * under Help, and where to find the other users under Community.
 */
export function MoreMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 hover:bg-neutral-300 dark:hover:bg-neutral-700"
          />
        }
      >
        <Icon icon="tabler:dots" className="size-4" strokeWidth={1.6} />
        <span className="text-[13px] font-medium">{i18n.t("popup.more.title")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-fit">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{i18n.t("popup.more.help")}</DropdownMenuLabel>

          <DropdownMenuItem
            onClick={() => openExternal(`${GITHUB_REPO_URL}#readme`)}
            className="cursor-pointer"
          >
            <Icon icon="tabler:help-circle" className="size-4" strokeWidth={1.6} />
            {i18n.t("popup.more.tutorial")}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => openExternal(GITHUB_DISCUSSIONS_IDEAS_URL)}
            className="cursor-pointer"
          >
            <Icon icon="tabler:message-circle" className="size-4" strokeWidth={1.6} />
            {i18n.t("popup.more.featureRequest")}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => openExternal(GITHUB_ISSUES_URL)}
            className="cursor-pointer"
          >
            <Icon icon="tabler:bug" className="size-4" strokeWidth={1.6} />
            {i18n.t("popup.more.bugReport")}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>{i18n.t("popup.more.community")}</DropdownMenuLabel>

          <DropdownMenuItem
            onClick={() => openExternal(GITHUB_DISCUSSIONS_URL)}
            className="cursor-pointer"
          >
            <Icon icon="tabler:messages" className="size-4" strokeWidth={1.6} />
            {i18n.t("popup.more.discussions")}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => openExternal(GITHUB_REPO_URL)}
            className="cursor-pointer"
          >
            <Icon icon="fa7-brands:github" className="size-4" strokeWidth={1.6} />
            {i18n.t("popup.more.starGithub")}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => openExternal(getReviewUrl("popup"))}
            className="cursor-pointer"
          >
            <Icon icon="tabler:star" className="size-4" strokeWidth={1.6} />
            {i18n.t("popup.more.rateUs")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
