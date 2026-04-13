/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApprovalMode } from '@google/gemini-cli-core';

interface PolicyAgent {
  updateOptions(options: { approvalMode?: ApprovalMode }): void;
}

interface PolicySession {
  setApprovalMode(mode: ApprovalMode): void;
}

export interface PolicySnapshot {
  allowAll: boolean;
  approvalMode: ApprovalMode;
  label: 'Safe' | 'Auto-approve';
}

export interface PolicyController {
  snapshot(): PolicySnapshot;
  setAllowAll(allowAll: boolean): PolicySnapshot;
  addSession(session: PolicySession): () => void;
}

export function createPolicyController(agent: PolicyAgent): PolicyController {
  let allowAll = false;
  const sessions = new Set<PolicySession>();

  const currentMode = () =>
    allowAll ? ApprovalMode.YOLO : ApprovalMode.DEFAULT;

  const snapshot = (): PolicySnapshot => ({
    allowAll,
    approvalMode: currentMode(),
    label: allowAll ? 'Auto-approve' : 'Safe',
  });

  const applyToSessions = () => {
    const mode = currentMode();
    for (const session of sessions) {
      session.setApprovalMode(mode);
    }
  };

  return {
    snapshot,
    setAllowAll(nextAllowAll: boolean): PolicySnapshot {
      allowAll = nextAllowAll;
      agent.updateOptions({
        approvalMode: allowAll ? ApprovalMode.YOLO : undefined,
      });
      applyToSessions();
      return snapshot();
    },
    addSession(session: PolicySession): () => void {
      sessions.add(session);
      session.setApprovalMode(currentMode());
      return () => {
        sessions.delete(session);
      };
    },
  };
}
