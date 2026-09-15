import type { ReviewSessionSummary } from "@/utils/review/types"
import { Icon } from "@iconify/react"
import { Button } from "@/components/ui/base-ui/button"
import { cn } from "@/utils/styles/utils"

export interface ReviewSummaryCardProps {
  summary: ReviewSessionSummary
  onStudyMore?: () => void
  onOpenDictionary?: () => void
  className?: string
}

export function ReviewSummaryCard({
  summary,
  onStudyMore,
  onOpenDictionary,
  className,
}: ReviewSummaryCardProps) {
  const { totalReviewed, ratingCounts } = summary

  return (
    <div
      className={cn(
        "flex animate-in flex-col items-center justify-center rounded-xl border border-border/70 bg-card p-5 text-center text-card-foreground shadow-xs duration-300 fade-in-50",
        className,
      )}
    >
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Icon icon="tabler:circle-check" className="size-6" />
      </div>

      <h3 className="text-base font-bold text-foreground">本次复习已完成！</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        本次共复习了 <span className="font-semibold text-foreground">{totalReviewed}</span> 个单词
      </p>

      {/* Breakdown chips */}
      <div className="my-4 grid w-full grid-cols-4 gap-1.5 text-center">
        <div className="flex flex-col rounded-lg border border-red-500/20 bg-red-500/10 p-1.5">
          <span className="text-[10px] text-red-600 dark:text-red-400">重来</span>
          <span className="text-xs font-bold text-foreground">{ratingCounts[1] || 0}</span>
        </div>
        <div className="flex flex-col rounded-lg border border-amber-500/20 bg-amber-500/10 p-1.5">
          <span className="text-[10px] text-amber-600 dark:text-amber-400">困难</span>
          <span className="text-xs font-bold text-foreground">{ratingCounts[2] || 0}</span>
        </div>
        <div className="flex flex-col rounded-lg border border-blue-500/20 bg-blue-500/10 p-1.5">
          <span className="text-[10px] text-blue-600 dark:text-blue-400">良好</span>
          <span className="text-xs font-bold text-foreground">{ratingCounts[3] || 0}</span>
        </div>
        <div className="flex flex-col rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-1.5">
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">简单</span>
          <span className="text-xs font-bold text-foreground">{ratingCounts[4] || 0}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex w-full flex-col gap-2">
        {onStudyMore && (
          <Button size="sm" className="w-full cursor-pointer" onClick={onStudyMore}>
            <Icon icon="tabler:rotate" className="mr-1.5 size-3.5" />
            再来一组
          </Button>
        )}
        {onOpenDictionary && (
          <Button
            size="sm"
            variant="outline"
            className="w-full cursor-pointer"
            onClick={onOpenDictionary}
          >
            <Icon icon="tabler:book" className="mr-1.5 size-3.5" />
            查看词典详情
          </Button>
        )}
      </div>
    </div>
  )
}
