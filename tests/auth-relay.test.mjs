import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../auth/auth.js", import.meta.url), "utf8");

test("le relais QCM récupère l’expiration depuis le jeton si elle manque dans le message", () => {
    const match = source.match(/function expirationDuJeton\(jeton\) \{[\s\S]*?\n    \}/);
    assert.ok(match);
    const decode = value => Buffer.from(value, "base64").toString("binary");
    const expirationDuJeton = vm.runInNewContext(`(${match[0]})`, { atob: decode });
    const expiration = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ exp: expiration })).toString("base64url");

    assert.equal(expirationDuJeton(`header.${payload}.signature`), expiration);
    assert.ok(Number.isNaN(expirationDuJeton("invalid")));
});

test("un accès lancé depuis QCM-MAJOR ne revient pas au formulaire mot de passe si le relais échoue", () => {
    assert.match(source, /get\('from'\) === 'qcm-major'/);
    assert.match(source, /if \(accesQcm\) \{\s+afficherEchecRelaisQcm\(\);\s+return;/);
    assert.match(source, /function relancerConnexionQcm\(\)[\s\S]*?demanderSessionQcm\(\)/);
    assert.match(source, /auth-retry-qcm/);
});
