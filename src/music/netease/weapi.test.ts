import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
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
