import React, { useState, useEffect } from 'react';
import { MessageSquare, ThumbsUp, Star, MapPin, Clock, User, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { createLogger } from '@/lib/logger';

const log = createLogger('UserGeneratedContent');

interface UserReview {
  id: string;
  businessName: string;
  businessId: string;
  userName: string;
  userInitials: string;
  rating: number;
  review: string;
  timestamp: Date;
  helpful: number;
  tags: string[];
  verified: boolean;
  photos?: string[];
}

interface BusinessUpdate {
  id: string;
  businessName: string;
  businessId: string;
  userName: string;
  updateType: 'hours' | 'menu' | 'service' | 'special' | 'crowdedness';
  content: string;
  timestamp: Date;
  verified: boolean;
}

/**
 * User-generated content component for community reviews and updates
 * Differentiates from CatchDesMoines by focusing on resident experiences
 * vs tourist recommendations
 */
export default function UserGeneratedContent() {
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [updates, setUpdates] = useState<BusinessUpdate[]>([]);
  const [newReview, setNewReview] = useState({
    businessName: '',
    rating: 5,
    review: '',
    userName: ''
  });
  const [showReviewForm, setShowReviewForm] = useState(false);

  // WEB-LEGAL-002: this component used to seed itself with fabricated content
  // about real, named local businesses and render it as community activity.
  //
  // Three "reviews" carried invented authors ("Sarah M.", "Mike R.",
  // "Jennifer L.") with helpful counts and verified:true badges, and three
  // "updates" asserted things that were simply not true: a limited-time
  // Thanksgiving burger at Zombie Burger, short lines at Adventureland today, and
  // a newly hired sommelier named Marcus at Proof Restaurant. That is fabricated
  // consumer review content (16 CFR 465) plus false factual claims about
  // identifiable third parties, on a live route (/real-time).
  //
  // Until this is wired to real data it shows nothing. public.user_ratings holds
  // genuine reviews and is where a real implementation should read from; the
  // submit handler below is still local-only and does not persist.
  useEffect(() => {
    setReviews([]);
    setUpdates([]);
  }, []);

  const handleSubmitReview = () => {
    if (newReview.review.trim() && newReview.businessName.trim() && newReview.userName.trim()) {
      const review: UserReview = {
        id: Date.now().toString(),
        businessName: newReview.businessName,
        businessId: newReview.businessName.toLowerCase().replace(/\s+/g, '-'),
        userName: newReview.userName,
        userInitials: newReview.userName.split(' ').map(n => n[0]).join('').toUpperCase(),
        rating: newReview.rating,
        review: newReview.review,
        timestamp: new Date(),
        helpful: 0,
        tags: [],
        verified: false
      };
      
      setReviews([review, ...reviews]);
      setNewReview({ businessName: '', rating: 5, review: '', userName: '' });
      setShowReviewForm(false);
    }
  };

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins} minutes ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hours ago`;
    } else {
      return `${diffDays} days ago`;
    }
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${
          i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
        }`}
      />
    ));
  };

  const getUpdateTypeColor = (type: string) => {
    switch (type) {
      case 'special': return 'bg-green-100 text-green-800';
      case 'crowdedness': return 'bg-blue-100 text-blue-800';
      case 'service': return 'bg-purple-100 text-purple-800';
      case 'hours': return 'bg-orange-100 text-orange-800';
      case 'menu': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Community Focus */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Community Reviews & Updates</h2>
        <p className="text-lg text-muted-foreground">
          Real experiences from Des Moines residents - not tourist reviews
        </p>
        <div className="flex justify-center gap-4 text-sm text-muted-foreground">
          <span>• Local perspectives</span>
          <span>• Resident-focused</span>
          <span>• Real-time updates</span>
        </div>
      </div>

      {/* Add Review Button */}
      <div className="flex justify-center">
        <Button 
          onClick={() => setShowReviewForm(!showReviewForm)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Share Your Experience
        </Button>
      </div>

      {/* Review Form */}
      {showReviewForm && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle className="text-lg">Add Your Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                placeholder="Business name"
                value={newReview.businessName}
                onChange={(e) => setNewReview({...newReview, businessName: e.target.value})}
              />
              <Input
                placeholder="Your name"
                value={newReview.userName}
                onChange={(e) => setNewReview({...newReview, userName: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Rating</label>
              <div className="flex gap-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setNewReview({...newReview, rating: i + 1})}
                  >
                    <Star
                      className={`h-6 w-6 cursor-pointer ${
                        i < newReview.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            
            <Textarea
              placeholder="Share your experience as a local resident. What would other Des Moines families want to know?"
              value={newReview.review}
              onChange={(e) => setNewReview({...newReview, review: e.target.value})}
              className="min-h-[100px]"
            />
            
            <div className="flex gap-2">
              <Button onClick={handleSubmitReview}>
                <Send className="h-4 w-4 mr-2" />
                Submit Review
              </Button>
              <Button variant="outline" onClick={() => setShowReviewForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Real-time Community Updates */}
      <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-green-600" />
            Latest Community Updates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {updates.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                No community updates yet. Be the first to post one.
              </p>
            )}
            {updates.slice(0, 3).map((update) => (
              <div key={update.id} className="flex items-start gap-3 p-3 bg-white rounded-lg">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{update.userName}</span>
                    <Badge 
                      variant="secondary" 
                      className={`text-xs ${getUpdateTypeColor(update.updateType)}`}
                    >
                      {update.updateType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(update.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-1">
                    <span className="font-medium">{update.businessName}:</span> {update.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Community Reviews */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Recent Community Reviews</h3>

        {reviews.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No community reviews yet. Share the first one.
          </p>
        )}

        {reviews.map((review) => (
          <Card key={review.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center font-medium text-blue-700">
                    {review.userInitials}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{review.userName}</span>
                      {review.verified && (
                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                          Verified Local
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex">
                        {renderStars(review.rating)}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatTimeAgo(review.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
                <Badge variant="outline">{review.businessName}</Badge>
              </div>
              
              <p className="text-gray-700 leading-relaxed mb-4">{review.review}</p>
              
              {review.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {review.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs bg-gray-100">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              
              <div className="flex items-center gap-4 text-sm">
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  <ThumbsUp className="h-4 w-4 mr-1" />
                  Helpful ({review.helpful})
                </Button>
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  <MessageSquare className="h-4 w-4 mr-1" />
                  Reply
                </Button>
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  <MapPin className="h-4 w-4 mr-1" />
                  View Business
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Community Value Proposition */}
      <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
        <CardContent className="p-6">
          <h3 className="font-semibold text-purple-900 mb-3">Why Community Reviews Matter</h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium text-purple-800 mb-2">Resident Perspective</h4>
              <ul className="space-y-1 text-purple-700">
                <li>• Family-friendly insights</li>
                <li>• Local pricing awareness</li>  
                <li>• Neighborhood context</li>
                <li>• Regular customer experiences</li>
              </ul>
            </div>
            <div>
              {/* WEB-LEGAL-010: this list advertised "Current wait times" and
                  "Special offers", neither of which anything records. Kept to
                  what people can actually post here. */}
              <h4 className="font-medium text-purple-800 mb-2">What people post</h4>
              <ul className="space-y-1 text-purple-700">
                <li>• Seasonal menu changes</li>
                <li>• Service quality updates</li>
                <li>• What a place is actually like on a weeknight</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-white/60 rounded-lg">
            <p className="text-purple-800 text-sm font-medium">
              Posts here come from Des Moines residents rather than from a tourism
              feed. Nothing is seeded, so this fills up as people write.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Quick community update widget for mobile
 */
export const QuickUpdateWidget = () => {
  const [updateText, setUpdateText] = useState('');
  const [selectedBusiness, setSelectedBusiness] = useState('');

  const handleQuickUpdate = () => {
    if (updateText.trim() && selectedBusiness) {
      // Submit quick update to community feed
      log.debug('quickUpdate', 'Quick update submitted', { data: { selectedBusiness, updateText } });
      setUpdateText('');
      setSelectedBusiness('');
    }
  };

  return (
    <Card className="border-green-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Quick Community Update</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input 
          placeholder="Which business?"
          value={selectedBusiness}
          onChange={(e) => setSelectedBusiness(e.target.value)}
        />
        <Textarea 
          placeholder="What's happening there right now?"
          value={updateText}
          onChange={(e) => setUpdateText(e.target.value)}
          className="min-h-[60px]"
        />
        <Button 
          size="sm" 
          onClick={handleQuickUpdate}
          className="w-full"
          disabled={!updateText.trim() || !selectedBusiness}
        >
          Share Update
        </Button>
      </CardContent>
    </Card>
  );
};