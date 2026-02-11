import { useState, useCallback, useRef } from "react";
import { Upload, X, CheckCircle, AlertCircle, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { PLACEMENT_SPECS, ALLOWED_MIME_TYPES } from "@/lib/placementSpecs";
import type { PlacementType } from "@/lib/placementSpecs";

export type { PlacementType };

interface CreativeFile {
  file: File;
  preview: string;
  width: number;
  height: number;
  isValid: boolean;
  error?: string;
}

interface CreativeUploaderProps {
  placementType: PlacementType;
  campaignId: string;
  onUploadComplete?: (fileUrl: string, metadata: any) => void;
  onUploadError?: (error: string) => void;
  onFilesReady?: (files: CreativeFile[]) => void;
  maxFiles?: number;
}

export function CreativeUploader({
  placementType,
  campaignId,
  onUploadComplete,
  onUploadError,
  onFilesReady,
  maxFiles = 3,
}: CreativeUploaderProps) {
  const [files, setFiles] = useState<CreativeFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const specs = PLACEMENT_SPECS[placementType];

  const validateFile = useCallback(
    async (file: File): Promise<{ isValid: boolean; error?: string; width?: number; height?: number }> => {
      // Check file type
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return {
          isValid: false,
          error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.',
        };
      }

      // Check file size
      if (file.size > specs.maxSize) {
        return {
          isValid: false,
          error: `File size exceeds ${(specs.maxSize / 1024).toFixed(0)}KB limit.`,
        };
      }

      // Check dimensions
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const validDimension = specs.dimensions.some(
            (dim) => dim.width === img.width && dim.height === img.height
          );

          if (!validDimension) {
            const expectedDims = specs.dimensions.map((d) => d.label).join(' or ');
            resolve({
              isValid: false,
              error: `Invalid dimensions (${img.width}x${img.height}). Expected: ${expectedDims}`,
              width: img.width,
              height: img.height,
            });
          } else {
            resolve({
              isValid: true,
              width: img.width,
              height: img.height,
            });
          }
        };
        img.onerror = () => {
          resolve({
            isValid: false,
            error: 'Failed to load image. File may be corrupted.',
          });
        };
        img.src = URL.createObjectURL(file);
      });
    },
    [specs]
  );

  const processFiles = useCallback(
    async (fileList: FileList) => {
      const newFiles: CreativeFile[] = [];

      for (let i = 0; i < Math.min(fileList.length, maxFiles - files.length); i++) {
        const file = fileList[i];
        const validation = await validateFile(file);
        const preview = URL.createObjectURL(file);

        newFiles.push({
          file,
          preview,
          width: validation.width || 0,
          height: validation.height || 0,
          isValid: validation.isValid,
          error: validation.error,
        });
      }

      setFiles((prev) => [...prev, ...newFiles]);
    },
    [files.length, maxFiles, validateFile]
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const { files } = e.dataTransfer;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      {/* Upload Instructions */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Upload Requirements for {placementType.replace(/_/g, ' ').toUpperCase()}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <p className="font-medium text-foreground mb-1">Dimensions:</p>
                <ul className="list-disc list-inside space-y-1">
                  {specs.dimensions.map((dim, i) => (
                    <li key={i}>{dim.label}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground mb-1">Requirements:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Max file size: {(specs.maxSize / 1024).toFixed(0)}KB</li>
                  <li>Formats: JPEG, PNG, WebP, GIF</li>
                  <li>Aspect ratio: {specs.aspectRatio}</li>
                  <li>Keep text/logos 10% from edges</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drag and Drop Area */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-gray-300",
          files.length >= maxFiles && "opacity-50 cursor-not-allowed"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleFileInput}
          className="hidden"
          disabled={files.length >= maxFiles}
        />

        <div className="flex flex-col items-center gap-4">
          <div
            className={cn(
              "rounded-full p-4",
              isDragging ? "bg-primary/20" : "bg-gray-100"
            )}
          >
            <Upload className={cn("h-8 w-8", isDragging ? "text-primary" : "text-gray-400")} />
          </div>

          <div>
            <p className="text-lg font-medium mb-1">
              {isDragging ? "Drop your files here" : "Drag and drop your ad creatives"}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              or{" "}
              <button
                onClick={handleBrowseClick}
                className="text-primary hover:underline font-medium"
                disabled={files.length >= maxFiles}
              >
                browse files
              </button>
            </p>
            <p className="text-xs text-muted-foreground">
              {files.length} / {maxFiles} files uploaded
            </p>
          </div>
        </div>
      </div>

      {/* File Previews */}
      {files.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold">Uploaded Files</h3>
          {files.map((fileItem, index) => (
            <Card key={index} className={cn(!fileItem.isValid && "border-destructive")}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Preview Image */}
                  <div className="relative flex-shrink-0">
                    <img
                      src={fileItem.preview}
                      alt={`Preview ${index + 1}`}
                      className="w-32 h-24 object-contain rounded border"
                    />
                    {fileItem.isValid && (
                      <div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1">
                        <CheckCircle className="h-4 w-4 text-white" />
                      </div>
                    )}
                    {!fileItem.isValid && (
                      <div className="absolute -top-2 -right-2 bg-destructive rounded-full p-1">
                        <AlertCircle className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-grow min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-grow min-w-0">
                        <p className="font-medium truncate">{fileItem.file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {fileItem.width}×{fileItem.height} • {(fileItem.file.size / 1024).toFixed(0)}KB
                        </p>

                        {fileItem.isValid ? (
                          <div className="flex items-center gap-2 mt-2 text-sm text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span>Ready to upload</span>
                          </div>
                        ) : (
                          <Alert variant="destructive" className="mt-2">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                              {fileItem.error}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(index)}
                        className="flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Upload Progress */}
                    {uploadProgress[fileItem.file.name] !== undefined && (
                      <div className="mt-3">
                        <Progress value={uploadProgress[fileItem.file.name]} className="h-2" />
                        <p className="text-xs text-muted-foreground mt-1">
                          Uploading... {uploadProgress[fileItem.file.name]}%
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      {files.length > 0 && (
        <div className="flex justify-between items-center pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            {files.filter((f) => f.isValid).length} of {files.length} files ready to upload
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                files.forEach((f) => URL.revokeObjectURL(f.preview));
                setFiles([]);
              }}
            >
              Clear All
            </Button>
            <Button
              disabled={files.filter((f) => f.isValid).length === 0}
              onClick={() => {
                const validFiles = files.filter((f) => f.isValid);
                if (onFilesReady) {
                  onFilesReady(validFiles);
                }
              }}
            >
              Continue to Upload Details
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
