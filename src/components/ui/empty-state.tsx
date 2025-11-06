import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  icon?: LucideIcon;
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: EmptyStateAction[];
  className?: string;
  children?: React.ReactNode;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  className,
  children,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8' : 'py-12 md:py-16',
        className
      )}
    >
      {Icon && (
        <div className={cn(
          'rounded-full bg-muted flex items-center justify-center mb-4',
          compact ? 'w-12 h-12' : 'w-16 h-16 md:w-20 md:h-20'
        )}>
          <Icon className={cn(
            'text-muted-foreground',
            compact ? 'w-6 h-6' : 'w-8 h-8 md:w-10 md:h-10'
          )} />
        </div>
      )}

      <h3 className={cn(
        'font-semibold text-foreground mb-2',
        compact ? 'text-base' : 'text-lg md:text-xl'
      )}>
        {title}
      </h3>

      {description && (
        <p className={cn(
          'text-muted-foreground max-w-md mx-auto mb-6',
          compact ? 'text-sm' : 'text-sm md:text-base'
        )}>
          {description}
        </p>
      )}

      {children}

      {actions && actions.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center gap-3 mt-6">
          {actions.map((action, index) => {
            const ActionIcon = action.icon;
            return (
              <Button
                key={index}
                onClick={action.onClick}
                variant={action.variant || 'default'}
                className={cn(compact && 'h-9')}
              >
                {ActionIcon && <ActionIcon className="w-4 h-4 mr-2" />}
                {action.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
