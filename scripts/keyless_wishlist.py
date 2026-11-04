#!/usr/bin/env python3
import base64
import json
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API_BASE = 'https://api.steampowered.com'
STORE_BASE = 'https://store.steampowered.com'
ORIGIN = 'https://store.steampowered.com'
USER_AGENT = 'SteamCalendarCompanion/1.0'

def encode_steamid_request(steamid):
    return bytes([9]) + struct.pack('<Q', steamid)

def eresult(headers, default=0):
    value = headers.get('X-Eresult') or headers.get('x-eresult')
    try:
        return int(value)
    except (TypeError, ValueError):
        return default

def fetch_protobuf(method, steamid):
    body = encode_steamid_request(steamid)
    encoded = base64.b64encode(body).decode('ascii')
    query = urllib.parse.urlencode({'origin': ORIGIN, 'input_protobuf_encoded': encoded})
    url = API_BASE + '/IWishlistService/' + method + '/v1?' + query
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/octet-stream'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return {'status': response.status, 'eresult': eresult(response.headers), 'headers': response.headers, 'body': response.read(), 'url': url}
    except urllib.error.HTTPError as error:
        return {'status': error.code, 'eresult': eresult(error.headers), 'headers': error.headers, 'body': error.read(), 'url': url}

def read_varint(buf, pos=0):
    value = 0
    shift = 0
    while pos < len(buf):
        byte = buf[pos]
        pos += 1
        value |= (byte & 0x7F) << shift
        if (byte & 0x80) == 0:
            return value, pos
        shift += 7
        if shift > 70:
            raise ValueError('varint too long')
    raise ValueError('truncated varint')

def skip_field(buf, pos, wire):
    if wire == 0:
        _, pos = read_varint(buf, pos)
    elif wire == 1:
        pos += 8
    elif wire == 2:
        length, pos = read_varint(buf, pos)
        pos += length
    elif wire == 5:
        pos += 4
    else:
        raise ValueError('bad wire type')
    if pos > len(buf):
        raise ValueError('truncated field')
    return pos

def parse_get_wishlist_item_count(buf):
    pos = 0
    while pos < len(buf):
        tag, pos = read_varint(buf, pos)
        field = tag >> 3
        wire = tag & 7
        if field == 1 and wire == 0:
            value, pos = read_varint(buf, pos)
            return value
        pos = skip_field(buf, pos, wire)
    return None

def parse_wishlist_item(buf):
    appid = 0
    priority = None
    date_added = None
    pos = 0
    while pos < len(buf):
        tag, pos = read_varint(buf, pos)
        field = tag >> 3
        wire = tag & 7
        if wire == 0:
            value, pos = read_varint(buf, pos)
            if field == 1:
                appid = value
            elif field == 2:
                priority = value
            elif field == 3:
                date_added = value
        else:
            pos = skip_field(buf, pos, wire)
    if appid <= 0:
        return None
    return {'appid': appid, 'priority': priority, 'date_added': date_added}

def parse_get_wishlist(buf):
    items = []
    pos = 0
    while pos < len(buf):
        tag, pos = read_varint(buf, pos)
        field = tag >> 3
        wire = tag & 7
        if field == 1 and wire == 2:
            length, pos = read_varint(buf, pos)
            end = pos + length
            item = parse_wishlist_item(buf[pos:end])
            if item is not None:
                items.append(item)
            pos = end
        else:
            pos = skip_field(buf, pos, wire)
    return items

def get_app_details(appid):
    params = {'appids': str(appid), 'filters': 'basic,release_date', 'l': 'en'}
    for extra in ({}, {'cc': 'us'}):
        query = urllib.parse.urlencode({**params, **extra})
        url = STORE_BASE + '/api/appdetails?' + query
        request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                data = json.loads(response.read().decode('utf-8'))
                entry = data.get(str(appid), {})
                if entry.get('success'):
                    return entry.get('data', {})
        except Exception:
            pass
    return None

def is_private(status, result):
    return status in (401, 402, 403) or result in (9, 13, 15)

def fetch_wishlist(steamid, with_details=False, max_details=250, delay=0.2):
    count_response = fetch_protobuf('GetWishlistItemCount', steamid)
    list_response = fetch_protobuf('GetWishlist', steamid)
    private = is_private(count_response['status'], count_response['eresult']) or is_private(list_response['status'], list_response['eresult'])
    out = {'steamid': str(steamid), 'private': private, 'totalKnown': None, 'items': [], 'warnings': []}
    if count_response['status'] == 200 and count_response['eresult'] == 1:
        out['totalKnown'] = parse_get_wishlist_item_count(count_response['body'])
    if private:
        out['warnings'].append('profile appears private or API access was rejected')
        return out
    if list_response['status'] != 200 or list_response['eresult'] != 1:
        out['warnings'].append('wishlist list request failed')
        return out
    out['items'] = parse_get_wishlist(list_response['body'])
    if out['totalKnown'] is None:
        out['totalKnown'] = len(out['items'])
    if with_details:
        for index, item in enumerate(out['items'][:max_details]):
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
        print('usage: python scripts/keyless_wishlist.py <steamid> [--details]', file=sys.stderr)
        return 2
    steamid = int(argv[1])
    with_details = '--details' in argv[2:]
    result = fetch_wishlist(steamid, with_details=with_details)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
