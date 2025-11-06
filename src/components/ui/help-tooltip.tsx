import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpCircle, Info, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HelpTooltipProps {
  content: string | React.ReactNode;
  title?: string;
  children?: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
  iconClassName?: string;
  variant?: 'default' | 'info' | 'warning';
  size?: 'sm' | 'md' | 'lg';
}

const iconMap = {
  default: HelpCircle,
  info: Info,
  warning: AlertCircle,
};

const sizeMap = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export function HelpTooltip({
  content,
  title,
  children,
  side = 'top',
  align = 'center',
  className,
  iconClassName,
  variant = 'default',
  size = 'md',
}: HelpTooltipProps) {
  const Icon = iconMap[variant];

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        {children || (
          <button
            type="button"
            className={cn(
              'inline-flex items-center justify-center',
              'text-muted-foreground hover:text-foreground',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'rounded-full',
              className
            )}
            aria-label="Help"
          >
            <Icon className={cn(sizeMap[size], iconClassName)} />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        className="max-w-xs text-sm z-50"
      >
        {title && (
          <p className="font-semibold mb-1 text-foreground">{title}</p>
        )}
        {typeof content === 'string' ? (
          <p className="text-muted-foreground leading-relaxed">{content}</p>
        ) : (
          content
        )}
      </TooltipContent>
    </Tooltip>
  );
}
