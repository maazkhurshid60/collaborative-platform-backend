import crypto from "crypto";
import jwt from "jsonwebtoken";

// Dedicated, single-purpose tokens for joining a video call — deliberately NOT
// the guest's cancelToken. A leaked cancel link should never double as a way
// to snoop on or disrupt a live call. Long-ish expiry here is just a ceiling;
// the REAL gating (appointment status + join time window) is re-checked
// server-side on every use — see AppointmentService and socket.ts.
const CALL_TOKEN_TTL = "7d";

export interface CallTokenPayload {
  appointmentId: string;
  role: "guest" | "provider";
  participantId: string; // provider's userId, or a fixed "guest" marker
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET;
  if (!secret) {
    throw new Error("JWT secret not set in environment variables");
  }
  return secret;
}

export function signCallToken(payload: CallTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: CALL_TOKEN_TTL });
}

export function verifyCallToken(token: string): CallTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      "appointmentId" in decoded &&
      "role" in decoded &&
      "participantId" in decoded
    ) {
      return decoded as unknown as CallTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}

// Join window: opens shortly before the session, closes at the natural end.
// Enforced both at the REST join endpoints AND on every `join_call` socket
// event — never trust a client-held token's own expiry as the real gate.
export const CALL_JOIN_WINDOW_BEFORE_MINUTES = 10;
// Grace period past the scheduled end before an in-progress call is force-ended.
export const CALL_GRACE_MINUTES = 5;

export function isWithinCallJoinWindow(startTime: Date, endTime: Date, now: Date = new Date()): boolean {
  const windowStart = new Date(startTime.getTime() - CALL_JOIN_WINDOW_BEFORE_MINUTES * 60000);
  const windowEnd = new Date(endTime.getTime() + CALL_GRACE_MINUTES * 60000);
  return now >= windowStart && now <= windowEnd;
}

export interface TurnCredentials {
  username: string;
  password: string;
  urls: string[];
}

// coturn REST API auth (time-limited-credential mechanism) — mints a
// short-lived username/password coturn can validate against a shared secret
// without a DB round-trip. Requires TURN_SHARED_SECRET (and ideally
// TURN_SERVER_URLS) to be set once the coturn server itself is deployed;
// until then this throws so a missing-config case fails loudly rather than
// silently handing out a call with no working TURN relay.
export function generateTurnCredentials(appointmentId: string, participantId: string): TurnCredentials {
  const sharedSecret = process.env.TURN_SHARED_SECRET;
  if (!sharedSecret) {
    throw new Error("TURN_SHARED_SECRET not set in environment variables");
  }

  const ttlSeconds = 60 * 60; // 1 hour — comfortably covers a session + buffer, never open-ended
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${appointmentId}:${participantId}`;
  const password = crypto.createHmac("sha1", sharedSecret).update(username).digest("base64");

  const urls = (process.env.TURN_SERVER_URLS || "turns:turn.kolabme.com:5349?transport=tcp")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  return { username, password, urls };
}

// STUN-only ICE config used ONLY when TURN_SHARED_SECRET isn't configured —
// i.e. local development before coturn is deployed. STUN alone lets two
// peers on ordinary home networks discover a direct path; it does NOT relay
// media, so calls between strict/symmetric NATs (mobile data, some corporate
// networks) will still fail without real TURN. Never used once
// TURN_SHARED_SECRET is set — production always goes through generateTurnCredentials.
const DEV_FALLBACK_STUN_URLS = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"];

export function getIceServers(
  appointmentId: string,
  participantId: string,
): { iceServers: RTCIceServerLike[]; turnCredentials: TurnCredentials | null } {
  if (!process.env.TURN_SHARED_SECRET) {
    return { iceServers: [{ urls: DEV_FALLBACK_STUN_URLS }], turnCredentials: null };
  }

  const turnCredentials = generateTurnCredentials(appointmentId, participantId);
  return {
    iceServers: [{ urls: turnCredentials.urls, username: turnCredentials.username, credential: turnCredentials.password }],
    turnCredentials,
  };
}

interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}
