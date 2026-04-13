/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApprovalMode } from '@google/gemini-cli-core';
import { describe, expect, it, vi } from 'vitest';
import { createPolicyController } from './policy.js';

describe('createPolicyController', () => {
  it('starts in safe default mode without overriding agent policy', () => {
    const updateOptions = vi.fn();

    const policy = createPolicyController({ updateOptions });

    expect(policy.snapshot()).toEqual({
      allowAll: false,
      approvalMode: ApprovalMode.DEFAULT,
      label: 'Safe',
    });
    expect(updateOptions).not.toHaveBeenCalled();
  });

  it('toggles active and future sessions into YOLO mode', () => {
    const updateOptions = vi.fn();
    const setApprovalMode = vi.fn();
    const policy = createPolicyController({ updateOptions });

    policy.addSession({ setApprovalMode });
    policy.setAllowAll(true);

    expect(policy.snapshot()).toEqual({
      allowAll: true,
      approvalMode: ApprovalMode.YOLO,
      label: 'Auto-approve',
    });
    expect(updateOptions).toHaveBeenCalledWith({
      approvalMode: ApprovalMode.YOLO,
    });
    expect(setApprovalMode).toHaveBeenCalledWith(ApprovalMode.YOLO);
  });

  it('clears the override when toggled back to safe mode', () => {
    const updateOptions = vi.fn();
    const setApprovalMode = vi.fn();
    const policy = createPolicyController({ updateOptions });

    policy.addSession({ setApprovalMode });
    policy.setAllowAll(true);
    policy.setAllowAll(false);

    expect(policy.snapshot()).toEqual({
      allowAll: false,
      approvalMode: ApprovalMode.DEFAULT,
      label: 'Safe',
    });
    expect(updateOptions).toHaveBeenLastCalledWith({
      approvalMode: undefined,
    });
    expect(setApprovalMode).toHaveBeenLastCalledWith(ApprovalMode.DEFAULT);
  });
});
