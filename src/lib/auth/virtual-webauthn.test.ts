import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { describe, expect, it } from "vitest";

import { authenticationResponse, createVirtualCredential, registrationResponse } from "./virtual-webauthn";

const ORIGIN = "http://localhost:3000";
const RP_ID = "localhost";

describe("virtual passkey", () => {
  it("accepts a matching challenge, stores the credential, and rejects a replayed counter", async () => {
    const challenge = "challenge-one";
    const credential = createVirtualCredential();
    const registered = await verifyRegistrationResponse({
      response: registrationResponse(credential, challenge, ORIGIN),
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });
    expect(registered.verified).toBe(true);
    const stored = registered.registrationInfo?.credential;
    expect(stored?.counter).toBe(0);
    expect(stored?.id).toBe(credential.id);

    await expect(
      verifyRegistrationResponse({
        response: registrationResponse(createVirtualCredential(), "other-challenge", ORIGIN),
        expectedChallenge: challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: false,
      }),
    ).rejects.toThrow();

    const signedIn = await verifyAuthenticationResponse({
      response: authenticationResponse(credential, "login-challenge", RP_ID, ORIGIN),
      expectedChallenge: "login-challenge",
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
      credential: {
        id: stored!.id,
        publicKey: stored!.publicKey,
        counter: stored!.counter,
      },
    });
    expect(signedIn.verified).toBe(true);
    expect(signedIn.authenticationInfo.newCounter).toBe(1);

    await expect(
      verifyAuthenticationResponse({
        response: authenticationResponse({ ...credential, counter: 0 }, "login-2", RP_ID, ORIGIN),
        expectedChallenge: "login-2",
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: false,
        credential: {
          id: stored!.id,
          publicKey: stored!.publicKey,
          counter: signedIn.authenticationInfo.newCounter,
        },
      }),
    ).rejects.toThrow();
  });
});
