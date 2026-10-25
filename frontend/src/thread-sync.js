export class RefreshSequencer {
  #versions = new Map();

  begin(scope) {
    const version = (this.#versions.get(scope) ?? 0) + 1;
    this.#versions.set(scope, version);
    return version;
  }

  isCurrent(scope, version) {
    return this.#versions.get(scope) === version;
  }

  invalidate(scope) {
    this.#versions.set(scope, (this.#versions.get(scope) ?? 0) + 1);
  }
}

export function withoutMessage(messages, id) {
  return messages.filter((message) => message.id !== id);
}

export function containsPendingUserMessage(messages) {
  return messages.some((message) => message.role === "USER" && message.status === "PENDING");
}

export function canReconcilePendingSnapshot(hasChat, snapshot) {
  return !hasChat || snapshot?.applied === true;
}
