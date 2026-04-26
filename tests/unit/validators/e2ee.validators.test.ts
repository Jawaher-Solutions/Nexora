import {
  uploadIdentityKeySchema,
  uploadSignedPreKeySchema,
  uploadPreKeysSchema,
  getPreKeyBundleParamSchema,
  recordKeySessionSchema,
  rotateSignedPreKeySchema,
} from '../../../src/validators/e2ee.validators';

const UUID = 'a3bb189e-8bf9-3888-9912-ace4e6543002';
const VALID_KEY = 'a'.repeat(44); // base64-encoded 32-byte key
const VALID_SIG = 'b'.repeat(88); // base64-encoded 64-byte signature

// ─── uploadIdentityKeySchema ─────────────────────────────────────────────────

describe('uploadIdentityKeySchema', () => {
  it('accepts a valid identity public key', () => {
    expect(() =>
      uploadIdentityKeySchema.parse({ identityPublicKey: VALID_KEY })
    ).not.toThrow();
  });

  it('rejects key shorter than 32 chars', () => {
    expect(() =>
      uploadIdentityKeySchema.parse({ identityPublicKey: 'a'.repeat(31) })
    ).toThrow();
  });

  it('accepts key exactly 32 chars', () => {
    expect(() =>
      uploadIdentityKeySchema.parse({ identityPublicKey: 'a'.repeat(32) })
    ).not.toThrow();
  });

  it('rejects key longer than 512 chars', () => {
    expect(() =>
      uploadIdentityKeySchema.parse({ identityPublicKey: 'a'.repeat(513) })
    ).toThrow();
  });

  it('accepts key exactly 512 chars', () => {
    expect(() =>
      uploadIdentityKeySchema.parse({ identityPublicKey: 'a'.repeat(512) })
    ).not.toThrow();
  });

  it('rejects missing identityPublicKey', () => {
    expect(() => uploadIdentityKeySchema.parse({} as never)).toThrow();
  });
});

// ─── uploadSignedPreKeySchema ────────────────────────────────────────────────

describe('uploadSignedPreKeySchema', () => {
  const valid = { keyId: 1, publicKey: VALID_KEY, signature: VALID_SIG };

  it('accepts valid signed pre-key input', () => {
    expect(() => uploadSignedPreKeySchema.parse(valid)).not.toThrow();
  });

  it('rejects keyId of 0', () => {
    expect(() =>
      uploadSignedPreKeySchema.parse({ ...valid, keyId: 0 })
    ).toThrow();
  });

  it('rejects negative keyId', () => {
    expect(() =>
      uploadSignedPreKeySchema.parse({ ...valid, keyId: -1 })
    ).toThrow();
  });

  it('rejects non-integer keyId', () => {
    expect(() =>
      uploadSignedPreKeySchema.parse({ ...valid, keyId: 1.5 })
    ).toThrow();
  });

  it('rejects publicKey shorter than 32 chars', () => {
    expect(() =>
      uploadSignedPreKeySchema.parse({ ...valid, publicKey: 'x'.repeat(31) })
    ).toThrow();
  });

  it('rejects publicKey longer than 512 chars', () => {
    expect(() =>
      uploadSignedPreKeySchema.parse({ ...valid, publicKey: 'x'.repeat(513) })
    ).toThrow();
  });

  it('rejects signature shorter than 32 chars', () => {
    expect(() =>
      uploadSignedPreKeySchema.parse({ ...valid, signature: 's'.repeat(31) })
    ).toThrow();
  });

  it('rejects signature longer than 1024 chars', () => {
    expect(() =>
      uploadSignedPreKeySchema.parse({ ...valid, signature: 's'.repeat(1025) })
    ).toThrow();
  });

  it('accepts signature exactly 1024 chars', () => {
    expect(() =>
      uploadSignedPreKeySchema.parse({ ...valid, signature: 's'.repeat(1024) })
    ).not.toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => uploadSignedPreKeySchema.parse({} as never)).toThrow();
  });
});

// ─── uploadPreKeysSchema ─────────────────────────────────────────────────────

describe('uploadPreKeysSchema', () => {
  const oneKey = { id: 1, publicKey: VALID_KEY };

  it('accepts a single valid pre-key', () => {
    expect(() =>
      uploadPreKeysSchema.parse({ preKeys: [oneKey] })
    ).not.toThrow();
  });

  it('accepts 100 pre-keys (max)', () => {
    const keys = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      publicKey: VALID_KEY,
    }));
    expect(() => uploadPreKeysSchema.parse({ preKeys: keys })).not.toThrow();
  });

  it('rejects more than 100 pre-keys', () => {
    const keys = Array.from({ length: 101 }, (_, i) => ({
      id: i + 1,
      publicKey: VALID_KEY,
    }));
    expect(() => uploadPreKeysSchema.parse({ preKeys: keys })).toThrow();
  });

  it('rejects empty pre-keys array', () => {
    expect(() => uploadPreKeysSchema.parse({ preKeys: [] })).toThrow();
  });

  it('rejects pre-key with id of 0', () => {
    expect(() =>
      uploadPreKeysSchema.parse({ preKeys: [{ id: 0, publicKey: VALID_KEY }] })
    ).toThrow();
  });

  it('rejects pre-key with short publicKey', () => {
    expect(() =>
      uploadPreKeysSchema.parse({ preKeys: [{ id: 1, publicKey: 'short' }] })
    ).toThrow();
  });

  it('rejects missing preKeys field', () => {
    expect(() => uploadPreKeysSchema.parse({} as never)).toThrow();
  });
});

// ─── getPreKeyBundleParamSchema ──────────────────────────────────────────────

describe('getPreKeyBundleParamSchema', () => {
  it('accepts a valid UUID', () => {
    expect(() =>
      getPreKeyBundleParamSchema.parse({ userId: UUID })
    ).not.toThrow();
  });

  it('rejects a non-UUID string', () => {
    expect(() =>
      getPreKeyBundleParamSchema.parse({ userId: 'not-a-uuid' })
    ).toThrow();
  });

  it('rejects missing userId', () => {
    expect(() => getPreKeyBundleParamSchema.parse({} as never)).toThrow();
  });
});

// ─── recordKeySessionSchema ──────────────────────────────────────────────────

describe('recordKeySessionSchema', () => {
  it('accepts valid input with both key IDs', () => {
    expect(() =>
      recordKeySessionSchema.parse({
        recipientId: UUID,
        usedPreKeyId: 5,
        usedSignedPreKeyId: 1,
      })
    ).not.toThrow();
  });

  it('accepts valid input with only recipientId (key IDs optional)', () => {
    expect(() =>
      recordKeySessionSchema.parse({ recipientId: UUID })
    ).not.toThrow();
  });

  it('rejects non-UUID recipientId', () => {
    expect(() =>
      recordKeySessionSchema.parse({ recipientId: 'bad' })
    ).toThrow();
  });

  it('rejects non-positive usedPreKeyId', () => {
    expect(() =>
      recordKeySessionSchema.parse({ recipientId: UUID, usedPreKeyId: 0 })
    ).toThrow();
  });

  it('rejects non-integer usedSignedPreKeyId', () => {
    expect(() =>
      recordKeySessionSchema.parse({
        recipientId: UUID,
        usedSignedPreKeyId: 1.5,
      })
    ).toThrow();
  });

  it('rejects missing recipientId', () => {
    expect(() => recordKeySessionSchema.parse({} as never)).toThrow();
  });
});

// ─── rotateSignedPreKeySchema ────────────────────────────────────────────────

describe('rotateSignedPreKeySchema', () => {
  const valid = { keyId: 2, publicKey: VALID_KEY, signature: VALID_SIG };

  it('accepts valid rotation input', () => {
    expect(() => rotateSignedPreKeySchema.parse(valid)).not.toThrow();
  });

  it('rejects keyId of 0', () => {
    expect(() =>
      rotateSignedPreKeySchema.parse({ ...valid, keyId: 0 })
    ).toThrow();
  });

  it('rejects negative keyId', () => {
    expect(() =>
      rotateSignedPreKeySchema.parse({ ...valid, keyId: -1 })
    ).toThrow();
  });

  it('rejects publicKey shorter than 32 chars', () => {
    expect(() =>
      rotateSignedPreKeySchema.parse({ ...valid, publicKey: 'x'.repeat(31) })
    ).toThrow();
  });

  it('rejects signature shorter than 32 chars', () => {
    expect(() =>
      rotateSignedPreKeySchema.parse({ ...valid, signature: 's'.repeat(31) })
    ).toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => rotateSignedPreKeySchema.parse({} as never)).toThrow();
  });
});
