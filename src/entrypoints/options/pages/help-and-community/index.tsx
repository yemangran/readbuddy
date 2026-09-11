import {
  IconBook,
  IconBrandGithub,
  IconBug,
  IconGitPullRequest,
  IconMessageCircle,
} from "@tabler/icons-react"
import {
  FluidCard,
  FluidCardDescription,
  FluidCardGroup,
  FluidCardHeader,
  FluidCardMedia,
  FluidCardTitle,
} from "@/components/ui/base-ui/fluid-card"
import {
  GITHUB_DISCUSSIONS_IDEAS_URL,
  GITHUB_DISCUSSIONS_URL,
  GITHUB_ISSUES_URL,
  GITHUB_REPO_URL,
} from "@/utils/constants/app"
import { i18n } from "@/utils/i18n"
import { ConfigSection } from "../../components/config-section"
import { PageLayout } from "../../components/page-layout"

export function HelpAndCommunityPage() {
  return (
    <PageLayout
      title={i18n.t("options.helpAndCommunity.title")}
      description={i18n.t("options.helpAndCommunity.pageDescription")}
      innerClassName="flex flex-col gap-10"
    >
      <ConfigSection
        title={i18n.t("options.helpAndCommunity.help.title")}
        titleClassName="border-b-0"
      >
        <FluidCardGroup columns={2}>
          <FluidCard
            href={`${GITHUB_REPO_URL}#readme`}
            external
            label={i18n.t("options.helpAndCommunity.tutorial.title")}
          >
            <FluidCardHeader>
              <FluidCardMedia icon={IconBook} />
              <FluidCardTitle>{i18n.t("options.helpAndCommunity.tutorial.title")}</FluidCardTitle>
              <FluidCardDescription>
                {i18n.t("options.helpAndCommunity.tutorial.description")}
              </FluidCardDescription>
            </FluidCardHeader>
          </FluidCard>

          <FluidCard
            href={GITHUB_ISSUES_URL}
            external
            label={i18n.t("options.helpAndCommunity.bugReport.title")}
          >
            <FluidCardHeader>
              <FluidCardMedia icon={IconBug} />
              <FluidCardTitle>{i18n.t("options.helpAndCommunity.bugReport.title")}</FluidCardTitle>
              <FluidCardDescription>
                {i18n.t("options.helpAndCommunity.bugReport.description")}
              </FluidCardDescription>
            </FluidCardHeader>
          </FluidCard>

          <FluidCard
            href={GITHUB_DISCUSSIONS_IDEAS_URL}
            external
            label={i18n.t("options.helpAndCommunity.featureRequest.title")}
          >
            <FluidCardHeader>
              <FluidCardMedia icon={IconMessageCircle} />
              <FluidCardTitle>
                {i18n.t("options.helpAndCommunity.featureRequest.title")}
              </FluidCardTitle>
              <FluidCardDescription>
                {i18n.t("options.helpAndCommunity.featureRequest.description")}
              </FluidCardDescription>
            </FluidCardHeader>
          </FluidCard>

          <FluidCard
            href={GITHUB_REPO_URL}
            external
            label={i18n.t("options.helpAndCommunity.github.title")}
          >
            <FluidCardHeader>
              <FluidCardMedia icon={IconBrandGithub} />
              <FluidCardTitle>{i18n.t("options.helpAndCommunity.github.title")}</FluidCardTitle>
              <FluidCardDescription>
                {i18n.t("options.helpAndCommunity.github.description")}
              </FluidCardDescription>
            </FluidCardHeader>
          </FluidCard>
        </FluidCardGroup>
      </ConfigSection>

      <ConfigSection
        title={i18n.t("options.helpAndCommunity.community.title")}
        titleClassName="border-b-0"
      >
        <FluidCardGroup columns={2}>
          <FluidCard
            href={GITHUB_DISCUSSIONS_URL}
            external
            label={i18n.t("options.helpAndCommunity.discussions.title")}
          >
            <FluidCardHeader>
              <FluidCardMedia icon={IconMessageCircle} />
              <FluidCardTitle>
                {i18n.t("options.helpAndCommunity.discussions.title")}
              </FluidCardTitle>
              <FluidCardDescription>
                {i18n.t("options.helpAndCommunity.discussions.description")}
              </FluidCardDescription>
            </FluidCardHeader>
          </FluidCard>

          <FluidCard
            href={`${GITHUB_REPO_URL}/pulls`}
            external
            label={i18n.t("options.helpAndCommunity.contribute.title")}
          >
            <FluidCardHeader>
              <FluidCardMedia icon={IconGitPullRequest} />
              <FluidCardTitle>{i18n.t("options.helpAndCommunity.contribute.title")}</FluidCardTitle>
              <FluidCardDescription>
                {i18n.t("options.helpAndCommunity.contribute.description")}
              </FluidCardDescription>
            </FluidCardHeader>
          </FluidCard>
        </FluidCardGroup>
      </ConfigSection>
    </PageLayout>
  )
}
