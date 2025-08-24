import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, UserPlus, Users } from "lucide-react";

interface GroupMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
}

interface FriendGroup {
  id: string;
  name: string;
  description?: string;
  member_count: number;
}

interface GroupInviteManagerProps {
  group: FriendGroup;
  onClose: () => void;
}

export function GroupInviteManager({ group, onClose }: GroupInviteManagerProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Manage Group: {group.name}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Add or remove members from your group
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Group management coming soon</p>
            <p className="text-sm">Full member management features will be available once the database is set up</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}