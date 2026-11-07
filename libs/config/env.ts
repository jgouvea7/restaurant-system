const LOCAL_ENVIRONMENTS = new Set(['', 'development', 'dev', 'local', 'test']);

export function isProduction(): boolean {
  return process.env.NODE_ENV?.trim().toLowerCase() === 'production';
}

export function isLocalEnvironment(): boolean {
  return LOCAL_ENVIRONMENTS.has(
    (process.env.NODE_ENV ?? '').trim().toLowerCase(),
  );
}

export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

export function requiredEnv(name: string, fallbackInLocal?: string): string {
  const value = process.env[name]?.trim();

  if (value) {
    return value;
  }

  if (!isProduction() && fallbackInLocal !== undefined) {
    return fallbackInLocal;
  }

  throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
}
