import { loginSchema, registerSchema } from '../../../src/validators/auth.validators';

describe('auth validators', () => {
  it('registerSchema accepts valid input', () => {
    const input = {
      username: 'user_name_1',
      email: 'user@example.com',
      password: 'Password123!',
      publicKey: 'pk',
    };

    expect(() => registerSchema.parse(input)).not.toThrow();
  });

  it('registerSchema rejects username shorter than 3 chars', () => {
    expect(() =>
      registerSchema.parse({
        username: 'ab',
        email: 'user@example.com',
        password: 'Password123!',
        publicKey: 'pk',
      })
    ).toThrow();
  });

  it('registerSchema rejects username with special chars', () => {
    expect(() =>
      registerSchema.parse({
        username: 'user@name',
        email: 'user@example.com',
        password: 'Password123!',
        publicKey: 'pk',
      })
    ).toThrow();
  });

  it('registerSchema rejects invalid email', () => {
    expect(() =>
      registerSchema.parse({
        username: 'username',
        email: 'not-an-email',
        password: 'Password123!',
        publicKey: 'pk',
      })
    ).toThrow();
  });

  it('registerSchema rejects password shorter than 8 chars', () => {
    expect(() =>
      registerSchema.parse({
        username: 'username',
        email: 'user@example.com',
        password: 'short',
        publicKey: 'pk',
      })
    ).toThrow();
  });

  it('loginSchema accepts valid email + password', () => {
    expect(() => loginSchema.parse({ email: 'user@example.com', password: 'x' })).not.toThrow();
  });

  it('loginSchema rejects missing password', () => {
    expect(() => loginSchema.parse({ email: 'user@example.com' } as any)).toThrow();
  });
});
