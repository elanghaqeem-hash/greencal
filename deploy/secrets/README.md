# Rahasia deployment on-premise

Direktori ini **kosong di repositori dan wajib tetap kosong**. `.gitignore`
menolak seluruh isinya kecuali berkas ini.

Operator bank menyiapkan berkas berikut pada host sebelum `docker compose up`,
dengan izin `0400` dan pemilik akun layanan, bukan root:

| Berkas | Isi | Catatan |
| --- | --- | --- |
| `db_bootstrap_password` | kata sandi peran bootstrap PostgreSQL | hanya dipakai saat initdb, lalu dinonaktifkan |
| `db_replication_password` | passfile replikasi ke DRC | format passfile PostgreSQL, bukan kata sandi mentah |
| `db_app_passfile` | passfile peran `crms_app` | |
| `db_migrator_passfile` | passfile peran `crms_migrator` | |
| `db_readonly_passfile` | passfile peran `crms_readonly` | |
| `db_ca_cert` | sertifikat CA internal bank | dipakai `sslrootcert` |
| `db_server_cert`, `db_server_key` | sertifikat server PostgreSQL | |
| `server.crt`, `server.key` | sertifikat TLS edge | diterbitkan CA internal |
| `objects_access_key`, `objects_secret_key` | kredensial penyimpanan objek | |
| `oidc_metadata.json` | metadata penyedia identitas | disalin dari SSO, tidak diunduh saat runtime |

Rotasi kunci dan kata sandi mengikuti kebijakan bank. Setiap rotasi dicatat
pada log perubahan dan memerlukan persetujuan CAB, sama seperti perubahan
konfigurasi lain.
