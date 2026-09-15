import type { ReviewCardItem, ReviewRating, ReviewSessionSummary } from "@/utils/review/types"
import { Icon } from "@iconify/react"
import { useState } from "react"
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
  const progressPercent = Math.round(((currentIndex + 1) / total) * 100)

  const handleNext = async (rating: ReviewRating) => {
    const updatedCounts = {
      ...ratingCounts,
      [rating]: ratingCounts[rating] + 1,
    }
    setRatingCounts(updatedCounts)

    if (onSubmitRating) {
      await onSubmitRating(currentCard.recordId, rating)
    } else {
      await reviewStore.submitRating(currentCard.recordId, rating)
    }

    if (currentIndex + 1 < total) {
      setCurrentIndex((prev) => prev + 1)
    } else {
      onComplete({
        totalReviewed: total,
        ratingCounts: updatedCounts,
        remainingDueCount: 0,
      })
    }
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Top progress header */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">
            {currentIndex + 1} / {total}
          </span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        {onExit && (
          <button
            type="button"
            aria-label="退出复习"
            className="flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onExit}
          >
            <Icon icon="tabler:x" className="size-4" />
          </button>
        )}
      </div>

      {/* Main card */}
      <ReviewCard key={currentCard.recordId} card={currentCard} onNext={handleNext} />
    </div>
  )
}
