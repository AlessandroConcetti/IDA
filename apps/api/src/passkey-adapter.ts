import { isIP } from "node:net";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { decodeAttestationObject } from "@simplewebauthn/server/helpers";

export type PasskeyCredential = {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: string[];
};

type CredentialReference = Pick<PasskeyCredential, "id" | "transports">;
const transports = new Set(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
const failure = () => new Error("PASSKEY_VERIFICATION_FAILED");

function canonicalBytes(value: unknown, minimum: number, maximum: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value) || value.length > Math.ceil((maximum * 4) / 3))
    throw failure();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.byteLength < minimum || bytes.byteLength > maximum || bytes.toString("base64url") !== value)
    throw failure();
  return new Uint8Array(bytes);
}

function credentialReference(credential: CredentialReference): CredentialReference {
  canonicalBytes(credential.id, 1, 1023);
  if (
    credential.transports !== undefined &&
    (!Array.isArray(credential.transports) ||
      credential.transports.length > transports.size ||
      credential.transports.some((transport) => !transports.has(transport)))
  )
    throw failure();
  return {
    id: credential.id,
    ...(credential.transports === undefined ? {} : { transports: [...new Set(credential.transports)] }),
  };
}

function validCounter(counter: unknown): counter is number {
  return typeof counter === "number" && Number.isSafeInteger(counter) && counter >= 0 && counter <= 0xffffffff;
}

function copyCredential(credential: PasskeyCredential): PasskeyCredential & { publicKey: Uint8Array<ArrayBuffer> } {
  if (
    !(credential.publicKey instanceof Uint8Array) ||
    credential.publicKey.byteLength === 0 ||
    credential.publicKey.byteLength > 16_384 ||
    !validCounter(credential.counter)
  )
    throw failure();
  return {
    ...credentialReference(credential),
    publicKey: new Uint8Array(credential.publicKey),
    counter: credential.counter,
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Bounds and same-frame policy only; cryptographic validation stays in SimpleWebAuthn. */
function boundedResponse(
  response: unknown,
  registration: boolean,
): RegistrationResponseJSON | AuthenticationResponseJSON {
  const serialized = JSON.stringify(response);
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > 65_536) throw failure();
  const value: unknown = JSON.parse(serialized);
  if (!record(value) || value.type !== "public-key" || !record(value.response) || !record(value.clientExtensionResults))
    throw failure();
  canonicalBytes(value.id, 1, 1023);
  canonicalBytes(value.rawId, 1, 1023);
  if (value.id !== value.rawId) throw failure();
  const clientDataBytes = canonicalBytes(value.response.clientDataJSON, 1, 8192);
  const clientData: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(clientDataBytes));
  if (
    !record(clientData) ||
    (clientData.crossOrigin !== undefined && clientData.crossOrigin !== false) ||
    clientData.topOrigin !== undefined
  )
    throw failure();
  if (registration) {
    const attestation = decodeAttestationObject(canonicalBytes(value.response.attestationObject, 1, 49_152));
    // Only the requested privacy-preserving format is accepted. In particular,
    // never enter certificate/metadata verification branches with network needs.
    if (attestation.get("fmt") !== "none" || attestation.get("attStmt")?.size !== 0) throw failure();
  } else {
    canonicalBytes(value.response.authenticatorData, 37, 8192);
    canonicalBytes(value.response.signature, 1, 16_384);
    if (value.response.userHandle !== undefined && value.response.userHandle !== null)
      canonicalBytes(value.response.userHandle, 1, 64);
  }
  return value as unknown as RegistrationResponseJSON | AuthenticationResponseJSON;
}

/** No account selection, session issuance, persistence, logs or network activation. */
export class PasskeyAdapter {
  private readonly origin: string;
  private readonly rpId: string;

  constructor(config: { origin: string; rpId: string }) {
    try {
      const origin = new URL(config.origin);
      const labels = config.rpId.split(".");
      if (
        origin.protocol !== "https:" ||
        origin.origin !== config.origin ||
        origin.hostname !== config.rpId ||
        origin.username ||
        origin.password ||
        isIP(config.rpId) !== 0 ||
        config.rpId.length > 253 ||
        labels.length < 2 ||
        labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))
      )
        throw failure();
      this.origin = origin.origin;
      this.rpId = config.rpId;
    } catch {
      throw new Error("PASSKEY_CONFIGURATION_INVALID");
    }
  }

  async registrationOptions(input: { challenge: string; userHandle: string }) {
    try {
      return await generateRegistrationOptions({
        rpName: "IDA",
        rpID: this.rpId,
        challenge: canonicalBytes(input.challenge, 32, 32),
        userID: canonicalBytes(input.userHandle, 32, 32),
        userName: "Navigateur IDA",
        userDisplayName: "Navigateur IDA",
        timeout: 120_000,
        attestationType: "none",
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
      });
    } catch {
      throw failure();
    }
  }

  async verifyRegistration(input: { response: unknown; challenge: string }): Promise<PasskeyCredential> {
    try {
      canonicalBytes(input.challenge, 32, 32);
      const verified = await verifyRegistrationResponse({
        response: boundedResponse(input.response, true) as RegistrationResponseJSON,
        expectedChallenge: input.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        requireUserPresence: true,
        requireUserVerification: true,
      });
      if (!verified.verified || !verified.registrationInfo?.userVerified) throw failure();
      return copyCredential(verified.registrationInfo.credential);
    } catch {
      throw failure();
    }
  }

  async authenticationOptions(input: { challenge: string; credential: CredentialReference }) {
    try {
      return await generateAuthenticationOptions({
        rpID: this.rpId,
        challenge: canonicalBytes(input.challenge, 32, 32),
        allowCredentials: [credentialReference(input.credential)],
        userVerification: "required",
        timeout: 120_000,
      });
    } catch {
      throw failure();
    }
  }

  async verifyAuthentication(input: { response: unknown; challenge: string; credential: PasskeyCredential }) {
    try {
      canonicalBytes(input.challenge, 32, 32);
      const credential = copyCredential(input.credential);
      const response = boundedResponse(input.response, false) as AuthenticationResponseJSON;
      if (response.id !== credential.id) throw failure();
      const verified = await verifyAuthenticationResponse({
        response,
        expectedChallenge: input.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        credential,
        requireUserVerification: true,
      });
      if (
        !verified.verified ||
        !verified.authenticationInfo.userVerified ||
        !validCounter(verified.authenticationInfo.newCounter)
      )
        throw failure();
      return { newCounter: verified.authenticationInfo.newCounter };
    } catch {
      throw failure();
    }
  }
}
