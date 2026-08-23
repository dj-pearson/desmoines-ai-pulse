import { RefObject, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Accessibility,
  X,
  Plus,
  Minus,
  RotateCcw,
  Eye,
  MousePointer2,
  Type,
  Link2,
  Space,
  Focus,
  ZapOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAccessibilityPreferences } from '@/contexts/AccessibilityContext';
import { useAccessibility } from '@/hooks/useAccessibility';

type ToggleKey =
  | 'highContrast'
  | 'reducedMotion'
  | 'dyslexiaFont'
  | 'highlightLinks'
  | 'largeCursor'
  | 'highlightFocus'
  | 'textSpacing';

interface AccessibilityPanelProps {
  panelRef: RefObject<HTMLDivElement>;
  onClose: () => void;
}

/**
 * The accessibility settings panel, split out of AccessibilityWidget so it can
 * be lazy-loaded (WEB-PERF-020).
 *
 * The widget is mounted at the app root, so everything it imported at module
 * scope sat on the critical path for every visitor on every page: Switch,
 * Button, Link and eleven lucide icons, for a panel that opens only when
 * someone taps the floating button. The trigger keeps the two icons it draws;
 * the rest arrives with this chunk.
 *
 * Default export because React.lazy needs one.
 */
export default function AccessibilityPanel({ panelRef, onClose }: AccessibilityPanelProps) {
  const {
    preferences,
    togglePreference,
    increaseFontSize,
    decreaseFontSize,
    resetPreferences,
    hasCustomPreferences,
  } = useAccessibilityPreferences();
  const { announceToScreenReader } = useAccessibility();

  // Focus on mount rather than from the parent on isOpen. The parent's ref is
  // still empty when isOpen flips - this component has not been fetched yet -
  // so keeping the effect there would move focus nowhere.
  useEffect(() => {
    panelRef.current?.focus();
  }, [panelRef]);

  const handleTogglePreference = (key: ToggleKey, label: string) => {
    togglePreference(key);
    const newValue = !preferences[key];
    announceToScreenReader(`${label} ${newValue ? 'enabled' : 'disabled'}`, 'polite');
  };

  const handleIncrease = () => {
    if (preferences.fontSize < 4) {
      increaseFontSize();
      announceToScreenReader(`Font size increased to level ${preferences.fontSize + 1}`, 'polite');
    }
  };

  const handleDecrease = () => {
    if (preferences.fontSize > -2) {
      decreaseFontSize();
      announceToScreenReader(`Font size decreased to level ${preferences.fontSize - 1}`, 'polite');
    }
  };

  const handleReset = () => {
    resetPreferences();
    announceToScreenReader('All accessibility preferences reset to defaults', 'assertive');
  };

  const toggleItems: {
    key: ToggleKey;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: 'highContrast',
      label: 'High Contrast',
      description: 'Increase color contrast for better readability',
      icon: <Eye className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: 'highlightLinks',
      label: 'Highlight Links',
      description: 'Underline and outline all links',
      icon: <Link2 className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: 'dyslexiaFont',
      label: 'Dyslexia-Friendly Font',
      description: 'Use a font designed for easier reading',
      icon: <Type className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: 'textSpacing',
      label: 'Increase Text Spacing',
      description: 'Add more space between letters and lines',
      icon: <Space className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: 'reducedMotion',
      label: 'Reduce Motion',
      description: 'Minimize animations and transitions',
      icon: <ZapOff className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: 'highlightFocus',
      label: 'Enhanced Focus',
      description: 'Show larger, more visible focus indicators',
      icon: <Focus className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: 'largeCursor',
      label: 'Large Cursor',
      description: 'Increase the cursor size for easier tracking',
      icon: <MousePointer2 className="h-4 w-4" aria-hidden="true" />,
    },
  ];

  return (
    <div
      ref={panelRef}
      id="a11y-panel"
      role="dialog"
      aria-label="Accessibility settings"
      aria-modal="false"
      tabIndex={-1}
      className={cn(
        'fixed bottom-36 left-4 z-[9998] lg:bottom-20',
        'w-[calc(100vw-2rem)] max-w-sm',
        'bg-card text-card-foreground border border-border',
        'rounded-xl shadow-2xl',
        'max-h-[70vh] overflow-y-auto',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {/* Header */}
      <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-xl">
        <div className="flex items-center gap-2">
          <Accessibility className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold">Accessibility</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close accessibility settings"
          className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Font Size Controls */}
        <fieldset>
          <legend className="text-sm font-medium mb-2">Text Size</legend>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleDecrease}
              disabled={preferences.fontSize <= -2}
              aria-label="Decrease text size"
              className="h-10 w-10"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </Button>
            <div
              className="flex-1 text-center text-sm tabular-nums"
              aria-live="polite"
              aria-atomic="true"
            >
              {preferences.fontSize === 0
                ? 'Default'
                : `${preferences.fontSize > 0 ? '+' : ''}${preferences.fontSize}`}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleIncrease}
              disabled={preferences.fontSize >= 4}
              aria-label="Increase text size"
              className="h-10 w-10"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </fieldset>

        {/* Toggle Options */}
        <div className="space-y-1" role="group" aria-label="Accessibility toggles">
          {toggleItems.map(({ key, label, description, icon }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
            >
              <label
                htmlFor={`a11y-${key}`}
                className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
              >
                <span className="text-muted-foreground flex-shrink-0">{icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight">{label}</div>
                  <div className="text-xs text-muted-foreground leading-tight mt-0.5">
                    {description}
                  </div>
                </div>
              </label>
              <Switch
                id={`a11y-${key}`}
                checked={preferences[key]}
                onCheckedChange={() => handleTogglePreference(key, label)}
                aria-describedby={`a11y-${key}-desc`}
              />
              <span id={`a11y-${key}-desc`} className="sr-only">
                {description}
              </span>
            </div>
          ))}
        </div>

        {/* Reset & Statement Link */}
        <div className="border-t border-border pt-3 space-y-2">
          {hasCustomPreferences && (
            <Button variant="outline" size="sm" onClick={handleReset} className="w-full">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Reset All Settings
            </Button>
          )}
          <Link
            to="/accessibility"
            onClick={onClose}
            className="block text-center text-xs text-muted-foreground hover:text-primary underline underline-offset-2"
          >
            Read our full accessibility statement
          </Link>
        </div>
      </div>
    </div>
  );
}
