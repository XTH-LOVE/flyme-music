import { createCipheriv } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { WEAPI_IV, WEAPI_NONCE, aesEncryptBase64, buildVisitorCookie, encryptWeapi } from './weapi';

const nodeAes = (text: string, key: string) => {
  const cipher = createCipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(WEAPI_IV, 'utf8'));
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64');
};

describe('aesEncryptBase64', () => {
  it('与 dev 代理使用的 Node crypto 结果一致', async () => {
    const text = '{"s":"search","limit":5}';
    expect(await aesEncryptBase64(text, WEAPI_NONCE)).toBe(nodeAes(text, WEAPI_NONCE));
  });
});

describe('encryptWeapi', () => {
  it('产出 params 与 256 位十六进制 encSecKey', async () => {
    const r = await encryptWeapi({ id: 123, lv: -1 });
    expect(r.params.length).toBeGreaterThan(20);
    expect(r.encSecKey).toMatch(/^[0-9a-f]{256}$/);
  });

  it('可直接编码为 x-www-form-urlencoded 请求体', async () => {
    const r = await encryptWeapi({ id: 1 });
    const form = new URLSearchParams(r);
    expect(form.get('params')).toBe(r.params);
    expect(form.get('encSecKey')).toBe(r.encSecKey);
  });

  it('encSecKey/params 命中 Node 参考实现的 golden vector（固定 RNG，防常量/reverse/padStart 漂移）', async () => {
    // randomKey 从 '012345679abcdef' 取字符；用 (index+0.5)/15 反推 Math.random，
    // 强制 secKey = SEC_KEY。SEC_KEY 特意选非回文 + RSA 结果带前导零，
    // 一条用例同时覆盖「删 reverse」「padStart 位数」两类变异。
    const ALPHABET = '012345679abcdef';
    const SEC_KEY = '23aa0b6b093421cc';
    let i = 0;
    const spy = vi.spyOn(Math, 'random')
      .mockImplementation(() => (ALPHABET.indexOf(SEC_KEY[i++ % SEC_KEY.length]) + 0.5) / ALPHABET.length);
    try {
      const r = await encryptWeapi({ id: 123, lv: -1 });
      // 双层 AES(NONCE→secKey) 输出，锁定 IV/NONCE/AES 全链路
      expect(r.params).toBe('oHvzRxJKGMqR7Vb/2hpZLb9oL21ie5YKUnZqFHGKeq489ZwFOIzLf7ok9JWTlzYF');
      // rsaEncrypt(SEC_KEY)：锁定 MODULUS/PUB_KEY/reverse/padStart(256)
      expect(r.encSecKey).toBe(
        '07e9d079dd7c90fa4677916d7dacc677d46431a19ac2b82e8ff09ae3e4f7e6dd' +
        '0a69e0c2f26b930557293f8eb61942d457ea1b8bd080fe202b9f95fcdab2316b' +
        'dab2faa43c2446c303d914ce19dd1213db12cf54252f9995a49b45f09ccd743f' +
        '0e69723089206bcf86c3a87c22ad697ec2a122fdec74288af858f53c8120af84',
      );
    } finally {
      spy.mockRestore();
    }
  });
});

describe('buildVisitorCookie', () => {
  it('带 pc 客户端标记且每次 nuid 不同', () => {
    const a = buildVisitorCookie();
    const b = buildVisitorCookie();
    expect(a).toContain('os=pc');
    expect(a).toContain('_ntes_nuid=');
    expect(a.endsWith('NMTID=0;')).toBe(true);
    expect(a).not.toBe(b);
  });
});
