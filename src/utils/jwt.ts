// src/utils/jwt.ts
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface JwtPayload {
  userId: string;
  roleId: string;
  roleName: string;
}

export function signAccessToken(payload: JwtPayload): string {
  const options: jwt.SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as NonNullable<jwt.SignOptions['expiresIn']>,
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(payload: JwtPayload): string {
  const options: jwt.SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as NonNullable<jwt.SignOptions['expiresIn']>,
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
}