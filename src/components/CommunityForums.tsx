import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCommunityFeatures } from "@/hooks/useCommunityFeatures";
import { MessageSquare, Plus, Users, Calendar, Pin, Lock, Reply } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function CommunityForums() {
  const { user } = useAuth();
  const { 
    forums, 
    createForum, 
    getThreads, 
    createThread, 
    getReplies, 
    createReply 
  } = useCommunityFeatures();
  
  const [selectedForum, setSelectedForum] = useState<any>(null);
  const [selectedThread, setSelectedThread] = useState<any>(null);
  const [threads, setThreads] = useState<any[]>([]);
  const [replies, setReplies] = useState<any[]>([]);
  const [newForumData, setNewForumData] = useState({
    title: '',
    description: '',
    category: 'general'
  });
  const [newThreadData, setNewThreadData] = useState({
    title: '',
    content: ''
  });
  const [newReply, setNewReply] = useState('');
  const [isCreateForumOpen, setIsCreateForumOpen] = useState(false);
  const [isCreateThreadOpen, setIsCreateThreadOpen] = useState(false);

  const handleCreateForum = async () => {
    const result = await createForum(newForumData);
    if (result) {
      setIsCreateForumOpen(false);
      setNewForumData({ title: '', description: '', category: 'general' });
    }
  };

  const handleCreateThread = async () => {
    if (!selectedForum) return;
    const result = await createThread(selectedForum.id, newThreadData);
    if (result) {
      setIsCreateThreadOpen(false);
      setNewThreadData({ title: '', content: '' });
      loadThreads(selectedForum.id);
    }
  };

  const handleCreateReply = async () => {
    if (!selectedThread || !newReply.trim()) return;
    const result = await createReply(selectedThread.id, newReply);
    if (result) {
      setNewReply('');
      loadReplies(selectedThread.id);
    }
  };

  const loadThreads = async (forumId: string) => {
    const threadsData = await getThreads(forumId);
    setThreads(threadsData);
  };

  const loadReplies = async (threadId: string) => {
    const repliesData = await getReplies(threadId);
    setReplies(repliesData);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Sign in to participate in community discussions</p>
        </CardContent>
      </Card>
    );
  }

  if (selectedThread) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedThread(null)}
              >
                ← Back to {selectedForum?.title}
              </Button>
            </div>
          </div>
          <CardTitle className="flex items-center gap-2">
            {selectedThread.is_pinned && <Pin className="w-4 h-4 text-blue-500" />}
            {selectedThread.is_locked && <Lock className="w-4 h-4 text-gray-500" />}
            {selectedThread.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Original Thread Content */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="whitespace-pre-wrap">{selectedThread.content}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Posted {formatDate(selectedThread.created_at)}
            </p>
          </div>

          {/* Replies */}
          <div className="space-y-4">
            {replies.map((reply) => (
              <div key={reply.id} className="border-l-2 border-muted pl-4">
                <p className="whitespace-pre-wrap">{reply.content}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Reply • {formatDate(reply.created_at)}
                </p>
              </div>
            ))}
          </div>

          {/* New Reply */}
          {!selectedThread.is_locked && (
            <div className="space-y-2">
              <Textarea
                placeholder="Write your reply..."
                value={newReply}
                onChange={(e) => setNewReply(e.target.value)}
                rows={4}
              />
              <Button 
                onClick={handleCreateReply}
                disabled={!newReply.trim()}
                className="gap-2"
              >
                <Reply className="w-4 h-4" />
                Post Reply
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (selectedForum) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedForum(null)}
              >
                ← Back to Forums
              </Button>
            </div>
            <Dialog open={isCreateThreadOpen} onOpenChange={setIsCreateThreadOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Thread
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Thread</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Title</label>
                    <Input
                      placeholder="Thread title..."
                      value={newThreadData.title}
                      onChange={(e) => setNewThreadData(prev => ({
                        ...prev,
                        title: e.target.value
                      }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Content</label>
                    <Textarea
                      placeholder="What would you like to discuss?"
                      value={newThreadData.content}
                      onChange={(e) => setNewThreadData(prev => ({
                        ...prev,
                        content: e.target.value
                      }))}
                      rows={6}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleCreateThread}
                      disabled={!newThreadData.title.trim() || !newThreadData.content.trim()}
                      className="flex-1"
                    >
                      Create Thread
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateThreadOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <CardTitle>{selectedForum.title}</CardTitle>
          {selectedForum.description && (
            <p className="text-muted-foreground">{selectedForum.description}</p>
          )}
        </CardHeader>
        <CardContent>
          {threads.length > 0 ? (
            <div className="space-y-3">
              {threads.map((thread) => (
                <div
                  key={thread.id}
                  className="p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors"
                  onClick={() => {
                    setSelectedThread(thread);
                    loadReplies(thread.id);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {thread.is_pinned && <Pin className="w-4 h-4 text-blue-500" />}
                        {thread.is_locked && <Lock className="w-4 h-4 text-gray-500" />}
                        <h3 className="font-medium">{thread.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {thread.content}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Started {formatDate(thread.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No threads yet</p>
              <p className="text-sm text-muted-foreground">Be the first to start a discussion!</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Community Forums
          </CardTitle>
          <Dialog open={isCreateForumOpen} onOpenChange={setIsCreateForumOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                New Forum
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Forum</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    placeholder="Forum title..."
                    value={newForumData.title}
                    onChange={(e) => setNewForumData(prev => ({
                      ...prev,
                      title: e.target.value
                    }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    placeholder="What is this forum about?"
                    value={newForumData.description}
                    onChange={(e) => setNewForumData(prev => ({
                      ...prev,
                      description: e.target.value
                    }))}
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateForum}
                    disabled={!newForumData.title.trim()}
                    className="flex-1"
                  >
                    Create Forum
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateForumOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {forums.length > 0 ? (
          <div className="grid gap-4">
            {forums.map((forum) => (
              <div
                key={forum.id}
                className="p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors"
                onClick={() => {
                  setSelectedForum(forum);
                  loadThreads(forum.id);
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-medium">{forum.title}</h3>
                      <Badge variant="secondary">{forum.category}</Badge>
                    </div>
                    {forum.description && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {forum.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Created {formatDate(forum.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No forums yet</p>
            <p className="text-sm text-muted-foreground">Create the first forum to get discussions started!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}