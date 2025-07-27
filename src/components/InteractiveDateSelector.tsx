import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

interface InteractiveDateSelectorProps {
  onDateChange: (dates: { start?: Date; end?: Date; mode: 'single' | 'range' | 'preset'; preset?: string } | null) => void;
  className?: string;
}

export default function InteractiveDateSelector({ onDateChange, className }: InteractiveDateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'preset' | 'single' | 'range'>('preset');
  const [preset, setPreset] = useState('any-date');
  const [singleDate, setSingleDate] = useState<Date>();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  
  // Track pending changes vs applied changes
  const [appliedFilter, setAppliedFilter] = useState<{ start?: Date; end?: Date; mode: 'single' | 'range' | 'preset'; preset?: string } | null>(null);
  const [pendingChanges, setPendingChanges] = useState(false);

  const presetOptions = [
    { value: 'any-date', label: 'Any date' },
    { value: 'today', label: 'Today' },
    { value: 'tomorrow', label: 'Tomorrow' },
    { value: 'this-week', label: 'This week' },
    { value: 'this-weekend', label: 'This weekend' },
    { value: 'next-week', label: 'Next week' },
  ];

  const handlePresetChange = (value: string) => {
    setPreset(value);
    setPendingChanges(true);
  };

  const handleSingleDateSelect = (date: Date | undefined) => {
    setSingleDate(date);
    setPendingChanges(true);
  };

  const handleDateRangeSelect = (range: DateRange | undefined) => {
    setDateRange(range);
    setPendingChanges(true);
  };

  const applyFilter = () => {
    let filterToApply = null;

    if (mode === 'single' && singleDate) {
      filterToApply = { mode: 'single' as const, start: singleDate, end: undefined };
    } else if (mode === 'range' && dateRange?.from) {
      filterToApply = { 
        mode: 'range' as const, 
        start: dateRange.from, 
        end: dateRange.to 
      };
    } else if (mode === 'preset' && preset !== 'any-date') {
      filterToApply = { mode: 'preset' as const, start: undefined, end: undefined, preset };
    }

    setAppliedFilter(filterToApply);
    onDateChange(filterToApply);
    setPendingChanges(false);
    setIsOpen(false);
  };

  const clearSelection = () => {
    setMode('preset');
    setPreset('any-date');
    setSingleDate(undefined);
    setDateRange(undefined);
    setAppliedFilter(null);
    onDateChange(null);
    setPendingChanges(false);
    setIsOpen(false);
  };

  const getDisplayText = () => {
    // Show applied filter, not pending selection
    if (appliedFilter?.mode === 'single' && appliedFilter.start) {
      return format(appliedFilter.start, "MMM d, yyyy");
    }
    if (appliedFilter?.mode === 'range' && appliedFilter.start) {
      if (appliedFilter.end) {
        return `${format(appliedFilter.start, "MMM d")} - ${format(appliedFilter.end, "MMM d, yyyy")}`;
      }
      return format(appliedFilter.start, "MMM d, yyyy");
    }
    if (appliedFilter?.mode === 'preset' && appliedFilter.preset) {
      return presetOptions.find(opt => opt.value === appliedFilter.preset)?.label || 'Any date';
    }
    return 'Any date';
  };

  const hasAppliedFilter = appliedFilter !== null;

  const canApply = () => {
    if (mode === 'preset' && preset !== 'any-date') return true;
    if (mode === 'single' && singleDate) return true;
    if (mode === 'range' && dateRange?.from) return true;
    return false;
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <CalendarIcon className="h-5 w-5 text-white/70" />
      
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-start text-left font-normal bg-white/95 backdrop-blur border-white/20 relative",
              !hasAppliedFilter && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {getDisplayText()}
            {pendingChanges && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full" />
            )}
          </Button>
        </PopoverTrigger>
        
        <PopoverContent className="w-auto p-0 bg-white" align="start">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Select dates</h4>
              {hasAppliedFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  className="h-8 px-2"
                >
                  <X className="h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant={mode === 'preset' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('preset')}
              >
                Quick
              </Button>
              <Button
                variant={mode === 'single' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('single')}
              >
                Single Date
              </Button>
              <Button
                variant={mode === 'range' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('range')}
              >
                Date Range
              </Button>
            </div>

            {mode === 'preset' && (
              <Select value={preset} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presetOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {mode === 'single' && (
              <Calendar
                mode="single"
                selected={singleDate}
                onSelect={handleSingleDateSelect}
                className={cn("p-3 pointer-events-auto")}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            )}

            {mode === 'range' && (
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={handleDateRangeSelect}
                className={cn("p-3 pointer-events-auto")}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            )}

            {(mode !== 'preset' || preset !== 'any-date') && (
              <div className="pt-2 border-t space-y-3">
                <Badge variant="secondary" className="text-xs">
                  {mode === 'single' && 'Single date selected'}
                  {mode === 'range' && (dateRange?.to ? 'Date range selected' : 'Select end date')}
                  {mode === 'preset' && 'Quick filter selected'}
                </Badge>
                
                <div className="flex gap-2">
                  <Button
                    onClick={applyFilter}
                    disabled={!canApply()}
                    className="flex-1"
                    size="sm"
                  >
                    Apply Filter
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMode('preset');
                      setPreset('any-date');
                      setSingleDate(undefined);
                      setDateRange(undefined);
                      setPendingChanges(false);
                    }}
                    size="sm"
                  >
                    Reset
                  </Button>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}