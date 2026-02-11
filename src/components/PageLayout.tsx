import React from "react";
import { Breadcrumbs, BreadcrumbItem } from "@/components/ui/breadcrumbs";
import { cn } from "@/lib/utils";

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
  showBreadcrumbs?: boolean;
  headerActions?: React.ReactNode;
}

export function PageLayout({
  children,
  title,
  description,
  breadcrumbs,
  className,
  showBreadcrumbs = true,
  headerActions,
}: PageLayoutProps) {
  return (
    <div className={cn("min-h-screen bg-background", className)}>
      <div className="container mx-auto mobile-padding py-6">
        {showBreadcrumbs && (
          <div className="mb-4">
            <Breadcrumbs items={breadcrumbs} />
          </div>
        )}
        
        {(title || headerActions) && (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
            <div className="space-y-1">
              {title && (
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  {title}
                </h1>
              )}
              {description && (
                <p className="text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {headerActions && (
              <div className="flex items-center gap-2">
                {headerActions}
              </div>
            )}
          </div>
        )}
        
        <div className="relative">
          {children}
        </div>
      </div>
    </div>
  );
}

export default PageLayout;