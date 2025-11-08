/**
 * CSV Utilities
 * Lightweight CSV conversion utilities without external dependencies
 */

/**
 * Escapes a CSV cell value to handle special characters
 */
function escapeCsvValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  // Convert to string
  let stringValue = String(value);

  // Handle arrays (convert to semicolon-separated)
  if (Array.isArray(value)) {
    stringValue = value.join('; ');
  }

  // Handle objects (convert to JSON)
  if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
    stringValue = JSON.stringify(value);
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  // Escape quotes by doubling them
  stringValue = stringValue.replace(/"/g, '""');

  // Wrap in quotes if contains comma, newline, or quote
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return `"${stringValue}"`;
  }

  return stringValue;
}

/**
 * Formats a date value for CSV export
 */
function formatDateForCsv(value: any): string {
  if (!value) return '';

  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);

    // Return ISO format for consistency
    return date.toISOString();
  } catch {
    return String(value);
  }
}

/**
 * Converts an array of objects to CSV string
 */
export function convertToCSV<T extends Record<string, any>>(
  data: T[],
  options?: {
    columns?: Array<{ key: keyof T; label: string; type?: string }>;
    includeHeaders?: boolean;
  }
): string {
  if (!data || data.length === 0) {
    return '';
  }

  const includeHeaders = options?.includeHeaders !== false;
  const columns = options?.columns;

  // If columns not specified, use all keys from first object
  const keys = columns
    ? columns.map(col => col.key as string)
    : Object.keys(data[0]);

  const headers = columns
    ? columns.map(col => col.label)
    : keys;

  const rows: string[] = [];

  // Add header row
  if (includeHeaders) {
    rows.push(headers.map(h => escapeCsvValue(h)).join(','));
  }

  // Add data rows
  for (const item of data) {
    const row = keys.map((key, index) => {
      const value = item[key];
      const columnType = columns?.[index]?.type;

      // Format based on column type
      if (columnType === 'date') {
        return escapeCsvValue(formatDateForCsv(value));
      }

      return escapeCsvValue(value);
    });

    rows.push(row.join(','));
  }

  return rows.join('\n');
}

/**
 * Parses a CSV string into an array of objects
 */
export function parseCSV(
  csvString: string,
  options?: {
    headers?: string[];
    skipFirstRow?: boolean;
  }
): Record<string, string>[] {
  if (!csvString || csvString.trim().length === 0) {
    return [];
  }

  const lines = csvString.split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const skipFirstRow = options?.skipFirstRow !== false;
  let headers = options?.headers;

  // Use first row as headers if not provided
  if (!headers) {
    const firstLine = lines[0];
    headers = parseCsvLine(firstLine);
  }

  const startIndex = skipFirstRow ? 1 : 0;
  const results: Record<string, string>[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);

    if (values.length === 0) continue;

    const obj: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] || '';
    }

    results.push(obj);
  }

  return results;
}

/**
 * Parses a single CSV line, handling quoted values
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current.trim());

  return result;
}

/**
 * Downloads data as CSV file
 */
export function downloadCSV(
  data: any[],
  filename: string,
  options?: {
    columns?: Array<{ key: string; label: string; type?: string }>;
  }
): void {
  const csv = convertToCSV(data, options);

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();

  // Clean up
  URL.revokeObjectURL(url);
}

/**
 * Generates a filename with timestamp
 */
export function generateCsvFilename(prefix: string): string {
  const date = new Date().toISOString().split('T')[0];
  return `${prefix}_${date}.csv`;
}

/**
 * Validates CSV data against expected structure
 */
export function validateCSVData(
  data: Record<string, any>[],
  requiredFields: string[]
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || data.length === 0) {
    errors.push('No data to import');
    return { isValid: false, errors, warnings };
  }

  // Check if all required fields are present in first row
  const firstRow = data[0];
  const missingFields = requiredFields.filter(field => !(field in firstRow));

  if (missingFields.length > 0) {
    errors.push(`Missing required fields: ${missingFields.join(', ')}`);
  }

  // Check for rows with missing required data
  data.forEach((row, index) => {
    requiredFields.forEach(field => {
      if (!row[field] || String(row[field]).trim().length === 0) {
        warnings.push(`Row ${index + 1}: Missing value for "${field}"`);
      }
    });
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
