import type { MiddlewareHandler } from 'melina';

export default function middleware(request: Request): Response | null {
  // Let melina handle all routing
  return null;
}
