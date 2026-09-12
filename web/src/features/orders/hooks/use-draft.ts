"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { creationDraftSchema, type CreationDraft } from "@/domain/orders";
import {
  browserStorage,
  subscribeStorage,
  type ReadResult,
  type SavedDraft,
} from "@/infrastructure/storage";

const emptyDraft = creationDraftSchema.parse({});
const emptySnapshot: ReadResult<SavedDraft | null> = { value: null };
function draftReader(deploymentId: number) {
  let serialized = "";
  let snapshot = emptySnapshot;
  return () => {
    const next = browserStorage.readDraft(deploymentId);
    const text = JSON.stringify(next);
    if (text !== serialized) {
      serialized = text;
      snapshot = next;
    }
    return snapshot;
  };
}

export function useDraft(deploymentId: number) {
  const reader = useMemo(() => draftReader(deploymentId), [deploymentId]);
  const saved = useSyncExternalStore(
    subscribeStorage,
    reader,
    () => emptySnapshot,
  );
  const [unsaved, setUnsaved] = useState<CreationDraft>();
  const [writeError, setWriteError] = useState("");
  const draft = unsaved ?? saved.value?.draft ?? emptyDraft;
  const update = (change: Partial<CreationDraft>) => {
    const next = { ...draft, ...change };
    const result = browserStorage.saveDraft(deploymentId, next);
    if (result.ok) {
      setUnsaved(undefined);
      setWriteError("");
    } else {
      setUnsaved(next);
      setWriteError(result.error);
    }
  };
  return {
    draft,
    update,
    revision: unsaved ? undefined : saved.value?.revision,
    error: writeError || saved.error,
  };
}
