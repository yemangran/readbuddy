import { Icon } from "@iconify/react"
import { useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/base-ui/popover"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/base-ui/sidebar"
import { GITHUB_REPO_URL } from "@/utils/constants/app"
import { i18n } from "@/utils/i18n"
import { version } from "../../../../package.json"

export function WhatsNewFooter() {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <SidebarMenu>
        <SidebarMenuItem>
          <PopoverTrigger
            render={
              <SidebarMenuButton
                aria-label={i18n.t("options.whatsNew.title")}
                tooltip={i18n.t("options.whatsNew.title")}
              />
            }
          >
            <Icon icon="tabler:sparkles" />
            <span>{i18n.t("options.whatsNew.title")}</span>
          </PopoverTrigger>
        </SidebarMenuItem>
      </SidebarMenu>

      <PopoverContent
        align="end"
        initialFocus={(openType) => openType === "keyboard"}
        side="top"
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-2rem))] gap-3 p-4"
      >
        <PopoverHeader className="gap-1.5">
          <div className="flex items-center justify-between">
            <PopoverTitle className="text-sm font-semibold">
              {i18n.t("options.whatsNew.title")}
            </PopoverTitle>
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground">
              v{version}
            </span>
          </div>
          <PopoverDescription className="text-xs leading-relaxed text-muted-foreground">
            {i18n.t("options.whatsNew.description")}
          </PopoverDescription>
        </PopoverHeader>

        <a
          href={`${GITHUB_REPO_URL}/releases`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
        >
          <span className="flex items-center gap-2">
            <Icon icon="tabler:brand-github" className="size-4 text-muted-foreground" />
            <span>{i18n.t("options.whatsNew.releases")}</span>
          </span>
          <Icon icon="tabler:external-link" className="size-3.5 text-muted-foreground" />
        </a>
      </PopoverContent>
    </Popover>
  )
}
