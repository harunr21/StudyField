"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps {
  min: number
  max: number
  value: [number, number]
  onValueChange: (value: [number, number]) => void
  step?: number
  className?: string
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ min, max, value, onValueChange, step = 1, className }, ref) => {
    const [dragging, setDragging] = React.useState<"min" | "max" | null>(null)
    const trackRef = React.useRef<HTMLDivElement>(null)

    const getPercent = (val: number) => {
      if (max === min) return 0
      return ((val - min) / (max - min)) * 100
    }

    const getValueFromPosition = (clientX: number) => {
      if (!trackRef.current) return min
      const rect = trackRef.current.getBoundingClientRect()
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const rawValue = min + percent * (max - min)
      return Math.round(rawValue / step) * step
    }

    const handlePointerDown = (e: React.PointerEvent, thumb: "min" | "max") => {
      e.preventDefault()
      setDragging(thumb)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    }

    const handlePointerMove = (e: React.PointerEvent) => {
      if (!dragging) return
      const newVal = getValueFromPosition(e.clientX)

      if (dragging === "min") {
        const clamped = Math.min(newVal, value[1])
        onValueChange([Math.max(min, clamped), value[1]])
      } else {
        const clamped = Math.max(newVal, value[0])
        onValueChange([value[0], Math.min(max, clamped)])
      }
    }

    const handlePointerUp = () => {
      setDragging(null)
    }

    const minPercent = getPercent(value[0])
    const maxPercent = getPercent(value[1])

    return (
      <div
        ref={ref}
        className={cn("relative flex w-full touch-none select-none items-center py-4", className)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          ref={trackRef}
          className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted"
        >
          <div
            className="absolute h-full bg-gradient-to-r from-red-500 to-rose-500 rounded-full"
            style={{
              left: `${minPercent}%`,
              width: `${maxPercent - minPercent}%`,
            }}
          />
        </div>
        {/* Min thumb */}
        <div
          className={cn(
            "absolute block h-5 w-5 rounded-full border-2 border-red-500 bg-background ring-offset-background transition-colors cursor-grab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
            dragging === "min" && "cursor-grabbing ring-2 ring-red-500/30 scale-110"
          )}
          style={{
            left: `calc(${minPercent}% - 10px)`,
            top: "50%",
            transform: "translateY(-50%)",
          }}
          onPointerDown={(e) => handlePointerDown(e, "min")}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={value[1]}
          aria-valuenow={value[0]}
          tabIndex={0}
        />
        {/* Max thumb */}
        <div
          className={cn(
            "absolute block h-5 w-5 rounded-full border-2 border-rose-500 bg-background ring-offset-background transition-colors cursor-grab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
            dragging === "max" && "cursor-grabbing ring-2 ring-rose-500/30 scale-110"
          )}
          style={{
            left: `calc(${maxPercent}% - 10px)`,
            top: "50%",
            transform: "translateY(-50%)",
          }}
          onPointerDown={(e) => handlePointerDown(e, "max")}
          role="slider"
          aria-valuemin={value[0]}
          aria-valuemax={max}
          aria-valuenow={value[1]}
          tabIndex={0}
        />
      </div>
    )
  }
)

Slider.displayName = "Slider"

export { Slider }
