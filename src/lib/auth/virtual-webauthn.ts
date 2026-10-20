import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

export type VirtualCredential = {
  id: string;
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
  counter: number;
};

function b64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function coseKey(x: Buffer, y: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    x,
    Buffer.from([0x22, 0x58, 0x20]),
    y,
  ]);
}

function cborNoneAttestation(authData: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0xa3, 0x63]),
    Buffer.from("fmt"),
    Buffer.from([0x64]),
    Buffer.from("none"),
    Buffer.from([0x67]),
    Buffer.from("attStmt"),
    Buffer.from([0xa0, 0x68]),
    Buffer.from("authData"),
    Buffer.from([0x58, authData.length]),
    authData,
  ]);
}

/** A software authenticator used by tests. It is not a browser. */
export function createVirtualCredential(): VirtualCredential {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = Buffer.from(jwk.x ?? "", "base64url");
  const y = Buffer.from(jwk.y ?? "", "base64url");
  const credentialId = randomBytes(16);
  const rpIdHash = createHash("sha256").update("localhost").digest();
  const cose = coseKey(x, y);
  const authData = Buffer.concat([
    rpIdHash,
    Buffer.from([0x41]),
    Buffer.from([0, 0, 0, 0]),
    Buffer.alloc(16),
    Buffer.from([0x00, credentialId.length]),
    credentialId,
    cose,
  ]);
  return {
    id: b64url(credentialId),
    privateKey,
    counter: 0,
    // stash attestation pieces on the object via closure fields below
    ...{ authData, publicCose: cose },
  } as VirtualCredential & { authData: Buffer };
}

type Stored = VirtualCredential & { authData: Buffer };

export function registrationResponse(
  credential: VirtualCredential,
  challenge: string,
  origin = "http://localhost:3000",
): RegistrationResponseJSON {
  const stored = credential as Stored;
  const clientData = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge, origin, crossOrigin: false }));
  return {
    id: credential.id,
    rawId: credential.id,
    type: "public-key",
    authenticatorAttachment: "platform",
    clientExtensionResults: {},
    response: {
      clientDataJSON: b64url(clientData),
      attestationObject: b64url(cborNoneAttestation(stored.authData)),
      transports: ["internal"],
    },
  };
}

export function authenticationResponse(
  credential: VirtualCredential,
  challenge: string,
  rpID = "localhost",
  origin = "http://localhost:3000",
): AuthenticationResponseJSON {
  credential.counter += 1;
  const rpIdHash = createHash("sha256").update(rpID).digest();
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(credential.counter);
  const authenticatorData = Buffer.concat([rpIdHash, Buffer.from([0x05]), counter]);
  const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false }));
  const signed = Buffer.concat([authenticatorData, createHash("sha256").update(clientData).digest()]);
  const signature = sign(null, signed, credential.privateKey);
  return {
    id: credential.id,
    rawId: credential.id,
    type: "public-key",
    authenticatorAttachment: "platform",
    clientExtensionResults: {},
    response: {
      clientDataJSON: b64url(clientData),
      authenticatorData: b64url(authenticatorData),
      signature: b64url(signature),
    },
  };
}
