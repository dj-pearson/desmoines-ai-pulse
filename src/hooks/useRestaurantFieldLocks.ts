import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchRestaurantFieldLocks,
  setRestaurantFieldLocks,
  type FieldLocksResult,
} from "@/lib/restaurantFieldLocks";

export const restaurantFieldLocksKey = (restaurantId: string | null) =>
  ["restaurant-field-locks", restaurantId] as const;

/**
 * WEB-BE-069: the field locks on one restaurant, and the admin actions on
 * them. Pass null to disable (a new row, or a content type that is not stored
 * in restaurants).
 */
export function useRestaurantFieldLocks(restaurantId: string | null) {
  const queryClient = useQueryClient();
  const key = restaurantFieldLocksKey(restaurantId);

  const query = useQuery<FieldLocksResult>({
    queryKey: key,
    queryFn: () => fetchRestaurantFieldLocks(restaurantId as string),
    enabled: Boolean(restaurantId),
    staleTime: 0,
  });

  const mutation = useMutation({
    mutationFn: ({ lock, unlock }: { lock: readonly string[]; unlock: readonly string[] }) =>
      setRestaurantFieldLocks(restaurantId as string, lock, unlock),
    onSuccess: (locks) => {
      queryClient.setQueryData<FieldLocksResult>(key, { status: "ok", locks });
    },
  });

  return {
    result: query.data,
    isLoading: query.isLoading,
    /** Records an admin lock on each changed field the database accepts as lockable. */
    lockFields: (fields: readonly string[]) => mutation.mutateAsync({ lock: fields, unlock: [] }),
    /** Clears one field's lock so the next enrichment fills it from Google. */
    unlockField: (field: string) => mutation.mutateAsync({ lock: [], unlock: [field] }),
    isUpdating: mutation.isPending,
  };
}
