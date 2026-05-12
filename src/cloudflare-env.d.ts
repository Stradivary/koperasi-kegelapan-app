declare module 'cloudflare:workers' {
  const env: CloudflareEnv
  export { env }
}

interface CloudflareEnv {
  DB: D1Database
  SESSION_MASTER_KEY: string
}
