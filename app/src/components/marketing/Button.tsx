import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

type MarketingButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';

interface MarketingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: MarketingButtonVariant;
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fluidOnMobile?: boolean;
}

const variantClassNames: Record<MarketingButtonVariant, string> = {
  primary:
    'bg-[#0F172A] text-white shadow-[0_16px_32px_-18px_rgba(15,23,42,0.7)] hover:-translate-y-0.5 hover:bg-[#1E293B] hover:shadow-[0_20px_36px_-20px_rgba(15,23,42,0.72)]',
  secondary:
    'bg-[#2563EB] text-white shadow-[0_16px_30px_-20px_rgba(37,99,235,0.7)] hover:-translate-y-0.5 hover:bg-[#1D4ED8] hover:shadow-[0_20px_34px_-20px_rgba(37,99,235,0.75)]',
  outline:
    'border border-slate-300 bg-white text-slate-800 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.4)] hover:-translate-y-0.5 hover:border-slate-900 hover:bg-slate-50 hover:text-slate-950',
  ghost:
    'bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950',
};

const MarketingButton = forwardRef<HTMLButtonElement, MarketingButtonProps>(
  (
    {
      children,
      className,
      variant = 'primary',
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      disabled,
      fluidOnMobile = true,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        className={cn(
          'inline-flex h-11 min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:translate-y-0',
          fluidOnMobile ? 'w-full sm:w-auto' : 'w-auto',
          variantClassNames[variant],
          className
        )}
        {...props}
      >
        {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : leftIcon}
        <span>{isLoading && loadingText ? loadingText : children}</span>
        {!isLoading ? rightIcon : null}
      </button>
    );
  }
);

MarketingButton.displayName = 'MarketingButton';

export default MarketingButton;
