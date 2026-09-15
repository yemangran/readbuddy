import type { LocalDictionaryRecord } from "@/utils/local-dictionary/types"
import type { ReviewCardItem, ReviewSessionSummary } from "@/utils/review/types"
import { Icon } from "@iconify/react"
import { useState } from "react"
import { ReviewSessionView, ReviewSummaryCard } from "@/components/review"
import { Button } from "@/components/ui/base-ui/button"
import { openOptionsPage } from "@/utils/navigation"
import { reviewStore } from "@/utils/review/store"
import { cn } from "@/utils/styles/utils"

export interface LearningTabProps {
  records?: LocalDictionaryRecord[]
  dueCount?: number
  isLoading?: boolean
  onOpenFullscreenReview?: () => void
  onOpenDictionary?: () => void
  className?: string
}

const DEFAULT_EMPTY_RECORDS: LocalDictionaryRecord[] = []

export function LearningTab({
  records = DEFAULT_EMPTY_RECORDS,
  dueCount = 0,
  isLoading = false,
  onOpenFullscreenReview,
  onOpenDictionary,
  className,
}: LearningTabProps) {
  const [phase, setPhase] = useState<"idle" | "reviewing" | "completed">("idle")
  const [reviewQueue, setReviewQueue] = useState<ReviewCardItem[]>([])
  const [summary, setSummary] = useState<ReviewSessionSummary | null>(null)
  const [isQueueLoading, setIsQueueLoading] = useState(false)

  const activeRecords = records.filter((r) => !r.deletedAt)
  const totalCount = activeRecords.length

  const handleStartReview = async () => {
    setIsQueueLoading(true)
    try {
      const queue = await reviewStore.buildReviewQueue(activeRecords, { batchLimit: 15 })
      setReviewQueue(queue)
      setPhase("reviewing")
    } finally {
      setIsQueueLoading(false)
    }
  }

  const handleSessionComplete = (result: ReviewSessionSummary) => {
    setSummary(result)
    setPhase("completed")
  }

  const handleOpenDictionary = () => {
    if (onOpenDictionary) {
      onOpenDictionary()
    } else {
      void openOptionsPage()
    }
  }

  const handleOpenFullscreen = () => {
    if (onOpenFullscreenReview) {
      onOpenFullscreenReview()
    } else {
      void openOptionsPage()
    }
  }

  if (isLoading || isQueueLoading) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-8 text-center", className)}>
        <Icon icon="tabler:loader-2" className="mb-2 size-6 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">加载生词中...</span>
      </div>
    )
  }

  if (phase === "reviewing") {
    return (
      <div className={cn("flex flex-col", className)}>
        <ReviewSessionView
          cards={reviewQueue}
          onComplete={handleSessionComplete}
          onExit={() => setPhase("idle")}
        />
      </div>
    )
  }

  if (phase === "completed" && summary) {
    return (
      <div className={cn("flex flex-col", className)}>
        <ReviewSummaryCard
          summary={summary}
          onStudyMore={handleStartReview}
          onOpenDictionary={handleOpenDictionary}
        />
      </div>
    )
  }

  // Idle phase / overview
  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      <div className="flex flex-col rounded-xl border border-border/70 bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon icon="tabler:cards" className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">本地词典复习</h3>
              <p className="text-[11px] text-muted-foreground">基于 FSRS 间隔重复记忆算法</p>
            </div>
          </div>
          {dueCount > 0 ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
              {dueCount}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <Icon icon="tabler:check" className="size-3.5" />
              已完成
            </span>
          )}
        </div>

        <div className="my-3.5 grid grid-cols-2 gap-2 border-t border-border/40 pt-2">
          <div className="flex flex-col rounded-lg bg-muted/40 p-2 text-center">
            <span className="text-[11px] text-muted-foreground">待复习词</span>
            <span className="mt-0.5 text-base font-bold text-foreground">{dueCount}</span>
          </div>
          <div className="flex flex-col rounded-lg bg-muted/40 p-2 text-center">
            <span className="text-[11px] text-muted-foreground">总生词数</span>
            <span className="mt-0.5 text-base font-bold text-foreground">{totalCount}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            className="w-full cursor-pointer font-medium"
            disabled={totalCount === 0}
            onClick={handleStartReview}
          >
            <Icon icon="tabler:player-play" className="mr-1.5 size-3.5" />
            {dueCount > 0 ? "开始复习" : "开始学习新词"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="w-full cursor-pointer text-xs text-muted-foreground"
            onClick={handleOpenFullscreen}
          >
            <Icon icon="tabler:external-link" className="mr-1.5 size-3.5" />
            在独立页面中全屏复习
          </Button>
        </div>
      </div>
    </div>
  )
}
