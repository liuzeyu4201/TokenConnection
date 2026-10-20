import { describe, expect, it } from "vitest";

import { sendMail, setMailTransportForTests, smtpConfigured } from "./send";

describe("sendMail", () => {
  it("does nothing when SMTP is not configured", async () => {
    const previous = process.env.SMTP_URL;
    delete process.env.SMTP_URL;
    const sent: string[] = [];
    setMailTransportForTests({
      send: async (message) => {
        sent.push(message.text);
      },
    });
    expect(smtpConfigured()).toBe(false);
    expect(await sendMail({ to: "a@example.com", subject: "hi", text: "http://localhost/reset" })).toBe(false);
    expect(sent).toEqual([]);
    setMailTransportForTests(null);
    if (previous) process.env.SMTP_URL = previous;
  });

  it("calls the transport with the link when SMTP is configured", async () => {
    const previous = process.env.SMTP_URL;
    process.env.SMTP_URL = "smtp://example.test:587";
    const sent: Array<{ to: string; text: string }> = [];
    setMailTransportForTests({
      send: async (message) => {
        sent.push({ to: message.to, text: message.text });
      },
    });
    const url = "http://localhost:3000/reset-password/abc";
    expect(
      await sendMail({
        to: "a@example.com",
        subject: "重置密码",
        text: `打开这个链接重置密码：\n${url}\n`,
      }),
    ).toBe(true);
    expect(sent).toEqual([{ to: "a@example.com", text: expect.stringContaining(url) }]);
    setMailTransportForTests(null);
    if (previous === undefined) delete process.env.SMTP_URL;
    else process.env.SMTP_URL = previous;
  });
});
