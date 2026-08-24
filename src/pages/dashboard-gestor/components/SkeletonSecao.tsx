import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonSecao({ height = 120 }: { height?: number }) {
  return <Skeleton className="w-full rounded-xl" style={{ height }} />;
}
