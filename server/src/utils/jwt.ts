import * as jose from "jose";
import { config } from "../config.js";

const secret = new TextEncoder().encode(config.jwtSecret);

export interface JwtPayload {
  sub: string; // user uuid
  role: string;
  isBound: boolean;
}

function parseDuration(duration: string): string {
  return duration;
}

export async function signAccessToken(payload: JwtPayload): Promise<string> {
  return new jose.SignJWT({ role: payload.role, isBound: payload.isBound })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(parseDuration(config.jwtAccessExpires))
    .sign(secret);
}

export async function signRefreshToken(payload: { sub: string }): Promise<string> {
  return new jose.SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(parseDuration(config.jwtRefreshExpires))
    .sign(secret);
}

export async function verifyToken(token: string): Promise<jose.JWTPayload & JwtPayload> {
  const { payload } = await jose.jwtVerify(token, secret);
  return payload as jose.JWTPayload & JwtPayload;
}
