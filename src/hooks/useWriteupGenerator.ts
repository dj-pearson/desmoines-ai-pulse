import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createLogger } from '@/lib/logger';

const log = createLogger('useWriteupGenerator');

export interface WriteupRequest {
  type: "event" | "restaurant";
  id: string;
  url: string;
  title: string;
  description?: string;
  location?: string;
  cuisine?: string;
  category?: string;
}

export function useWriteupGenerator() {
  const [isGenerating, setIsGenerating] = useState<string | null>(null); // Store the ID being processed

  const generateWriteup = async (request: WriteupRequest): Promise<void> => {
    try {
      setIsGenerating(request.id);

      // Validate URL
      if (
        !request.url ||
        (!request.url.startsWith("http://") &&
          !request.url.startsWith("https://"))
      ) {
        throw new Error("Valid URL is required for writeup generation");
      }

      log.info(`Generating writeup for ${request.type}`, { action: 'generateWriteup', metadata: { request } });

      const { data, error } = await supabase.functions.invoke(
        "generate-writeup",
        {
          body: {
            type: request.type,
            id: request.id,
            url: request.url,
            title: request.title,
            description: request.description,
            location: request.location,
            cuisine: request.cuisine,
            category: request.category,
          },
        }
      );

      if (error) {
        log.error("Supabase function error", { action: 'generateWriteup', metadata: { error } });
        throw new Error(error.message || "Failed to generate writeup");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to generate writeup");
      }

      toast.success("Writeup generated successfully!", {
        description: `AI-powered writeup created for ${
          request.title
        }. Length: ${data.writeup?.length || 0} characters.`,
      });

      log.info("Writeup generation completed", { action: 'generateWriteup', metadata: {
        id: request.id,
        type: request.type,
        writeupLength: data.writeup?.length,
        extractedContentLength: data.extractedContentLength,
        featuresFound: data.featuresFound,
      } });
    } catch (error) {
      log.error("Error generating writeup", { action: 'generateWriteup', metadata: { error } });
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      toast.error("Failed to generate writeup", {
        description: errorMessage,
      });

      throw error;
    } finally {
      setIsGenerating(null);
    }
  };

  return {
    generateWriteup,
    isGenerating,
    isGeneratingId: (id: string) => isGenerating === id,
  };
}
