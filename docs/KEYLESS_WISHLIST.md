# Keyless Steam Wishlist

## Краткий ответ

Да. Полный публичный Steam wishlist можно получить без Steam Web API key, cookie и OpenID login.

Проверенные public JSON endpoints для steamid `76561198015461483`:

```text
https://api.steampowered.com/IWishlistService/GetWishlistItemCount/v1?steamid=76561198015461483
https://api.steampowered.com/IWishlistService/GetWishlist/v1?steamid=76561198015461483
```

Результат:

- `GetWishlistItemCount`: `34`;
- `GetWishlist`: `34` appid;
- обычный public SSR wishlist page отдаёт только первые `30` elements.

## Про `wishlistdata/?p=0`

`https://store.steampowered.com/wishlist/profiles/<steamid>/wishlistdata/?p=0` в текущей проверке без cookies не вернул JSON. Steam отдал generic HTML `Welcome to Steam`.

Этот path выглядит как internal Store page endpoint, вероятно зависящий от session/login. Для anonymous full wishlist надёжнее использовать API method:

```text
GET https://api.steampowered.com/IWishlistService/GetWishlist/v1?steamid=<steamid64>
```

## Public JSON responses

Count:

```text
GET https://api.steampowered.com/IWishlistService/GetWishlistItemCount/v1?steamid=<steamid64>
```

Example:

```json
{"response":{"count":34}}
```

Wishlist:

```text
GET https://api.steampowered.com/IWishlistService/GetWishlist/v1?steamid=<steamid64>
```

Example:

```json
{
  "response": {
    "items": [
      {"appid":388860,"priority":30,"date_added":1765441236}
    ]
  }
}
```

`GetWishlist` не содержит `name`, `coverImage`, `releaseDateText`, price и другие store metadata.

## Metadata enrichment

Полный appid-лист берётся из public wishlist API. Title/cover/release date достраиваются через public appdetails:

```text
GET https://store.steampowered.com/api/appdetails?appids=<appid>&filters=basic,release_date&l=en
```

Fallback с `cc`:

```text
GET https://store.steampowered.com/api/appdetails?appids=<appid>&filters=basic,release_date&l=en&cc=us
```

## Эталонная реализация на Python

Полный рабочий пример находится в `scripts/public_wishlist_api.py`. Он использует только Python stdlib.

```python
#!/usr/bin/env python3
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API_BASE = 'https://api.steampowered.com'
STORE_BASE = 'https://store.steampowered.com'
USER_AGENT = 'SteamCalendarCompanion/1.0'

def parse_eresult(headers):
    value = headers.get('X-Eresult') or headers.get('x-eresult')
    try:
        return int(value)
    except (TypeError, ValueError):
        return None

def is_private(status, eresult):
    return status in (401, 402, 403) or eresult in (9, 13, 15)

def fetch_json(method, steamid):
    query = urllib.parse.urlencode({'steamid': str(steamid)})
    url = API_BASE + '/IWishlistService/' + method + '/v1?' + query
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            eresult = parse_eresult(response.headers)
            data = json.loads(response.read().decode('utf-8'))
            return {'status': response.status, 'eresult': eresult, 'private': is_private(response.status, eresult), 'data': data}
    except urllib.error.HTTPError as error:
        try:
            data = json.loads(error.read().decode('utf-8'))
        except Exception:
            data = None
        eresult = parse_eresult(error.headers)
        return {'status': error.code, 'eresult': eresult, 'private': is_private(error.code, eresult), 'data': data}

def parse_count(data):
    response = data.get('response') if isinstance(data, dict) else None
    if isinstance(response, dict):
        return response.get('count')
    return None

def parse_items(data):
    response = data.get('response') if isinstance(data, dict) else None
    if not isinstance(response, dict):
        return []
    items = response.get('items')
    if not isinstance(items, list):
        return []
    out = []
    for item in items:
        if isinstance(item, dict) and isinstance(item.get('appid'), int):
            out.append({'appid': item['appid'], 'priority': item.get('priority'), 'date_added': item.get('date_added')})
    return out

def get_app_details(appid):
    params = {'appids': str(appid), 'filters': 'basic,release_date', 'l': 'en'}
    for extra in ({}, {'cc': 'us'}):
        query = urllib.parse.urlencode({**params, **extra})
        request = urllib.request.Request(STORE_BASE + '/api/appdetails?' + query, headers={'User-Agent': USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                data = json.loads(response.read().decode('utf-8'))
                entry = data.get(str(appid), {})
                if entry.get('success'):
                    return entry.get('data', {})
        except Exception:
            pass
    return None

def fetch_wishlist(steamid, with_details=False, max_details=250, delay=0.2):
    count = fetch_json('GetWishlistItemCount', steamid)
    listing = fetch_json('GetWishlist', steamid)
    private = count['private'] or listing['private']
    items = parse_items(listing['data'])
    total = parse_count(count['data'])
    out = {'steamid': str(steamid), 'private': private, 'totalKnown': total, 'items': items, 'warnings': []}
    if out['totalKnown'] is None:
        out['totalKnown'] = len(items)
    if private:
        out['warnings'].append('profile appears private or API access was rejected')
    if with_details:
        for index, item in enumerate(items[:max_details]):
            if index:
                time.sleep(delay)
            details = get_app_details(item['appid'])
            if not details:
                out['warnings'].append('appdetails failed for appid ' + str(item['appid']))
                continue
            item['name'] = details.get('name')
            item['coverImage'] = details.get('header_image')
            item['releaseDateText'] = details.get('release_date', {}).get('date')
            item['releaseDateUnix'] = details.get('release_date', {}).get('unix')
    return out

def main(argv):
    if len(argv) < 2:
        print('usage: python scripts/public_wishlist_api.py <steamid> [--details]', file=sys.stderr)
        return 2
    result = fetch_wishlist(int(argv[1]), '--details' in argv[2:])
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
```

## Запуск

Appid-only:

```bash
python3 scripts/public_wishlist_api.py 76561198015461483
```

С metadata enrichment:

```bash
python3 scripts/public_wishlist_api.py 76561198015461483 --details
```

## Protobuf fallback

Если public JSON `?steamid=` variant недоступен, можно использовать protobuf variant того же service:

```text
POST-like query:
GET https://api.steampowered.com/IWishlistService/GetWishlist/v1
  ?origin=https%3A%2F%2Fstore.steampowered.com
  &input_protobuf_encoded=<base64 protobuf body>
```

Request protobuf body:

```text
09 6b 38 4a 03 01 00 10 01
09 = field 1 wire type 1 fixed64
remaining 8 bytes = steamid little endian
```

Response protobuf fields:

```text
GetWishlistItemCount:
  field 1 varint count

GetWishlist:
  field 1 repeated item
  item field 1 uint32 appid
  item field 2 uint32 priority
  item field 3 uint32 date_added
```

Старый protobuf эталонный пример сохранён в `scripts/keyless_wishlist.py`.

## Как это связано с текущим проектом

В `lib/wishlist.ts`:

- `fetchWishlistJsonMethod` вызывает public JSON endpoints с `?steamid=`;
- protobuf fallback `fetchWishlistApiMethod` используется, если JSON variant не прошёл;
- public SSR wishlist page остаётся fallback для первых store metadata;
- appdetails обогащает недостающие title/cover/release date.

## Private profile

Для приватного профиля public endpoints могут вернуть HTTP 401, 402, 403 или Steam eresult с ошибкой доступа. Приложение помечает такой результат как `private: true`.

На реальном приватном профиле проверка не делалась. Это ожидаемое поведение, но не подтверждённый контракт Steam.

## Ограничения

- Работает для публичных профилей.
- Steam может менять public JSON query variants без публичных заметок.
- `appdetails` может быть rate limited или возвращать `success:false`.
- Это public keyless WebAPI variant, но всё равно неофициальный способ для app-specific use; он не гарантирован как стабильный контракт.
