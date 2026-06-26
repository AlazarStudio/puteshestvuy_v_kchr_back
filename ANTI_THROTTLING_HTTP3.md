# Обход троттлинга РКН/ТСПУ: перевод бэкенда на HTTP/2 + HTTP/3 (QUIC)

> Документ описывает реальную проблему, которая возникла на проде
> «Путешествуй в КЧР», как её диагностировали и как решили. В конце —
> универсальный рецепт, как повторить это на любом другом сервисе/проекте.

---

## 1. Симптомы

- Сайт (фронт) открывался без VPN нормально, но **данные с бэкенда не грузились**:
  бесконечный лоадер, в консоли `ERR_CONNECTION_RESET` и `ERR_TIMED_OUT` на
  запросах к `https://devbackend.<домен>/api/*`.
- **С VPN всё работало.**
- Раньше (≈месяц назад) работало и без VPN — «само сломалось».

Важная деталь топологии: фронт и бэк — на **разных серверах/IP**:
- фронт — обычный хостинг (статика, отдельный IP), доступен без VPN;
- бэк — отдельный VPS (`185.207.1.45`, домен `devbackend.<домен>`), к нему и не доходил трафик.

## 2. Корневая причина

Это **не блокировка**, а **троттлинг (пессимизация) ТСПУ** трафика TCP/HTTP к IP бэка.
Признаки, которые это доказали:

| Тест (без VPN) | Результат |
|---|---|
| Один запрос `/api/footer` (порт 443) | ✅ открывается мгновенно |
| Один запрос по IP напрямую `https://185.207.1.45/...` | ✅ открывается |
| Один запрос на другом порту (8443) | ✅ открывается |
| **40 параллельных** запросов поверх HTTP/1.1 | ⚠️ проходят, но **2086 мс** |
| Реальный сайт (много параллельных + тяжёлые JSON/картинки) | ❌ рвётся |

Вывод: ни IP, ни домен, ни порт **жёстко не заблокированы**. ТСПУ режет
**объём/количество одновременных TCP-соединений** к этому адресу. Браузер на
HTTP/1.1 открывает к одному origin **6+ параллельных TCP-соединений** и тянет
крупные ответы — именно это и попадает под троттлинг и рвётся (RST).
VPN помогает, потому что прячет весь трафик в один шифрованный туннель.

## 3. Решение

Поставить перед Node-приложением **обратный прокси Caddy**, который терминирует
TLS и отдаёт браузеру **HTTP/2 и HTTP/3 (QUIC)**:

- **HTTP/2** мультиплексирует все запросы к origin в **одно** TCP-соединение
  вместо 6+ → троттлинг по числу соединений перестаёт срабатывать.
- **HTTP/3 (QUIC)** работает поверх **UDP**, а не TCP. ТСПУ-инъекции RST и
  TCP-троттлинг его не достают. Браузеры Chrome/Firefox сами переходят на h3,
  увидев заголовок `Alt-Svc: h3=":443"`.

Замер «до/после» на той же сети без VPN:

| Через | Протокол | 40 параллельных запросов |
|---|---|---|
| Node напрямую (как было) | http/1.1 | 40/40 за **2086 мс** |
| Через Caddy | **h3 (QUIC)** | 40/40 за **332 мс** (×6 быстрее) |

После включения Caddy сайт заработал без VPN. **Фронт менять не пришлось** — он
как и раньше ходит на `https://devbackend.<домен>/api`, тот же домен, тот же
443-й порт, тот же сертификат; изменился только протокол на стороне сервера.

---

## 4. Что конкретно сделано на этом сервере

Архитектура стала такой:

```
Браузер  ──HTTPS (h2/h3, :443)──▶  Caddy  ──HTTP (:4000, 127.0.0.1)──▶  Node/Express  ──▶  MongoDB rs0 (27017/18/19)
            TLS терминируется здесь
```

### 4.1. Node стал слушать внутренний HTTP-порт (а не сам держать TLS)

Правка в [`server.js`](./server.js): добавлена поддержка работы за обратным прокси.

```js
const behindProxy = process.env.BEHIND_PROXY === "true"
if (behindProxy) app.set("trust proxy", true)

const PORT = process.env.PORT ? Number(process.env.PORT) : (isProd ? 443 : 4000)

if (isProd && !behindProxy) {
  // старое поведение: Node сам терминирует TLS на 443
} else {
  // prod за прокси / dev → обычный HTTP
  const HOST = process.env.HOST || (behindProxy ? "127.0.0.1" : "0.0.0.0")
  server = app.listen(PORT, HOST, ...)
}
```

В `/root/server/.env` добавлено:

```
BEHIND_PROXY="true"
PORT="4000"
```

> `app.set("trust proxy", true)` нужен, чтобы Express корректно видел
> `X-Forwarded-For`/`X-Forwarded-Proto` от Caddy (реальный IP, https).

### 4.2. Caddy как обратный прокси

Бинарь поставлен в `/usr/local/bin/caddy` (v2):

```bash
curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=amd64" -o /usr/local/bin/caddy
chmod +x /usr/local/bin/caddy
```

`/etc/caddy/Caddyfile` (используем bind `:443` с явным сертификатом — это форма,
которая стабильно отдаёт сертификат для любого SNI; именованный site-блок в нашем
случае давал TLS internal error):

```caddyfile
{
  admin off
  auto_https off
}
:443 {
  tls /etc/letsencrypt/live/devbackend.<домен>/fullchain.pem /etc/letsencrypt/live/devbackend.<домен>/privkey.pem
  reverse_proxy http://127.0.0.1:4000 {
    header_up Host {host}
    header_up X-Real-IP {remote_host}
  }
}
```

> Сжатие (gzip) делает само Express-приложение (`compression`), поэтому в Caddy
> `encode` не включаем, чтобы не было двойного кодирования. Caddy автоматически
> включает HTTP/3 на UDP того же порта и шлёт `Alt-Svc`.

### 4.3. Открыть UDP/443 для HTTP/3

```bash
iptables -I INPUT -p udp --dport 443 -j ACCEPT
```

### 4.4. Всё под systemd + автозапуск (это и была причина падения после ребута!)

Раньше Mongo и Node поднимались **вручную в tmux** и после автоматической
перезагрузки сервера (обновление ядра) не вставали. Перевели всё на systemd.

**MongoDB** — шаблонный юнит `/etc/systemd/system/mongod-rs@.service`:

```ini
[Unit]
Description=MongoDB replica node rs0 (port %i)
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
ExecStart=/usr/bin/mongod --dbpath /data/db/rs0-%i --port %i --replSet rs0 --bind_ip 127.0.0.1
Restart=always
RestartSec=5
LimitNOFILE=64000
LimitNPROC=64000
[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now mongod-rs@27017 mongod-rs@27018 mongod-rs@27019
```

> Конфиг реплики rs0 хранится в самих файлах данных, поэтому набор поднимается
> сам. Ноды переносили из tmux в systemd **по одной** (rolling), чтобы кворим
> 2/3 сохранялся и не было простоя.

**Backend** — `/etc/systemd/system/kchr-backend.service`:

```ini
[Unit]
Description=KCHR backend (Node/Express)
After=network.target mongod-rs@27017.service mongod-rs@27018.service mongod-rs@27019.service
Wants=mongod-rs@27017.service mongod-rs@27018.service mongod-rs@27019.service
[Service]
Type=simple
WorkingDirectory=/root/server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
```

> `WorkingDirectory=/root/server` важен: `dotenv` читает `.env` из рабочей папки.

**Caddy** — `/etc/systemd/system/caddy.service`:

```ini
[Unit]
Description=Caddy reverse proxy
After=network.target kchr-backend.service
[Service]
Type=simple
Environment=HOME=/root
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576
[Install]
WantedBy=multi-user.target
```

### 4.5. Persistence сетевых правил (без конфликта с fail2ban)

`net.ipv4.tcp_mtu_probing` — в `/etc/sysctl.d/99-net-tuning.conf` (`= 1`).

iptables-правила (udp/443 + MSS-клемп как страховка для TCP-фолбэка на сетях,
где UDP/QUIC заблокирован) восстанавливаются идемпотентным oneshot-сервисом
`kchr-netrules.service` → `/usr/local/sbin/kchr-netrules.sh`:

```bash
iptables -C INPUT -p udp --dport 443 -j ACCEPT || iptables -I INPUT -p udp --dport 443 -j ACCEPT
iptables -t mangle -C POSTROUTING -o eth0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1200 \
  || iptables -t mangle -A POSTROUTING -o eth0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1200
```

> Не используем `iptables-save`/`netfilter-persistent`, потому что в правилах есть
> ссылка на ipset `f2b-sshd` от fail2ban, которого на момент раннего восстановления
> ещё нет. Идемпотентный скрипт добавляет только наши правила и ничего не ломает.

---

## 5. Эксплуатация

```bash
# статус всего
systemctl status caddy kchr-backend mongod-rs@27017 mongod-rs@27018 mongod-rs@27019

# логи
journalctl -u caddy -f
journalctl -u kchr-backend -f

# здоровье реплики
mongosh --port 27017 --eval 'rs.status().members.map(m=>m.name+" "+m.stateStr)'

# рестарт после деплоя бэкенда
cd /root/server && git pull && systemctl restart kchr-backend

# перезагрузить конфиг Caddy без даунтайма
systemctl reload caddy
```

### Деплой бэкенда (как заведено в проекте)
Правки → коммит/пуш локально → на сервере `git pull` → `systemctl restart kchr-backend`.

### Откат на старую схему (Node сам на 443)
1. `systemctl disable --now caddy`
2. В `/root/server/.env` убрать `BEHIND_PROXY` и `PORT` (или поставить `BEHIND_PROXY="false"`).
3. `systemctl restart kchr-backend` — Node снова займёт 443 с TLS.

---

## 6. Универсальный рецепт для других проектов/сервисов

Подходит для **любого стека** (Node, Python/Django/FastAPI, PHP, Go, Ruby…),
потому что Caddy просто стоит спереди и проксирует.

1. **Приложение слушает только localhost** на внутреннем HTTP-порту
   (`127.0.0.1:4000`/`:8000`/`:3000`…), TLS само не терминирует.
2. **Caddy спереди** терминирует TLS и даёт HTTP/2 + HTTP/3:
   ```caddyfile
   {
     auto_https off   # если сертификат свой (Let's Encrypt/certbot)
   }
   :443 {
     tls /path/fullchain.pem /path/privkey.pem
     reverse_proxy http://127.0.0.1:ВНУТР_ПОРТ
   }
   ```
   Если у домена правильно настроен DNS и открыт 80/443 — можно отдать выпуск
   сертификата самому Caddy (тогда вместо `tls <файлы>` пишут просто домен
   `mydomain.tld { reverse_proxy ... }` и `auto_https` оставляют включённым).
3. **Открыть UDP того же порта** (обычно 443) — иначе HTTP/3 не заработает:
   `iptables -I INPUT -p udp --dport 443 -j ACCEPT`.
4. **Автозапуск через systemd** для приложения, БД и Caddy (`enable --now`),
   с правильными `After=`/`Wants=`, чтобы порядок при загрузке был корректным.
5. **Проверить, что h3 реально отдаётся**:
   `curl -sI https://домен/ | grep -i alt-svc` → должно быть `h3=":443"`.

### Как быстро понять, что проблема именно в троттлинге (а не в коде/доступности)
- Один запрос проходит, а пачка параллельных/тяжёлых — рвётся → троттлинг.
- Проверка одиночными запросами: домен на 443, домен на другом порту, по IP
  напрямую. Если одиночные везде живые — IP/домен/порт не заблокированы.
- Диагностическая страница на 40 параллельных запросов (кладётся в статику и
  открывается без VPN, сравнить http/1.1 vs h2/h3):

```html
<!doctype html><meta charset=utf-8>
<button id=go>Run 40</button><pre id=out></pre>
<script>
go.onclick=async()=>{let ok=0,f=0;const E={},t=performance.now();
 await Promise.all([...Array(40)].map((_,i)=>
   fetch('/api/footer?_='+Date.now()+'_'+i,{cache:'no-store'})
     .then(r=>r.ok?ok++:(f++,E['H'+r.status]=(E['H'+r.status]||0)+1))
     .catch(e=>{f++;E[e.message]=(E[e.message]||0)+1})));
 const p=(performance.getEntriesByType('resource').at(-1)||{}).nextHopProtocol;
 out.textContent=`OK ${ok}/40  err ${f}  ${Math.round(performance.now()-t)}ms  ${p}\n`+JSON.stringify(E);
};
</script>
```

### Если однажды заблокируют сам IP жёстко (h3 не спасёт)
Следующая ступень — спрятать origin за **CDN с «чистым» IP** (Cloudflare или
российский CDN: DDoS-Guard, Servicepipe, Stormwall, Selectel/VK CDN). Тогда
пользователь коннектится к IP CDN, а тот по своим каналам — к origin. CDN тоже
даёт h2/h3 и кэширование. Минус: Cloudflare в РФ временами сам пессимизируется,
поэтому российский CDN надёжнее.

---

## 7. Чек-лист «здорового» прод-бэкенда (выводы на будущее)

- [x] TLS терминируется на edge-прокси (Caddy/nginx) с **HTTP/2 и HTTP/3**.
- [x] Приложение слушает только `127.0.0.1`, не светит «голый» origin наружу.
- [x] gzip/zstd-сжатие ответов включено (у нас — в Express `compression`).
- [x] Всё (БД, приложение, прокси) под **systemd с `enable`** — переживает ребут.
- [x] Открыт **UDP/443** для QUIC.
- [ ] Желательно: вынести origin за CDN на случай жёсткой блокировки IP.
- [ ] Желательно: мониторинг/healthcheck и алерты (uptime, `rs.status`).
