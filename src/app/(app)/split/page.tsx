"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, ArrowRight, Link as LinkIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/stores/app-store";
import { formatCurrency, getInitials, cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { FAB } from "@/components/ui/fab";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ShimmerCard } from "@/components/ui/shimmer";

export default function SplitPage() {
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();
  const profile = useAppStore((s) => s.profile);

  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<string[]>([""]);
  const [formError, setFormError] = useState("");

  const { data: groups, isLoading } = useQuery({
    queryKey: ["split-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("split_groups")
        .select("*, split_members(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createGroup = useMutation({
    mutationFn: async ({ name, memberNames }: { name: string; memberNames: string[] }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: group, error } = await supabase
        .from("split_groups")
        .insert({ name, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;

      const allMembers = [
        { group_id: group.id, name: profile?.display_name || "Me", user_id: user!.id },
        ...memberNames.filter(Boolean).map((n) => ({ group_id: group.id, name: n, user_id: null })),
      ];
      await supabase.from("split_members").insert(allMembers);
      return group;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["split-groups"] }),
  });

  function addMemberField() {
    setMembers([...members, ""]);
  }

  function updateMember(index: number, value: string) {
    const copy = [...members];
    copy[index] = value;
    setMembers(copy);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!groupName.trim()) { setFormError("Group name is required"); return; }
    const validMembers = members.filter((m) => m.trim());
    if (validMembers.length === 0) { setFormError("Add at least one member"); return; }
    try {
      await createGroup.mutateAsync({ name: groupName.trim(), memberNames: validMembers });
      setShowCreate(false);
      setGroupName(""); setMembers([""]);
    } catch (err: any) { setFormError(err.message); }
  }

  const isSplitwiseConnected = !!profile?.splitwise_access_token;

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="text-xl font-semibold">Splits</h1>
        <ShimmerCard /><ShimmerCard />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-semibold">Splits</h1>

      {/* Splitwise connection banner */}
      {!isSplitwiseConnected && (
        <Card className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-blue/10 flex items-center justify-center">
            <LinkIcon className="w-4 h-4 text-accent-blue" />
          </div>
          <div className="flex-1">
            <p className="text-sm">Connect Splitwise</p>
            <p className="text-xs text-muted">Sync your existing groups</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => window.location.href = "/api/splitwise/auth"}>
            Connect
          </Button>
        </Card>
      )}

      {!groups || groups.length === 0 ? (
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title="No splits yet"
          description="Create a group or connect Splitwise"
          actionLabel="Create a Group"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="space-y-3">
          {groups.map((g: any) => {
            const memberCount = g.split_members?.length || 0;
            return (
              <Card
                key={g.id}
                hover
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => router.push(`/split/${g.id}`)}
              >
                <div className="flex -space-x-2">
                  {(g.split_members || []).slice(0, 4).map((m: any, i: number) => (
                    <div key={m.id} className="w-8 h-8 rounded-full bg-accent-blue/20 border-2 border-obsidian flex items-center justify-center text-[10px] font-semibold text-accent-blue">
                      {getInitials(m.name)}
                    </div>
                  ))}
                  {memberCount > 4 && (
                    <div className="w-8 h-8 rounded-full bg-white/[0.06] border-2 border-obsidian flex items-center justify-center text-[10px] text-muted">
                      +{memberCount - 4}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{g.name}</p>
                  <p className="text-xs text-muted">{memberCount} members</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted" />
              </Card>
            );
          })}
        </div>
      )}

      <FAB onClick={() => setShowCreate(true)} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Split Group">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Group Name" placeholder="e.g., Apartment, Trip to Goa" value={groupName}
            onChange={(e) => setGroupName(e.target.value)} />
          <div className="space-y-2">
            <label className="block text-sm text-muted">Members</label>
            {members.map((m, i) => (
              <Input key={i} placeholder={`Member ${i + 1} name`} value={m}
                onChange={(e) => updateMember(i, e.target.value)} />
            ))}
            <button type="button" onClick={addMemberField}
              className="text-xs text-accent-blue hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add another member
            </button>
          </div>
          {formError && <p className="text-sm text-accent-coral">{formError}</p>}
          <Button type="submit" className="w-full" loading={createGroup.isPending}>Create Group</Button>
        </form>
      </Modal>
    </div>
  );
}
