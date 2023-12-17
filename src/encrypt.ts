import {base32, base64url} from "rfc4648";
import {bufferToArrayBuffer} from "./misc";
import {blockSize} from "./penguin";


const DEFAULT_ITER = 20000;

const getKeyFromPassword = async (
  salt: Uint8Array,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  const k1 = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    {name: "PBKDF2"},
    false,
    ["deriveKey", "deriveBits"]
  );

  const k2 = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: rounds,
      hash: "SHA-256",
    },
    k1,
    256
  );

  return k2;
};

export const encryptArrayBuffer = async (
  arrBuf: ArrayBuffer,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  let salt = window.crypto.getRandomValues(new Uint8Array(16));
  const derivedKey = await getKeyFromPassword(salt, password, rounds);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const keyCrypt = await window.crypto.subtle.importKey(
    "raw",
    derivedKey,
    {name: "AES-GCM"},
    false,
    ["encrypt", "decrypt"]
  );
  let resultBuffer: ArrayBuffer[] = [];
  let startPosition = 0;

  while (startPosition < arrBuf.byteLength) {
    const endPosition = Math.min(startPosition + blockSize, arrBuf.byteLength);
    const chunk = arrBuf.slice(startPosition, endPosition);

    const enc = await window.crypto.subtle.encrypt(
      {name: "AES-GCM", iv: iv},
      keyCrypt,
      chunk
    ) as ArrayBuffer;

    resultBuffer.push(enc);
    startPosition += blockSize;
  }

  return combineChunks(salt, iv, resultBuffer);
};

function combineChunks(salt: Uint8Array, iv: Uint8Array, chunks: ArrayBuffer[]): ArrayBuffer {
  // 计算总长度：盐的长度 + IV 的长度 + 所有加密块的长度
  const totalLength = salt.length + iv.length + chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);

  // 创建一个新的 Uint8Array 来存储组合的结果
  const combined = new Uint8Array(totalLength);

  // 设置盐和 IV
  combined.set(salt, 0);
  combined.set(iv, salt.length);

  // 追加每个加密块的数据
  let offset = salt.length + iv.length;
  chunks.forEach(chunk => {
    combined.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  });
  return combined.buffer;
}


export const decryptArrayBuffer = async (
  arrBuf: ArrayBuffer,
  password: string,
  rounds: number = DEFAULT_ITER
): Promise<ArrayBuffer> => {
  const salt = arrBuf.slice(0, 16); // first 16 bytes are salt
  const iv = arrBuf.slice(16, 28); // next 12 bytes are IV
  const cipherText = arrBuf.slice(28); // remaining bytes are ciphertext

  const key = await getKeyFromPassword(
    new Uint8Array(salt),
    password,
    rounds
  );

  const keyCrypt = await window.crypto.subtle.importKey(
    "raw",
    key,
    {name: "AES-GCM"},
    false,
    ["decrypt"]
  );

  let resultBuffer: ArrayBuffer[] = [];
  let startPosition = 0;
  let chunk;
  let dec;
  while (startPosition < cipherText.byteLength) {
    // 假设每个加密块后附加了16字节的认证标签
    const endPosition = Math.min(startPosition + blockSize + 16, cipherText.byteLength);
    chunk = cipherText.slice(startPosition, endPosition);

    try {
      dec = await window.crypto.subtle.decrypt(
        {name: "AES-GCM", iv: new Uint8Array(iv)},
        keyCrypt,
        chunk
      ) as ArrayBuffer;
      resultBuffer.push(dec);
      dec = undefined;
      chunk = undefined;
    } catch (e) {
      console.error("解密错误:", e);
      throw e;
    }

    // 更新startPosition以跳过认证标签
    startPosition += blockSize + 16;
  }

  return combineDecryptedChunks(resultBuffer);
};

function combineDecryptedChunks(buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce((acc, buffer) => acc + buffer.byteLength, 0);
  const combined = new Uint8Array(totalLength);

  let offset = 0;
  buffers.forEach(buffer => {
    combined.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  });

  return combined.buffer;
}


export const encryptStringToBase32 = async (
  text: string,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  const enc = await encryptArrayBuffer(
    bufferToArrayBuffer(new TextEncoder().encode(text)),
    password,
    rounds
  );
  return base32.stringify(new Uint8Array(enc), {pad: false});
};

export const decryptBase32ToString = async (
  text: string,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  return new TextDecoder().decode(
    await decryptArrayBuffer(
      bufferToArrayBuffer(base32.parse(text, {loose: true})),
      password,
      rounds,
    )
  );
};

export const encryptStringToBase64url = async (
  text: string,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  const enc = await encryptArrayBuffer(
    bufferToArrayBuffer(new TextEncoder().encode(text)),
    password,
    rounds
  );
  return base64url.stringify(new Uint8Array(enc), {pad: false});
};

export const decryptBase64urlToString = async (
  text: string,
  password: string,
  rounds: number = DEFAULT_ITER,
) => {
  return new TextDecoder().decode(
    await decryptArrayBuffer(
      bufferToArrayBuffer(base64url.parse(text, {loose: true})),
      password,
      rounds,
    )
  );
};

export const getSizeFromOrigToEnc = (x: number) => {
  if (x < 0 || Number.isNaN(x) || !Number.isInteger(x)) {
    throw Error(`getSizeFromOrigToEnc: x=${x} is not a valid size`);
  }
  return (Math.floor(x / 16) + 1) * 16 + 16;
};

export const getSizeFromEncToOrig = (x: number) => {
  if (x < 32 || Number.isNaN(x) || !Number.isInteger(x)) {
    throw Error(`getSizeFromEncToOrig: ${x} is not a valid size`);
  }
  if (x % 16 !== 0) {
    throw Error(
      `getSizeFromEncToOrig: ${x} is not a valid encrypted file size`
    );
  }
  return {
    minSize: ((x - 16) / 16 - 1) * 16,
    maxSize: ((x - 16) / 16 - 1) * 16 + 15,
  };
};
