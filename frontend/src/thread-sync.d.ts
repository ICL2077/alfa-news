export declare class RefreshSequencer {
  begin(scope: string): number;
  isCurrent(scope: string, version: number): boolean;
  invalidate(scope: string): void;
}

export declare function withoutMessage<T extends { id: string }>(
  messages: T[],
  id: string,
): T[];

export declare function containsPendingUserMessage(
  messages: Array<{ role: string; status: string }>,
): boolean;

export declare function canReconcilePendingSnapshot(
  hasChat: boolean,
  snapshot: { applied: boolean } | null,
): boolean;
