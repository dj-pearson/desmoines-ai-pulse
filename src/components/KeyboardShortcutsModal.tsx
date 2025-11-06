import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Keyboard, Command } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface KeyboardShortcut {
  keys: string[];
  description: string;
  category: string;
}

const shortcuts: KeyboardShortcut[] = [
  // Navigation
  { keys: ['H'], description: 'Go to home page', category: 'Navigation' },
  { keys: ['E'], description: 'Go to events page', category: 'Navigation' },
  { keys: ['R'], description: 'Go to restaurants page', category: 'Navigation' },

  // Search
  { keys: ['/'], description: 'Focus search bar', category: 'Search' },

  // Actions
  { keys: ['Esc'], description: 'Close modal or dialog', category: 'Actions' },
  { keys: ['?'], description: 'Show keyboard shortcuts', category: 'Actions' },

  // Future features
  { keys: ['⌘', 'K'], description: 'Open command palette (coming soon)', category: 'Future' },
];

const shortcutsByCategory = shortcuts.reduce((acc, shortcut) => {
  if (!acc[shortcut.category]) {
    acc[shortcut.category] = [];
  }
  acc[shortcut.category].push(shortcut);
  return acc;
}, {} as Record<string, KeyboardShortcut[]>);

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsModal({
  open,
  onOpenChange,
}: KeyboardShortcutsModalProps) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  const formatKey = (key: string): string => {
    if (key === '⌘') return isMac ? '⌘' : 'Ctrl';
    return key;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Keyboard className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </div>
          <DialogDescription>
            Use these keyboard shortcuts to navigate faster and boost your productivity
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {Object.entries(shortcutsByCategory).map(([category, categoryShortcuts]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {category}
              </h3>
              <div className="space-y-2">
                {categoryShortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <React.Fragment key={keyIndex}>
                          <Badge
                            variant="outline"
                            className="px-2 py-1 text-xs font-mono bg-background"
                          >
                            {formatKey(key)}
                          </Badge>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="text-xs text-muted-foreground mx-1">+</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-start gap-3">
            <Command className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">Pro Tip</p>
              <p>
                Press <Badge variant="outline" className="mx-1 px-1.5 py-0.5 text-xs font-mono">?</Badge>
                anytime to see this shortcuts guide. Most shortcuts work from anywhere on the site.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
