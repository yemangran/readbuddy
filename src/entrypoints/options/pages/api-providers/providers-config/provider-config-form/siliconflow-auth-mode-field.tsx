import type { APIProviderConfig } from "@/types/config/provider"
import type { SiliconFlowAuthMode } from "@/types/config/provider/provider-specific-settings"
import { Icon } from "@iconify/react"
import { useSelector } from "@tanstack/react-store"
import { useAutosaveContext } from "@/components/form/use-autosave"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/base-ui/alert"
import { Field, FieldLabel } from "@/components/ui/base-ui/field"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/base-ui/tabs"
import { isLLMProviderConfig } from "@/types/config/provider"
import {
  SILICONFLOW_DEFAULT_SPONSORED_MODEL,
  SILICONFLOW_SPONSORED_MODELS,
} from "@/utils/constants/models"
import { i18n } from "@/utils/i18n"
import { resolveSiliconFlowAuthMode } from "@/utils/providers/siliconflow-signing"
import { withForm } from "./form"

export function SiliconFlowSponsoredBanner() {
  return (
    <Alert className="border-primary/20 bg-primary/5" data-testid="siliconflow-sponsored-banner">
      <Icon icon="tabler:sparkles" className="size-4 text-primary" />
      <AlertTitle className="font-medium text-foreground">
        {i18n.t("options.apiProviders.form.siliconflow.sponsoredNoticeTitle")}
      </AlertTitle>
      <AlertDescription className="text-muted-foreground">
        {i18n.t("options.apiProviders.form.siliconflow.sponsoredNoticeDescription")}
      </AlertDescription>
    </Alert>
  )
}

export const SiliconFlowAuthModeField = withForm({
  ...{ defaultValues: {} as APIProviderConfig },
  render: function Render({ form }) {
    const providerConfig = useSelector(form.store, (state) => state.values)
    const autosave = useAutosaveContext()

    if (providerConfig.provider !== "siliconflow") {
      return null
    }

    const currentAuthMode = resolveSiliconFlowAuthMode(providerConfig)

    const handleModeChange = (newMode: SiliconFlowAuthMode) => {
      autosave.edit(
        () => {
          const currentSettings = providerConfig.providerSpecificSettings ?? {}
          form.setFieldValue("providerSpecificSettings", {
            ...currentSettings,
            authMode: newMode,
          })

          if (newMode === "sponsored" && isLLMProviderConfig(providerConfig)) {
            const currentModel = providerConfig.model
            if (
              currentModel?.isCustomModel ||
              !SILICONFLOW_SPONSORED_MODELS.includes(currentModel?.model as never)
            ) {
              form.setFieldValue("model.isCustomModel", false)
              form.setFieldValue("model.model", SILICONFLOW_DEFAULT_SPONSORED_MODEL)
              form.setFieldValue("model.customModel", null)
            }
          }
        },
        { immediate: true },
      )
    }

    return (
      <Field>
        <FieldLabel>{i18n.t("options.apiProviders.form.siliconflow.authMode")}</FieldLabel>
        <Tabs
          value={currentAuthMode}
          onValueChange={(value) => handleModeChange(value as SiliconFlowAuthMode)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sponsored">
              {i18n.t("options.apiProviders.form.siliconflow.sponsoredMode")}
            </TabsTrigger>
            <TabsTrigger value="byok">
              {i18n.t("options.apiProviders.form.siliconflow.byokMode")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </Field>
    )
  },
})
