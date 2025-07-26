import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Globe, CheckCircle, Code, Target } from "lucide-react";

interface ScraperTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  schedule: string;
  selectors: {
    title: string;
    description: string;
    date: string;
    location: string;
    price?: string;
    category?: string;
  };
  example_url: string;
  tips: string[];
}

interface ScraperTemplateCardProps {
  template: ScraperTemplate;
  onApply: (template: ScraperTemplate) => void;
  isSelected?: boolean;
}

export default function ScraperTemplateCard({
  template,
  onApply,
  isSelected,
}: ScraperTemplateCardProps) {
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "beginner":
        return "default";
      case "intermediate":
        return "secondary";
      case "advanced":
        return "destructive";
      default:
        return "default";
    }
  };

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-all duration-200 ${
        isSelected ? "ring-2 ring-blue-500" : ""
      }`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4" />
            {template.name}
          </CardTitle>
          <div className="flex gap-1">
            <Badge variant={getDifficultyColor(template.difficulty) as any}>
              {template.difficulty}
            </Badge>
            <Badge variant="outline">{template.category}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">{template.description}</p>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Clock className="h-3 w-3 text-blue-600" />
            <span className="font-medium">Schedule:</span>
            <code className="bg-gray-100 px-1 rounded">
              {template.schedule}
            </code>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <Globe className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-medium">Example URL:</div>
              <div className="text-gray-500 break-all">
                {template.example_url}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Code className="h-3 w-3 text-purple-600" />
            <span className="text-xs font-medium">Key Selectors:</span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div>
              <strong>Title:</strong>{" "}
              <code className="text-xs">
                {template.selectors.title.split(",")[0]}
              </code>
            </div>
            <div>
              <strong>Date:</strong>{" "}
              <code className="text-xs">
                {template.selectors.date.split(",")[0]}
              </code>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium">Best Practices:</div>
          <ul className="text-xs space-y-1">
            {template.tips.slice(0, 2).map((tip, index) => (
              <li key={index} className="flex items-start gap-1">
                <CheckCircle className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                <span className="text-gray-600">{tip}</span>
              </li>
            ))}
            {template.tips.length > 2 && (
              <li className="text-gray-500">
                + {template.tips.length - 2} more tips...
              </li>
            )}
          </ul>
        </div>

        <Button
          size="sm"
          className="w-full"
          onClick={() => onApply(template)}
          variant={isSelected ? "default" : "outline"}
        >
          {isSelected ? "Selected" : "Use This Template"}
        </Button>
      </CardContent>
    </Card>
  );
}
