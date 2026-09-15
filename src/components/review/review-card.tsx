import type { ReviewCardItem, ReviewRating } from "@/utils/review/types"
import { Icon } from "@iconify/react"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import { cn } from "@/utils/styles/utils"

export interface ReviewCardProps {
  card: ReviewCardItem
  onNext: (rating: ReviewRating) => void
  className?: string
}

function playPronunciation(text: string, e?: React.MouseEvent) {
  e?.stopPropagation()
  if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return
  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "en-US"
    window.speechSynthesis.speak(utterance)
  } catch (err) {
    console.error("Speech synthesis failed:", err)
  }
}

const RATING_OPTIONS: Array<{
  rating: ReviewRating
  label: string
  keyHint: string
  variantClass: string
  activeClass: string
}> = [
  {
    rating: 1,
    label: "重来",
    keyHint: "1",
    variantClass:
      "hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/40 dark:hover:text-red-400",
    activeClass:
      "bg-red-500/15 text-red-600 border-red-500/60 dark:text-red-400 font-semibold shadow-xs",
  },
  {
    rating: 2,
    label: "困难",
    keyHint: "2",
    variantClass:
      "hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500/40 dark:hover:text-amber-400",
    activeClass:
      "bg-amber-500/15 text-amber-600 border-amber-500/60 dark:text-amber-400 font-semibold shadow-xs",
  },
  {
    rating: 3,
    label: "良好",
    keyHint: "3",
    variantClass:
      "hover:bg-blue-500/10 hover:text-blue-600 hover:border-blue-500/40 dark:hover:text-blue-400",
    activeClass:
      "bg-blue-500/15 text-blue-600 border-blue-500/60 dark:text-blue-400 font-semibold shadow-xs",
  },
  {
    rating: 4,
    label: "简单",
    keyHint: "4",
    variantClass:
      "hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/40 dark:hover:text-emerald-400",
    activeClass:
      "bg-emerald-500/15 text-emerald-600 border-emerald-500/60 dark:text-emerald-400 font-semibold shadow-xs",
  },
]

export function ReviewCard({ card, onNext, className }: ReviewCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [selectedRating, setSelectedRating] = useState<ReviewRating | null>(null)
  const [prevRecordId, setPrevRecordId] = useState(card.recordId)

  if (prevRecordId !== card.recordId) {
    setPrevRecordId(card.recordId)
    setIsFlipped(false)
    setSelectedRating(null)
  }

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting if user is in an input or textarea
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        return
      }

      if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
        e.preventDefault()
        const rating = Number(e.key) as ReviewRating
        setSelectedRating(rating)
        if (!isFlipped) {
          setIsFlipped(true)
        }
      } else if (isFlipped && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault()
        if (selectedRating !== null) {
          onNext(selectedRating)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isFlipped, selectedRating, onNext])

  const handleRatingClick = (rating: ReviewRating) => {
    setSelectedRating(rating)
    if (!isFlipped) {
      setIsFlipped(true)
    }
  }

  const handleCommitNext = () => {
    if (selectedRating !== null) {
      onNext(selectedRating)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4 text-card-foreground shadow-xs transition-all",
        className,
      )}
    >
      {/* Front / Common header area */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground select-text">
              {card.term}
            </h2>
            {card.partOfSpeech && (
              <Badge variant="outline" className="px-1.5 py-0 text-xs">
                {card.partOfSpeech}
              </Badge>
            )}
          </div>
          <button
            type="button"
            aria-label="朗读发音"
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={(e) => playPronunciation(card.term, e)}
          >
            <Icon icon="tabler:volume" className="size-4" />
          </button>
        </div>

        {/* Phonetic symbol: always show once revealed or if on answer face */}
        {isFlipped && card.phonetic && (
          <span className="font-mono text-xs text-muted-foreground">{card.phonetic}</span>
        )}

        {/* Answer side details (revealed when flipped) */}
        {isFlipped && (
          <div className="flex animate-in flex-col gap-3 border-t border-border/40 pt-3 duration-200 fade-in-50">
            {/* Definition */}
            {card.definition && (
              <div className="text-sm leading-relaxed font-medium text-foreground select-text">
                {card.definition}
              </div>
            )}

            {/* Context sentence and translation */}
            {card.sentence && (
              <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-2.5 text-xs">
                <p className="leading-relaxed font-normal text-muted-foreground select-text">
                  {card.sentence}
                </p>
                {card.sentenceTranslation && (
                  <p className="leading-relaxed font-normal text-muted-foreground/80 select-text">
                    {card.sentenceTranslation}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer controls: 4 ratings + Next button */}
      <div className="mt-4 flex flex-col gap-2 pt-2">
        {/* Rating buttons row */}
        <div className="grid grid-cols-4 gap-1.5">
          {RATING_OPTIONS.map(({ rating, label, variantClass, activeClass }) => {
            const isSelected = selectedRating === rating
            return (
              <button
                key={rating}
                type="button"
                className={cn(
                  "flex h-8 cursor-pointer items-center justify-center rounded-lg border border-border/60 text-xs font-medium transition-all",
                  variantClass,
                  isSelected && activeClass,
                )}
                onClick={() => handleRatingClick(rating)}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* When flipped, show prominent Next button */}
        {isFlipped && (
          <Button
            size="sm"
            className="mt-1 w-full cursor-pointer font-medium"
            disabled={selectedRating === null}
            onClick={handleCommitNext}
          >
            下一个 (继续)
            <Icon icon="tabler:arrow-right" className="ml-1 size-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
