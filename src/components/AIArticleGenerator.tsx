import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Sparkles, 
  Brain, 
  Target, 
  MapPin, 
  TrendingUp, 
  FileText, 
  Plus, 
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  Lightbulb,
  RefreshCw,
  Clock,
  Users,
  Star
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface GenerationSettings {
  topic: string;
  category: string;
  targetKeywords: string[];
  tone: 'professional' | 'conversational' | 'informative' | 'engaging';
  length: 'short' | 'medium' | 'long';
  includeLocalSEO: boolean;
  customInstructions: string;
}

interface TopicSuggestion {
  title: string;
  description: string;
  category: string;
  estimated_keywords: string[];
  content_type: string;
  seo_potential: 'high' | 'medium' | 'low';
  seasonal_relevance: 'high' | 'medium' | 'low' | 'none';
  target_audience: string;
  difficulty: 'easy' | 'medium' | 'advanced';
  estimated_word_count: string;
  unique_angle: string;
}

interface SuggestionsData {
  suggestions: TopicSuggestion[];
  content_gaps_identified: string[];
  seasonal_opportunities: string[];
  trending_local_topics: string[];
  suggested_focus_areas: string[];
}

interface GenerationResult {
  article: any;
  metadata: {
    word_count: number;
    seo_score: {
      readability: string;
      seo_strength: string;
      local_relevance: string;
    };
    local_optimization: boolean;
    featured_image_suggestions: string[];
    internal_linking_opportunities: string[];
    schema_suggestions: any;
  };
}

const AIArticleGenerator: React.FC = () => {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionsData | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<TopicSuggestion | null>(null);
  
  const [settings, setSettings] = useState<GenerationSettings>({
    topic: '',
    category: 'General',
    targetKeywords: [],
    tone: 'engaging',
    length: 'medium',
    includeLocalSEO: true,
    customInstructions: ''
  });

  // Load suggestions on component mount
  useEffect(() => {
    loadTopicSuggestions();
  }, []);

  const categories = [
    'General', 'Events', 'Restaurants', 'Attractions', 'Culture', 
    'Business', 'Tourism', 'Entertainment', 'Food & Drink', 'Lifestyle',
    'Sports', 'Arts', 'Shopping', 'Outdoors', 'History'
  ];

  const toneDescriptions = {
    professional: 'Formal, authoritative tone for business content',
    conversational: 'Friendly, casual tone that feels like talking to a friend',
    informative: 'Clear, educational tone focused on facts and insights',
    engaging: 'Dynamic, compelling tone that captivates readers'
  };

  const lengthDescriptions = {
    short: '800-1000 words - Quick read, focused content',
    medium: '1200-1500 words - Comprehensive coverage',
    long: '1800-2500 words - In-depth, authoritative content'
  };

  const handleSettingChange = (key: keyof GenerationSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !settings.targetKeywords.includes(newKeyword.trim())) {
      handleSettingChange('targetKeywords', [...settings.targetKeywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    handleSettingChange('targetKeywords', settings.targetKeywords.filter(k => k !== keywordToRemove));
  };

  const handleGenerate = async () => {
    if (!settings.topic.trim()) {
      toast.error('Please enter a topic for your article');
      return;
    }

    try {
      setIsGenerating(true);
      
      const { data, error } = await supabase.functions.invoke('generate-article', {
        body: settings
      });

      if (error) {
        console.error('Generation error:', error);
        throw new Error(error.message || 'Failed to generate article');
      }

      if (data.success) {
        setGenerationResult(data);
        toast.success('Article generated successfully!', {
          description: `Created "${data.article.title}" with ${data.metadata.word_count} words`
        });
      } else {
        throw new Error(data.error || 'Generation failed');
      }
    } catch (error) {
      console.error('Error generating article:', error);
      toast.error('Failed to generate article', {
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditArticle = () => {
    if (generationResult?.article?.id) {
      navigate(`/admin/articles/edit/${generationResult.article.id}`);
    }
  };

  const loadTopicSuggestions = async (focusArea = '', categoryFilter = '') => {
    try {
      setIsLoadingSuggestions(true);
      
      const { data, error } = await supabase.functions.invoke('suggest-article-topics', {
        body: {
          category: categoryFilter,
          focusArea: focusArea,
          includeLocalTrends: true,
          includeSeasonalTopics: true,
          excludeExistingTopics: true,
          suggestionCount: 8
        }
      });

      if (error) {
        console.error('Suggestions error:', error);
        throw new Error(error.message || 'Failed to load suggestions');
      }

      if (data.success) {
        setSuggestions(data.data);
      } else {
        throw new Error(data.error || 'Failed to load suggestions');
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
      toast.error('Failed to load topic suggestions', {
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleSuggestionSelect = (suggestion: TopicSuggestion) => {
    setSelectedSuggestion(suggestion);
    handleSettingChange('topic', suggestion.title);
    handleSettingChange('category', suggestion.category);
    handleSettingChange('targetKeywords', suggestion.estimated_keywords);
    
    // Set appropriate length based on suggestion
    const lengthMap: { [key: string]: 'short' | 'medium' | 'long' } = {
      '800-1000': 'short',
      '1200-1500': 'medium',
      '1800-2500': 'long'
    };
    handleSettingChange('length', lengthMap[suggestion.estimated_word_count] || 'medium');
  };

  const getSEOPotentialColor = (potential: string) => {
    switch (potential) {
      case 'high': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-blue-600 bg-blue-100';
      case 'advanced': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            AI Article Generator
          </CardTitle>
          <CardDescription>
            Generate SEO-optimized, locally-focused articles for Des Moines using advanced AI. 
            Powered by Claude Sonnet 4 with specialized local SEO and GEO optimization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs defaultValue="suggestions" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="suggestions" className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Topic Suggestions
              </TabsTrigger>
              <TabsTrigger value="custom" className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Custom Topic
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="suggestions" className="space-y-6">
              {/* Topic Suggestions */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        AI-Powered Topic Suggestions
                      </CardTitle>
                      <CardDescription>
                        Smart topic ideas based on content gaps, trends, and Des Moines local opportunities
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => loadTopicSuggestions()}
                      disabled={isLoadingSuggestions}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoadingSuggestions ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingSuggestions ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Loading intelligent suggestions...</span>
                      </div>
                    </div>
                  ) : suggestions ? (
                    <div className="space-y-6">
                      {/* Insights */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">{suggestions.suggestions.length}</div>
                          <div className="text-sm text-blue-700 dark:text-blue-300">Topic Ideas</div>
                        </div>
                        <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">{suggestions.content_gaps_identified.length}</div>
                          <div className="text-sm text-green-700 dark:text-green-300">Content Gaps</div>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-950 p-4 rounded-lg">
                          <div className="text-2xl font-bold text-purple-600">{suggestions.seasonal_opportunities.length}</div>
                          <div className="text-sm text-purple-700 dark:text-purple-300">Seasonal Ideas</div>
                        </div>
                        <div className="bg-orange-50 dark:bg-orange-950 p-4 rounded-lg">
                          <div className="text-2xl font-bold text-orange-600">{suggestions.trending_local_topics.length}</div>
                          <div className="text-sm text-orange-700 dark:text-orange-300">Trending Topics</div>
                        </div>
                      </div>

                      {/* Suggestions Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {suggestions.suggestions.map((suggestion, index) => (
                          <Card 
                            key={index} 
                            className={`cursor-pointer transition-all hover:shadow-md ${
                              selectedSuggestion?.title === suggestion.title 
                                ? 'ring-2 ring-primary bg-primary/5' 
                                : 'hover:border-primary/50'
                            }`}
                            onClick={() => handleSuggestionSelect(suggestion)}
                          >
                            <CardContent className="p-4 space-y-3">
                              <div className="space-y-2">
                                <h4 className="font-semibold line-clamp-2">{suggestion.title}</h4>
                                <p className="text-sm text-muted-foreground line-clamp-2">{suggestion.description}</p>
                              </div>
                              
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {suggestion.category}
                                </Badge>
                                <Badge 
                                  variant="secondary" 
                                  className={`text-xs ${getSEOPotentialColor(suggestion.seo_potential)}`}
                                >
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                  {suggestion.seo_potential} SEO
                                </Badge>
                                <Badge 
                                  variant="secondary" 
                                  className={`text-xs ${getDifficultyColor(suggestion.difficulty)}`}
                                >
                                  {suggestion.difficulty}
                                </Badge>
                              </div>

                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {suggestion.target_audience}
                                </div>
                                <div className="flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  {suggestion.estimated_word_count}
                                </div>
                              </div>

                              {suggestion.unique_angle && (
                                <div className="bg-muted/50 p-2 rounded text-xs">
                                  <strong>Unique Angle:</strong> {suggestion.unique_angle}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      {/* Content Gaps & Opportunities */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-semibold mb-3 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-orange-500" />
                            Content Gaps Identified
                          </h4>
                          <div className="space-y-2">
                            {suggestions.content_gaps_identified.map((gap, index) => (
                              <div key={index} className="bg-orange-50 dark:bg-orange-950 p-2 rounded text-sm">
                                {gap}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-semibold mb-3 flex items-center gap-2">
                            <Clock className="h-4 w-4 text-green-500" />
                            Seasonal Opportunities
                          </h4>
                          <div className="space-y-2">
                            {suggestions.seasonal_opportunities.map((opportunity, index) => (
                              <div key={index} className="bg-green-50 dark:bg-green-950 p-2 rounded text-sm">
                                {opportunity}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Click "Refresh" to load topic suggestions</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="custom" className="space-y-6">
          {/* Generation Results */}
          {generationResult && (
            <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-200">
                  <CheckCircle className="h-5 w-5" />
                  Article Generated Successfully!
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{generationResult.metadata.word_count}</div>
                    <div className="text-sm text-muted-foreground">Words Generated</div>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{generationResult.metadata.seo_score.seo_strength}</div>
                    <div className="text-sm text-muted-foreground">SEO Strength</div>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">{generationResult.metadata.seo_score.local_relevance}</div>
                    <div className="text-sm text-muted-foreground">Local Relevance</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Generated Article:</h4>
                  <p className="text-lg font-medium">{generationResult.article.title}</p>
                  <p className="text-muted-foreground">{generationResult.article.excerpt}</p>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleEditArticle} className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Edit Article
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setGenerationResult(null)}
                  >
                    Generate Another
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Main Settings */}
            <div className="space-y-6">
              {/* Topic */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Article Topic
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="topic">Topic *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="topic"
                        value={settings.topic}
                        onChange={(e) => handleSettingChange('topic', e.target.value)}
                        placeholder="e.g., Best Coffee Shops in Des Moines"
                        className="flex-1"
                      />
                      <Button 
                        variant="outline" 
                        onClick={() => loadTopicSuggestions()}
                        disabled={isLoadingSuggestions}
                        className="flex items-center gap-2"
                      >
                        <Lightbulb className="h-4 w-4" />
                        Suggest
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select value={settings.category} onValueChange={(value) => handleSettingChange('category', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Target Keywords</Label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        placeholder="Add keyword..."
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddKeyword())}
                      />
                      <Button onClick={handleAddKeyword} size="sm">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {settings.targetKeywords.map((keyword) => (
                        <Badge key={keyword} variant="secondary" className="gap-1">
                          {keyword}
                          <button onClick={() => handleRemoveKeyword(keyword)}>
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Content Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Content Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="tone">Writing Tone</Label>
                    <Select value={settings.tone} onValueChange={(value: any) => handleSettingChange('tone', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(toneDescriptions).map(([tone, description]) => (
                          <SelectItem key={tone} value={tone}>
                            <div className="text-left">
                              <div className="font-medium capitalize">{tone}</div>
                              <div className="text-xs text-muted-foreground">{description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="length">Article Length</Label>
                    <Select value={settings.length} onValueChange={(value: any) => handleSettingChange('length', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(lengthDescriptions).map(([length, description]) => (
                          <SelectItem key={length} value={length}>
                            <div className="text-left">
                              <div className="font-medium capitalize">{length}</div>
                              <div className="text-xs text-muted-foreground">{description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Advanced Settings */}
            <div className="space-y-6">
              {/* Local SEO */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Local SEO Optimization
                  </CardTitle>
                  <CardDescription>
                    Enhanced optimization for Des Moines, Iowa local search
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Enable Local SEO</Label>
                      <p className="text-sm text-muted-foreground">
                        Includes Des Moines-specific keywords, landmarks, and local search optimization
                      </p>
                    </div>
                    <Switch
                      checked={settings.includeLocalSEO}
                      onCheckedChange={(checked) => handleSettingChange('includeLocalSEO', checked)}
                    />
                  </div>

                  {settings.includeLocalSEO && (
                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg space-y-2">
                      <h4 className="font-semibold text-blue-800 dark:text-blue-200">Local SEO Features:</h4>
                      <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        <li>• Des Moines geographic keywords</li>
                        <li>• Local landmark references</li>
                        <li>• Neighborhood mentions</li>
                        <li>• Seasonal Iowa content</li>
                        <li>• Local business entity connections</li>
                        <li>• Schema markup suggestions</li>
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Custom Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Custom Instructions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div>
                    <Label htmlFor="instructions">Additional Instructions (Optional)</Label>
                    <Textarea
                      id="instructions"
                      value={settings.customInstructions}
                      onChange={(e) => handleSettingChange('customInstructions', e.target.value)}
                      placeholder="Add specific requirements, focus areas, or style preferences..."
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      e.g., "Focus on family-friendly activities", "Include price ranges", "Mention parking availability"
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Generation Button */}
              <Card>
                <CardContent className="pt-6">
                  <Button 
                    onClick={handleGenerate}
                    disabled={isGenerating || !settings.topic.trim()}
                    className="w-full h-12 text-lg"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Generating Article...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5 mr-2" />
                        Generate AI Article
                      </>
                    )}
                  </Button>
                  
                  {!settings.topic.trim() && (
                    <p className="text-sm text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      Please enter a topic to generate an article
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIArticleGenerator;