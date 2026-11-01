# Fragmen penerusan bersama seluruh location. Dipisah agar setiap perubahan
# header penerusan berlaku seragam dan tidak terlewat di salah satu rute.

proxy_pass ${BACKEND};
proxy_http_version 1.1;

# Upgrade tidak diteruskan: aplikasi tidak memakai WebSocket.
proxy_set_header Upgrade $connection_upgrade;
proxy_set_header Connection "";

proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;
proxy_set_header X-Forwarded-Port 443;
proxy_set_header X-Request-Id $request_id;

# Header yang datang dari klien dan tidak boleh dipercaya dibuang di sini,
# bukan diabaikan di aplikasi.
proxy_set_header X-Forwarded-Host "";
proxy_set_header X-Original-URL "";
proxy_set_header X-Rewrite-URL "";
proxy_set_header X-CRMS-Tenant "";
proxy_set_header X-CRMS-Role "";

proxy_connect_timeout 5s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;
proxy_buffering on;
proxy_buffer_size 8k;
proxy_buffers 16 8k;

# Galat hulu tidak diteruskan apa adanya; edge menampilkan halaman netral.
proxy_intercept_errors on;
proxy_hide_header X-Powered-By;
proxy_hide_header Server;
