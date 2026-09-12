"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { creationDraftSchema, type CreationDraft } from "@/domain/orders";
import {
  browserStorage,
  subscribeStorage,
  type ReadResult,
  type SavedDraft,
} from "@/infrastructure/storage";

let preferredDeployment: number | undefined;
type TransientDraft = {
  draft: CreationDraft;
  error: string;
  baseRevision: string | undefined;
};
const transientDrafts = new Map<number, TransientDraft>();
export function clearTransientDraft(
  deploymentId: number,
  completed: CreationDraft,
) {
  if (transientDrafts.get(deploymentId)?.draft === completed)
    transientDrafts.delete(deploymentId);
}
export function preferredDraftDeployment() {
  return preferredDeployment;
}
export function beginDraft(deploymentId: number, draft: CreationDraft) {
  const next: CreationDraft = { ...draft, stage: "edit" };
  const baseRevision = browserStorage.readDraft(deploymentId).value?.revision;
  const result = browserStorage.saveDraft(deploymentId, next);
  preferredDeployment = deploymentId;
  if (result.ok) transientDrafts.delete(deploymentId);
  else
    transientDrafts.set(deploymentId, {
      draft: next,
      error: result.error,
      baseRevision,
    });
  return result;
}

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
  const [unsaved, setUnsaved] = useState<TransientDraft | undefined>(() =>
    transientDrafts.get(deploymentId),
  );
  const draft = unsaved?.draft ?? saved.value?.draft ?? emptyDraft;
  const update = (change: Partial<CreationDraft>) => {
    const next = { ...draft, ...change };
    const result = browserStorage.saveDraft(deploymentId, next);
    if (result.ok) {
      transientDrafts.delete(deploymentId);
      setUnsaved(undefined);
    } else {
      const transient = {
        draft: next,
        error: result.error,
        // Capture the persisted base once. Later storage events may carry a newer draft.
        baseRevision: unsaved ? unsaved.baseRevision : saved.value?.revision,
      };
      transientDrafts.set(deploymentId, transient);
      setUnsaved(transient);
    }
  };
  return {
    draft,
    update,
    revision: unsaved ? unsaved.baseRevision : saved.value?.revision,
    error: unsaved?.error || saved.error,
  };
}
