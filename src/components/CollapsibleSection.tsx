import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  id?: string;
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  itemCount?: number;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export function CollapsibleSection({
  id,
  title,
  icon,
  defaultOpen = true,
  itemCount,
  badge,
  children,
  className,
  headerClassName,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger asChild>
        <button
          id={id}
          className={cn(
            'flex items-center justify-between w-full py-3 px-1 group text-left',
            'hover:bg-muted/30 rounded-lg transition-colors -mx-1',
            headerClassName
          )}
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            {badge}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            {itemCount !== undefined && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            )}
            <ChevronDown
              className={cn(
                'h-5 w-5 transition-transform duration-200',
                open && 'rotate-180'
              )}
            />
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
