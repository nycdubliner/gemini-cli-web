/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './protocol.js';

describe('parseClientMessage', () => {
  it('parses chat messages', () => {
    expect(parseClientMessage('{"type":"chat","text":"hello"}')).toEqual({
      type: 'chat',
      text: 'hello',
    });
  });

  it('parses confirmation responses', () => {
    expect(
      parseClientMessage(
        '{"type":"confirmation_response","correlationId":"abc","confirmed":true}',
      ),
    ).toEqual({
      type: 'confirmation_response',
      correlationId: 'abc',
      confirmed: true,
    });
  });

  it('parses confirmation responses with explicit outcomes', () => {
    expect(
      parseClientMessage(
        '{"type":"confirmation_response","correlationId":"abc","confirmed":true,"outcome":"proceed_always"}',
      ),
    ).toEqual({
      type: 'confirmation_response',
      correlationId: 'abc',
      confirmed: true,
      outcome: 'proceed_always',
    });
  });

  it('rejects malformed messages', () => {
    expect(() => parseClientMessage('{"type":"chat"}')).toThrow(
      /Invalid client message/,
    );
  });
});
