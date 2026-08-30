import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Award,
  Calendar,
  Camera,
  Crown,
  Home,
  MapPin,
  Share2,
  Star,
  Sunrise,
  Trophy,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { Badge as BadgeType, useGamification } from "@/hooks/useGamification";

// WEB-PERF-026. This file used to be `import * as LucideIcons` plus
// `(LucideIcons as any)[badge.icon]`. Rollup cannot tree-shake a namespace
// import indexed by a runtime string, and vite.config.ts routes lucide-react
// into the `vendor-icons` chunk that index.html references — so all 1,500-odd
// icons (780 KB raw / 133 KB gz) shipped on first paint for every visitor,
// because of one component behind /gamification.
//
// The keys are every `icon` value seeded into public.badges by
// supabase/migrations/20250805010931_*.sql:223-233. Nothing in src/ or in any
// edge function writes that table, so this is the complete set. If a badge is
// ever added with a new icon name, it renders the Award fallback rather than
// crashing — which is what the old code did, since indexing the namespace with
// an unknown name yields undefined and React throws on an undefined element
// type.
const BADGE_ICONS: Record<string, LucideIcon> = {
  Award,
  Calendar,
  Camera,
  Crown,
  Home,
  MapPin,
  Share2,
  Star,
  Sunrise,
  Trophy,
  UtensilsCrossed,
};

const getRarityColor = (rarity: string) => {
  switch (rarity) {
    case 'common': return 'bg-gray-500';
    case 'rare': return 'bg-blue-500';
    case 'epic': return 'bg-purple-500';
    case 'legendary': return 'bg-yellow-500';
    default: return 'bg-gray-500';
  }
};

const getRarityBorder = (rarity: string) => {
  switch (rarity) {
    case 'common': return 'border-gray-300';
    case 'rare': return 'border-blue-300';
    case 'epic': return 'border-purple-300';
    case 'legendary': return 'border-yellow-300';
    default: return 'border-gray-300';
  }
};

interface BadgeCardProps {
  badge: BadgeType;
  earned?: boolean;
  progress?: number;
}

function BadgeCard({ badge, earned = false, progress }: BadgeCardProps) {
  const IconComponent = (badge.icon && BADGE_ICONS[badge.icon]) || Award;
  
  return (
    <Card className={`relative ${earned ? '' : 'opacity-60'} ${getRarityBorder(badge.rarity)} border-2`}>
      <CardContent className="p-4 text-center space-y-2">
        <div className={`w-12 h-12 rounded-full ${getRarityColor(badge.rarity)} flex items-center justify-center mx-auto`}>
          <IconComponent className="h-6 w-6 text-white" />
        </div>
        
        <div>
          <h3 className="font-semibold text-sm">{badge.name}</h3>
          <p className="text-xs text-muted-foreground line-clamp-2">{badge.description}</p>
        </div>
        
        <div className="flex items-center justify-center gap-1">
          <Badge variant="secondary" className="text-xs">
            {badge.rarity}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {badge.points_value} XP
          </Badge>
        </div>
        
        {!earned && progress && (
          <div className="space-y-1">
            <Progress value={progress} className="h-1" />
            <p className="text-xs text-muted-foreground">{Math.round(progress)}% complete</p>
          </div>
        )}
        
        {earned && badge.earned_at && (
          <p className="text-xs text-green-600">
            Earned {new Date(badge.earned_at).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function BadgeCollection() {
  const { badges, availableBadges, isLoading } = useGamification();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Badge Collection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-32 bg-muted rounded-lg" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const earnedBadgeIds = new Set(badges.map(b => b.id));
  const unearned = availableBadges.filter(b => !earnedBadgeIds.has(b.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          Badge Collection ({badges.length}/{availableBadges.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="earned" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="earned">Earned ({badges.length})</TabsTrigger>
            <TabsTrigger value="available">Available ({unearned.length})</TabsTrigger>
          </TabsList>
          
          <TabsContent value="earned" className="space-y-4">
            {badges.length === 0 ? (
              <div className="text-center py-8">
                <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No badges earned yet. Start exploring to earn your first badge!</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {badges
                  .sort((a, b) => new Date(b.earned_at || '').getTime() - new Date(a.earned_at || '').getTime())
                  .map(badge => (
                    <BadgeCard key={badge.id} badge={badge} earned={true} />
                  ))}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="available" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {unearned
                .sort((a, b) => {
                  const rarityOrder = { common: 1, rare: 2, epic: 3, legendary: 4 };
                  return (rarityOrder[a.rarity as keyof typeof rarityOrder] || 1) - 
                         (rarityOrder[b.rarity as keyof typeof rarityOrder] || 1);
                })
                .map(badge => (
                  <BadgeCard key={badge.id} badge={badge} earned={false} />
                ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}