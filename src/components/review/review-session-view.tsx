import type { ReviewCardItem, ReviewRating, ReviewSessionSummary } from "@/utils/review/types"
import { Icon } from "@iconify/react"
import { useState } from "react"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import { reviewStore } from "@/utils/review/store"
import { cn } from "@/utils/styles/utils"
import { ReviewCard } from "./review-card"

export interface ReviewSessionViewProps {
  cards: ReviewCardItem[]
  onComplete: (summary: ReviewSessionSummary) => void
  onSubmitRating?: (recordId: string, rating: ReviewRating) => Promise<unknown>
  onExit?: () => void
  className?: string
}

export function ReviewSessionView({
  cards,
  onComplete,
  onSubmitRating,
  onExit,
  className,
}: ReviewSessionViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completedIndices, setCompletedIndices] = useState<Set<number>>(new Set())
  const [ratingCounts, setRatingCounts] = useState<Record<ReviewRating, number>>({
    1: 0,
    2: 0,
    3: 0,
    4: 0,
  })

  if (!cards || cards.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-6 text-center", className)}>
        <Icon icon="tabler:circle-check" className="mb-2 size-10 text-emerald-500" />
        <p className="text-sm font-medium text-foreground">暂无待复习单词</p>
        <p className="mt-1 text-xs text-muted-foreground">今天的所有复习任务都已完成！</p>
        {onExit && (
          <Button size="sm" variant="outline" className="mt-4" onClick={onExit}>
            返回
          </Button>
        )}
      </div>
    )
  }

  const currentCard = cards[currentIndex]
  if (!currentCard) {
    return null
  }
  const total = cards.length
  const completedCount = completedIndices.size

  const handleNext = async (rating: ReviewRating) => {
    const updatedCounts = {
      ...ratingCounts,
      [rating]: ratingCounts[rating] + 1,
    }
    setRatingCounts(updatedCounts)

    const nextCompleted = new Set(completedIndices)
    nextCompleted.add(currentIndex)
    setCompletedIndices(nextCompleted)

    if (onSubmitRating) {
      await onSubmitRating(currentCard.recordId, rating)
    } else {
      await reviewStore.submitRating(currentCard.recordId, rating)
    }

    if (nextCompleted.size >= total) {
      onComplete({
        totalReviewed: total,
        ratingCounts: updatedCounts,
        remainingDueCount: 0,
      })
    } else {
      // 优先推进到下一个未完成的卡片
      let nextIdx = (currentIndex + 1) % total
      while (nextCompleted.has(nextIdx) && nextCompleted.size < total) {
        nextIdx = (nextIdx + 1) % total
      }
      setCurrentIndex(nextIdx)
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-[580px] w-full overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm",
        className,
      )}
    >
      {/* 左侧：复习队列面板 (260px~280px) */}
      <aside className="flex w-64 flex-col border-r border-border/60 bg-muted/20 select-none md:w-72">
        {/* 队列顶栏 */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">复习队列</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              ({completedCount}/{total})
            </span>
          </div>
          <Badge variant="secondary" className="px-1.5 py-0 font-mono text-[10px]">
            {Math.round((completedCount / total) * 100)}%
          </Badge>
        </div>

        {/* 单词列表，支持点选跳查 */}
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {cards.map((card, idx) => {
            const isSelected = idx === currentIndex
            const isDone = completedIndices.has(idx)
            return (
              <button
                key={card.recordId}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  "group flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors",
                  isSelected
                    ? "border border-primary/25 bg-primary/10 font-medium text-primary shadow-2xs"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  isDone && !isSelected && "opacity-60",
                )}
              >
                <div className="flex items-center gap-2 truncate">
                  {isDone ? (
                    <Icon
                      icon="tabler:circle-check"
                      className="size-3.5 shrink-0 text-emerald-500"
                    />
                  ) : isSelected ? (
                    <Icon icon="tabler:point-filled" className="size-3.5 shrink-0 text-primary" />
                  ) : (
                    <span className="mr-1 ml-1 size-1.5 shrink-0 rounded-full bg-border" />
                  )}
                  <span className="truncate font-medium">{card.term}</span>
                </div>
                {card.partOfSpeech && (
                  <span className="text-[10px] text-muted-foreground/70 group-hover:text-muted-foreground">
                    {card.partOfSpeech}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* 队列底栏统计 */}
        <div className="flex items-center justify-between border-t border-border/60 bg-card/40 px-4 py-2.5 text-[11px] text-muted-foreground">
          <span>待复习: {total - completedCount}</span>
          <span>已过关: {completedCount}</span>
        </div>
      </aside>

      {/* 右侧：主体卡片学习区域 */}
      <main className="flex flex-1 flex-col justify-between p-6 md:p-8">
        {/* 顶部右侧辅助信息栏：退出与记忆指标 */}
        <div className="flex items-center justify-between border-b border-border/40 pb-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-foreground">
              第 {currentIndex + 1} / {total} 词
            </span>
            {currentCard.reviewState && (
              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                稳定性:{" "}
                {currentCard.reviewState.stability > 0
                  ? `${currentCard.reviewState.stability.toFixed(1)} 天`
                  : "新词"}
              </Badge>
            )}
          </div>
        </div>

        {/* 主卡片渲染 */}
        <div className="my-4 flex flex-1 flex-col justify-center">
          <ReviewCard key={currentCard.recordId} card={currentCard} onNext={handleNext} />
        </div>
      </main>
    </div>
  )
}
