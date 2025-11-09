/**
 * Data Quality Dashboard
 * Displays data quality issues and provides auto-fix capabilities
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  Wrench,
  ExternalLink,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { useDataQuality, QualitySummary, QualityIssue } from '@/hooks/useDataQuality';
import { Alert, AlertDescription } from './ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface DataQualityDashboardProps {
  events: any[];
  restaurants: any[];
  attractions: any[];
  playgrounds: any[];
  onFixIssue?: (issue: QualityIssue) => void;
  onViewItem?: (contentType: string, itemId: string) => void;
}

const getSeverityIcon = (severity: 'error' | 'warning' | 'info') => {
  switch (severity) {
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'info':
      return <Info className="h-4 w-4 text-blue-500" />;
  }
};

const getSeverityBadge = (severity: 'error' | 'warning' | 'info') => {
  const variants = {
    error: 'destructive',
    warning: 'secondary',
    info: 'outline'
  } as const;

  return (
    <Badge variant={variants[severity]} className="capitalize">
      {severity}
    </Badge>
  );
};

export function DataQualityDashboard({
  events,
  restaurants,
  attractions,
  playgrounds,
  onFixIssue,
  onViewItem
}: DataQualityDashboardProps) {
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['events']));

  const eventQuality = useDataQuality('event', events);
  const restaurantQuality = useDataQuality('restaurant', restaurants);
  const attractionQuality = useDataQuality('attraction', attractions);
  const playgroundQuality = useDataQuality('playground', playgrounds);

  const allQualities = [eventQuality, restaurantQuality, attractionQuality, playgroundQuality];

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // Filter issues based on selected type and severity
  const getFilteredIssues = (quality: QualitySummary) => {
    let filtered = quality.issues;

    if (selectedSeverity !== 'all') {
      filtered = filtered.filter(issue => issue.severity === selectedSeverity);
    }

    return filtered;
  };

  // Calculate totals
  const totalErrors = allQualities.reduce((sum, q) => sum + q.errors, 0);
  const totalWarnings = allQualities.reduce((sum, q) => sum + q.warnings, 0);
  const totalInfos = allQualities.reduce((sum, q) => sum + q.infos, 0);
  const totalIssues = totalErrors + totalWarnings + totalInfos;

  const renderQualitySummary = (quality: QualitySummary) => {
    const filteredIssues = getFilteredIssues(quality);
    const isExpanded = expandedSections.has(quality.contentType);
    const autoFixableCount = filteredIssues.filter(i => i.autoFixable).length;

    if (quality.total === 0) {
      return null;
    }

    return (
      <Card key={quality.contentType} className="mb-4">
        <CardHeader
          className="cursor-pointer"
          onClick={() => toggleSection(quality.contentType)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <CardTitle className="capitalize">
                {quality.contentType}s
              </CardTitle>
              <Badge variant="outline">{quality.total} total</Badge>
            </div>
            <div className="flex gap-2">
              {quality.errors > 0 && (
                <Badge variant="destructive">{quality.errors} errors</Badge>
              )}
              {quality.warnings > 0 && (
                <Badge variant="secondary">{quality.warnings} warnings</Badge>
              )}
              {quality.infos > 0 && (
                <Badge variant="outline">{quality.infos} info</Badge>
              )}
            </div>
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent>
            {filteredIssues.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span>No issues found for selected filters</span>
              </div>
            ) : (
              <>
                {autoFixableCount > 0 && (
                  <Alert className="mb-4 bg-blue-50 border-blue-200">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <div className="flex items-center justify-between">
                        <span>{autoFixableCount} issues can be auto-fixed</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            filteredIssues
                              .filter(i => i.autoFixable)
                              .forEach(issue => onFixIssue?.(issue));
                          }}
                        >
                          <Wrench className="h-4 w-4 mr-2" />
                          Fix All Auto-Fixable
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  {filteredIssues.slice(0, 50).map((issue) => (
                    <div
                      key={issue.id}
                      className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-start gap-3 flex-1">
                        {getSeverityIcon(issue.severity)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{issue.field}</span>
                            {getSeverityBadge(issue.severity)}
                            {issue.autoFixable && (
                              <Badge variant="outline" className="bg-blue-50">
                                <Wrench className="h-3 w-3 mr-1" />
                                Auto-fixable
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{issue.issue}</p>
                          {issue.currentValue && (
                            <p className="text-xs text-gray-400 mt-1">
                              Current: {String(issue.currentValue)}
                            </p>
                          )}
                          {issue.suggestedValue && (
                            <p className="text-xs text-green-600 mt-1">
                              Suggested: {String(issue.suggestedValue)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {issue.autoFixable && onFixIssue && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onFixIssue(issue)}
                          >
                            <Wrench className="h-4 w-4 mr-1" />
                            Fix
                          </Button>
                        )}
                        {onViewItem && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onViewItem(quality.contentType, issue.contentId)}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {filteredIssues.length > 50 && (
                    <p className="text-sm text-gray-500 text-center py-2">
                      Showing 50 of {filteredIssues.length} issues. Use filters to narrow down.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalIssues}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-red-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{totalErrors}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-yellow-600 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{totalWarnings}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-blue-600 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{totalInfos}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter issues by severity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Severity</label>
              <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="error">Errors Only</SelectItem>
                  <SelectItem value="warning">Warnings Only</SelectItem>
                  <SelectItem value="info">Info Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quality Reports by Content Type */}
      <div>
        {(selectedType === 'all' || selectedType === 'event') && renderQualitySummary(eventQuality)}
        {(selectedType === 'all' || selectedType === 'restaurant') && renderQualitySummary(restaurantQuality)}
        {(selectedType === 'all' || selectedType === 'attraction') && renderQualitySummary(attractionQuality)}
        {(selectedType === 'all' || selectedType === 'playground') && renderQualitySummary(playgroundQuality)}
      </div>

      {totalIssues === 0 && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-2 text-green-600">
              <CheckCircle className="h-12 w-12" />
              <h3 className="text-xl font-bold">Excellent Data Quality!</h3>
              <p className="text-gray-600">No issues found across all content types.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
