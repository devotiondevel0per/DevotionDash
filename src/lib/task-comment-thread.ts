export type ThreadCommentBase = {
  id: string;
  parentCommentId?: string | null;
  createdAt: string;
};

export type ThreadNode<T extends ThreadCommentBase> = T & {
  replies: ThreadNode<T>[];
};

function toTime(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function buildThreadTree<T extends ThreadCommentBase>(comments: T[]): ThreadNode<T>[] {
  const sorted = [...comments].sort((a, b) => toTime(a.createdAt) - toTime(b.createdAt));
  const nodes = new Map<string, ThreadNode<T>>();
  for (const comment of sorted) {
    nodes.set(comment.id, { ...comment, replies: [] });
  }

  const roots: ThreadNode<T>[] = [];
  for (const comment of sorted) {
    const node = nodes.get(comment.id);
    if (!node) continue;
    const parentId =
      typeof comment.parentCommentId === "string" && comment.parentCommentId.trim()
        ? comment.parentCommentId
        : null;
    if (!parentId) {
      roots.push(node);
      continue;
    }
    const parent = nodes.get(parentId);
    if (!parent) {
      roots.push(node);
      continue;
    }
    parent.replies.push(node);
  }

  return roots;
}
