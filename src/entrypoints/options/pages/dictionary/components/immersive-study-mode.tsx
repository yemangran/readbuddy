import type { LocalDictionaryRecord } from "@/utils/local-dictionary/types"
import type { ReviewCardItem, ReviewSessionSummary } from "@/utils/review/types"
import { Icon } from "@iconify/react"
import { useEffect, useState } from "react"
import { ReviewSessionView, ReviewSummaryCard } from "@/components/review"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import { reviewStore } from "@/utils/review/store"
import { cn } from "@/utils/styles/utils"

export interface ImmersiveStudyModeProps {
  records?: LocalDictionaryRecord[]
  onExit: () => void
  className?: string
}

const DEFAULT_BATCH_LIMIT = 50
const DEFAULT_RECORDS: LocalDictionaryRecord[] = []

export function ImmersiveStudyMode({
  records = DEFAULT_RECORDS,
  onExit,
  className,
}: ImmersiveStudyModeProps) {
  const [phase, setPhase] = useState<"loading" | "empty" | "reviewing" | "completed">("loading")
  const [queue, setQueue] = useState<ReviewCardItem[]>([])
  const [summary, setSummary] = useState<ReviewSessionSummary | null>(null)

  const activeRecords = records.filter((r) => !r.deletedAt)

  const loadQueue = async (forceAll = false) => {
    setPhase("loading")
    try {
      let cards = await reviewStore.buildReviewQueue(activeRecords, {
        batchLimit: DEFAULT_BATCH_LIMIT,
      })

      // If due queue is empty and forceAll is true, take all active records
      if (cards.length === 0 && forceAll && activeRecords.length > 0) {
        cards = await reviewStore.buildReviewQueue(activeRecords, {
          batchLimit: DEFAULT_BATCH_LIMIT,
          now: Date.now() + 1000 * 3600 * 24 * 365, // virtual future to load all
        })
      }

      if (cards.length === 0) {
        setPhase("empty")
      } else {
        setQueue(cards)
        setPhase("reviewing")
      }
    } catch {
      setPhase("empty")
    }
  }

  useEffect(() => {
    void loadQueue(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records.length])

  return (
    <div className={cn("flex min-h-[600px] w-full flex-col", className)}>
      {/* Top action header */}
      <div className="mb-6 flex items-center justify-between border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onExit}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
            aria-label="返回词典"
          >
            <Icon icon="tabler:arrow-left" className="mr-1.5 size-4" />
            返回词典
          </Button>
          <div className="h-4 w-px bg-border/80" />
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">闪卡复习</h2>
            <Badge variant="secondary" className="text-[11px] font-normal">
              FSRS 间隔记忆
            </Badge>
          </div>
        </div>

        <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">
            1-4
          </span>
          <span>评估难度</span>
          <span className="text-border">·</span>
          <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">
            Space / Enter
          </span>
          <span>翻转与前进</span>
        </div>
      </div>

      {/* Main Review Area */}
      <div className="flex flex-1 flex-col items-center justify-center">
        {phase === "loading" && (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Icon icon="tabler:loader-2" className="mb-3 size-8 animate-spin text-primary" />
            <p className="text-sm">正在加载复习卡片...</p>
          </div>
        )}

        {phase === "empty" && (
          <div className="flex max-w-md flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 p-8 text-center shadow-xs">
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <Icon icon="tabler:circle-check" className="size-8" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">太棒了！暂无待复习单词</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              当前生词本中的所有单词都已复习完毕或尚未到达复习时间。
            </p>
            <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
              {activeRecords.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 cursor-pointer"
                  onClick={() => void loadQueue(true)}
                >
                  <Icon icon="tabler:refresh" className="mr-1.5 size-4" />
                  复习全部生词
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                className="flex-1 cursor-pointer"
                onClick={onExit}
              >
                返回词典
              </Button>
            </div>
          </div>
        )}

        {phase === "reviewing" && queue.length > 0 && (
          <div className="w-full">
            <ReviewSessionView
              cards={queue}
              onComplete={(res) => {
                setSummary(res)
                setPhase("completed")
              }}
              onExit={onExit}
            />
          </div>
        )}

        {phase === "completed" && summary && (
          <div className="w-full max-w-md">
            <ReviewSummaryCard
              summary={summary}
              onStudyMore={() => void loadQueue(false)}
              onOpenDictionary={onExit}
            />
          </div>
        )}
      </div>
    </div>
  )
}
