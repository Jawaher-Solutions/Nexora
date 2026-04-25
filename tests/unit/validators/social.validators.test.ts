import {
  followParamSchema,
  addCommentSchema,
  getCommentsQuerySchema,
  deleteCommentParamSchema,
  notificationsQuerySchema,
  sendMessageSchema,
  getConversationQuerySchema,
} from '../../../src/validators/social.validators';

const UUID = 'a3bb189e-8bf9-3888-9912-ace4e6543002';

// ─── followParamSchema ────────────────────────────────────────────────────────

describe('followParamSchema', () => {
  it('accepts a valid UUID', () => {
    expect(() => followParamSchema.parse({ userId: UUID })).not.toThrow();
  });

  it('rejects a non-UUID string', () => {
    expect(() => followParamSchema.parse({ userId: 'not-a-uuid' })).toThrow();
  });

  it('rejects missing userId', () => {
    expect(() => followParamSchema.parse({} as never)).toThrow();
  });
});

// ─── addCommentSchema ─────────────────────────────────────────────────────────

describe('addCommentSchema', () => {
  const base = { videoId: UUID, content: 'Hello' };

  it('accepts valid input without parentId', () => {
    expect(() => addCommentSchema.parse(base)).not.toThrow();
  });

  it('accepts valid input with a parentId UUID', () => {
    expect(() => addCommentSchema.parse({ ...base, parentId: UUID })).not.toThrow();
  });

  it('trims whitespace from content', () => {
    const result = addCommentSchema.parse({ ...base, content: '  Hi  ' });
    expect(result.content).toBe('Hi');
  });

  it('rejects empty content after trimming', () => {
    expect(() => addCommentSchema.parse({ ...base, content: '   ' })).toThrow();
  });

  it('rejects content exceeding 1000 characters', () => {
    expect(() =>
      addCommentSchema.parse({ ...base, content: 'a'.repeat(1001) })
    ).toThrow();
  });

  it('accepts content exactly 1000 characters', () => {
    expect(() =>
      addCommentSchema.parse({ ...base, content: 'a'.repeat(1000) })
    ).not.toThrow();
  });

  it('rejects non-UUID videoId', () => {
    expect(() => addCommentSchema.parse({ ...base, videoId: 'bad' })).toThrow();
  });

  it('rejects non-UUID parentId', () => {
    expect(() =>
      addCommentSchema.parse({ ...base, parentId: 'not-a-uuid' })
    ).toThrow();
  });

  it('rejects missing videoId', () => {
    expect(() => addCommentSchema.parse({ content: 'hi' } as never)).toThrow();
  });
});

// ─── getCommentsQuerySchema ───────────────────────────────────────────────────

describe('getCommentsQuerySchema', () => {
  it('accepts valid input with defaults', () => {
    const result = getCommentsQuerySchema.parse({ videoId: UUID });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('coerces string numbers', () => {
    const result = getCommentsQuerySchema.parse({ videoId: UUID, page: '2', limit: '10' });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  it('rejects page < 1', () => {
    expect(() =>
      getCommentsQuerySchema.parse({ videoId: UUID, page: '0' })
    ).toThrow();
  });

  it('rejects limit > 50', () => {
    expect(() =>
      getCommentsQuerySchema.parse({ videoId: UUID, limit: '51' })
    ).toThrow();
  });

  it('accepts limit exactly 50', () => {
    expect(() =>
      getCommentsQuerySchema.parse({ videoId: UUID, limit: '50' })
    ).not.toThrow();
  });

  it('rejects missing videoId', () => {
    expect(() => getCommentsQuerySchema.parse({} as never)).toThrow();
  });
});

// ─── deleteCommentParamSchema ─────────────────────────────────────────────────

describe('deleteCommentParamSchema', () => {
  it('accepts a valid UUID', () => {
    expect(() => deleteCommentParamSchema.parse({ commentId: UUID })).not.toThrow();
  });

  it('rejects a non-UUID', () => {
    expect(() => deleteCommentParamSchema.parse({ commentId: 'abc' })).toThrow();
  });
});

// ─── notificationsQuerySchema ─────────────────────────────────────────────────

describe('notificationsQuerySchema', () => {
  it('uses defaults when no input is provided', () => {
    const result = notificationsQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('coerces string page and limit', () => {
    const result = notificationsQuerySchema.parse({ page: '3', limit: '15' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(15);
  });

  it('rejects page < 1', () => {
    expect(() => notificationsQuerySchema.parse({ page: '0' })).toThrow();
  });

  it('rejects limit > 50', () => {
    expect(() => notificationsQuerySchema.parse({ limit: '51' })).toThrow();
  });

  it('accepts limit exactly 1', () => {
    expect(() => notificationsQuerySchema.parse({ limit: '1' })).not.toThrow();
  });
});

// ─── sendMessageSchema ────────────────────────────────────────────────────────

describe('sendMessageSchema', () => {
  it('accepts valid recipient and ciphertext', () => {
    expect(() =>
      sendMessageSchema.parse({ recipientId: UUID, encryptedContent: 'ciphertext' })
    ).not.toThrow();
  });

  it('rejects non-UUID recipientId', () => {
    expect(() =>
      sendMessageSchema.parse({ recipientId: 'bad', encryptedContent: 'cipher' })
    ).toThrow();
  });

  it('rejects empty encryptedContent', () => {
    expect(() =>
      sendMessageSchema.parse({ recipientId: UUID, encryptedContent: '' })
    ).toThrow();
  });

  it('rejects encryptedContent exceeding 65535 chars', () => {
    expect(() =>
      sendMessageSchema.parse({
        recipientId: UUID,
        encryptedContent: 'a'.repeat(65536),
      })
    ).toThrow();
  });

  it('accepts encryptedContent exactly 65535 chars', () => {
    expect(() =>
      sendMessageSchema.parse({
        recipientId: UUID,
        encryptedContent: 'a'.repeat(65535),
      })
    ).not.toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => sendMessageSchema.parse({} as never)).toThrow();
  });
});

// ─── getConversationQuerySchema ───────────────────────────────────────────────

describe('getConversationQuerySchema', () => {
  it('uses defaults when no input is provided', () => {
    const result = getConversationQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it('coerces string values', () => {
    const result = getConversationQuerySchema.parse({ page: '2', limit: '25' });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(25);
  });

  it('rejects limit > 100', () => {
    expect(() => getConversationQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('accepts limit exactly 100', () => {
    expect(() =>
      getConversationQuerySchema.parse({ limit: '100' })
    ).not.toThrow();
  });

  it('rejects page < 1', () => {
    expect(() => getConversationQuerySchema.parse({ page: '0' })).toThrow();
  });
});
