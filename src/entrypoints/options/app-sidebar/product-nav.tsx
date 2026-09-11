import { Icon } from "@iconify/react"
import { Link, useLocation } from "react-router"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/base-ui/sidebar"
import { GITHUB_REPO_URL } from "@/utils/constants/app"
import { i18n } from "@/utils/i18n"

export function ProductNav() {
  const { pathname } = useLocation()

  const roadmapHref = `${GITHUB_REPO_URL}/issues`

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{i18n.t("options.sidebar.product")}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<a href={roadmapHref} target="_blank" rel="noopener noreferrer" />}
              tooltip={i18n.t("options.product.roadmap")}
            >
              <Icon icon="tabler:route" />
              <span>{i18n.t("options.product.roadmap")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Feedback used to leave for the portal; it is a page now, and the portal is one
              of the ways to reach us listed on it. */}
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/help-and-community" />}
              isActive={pathname === "/help-and-community"}
              tooltip={i18n.t("options.helpAndCommunity.title")}
            >
              <Icon icon="tabler:message-circle" />
              <span>{i18n.t("options.helpAndCommunity.title")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
