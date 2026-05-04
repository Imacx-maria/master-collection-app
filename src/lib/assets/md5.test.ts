import { describe, expect, it } from "vitest";
import { md5String } from "./md5";

describe("md5String", () => {
  it("matches standard MD5 test vectors", () => {
    expect(md5String("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5String("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5String("message digest")).toBe("f96b697d7cb7938d525a2f31aaf161d0");
  });
});
