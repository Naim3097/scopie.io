import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService, AuthedUser } from "./auth.service";

/**
 * Route guard for user-scoped endpoints (checkout, cart, wallet, order
 * status). Configured mode requires a valid Supabase token; demo mode admits
 * a namespaced guest identity so the zero-infrastructure flow keeps working.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthedUser }>();
    if (this.auth.configured) {
      const user = this.auth.fromRequest(req);
      if (!user) throw new UnauthorizedException("Sign in to continue.");
      req.user = user;
    } else {
      req.user = this.auth.guestFrom(req);
    }
    return true;
  }
}

/** Injects the guard-attached identity into a handler parameter. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthedUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthedUser }>();
  if (!req.user) throw new UnauthorizedException("Sign in to continue.");
  return req.user;
});
