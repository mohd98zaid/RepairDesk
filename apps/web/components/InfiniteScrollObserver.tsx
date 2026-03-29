import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

interface InfiniteScrollObserverProps {
    isFetchingNextPage: boolean;
    hasNextPage: boolean;
    fetchNextPage: () => void;
}

export function InfiniteScrollObserver({
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
}: InfiniteScrollObserverProps) {
    const observerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!observerRef.current || !hasNextPage) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !isFetchingNextPage) {
                    fetchNextPage();
                }
            },
            { threshold: 0.1 }
        );

        observer.observe(observerRef.current);

        return () => {
            observer.disconnect();
        };
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    if (!hasNextPage) return null;

    return (
        <div ref={observerRef} className="w-full flex justify-center py-6">
            {isFetchingNextPage ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">Loading more...</span>
                </div>
            ) : (
                <div className="h-5" /> // Spacer for the observer
            )}
        </div>
    );
}
