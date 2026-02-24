import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[14px] font-semibold tracking-[-0.005em] transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-brand-primary via-[#123160] to-brand-secondary text-white shadow-[0_16px_32px_-18px_rgba(11,31,59,0.7)] hover:-translate-y-0.5 hover:from-[#0d2548] hover:to-brand-secondary hover:shadow-[0_18px_34px_-18px_rgba(11,31,59,0.78)]",
        destructive:
          "bg-destructive text-white shadow-[0_14px_28px_-16px_rgba(239,68,68,0.62)] hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-border bg-white text-slate-700 shadow-[0_10px_24px_-20px_rgba(11,31,59,0.4)] hover:border-brand-secondary/45 hover:bg-slate-50 hover:text-brand-primary dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-brand-secondary text-white shadow-[0_14px_30px_-18px_rgba(29,78,216,0.5)] hover:bg-[#1d46be]",
        ghost:
          "text-slate-700 hover:bg-brand-primary/10 hover:text-brand-primary dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 rounded-lg gap-1.5 px-4 text-sm",
        lg: "h-12 rounded-xl px-6",
        icon: "size-11",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
