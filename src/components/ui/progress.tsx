"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

const progressVariants = cva("relative flex h-3 w-full items-center overflow-hidden rounded-full", {
  variants: {
    variant: {
      default: "bg-secondary",
      inverse: "bg-primary-foreground/20",
      warning: "bg-warning/15",
    },
  },
  defaultVariants: { variant: "default" },
})

const indicatorVariants = cva("size-full flex-1 transition-all", {
  variants: {
    variant: {
      default: "bg-primary",
      inverse: "bg-primary-container-foreground",
      warning: "bg-warning",
    },
  },
  defaultVariants: { variant: "default" },
})

function Progress({
  className,
  value,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & VariantProps<typeof progressVariants>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(progressVariants({ variant }), className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={indicatorVariants({ variant })}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
