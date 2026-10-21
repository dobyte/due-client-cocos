import assert from 'node:assert';
import { constants, generateKeyPairSync, sign } from 'node:crypto';
import { createAeadCipher, SUITE_AES_GCM, SUITE_CHACHA20_POLY1305 } from '../assets/scripts/network/security/aead';
import { concatBytes } from '../assets/scripts/network/security/bytes';
import { digest } from '../assets/scripts/network/security/digest';
import { Direction, makeAAD, SecureSession } from '../assets/scripts/network/security/handshake';
import { Verifier } from '../assets/scripts/network/security/verifier';
import { hkdfSha256, hmacSha256, sha256 } from '../assets/scripts/network/security/sha256';
import { x25519 } from '../assets/scripts/network/security/x25519';

const encoder = new TextEncoder();

function hex(value: string): Uint8Array {
    const clean = value.replace(/\s/g, '');
    const bytes = new Uint8Array(clean.length / 2);

    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }

    return bytes;
}

function toHex(value: Uint8Array): string {
    return Array.from(value).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function testSha256() {
    assert.strictEqual(
        toHex(sha256(encoder.encode('abc'))),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );

    // RFC 4231 用例 2
    assert.strictEqual(
        toHex(hmacSha256(encoder.encode('Jefe'), encoder.encode('what do ya want for nothing?'))),
        '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );

    // RFC 5869 用例 1
    const okm = hkdfSha256(
        hex('0b'.repeat(22)),
        hex('000102030405060708090a0b0c'),
        hex('f0f1f2f3f4f5f6f7f8f9'),
        42,
    );
    assert.strictEqual(
        toHex(okm),
        '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );

    console.log('  ✓ SHA-256 / HMAC-SHA256 / HKDF-SHA256 通过');
}

function testDigest() {
    const data = encoder.encode('abc');

    assert.strictEqual(
        toHex(digest('sha1', data)),
        'a9993e364706816aba3e25717850c26c9cd0d89d',
    );
    assert.strictEqual(
        toHex(digest('sha224', data)),
        '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7',
    );
    assert.strictEqual(
        toHex(digest('sha256', data)),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    assert.strictEqual(
        toHex(digest('sha384', data)),
        'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
    );
    assert.strictEqual(
        toHex(digest('sha512', data)),
        'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    );

    console.log('  ✓ SHA-1 / SHA-224 / SHA-256 / SHA-384 / SHA-512 通过');
}

function testX25519() {
    // RFC 7748 §6.1
    const alicePrivate = hex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a');
    const bobPrivate = hex('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb');
    const alicePublic = hex('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a');
    const bobPublic = hex('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f');
    const shared = '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742';

    assert.strictEqual(toHex(x25519(alicePrivate, hex('09' + '00'.repeat(31)))), toHex(alicePublic));
    assert.strictEqual(toHex(x25519(bobPrivate, hex('09' + '00'.repeat(31)))), toHex(bobPublic));
    assert.strictEqual(toHex(x25519(alicePrivate, bobPublic)), shared);
    assert.strictEqual(toHex(x25519(bobPrivate, alicePublic)), shared);

    // 低阶公钥必须被拒绝
    assert.throws(() => x25519(alicePrivate, new Uint8Array(32)), /low order/);

    console.log('  ✓ X25519 通过');
}

function testChaCha20Poly1305() {
    // RFC 8439 §2.8.2
    const key = hex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
    const nonce = hex('070000004041424344454647');
    const aad = hex('50515253c0c1c2c3c4c5c6c7');
    const plaintext = encoder.encode("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.");
    const cipher = createAeadCipher(SUITE_CHACHA20_POLY1305, key);
    const sealed = cipher.seal(nonce, aad, plaintext);

    assert.strictEqual(
        toHex(sealed),
        'd31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d63dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b3692ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc3ff4def08e4b7a9de576d26586cec64b6116'
        + '1ae10b594f09e26a7e902ecbd0600691',
    );

    assert.deepStrictEqual(cipher.open(nonce, aad, sealed), plaintext);
    assert.strictEqual(cipher.open(nonce, aad, sealed.subarray(0, sealed.length - 1)), null);

    console.log('  ✓ ChaCha20-Poly1305 通过');
}

function testAesGcm() {
    // NIST GCM 测试向量：全零 key/nonce/plaintext
    const cipher = createAeadCipher(SUITE_AES_GCM, new Uint8Array(32));
    const sealed = cipher.seal(new Uint8Array(12), new Uint8Array(0), new Uint8Array(16));

    assert.strictEqual(toHex(sealed.subarray(0, 16)), 'cea7403d4d606b6e074ec5d3baf39d18');
    assert.strictEqual(toHex(sealed.subarray(16)), 'd0d1c8a799996bf0265b98b5d48ab919');
    assert.deepStrictEqual(cipher.open(new Uint8Array(12), new Uint8Array(0), sealed), new Uint8Array(16));

    // 变更密文必须认证失败
    const tampered = sealed.slice();
    tampered[0] ^= 0x01;
    assert.strictEqual(cipher.open(new Uint8Array(12), new Uint8Array(0), tampered), null);

    console.log('  ✓ AES-256-GCM 通过');
}

function createMaterial() {
    const key = (value: number) => new Uint8Array(32).fill(value);

    return {
        c2sKey: key(1),
        s2cKey: key(2),
        c2sFinish: key(3),
        s2cFinish: key(4),
        salt: new Uint8Array([5, 6, 7, 8]),
    };
}

function testSession() {
    const material = createMaterial();
    const client = new SecureSession(SUITE_CHACHA20_POLY1305, material, 'client');
    const server = new SecureSession(SUITE_CHACHA20_POLY1305, material, 'server');
    const plaintext = encoder.encode('secure message');

    const sealed = client.seal(plaintext, Direction.ClientToServer, 100, 7);

    assert.strictEqual(sealed.length, plaintext.length + client.overhead);
    assert.strictEqual(sealed[0], 1);
    assert.deepStrictEqual(server.open(sealed, Direction.ClientToServer, 100, 7), plaintext);

    // 重放消息必须被拒绝
    assert.throws(() => server.open(sealed, Direction.ClientToServer, 100, 7), /replayed/);

    // AAD 不一致必须认证失败
    const another = client.seal(plaintext, Direction.ClientToServer, 100, 8);
    assert.throws(() => server.open(another, Direction.ClientToServer, 101, 8), /authentication failed/);

    // 服务端下行
    const downlink = server.seal(plaintext, Direction.ServerToClient, 100, 7);
    assert.deepStrictEqual(client.open(downlink, Direction.ServerToClient, 100, 7), plaintext);

    console.log('  ✓ 会话封装、AAD 绑定与重放拒绝通过');
}

function testRsaVerifier() {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const data = encoder.encode('due handshake signature');
    const spki = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const pkcs1 = publicKey.export({ type: 'pkcs1', format: 'pem' }).toString();

    const pss256 = sign('sha256', data, {
        key: privateKey,
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32,
    });
    const pss1 = sign('sha1', data, {
        key: privateKey,
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 20,
    });
    const pkcs256 = sign('sha256', data, { key: privateKey, padding: constants.RSA_PKCS1_PADDING });
    const pkcs512 = sign('sha512', data, { key: privateKey, padding: constants.RSA_PKCS1_PADDING });

    // PSS（默认 sha256）
    assert.strictEqual(Verifier.rsa(spki)(data, new Uint8Array(pss256)), true);
    // PKCS#1 v1.5（显式 pss: false）
    assert.strictEqual(Verifier.rsa(spki, 'sha256', false)(data, new Uint8Array(pkcs256)), true);
    // PKCS#1 公钥格式也应被支持
    assert.strictEqual(Verifier.rsa(pkcs1, 'sha256', false)(data, new Uint8Array(pkcs256)), true);
    // 哈希算法需与服务端配置一致
    assert.strictEqual(Verifier.rsa(spki, 'sha1')(data, new Uint8Array(pss1)), true);
    assert.strictEqual(Verifier.rsa(spki, 'sha512', false)(data, new Uint8Array(pkcs512)), true);
    // 哈希不一致或签名错误必须失败
    assert.strictEqual(Verifier.rsa(spki)(data, new Uint8Array(pss1)), false);
    assert.strictEqual(Verifier.rsa(spki)(encoder.encode('other'), new Uint8Array(pss256)), false);

    console.log('  ✓ RSA PSS / PKCS#1 v1.5 签名校验通过');
}

function readDerLength(signature: Uint8Array, offset: number): { length: number; offset: number } {
    let length = signature[offset++];

    if (length & 0x80) {
        const count = length & 0x7f;
        length = 0;

        for (let i = 0; i < count; i++) {
            length = (length << 8) | signature[offset++];
        }
    }

    return { length, offset };
}

function readDerInteger(signature: Uint8Array, offset: number): { value: bigint; offset: number } {
    assert.strictEqual(signature[offset], 0x02);
    const decoded = readDerLength(signature, offset + 1);
    let value = 0n;

    for (let i = 0; i < decoded.length; i++) {
        value = (value << 8n) | BigInt(signature[decoded.offset + i]);
    }

    return { value, offset: decoded.offset + decoded.length };
}

// 将 DER 签名转换为 due 的十进制文本格式
function ecdsaSignature(privateKey: any, data: Uint8Array, hash: string, delimiter = ' '): Uint8Array {
    const der = new Uint8Array(sign(hash, data, { key: privateKey, dsaEncoding: 'der' }));
    const sequence = readDerLength(der, 1);
    const first = readDerInteger(der, sequence.offset);
    const second = readDerInteger(der, first.offset);

    return encoder.encode(`${first.value.toString()}${delimiter}${second.value.toString()}`);
}

function testEcdsaVerifier() {
    const data = encoder.encode('due handshake signature');
    const other = encoder.encode('other');
    const cases = [
        { curve: 'prime256v1', hash: 'sha256' },
        { curve: 'secp384r1', hash: 'sha384' },
        { curve: 'secp521r1', hash: 'sha512' },
        // 哈希长于曲线阶，验证按 Go 规则截断
        { curve: 'prime256v1', hash: 'sha512' },
    ] as const;

    for (const { curve, hash } of cases) {
        const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: curve });
        const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
        const signature = ecdsaSignature(privateKey, data, hash);

        assert.strictEqual(Verifier.ecdsa(pem, hash)(data, signature), true);
        assert.strictEqual(Verifier.ecdsa(pem, hash)(other, signature), false);
    }

    // 自定义分隔符
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const comma = ecdsaSignature(privateKey, data, 'sha256', ',');

    assert.strictEqual(Verifier.ecdsa(pem, 'sha256', ',')(data, comma), true);

    console.log('  ✓ ECDSA P-256/P-384/P-521 与哈希/分隔符选项通过');
}

function testAAD() {
    // AAD：version(1) | direction(1) | epoch(1) | route(4, BE) | seq(4, BE)
    const expected = concatBytes(
        new Uint8Array([1, 0, 1]),
        new Uint8Array([0, 0, 0, 100]),
        new Uint8Array([0, 0, 0, 7]),
    );

    assert.strictEqual(toHex(makeAAD(Direction.ClientToServer, 1, 100, 7)), toHex(expected));

    console.log('  ✓ AAD 编码通过');
}

console.log('=== due 客户端 security 单元测试 ===\n');
testSha256();
testDigest();
testX25519();
testChaCha20Poly1305();
testAesGcm();
testSession();
testRsaVerifier();
testEcdsaVerifier();
testAAD();
console.log('\n=== security 单元测试全部通过 ===');
