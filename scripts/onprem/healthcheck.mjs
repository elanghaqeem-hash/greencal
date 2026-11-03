// Healthcheck kontainer. Memanggil endpoint lokal saja, tidak pernah jaringan
// luar, sehingga healthcheck tetap berfungsi pada jaringan tanpa egress.
// Keluar 0 bila siap, 1 bila tidak. Dipakai HEALTHCHECK pada Dockerfile.
import { request } from 'node:http';

const port = Number(process.env.PORT || 8080);
const path = process.env.GREENCAL_HEALTH_PATH || '/readyz';

const req = request({ host: '127.0.0.1', port, path, method: 'GET', timeout: 4000 }, (res) => {
  let body = '';
  res.on('data', (c) => { body += c; });
  res.on('end', () => {
    if (res.statusCode === 200) process.exit(0);
    process.stderr.write(`healthcheck gagal: HTTP ${res.statusCode} ${body.slice(0, 500)}\n`);
    process.exit(1);
  });
});

req.on('timeout', () => { req.destroy(new Error('timeout')); });
req.on('error', (e) => {
  process.stderr.write(`healthcheck gagal: ${e.message}\n`);
  process.exit(1);
});
req.end();
