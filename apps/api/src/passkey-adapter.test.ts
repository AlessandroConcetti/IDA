import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import * as webauthn from "@simplewebauthn/server";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasskeyAdapter, type PasskeyCredential } from "./passkey-adapter.js";

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@simplewebauthn/server")>();
  return {
    ...actual,
    verifyRegistrationResponse: vi.fn(actual.verifyRegistrationResponse),
    verifyAuthenticationResponse: vi.fn(actual.verifyAuthenticationResponse),
  };
});

const config = { origin: "https://ida.synthetic.invalid", rpId: "ida.synthetic.invalid" };
const challenge = Buffer.alloc(32, 7).toString("base64url");
const userHandle = Buffer.alloc(32, 8).toString("base64url");
const credential: PasskeyCredential = {
  id: Buffer.alloc(32, 9).toString("base64url"),
  publicKey: new Uint8Array([1, 2, 3]),
  counter: 0,
  transports: ["internal", "hybrid"],
};
function response(registration: boolean, crossOrigin = false) {
  return {
    id: credential.id,
    rawId: credential.id,
    type: "public-key" as const,
    clientExtensionResults: {},
    response: {
      clientDataJSON: Buffer.from(
        JSON.stringify({
          type: registration ? "webauthn.create" : "webauthn.get",
          challenge,
          origin: config.origin,
          crossOrigin,
        }),
      ).toString("base64url"),
      ...(registration
        ? {
            attestationObject: Buffer.from(
              "a363666d74646e6f6e656761747453746d74a06861757468446174614100",
              "hex",
            ).toString("base64url"),
          }
        : { authenticatorData: Buffer.alloc(37).toString("base64url"), signature: "AQ" }),
    },
  };
}
function registrationResult(verified = true, userVerified = true) {
  return {
    verified,
    registrationInfo: { credential, userVerified },
  } as Awaited<ReturnType<typeof webauthn.verifyRegistrationResponse>>;
}
function authenticationResult(verified = true, userVerified = true, newCounter = 1) {
  return {
    verified,
    authenticationInfo: { credentialID: credential.id, userVerified, newCounter },
  } as Awaited<ReturnType<typeof webauthn.verifyAuthenticationResponse>>;
}

/** Synthetic authenticator: ephemeral test key, no device, persisted secret or network. */
function syntheticAuthenticator() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  if (!jwk.x || !jwk.y) throw new Error("TEST_KEY_INVALID");
  const coseKey = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, new Uint8Array(Buffer.from(jwk.x, "base64url"))],
      [-3, new Uint8Array(Buffer.from(jwk.y, "base64url"))],
    ]),
  );
  const id = randomBytes(32);
  const stored: PasskeyCredential = {
    id: id.toString("base64url"),
    publicKey: coseKey,
    counter: 0,
    transports: ["internal"],
  };
  function ceremony(
    registration: boolean,
    overrides: { challenge?: string; origin?: string; rpId?: string; flags?: number; counter?: number } = {},
  ) {
    const clientData = Buffer.from(
      JSON.stringify({
        type: registration ? "webauthn.create" : "webauthn.get",
        challenge: overrides.challenge ?? challenge,
        origin: overrides.origin ?? config.origin,
        crossOrigin: false,
      }),
    );
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(overrides.counter ?? (registration ? 0 : 1));
    const header = Buffer.concat([
      createHash("sha256")
        .update(overrides.rpId ?? config.rpId)
        .digest(),
      Buffer.from([overrides.flags ?? (registration ? 0x45 : 0x05)]),
      counter,
    ]);
    const authData = registration
      ? Buffer.concat([header, Buffer.alloc(16), Buffer.from([0, id.length]), id, coseKey])
      : header;
    return {
      id: stored.id,
      rawId: stored.id,
      type: "public-key" as const,
      clientExtensionResults: {},
      response: {
        clientDataJSON: clientData.toString("base64url"),
        ...(registration
          ? {
              attestationObject: Buffer.from(
                isoCBOR.encode(
                  new Map<string, string | Map<string, never> | Uint8Array>([
                    ["fmt", "none"],
                    ["attStmt", new Map<string, never>()],
                    ["authData", new Uint8Array(authData)],
                  ]),
                ),
              ).toString("base64url"),
              transports: stored.transports,
            }
          : {
              authenticatorData: authData.toString("base64url"),
              signature: sign(
                "sha256",
                Buffer.concat([authData, createHash("sha256").update(clientData).digest()]),
                privateKey,
              ).toString("base64url"),
            }),
      },
    };
  }
  return { stored, ceremony };
}

beforeEach(async () => {
  // Explicit restoration makes real-crypto tests independent of Vitest reset semantics.
  const actual = await vi.importActual<typeof webauthn>("@simplewebauthn/server");
  vi.mocked(webauthn.verifyRegistrationResponse).mockImplementation(actual.verifyRegistrationResponse);
  vi.mocked(webauthn.verifyAuthenticationResponse).mockImplementation(actual.verifyAuthenticationResponse);
});
afterEach(() => vi.resetAllMocks());

describe("Passkey adapter — exact RP and maintained WebAuthn verifier", () => {
  it.each([
    { ...config, origin: "http://ida.synthetic.invalid" },
    { ...config, origin: "https://ida.synthetic.invalid/" },
    { ...config, origin: "https://ida.synthetic.invalid/path" },
    { ...config, origin: "https://ida.synthetic.invalid?key=private" },
    { ...config, origin: "https://ida.synthetic.invalid#private" },
    { ...config, origin: "https://user:private@ida.synthetic.invalid" },
    { ...config, rpId: "synthetic.invalid" },
    { ...config, rpId: "*.synthetic.invalid" },
    { origin: "https://127.0.0.1", rpId: "127.0.0.1" },
    { origin: "https://[::1]", rpId: "[::1]" },
    { origin: "https://localhost", rpId: "localhost" },
    { origin: "https://-ida.synthetic.invalid", rpId: "-ida.synthetic.invalid" },
    { origin: "https://IDA.synthetic.invalid", rpId: "IDA.synthetic.invalid" },
  ])("rejects ambiguous/insecure config without reflecting it: %j", (input) => {
    expect(() => new PasskeyAdapter(input)).toThrow("PASSKEY_CONFIGURATION_INVALID");
  });

  it("copies validated origin config and preserves canonical caller-generated challenge and opaque user handle", async () => {
    const mutable = { ...config };
    const adapter = new PasskeyAdapter(mutable);
    mutable.rpId = "attacker.invalid";
    mutable.origin = "https://attacker.invalid";
    const options = await adapter.registrationOptions({ challenge, userHandle });
    expect(options.rp).toEqual({ name: "IDA", id: config.rpId });
    expect(options.challenge).toBe(challenge);
    expect(options.user).toMatchObject({ id: userHandle, name: "Navigateur IDA", displayName: "Navigateur IDA" });
    expect(options.attestation).toBe("none");
    expect(options.authenticatorSelection).toMatchObject({ residentKey: "required", userVerification: "required" });
    expect(options.timeout).toBe(120_000);
  });

  it("limits authentication to the selected credential and requires user verification", async () => {
    const options = await new PasskeyAdapter(config).authenticationOptions({ challenge, credential });
    expect(options).toMatchObject({ rpId: config.rpId, challenge, userVerification: "required", timeout: 120_000 });
    expect(options.allowCredentials).toEqual([
      { id: credential.id, type: "public-key", transports: credential.transports },
    ]);
  });

  it.each(["", "too-short", `${challenge}=`, "x".repeat(4096)])(
    "rejects non-canonical or unbounded challenge %s",
    async (invalid) => {
      const adapter = new PasskeyAdapter(config);
      await expect(adapter.registrationOptions({ challenge: invalid, userHandle })).rejects.toThrow(
        "PASSKEY_VERIFICATION_FAILED",
      );
      await expect(adapter.authenticationOptions({ challenge: invalid, credential })).rejects.toThrow(
        "PASSKEY_VERIFICATION_FAILED",
      );
    },
  );

  it("rejects non-opaque user handles and malformed credential metadata", async () => {
    const adapter = new PasskeyAdapter(config);
    await expect(adapter.registrationOptions({ challenge, userHandle: "person@example.invalid" })).rejects.toThrow(
      "PASSKEY_VERIFICATION_FAILED",
    );
    await expect(adapter.authenticationOptions({ challenge, credential: { id: "not canonical!" } })).rejects.toThrow(
      "PASSKEY_VERIFICATION_FAILED",
    );
    await expect(
      adapter.authenticationOptions({
        challenge,
        credential: { id: credential.id, transports: ["private-value" as "usb"] },
      }),
    ).rejects.toThrow("PASSKEY_VERIFICATION_FAILED");
  });

  it("passes exact challenge, origin, RP ID and mandatory UV to the registration verifier", async () => {
    const verify = vi.mocked(webauthn.verifyRegistrationResponse).mockResolvedValue(registrationResult());
    const result = await new PasskeyAdapter(config).verifyRegistration({ response: response(true), challenge });
    expect(verify).toHaveBeenCalledWith({
      response: response(true),
      expectedChallenge: challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      requireUserPresence: true,
      requireUserVerification: true,
    });
    expect(result).toEqual(credential);
    expect(result.publicKey).not.toBe(credential.publicKey);
    expect(result.transports).not.toBe(credential.transports);
  });

  it("passes exact credential and mandatory UV to authentication; only returns new counter", async () => {
    const verify = vi.mocked(webauthn.verifyAuthenticationResponse).mockResolvedValue(authenticationResult());
    const result = await new PasskeyAdapter(config).verifyAuthentication({
      response: response(false),
      challenge,
      credential,
    });
    expect(verify).toHaveBeenCalledWith({
      response: response(false),
      expectedChallenge: challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      requireUserVerification: true,
      credential,
    });
    expect(result).toEqual({ newCounter: 1 });
  });

  it("refuses false results, missing user verification and invalid counters", async () => {
    const adapter = new PasskeyAdapter(config);
    const registration = vi.mocked(webauthn.verifyRegistrationResponse);
    for (const result of [registrationResult(false), registrationResult(true, false)]) {
      registration.mockResolvedValue(result);
      await expect(adapter.verifyRegistration({ response: response(true), challenge })).rejects.toThrow(
        "PASSKEY_VERIFICATION_FAILED",
      );
    }
    const authentication = vi.mocked(webauthn.verifyAuthenticationResponse);
    for (const result of [
      authenticationResult(false),
      authenticationResult(true, false),
      authenticationResult(true, true, -1),
    ]) {
      authentication.mockResolvedValue(result);
      await expect(adapter.verifyAuthentication({ response: response(false), challenge, credential })).rejects.toThrow(
        "PASSKEY_VERIFICATION_FAILED",
      );
    }
  });

  it("refuses another credential and embedded cross-origin ceremonies before the verifier", async () => {
    const verify = vi.mocked(webauthn.verifyAuthenticationResponse);
    const adapter = new PasskeyAdapter(config);
    await expect(
      adapter.verifyAuthentication({ response: response(false, true), challenge, credential }),
    ).rejects.toThrow("PASSKEY_VERIFICATION_FAILED");
    await expect(
      adapter.verifyAuthentication({
        response: response(false),
        challenge,
        credential: { ...credential, id: Buffer.alloc(32, 10).toString("base64url") },
      }),
    ).rejects.toThrow("PASSKEY_VERIFICATION_FAILED");
    expect(verify).not.toHaveBeenCalled();
  });

  it("refuses certificate attestation formats before entering verifier or metadata branches", async () => {
    const verify = vi.mocked(webauthn.verifyRegistrationResponse);
    const input = {
      ...response(true),
      response: {
        ...response(true).response,
        attestationObject: Buffer.from(
          "a363666d74667061636b65646761747453746d74a06861757468446174614100",
          "hex",
        ).toString("base64url"),
      },
    };
    await expect(new PasskeyAdapter(config).verifyRegistration({ response: input, challenge })).rejects.toThrow(
      "PASSKEY_VERIFICATION_FAILED",
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it("bounds unknown response data and does not leak verifier errors", async () => {
    const adapter = new PasskeyAdapter(config);
    await expect(
      adapter.verifyRegistration({ response: { ...response(true), oversized: "x".repeat(65_536) }, challenge }),
    ).rejects.toThrow("PASSKEY_VERIFICATION_FAILED");
    vi.mocked(webauthn.verifyRegistrationResponse).mockRejectedValue(new Error("private-details-and-challenge"));
    try {
      await adapter.verifyRegistration({ response: response(true), challenge });
      expect.fail("must reject");
    } catch (error) {
      expect(error).toEqual(new Error("PASSKEY_VERIFICATION_FAILED"));
      expect(String(error)).not.toContain("private-details");
    }
  });

  it("real library rejects incomplete registrations and unsigned authentication responses", async () => {
    const adapter = new PasskeyAdapter(config);
    await expect(adapter.verifyRegistration({ response: response(true), challenge })).rejects.toThrow(
      "PASSKEY_VERIFICATION_FAILED",
    );
    await expect(adapter.verifyAuthentication({ response: response(false), challenge, credential })).rejects.toThrow(
      "PASSKEY_VERIFICATION_FAILED",
    );
    for (const invalid of [null, [], {}, "private-data", 42]) {
      await expect(adapter.verifyRegistration({ response: invalid, challenge })).rejects.toThrow(
        "PASSKEY_VERIFICATION_FAILED",
      );
      await expect(adapter.verifyAuthentication({ response: invalid, challenge, credential })).rejects.toThrow(
        "PASSKEY_VERIFICATION_FAILED",
      );
    }
  });

  it("real library registers an ephemeral ES256 credential and verifies its signed assertion", async () => {
    const authenticator = syntheticAuthenticator();
    const adapter = new PasskeyAdapter(config);
    const enrolled = await adapter.verifyRegistration({ response: authenticator.ceremony(true), challenge });
    expect(enrolled).toEqual(authenticator.stored);
    await expect(
      adapter.verifyAuthentication({ response: authenticator.ceremony(false), challenge, credential: enrolled }),
    ).resolves.toEqual({ newCounter: 1 });
  });

  it.each([
    { challenge: Buffer.alloc(32, 42).toString("base64url") },
    { origin: "https://other.synthetic.invalid" },
    { rpId: "other.synthetic.invalid" },
    { flags: 0x41 },
    { flags: 0x44 },
  ])("real library rejects an invalid registration binding or mandatory flag: %j", async (overrides) => {
    const authenticator = syntheticAuthenticator();
    await expect(
      new PasskeyAdapter(config).verifyRegistration({ response: authenticator.ceremony(true, overrides), challenge }),
    ).rejects.toThrow("PASSKEY_VERIFICATION_FAILED");
  });

  it.each([
    { challenge: Buffer.alloc(32, 42).toString("base64url") },
    { origin: "https://other.synthetic.invalid" },
    { rpId: "other.synthetic.invalid" },
    { flags: 0x01 },
    { flags: 0x04 },
  ])("real library rejects even a correctly signed assertion with invalid binding or flags: %j", async (overrides) => {
    const authenticator = syntheticAuthenticator();
    await expect(
      new PasskeyAdapter(config).verifyAuthentication({
        response: authenticator.ceremony(false, overrides),
        challenge,
        credential: authenticator.stored,
      }),
    ).rejects.toThrow("PASSKEY_VERIFICATION_FAILED");
  });

  it("real library rejects altered signatures, wrong keys and replayed counters", async () => {
    const authenticator = syntheticAuthenticator();
    const assertion = authenticator.ceremony(false);
    if (!("signature" in assertion.response)) throw new Error("TEST_SIGNATURE_MISSING");
    const signature = Buffer.from(assertion.response.signature, "base64url");
    signature.writeUInt8(signature.readUInt8(signature.length - 1) ^ 1, signature.length - 1);
    const adapter = new PasskeyAdapter(config);
    await expect(
      adapter.verifyAuthentication({
        response: { ...assertion, response: { ...assertion.response, signature: signature.toString("base64url") } },
        challenge,
        credential: authenticator.stored,
      }),
    ).rejects.toThrow("PASSKEY_VERIFICATION_FAILED");
    await expect(
      adapter.verifyAuthentication({
        response: assertion,
        challenge,
        credential: { ...authenticator.stored, publicKey: syntheticAuthenticator().stored.publicKey },
      }),
    ).rejects.toThrow("PASSKEY_VERIFICATION_FAILED");
    await expect(
      adapter.verifyAuthentication({
        response: assertion,
        challenge,
        credential: { ...authenticator.stored, counter: 1 },
      }),
    ).rejects.toThrow("PASSKEY_VERIFICATION_FAILED");
  });
});
