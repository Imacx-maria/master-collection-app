export async function md5File(file: File): Promise<string> {
  if (typeof file.arrayBuffer === "function") {
    return md5Bytes(new Uint8Array(await file.arrayBuffer()));
  }
  if (typeof file.text === "function") {
    return md5String(await file.text());
  }
  return md5Bytes(new Uint8Array(await new Response(file).arrayBuffer()));
}

export function md5String(value: string): string {
  return md5Bytes(new TextEncoder().encode(value));
}

export function md5Bytes(input: Uint8Array): string {
  const bytes = withMd5Padding(input);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const table = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array<number>(16);
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4;
      words[i] = bytes[j] | (bytes[j + 1] << 8) | (bytes[j + 2] << 16) | (bytes[j + 3] << 24);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const next = d;
      d = c;
      c = b;
      b = add32(b, rotateLeft(add32(add32(a, f), add32(table[i], words[g])), shifts[i]));
      a = next;
    }

    a0 = add32(a0, a);
    b0 = add32(b0, b);
    c0 = add32(c0, c);
    d0 = add32(d0, d);
  }

  return [a0, b0, c0, d0].map(wordToHex).join("");
}

function withMd5Padding(input: Uint8Array): Uint8Array {
  const bitLength = input.length * 8;
  const paddedLength = (((input.length + 8) >> 6) + 1) * 64;
  const output = new Uint8Array(paddedLength);
  output.set(input);
  output[input.length] = 0x80;

  for (let i = 0; i < 8; i += 1) {
    output[paddedLength - 8 + i] = Math.floor(bitLength / 2 ** (8 * i)) & 0xff;
  }

  return output;
}

function add32(a: number, b: number): number {
  return (a + b) >>> 0;
}

function rotateLeft(value: number, count: number): number {
  return (value << count) | (value >>> (32 - count));
}

function wordToHex(word: number): string {
  const chars: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    chars.push(((word >>> (i * 8)) & 0xff).toString(16).padStart(2, "0"));
  }
  return chars.join("");
}
